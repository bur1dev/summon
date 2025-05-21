import { nanoid } from 'nanoid';
import type { Product } from './search-types'; // Assuming Product is in search-types

// Types for messages between main thread and worker
export interface WorkerMessage {
    id: string;
    type: 'loadModel' | 'embedQuery' | 'rankSimilarity' | // Original types
    'initHnswLib' | 'initHnswIndex' | 'addPointsToHnsw' | 'searchHnsw' | // HNSW specific
    'loadHnswIndexFile' | 'saveHnswIndexFile' | 'switchHnswContext'; // HNSW file operations + new context switch
    [key: string]: any;
}

export interface WorkerResponse {
    id: string;
    type: string; // e.g., 'hnswInitResult', 'hnswSearchResult', 'hnswBuildProgress'
    success?: boolean;
    error?: string;
    data?: any; // Generic data payload
    [key: string]: any;
}

export interface EmbeddingServiceConfig {
    modelName?: string;
    workerUrl?: string;
    maxCacheSize?: number;
    hnswIndexFilename?: string; // For saving/loading HNSW index
}

export interface EmbeddingRequest {
    id: string;
    query: string;
    priority: number;
    timestamp: number;
    resolve: (result: Float32Array | null) => void;
    reject: (error: Error) => void;
}

/**
 * Service for managing embedding calculations and HNSW operations via Web Worker
 */
export class EmbeddingService {
    private worker: Worker | null = null;
    private isInitialized: boolean = false; // Tracks overall service initialization (worker ready, model loaded)
    private isLoading: boolean = false; // General loading state for the service
    private pendingRequests: Map<string, { resolve: Function, reject: Function, operation?: string }> = new Map();
    private embeddingQueue: EmbeddingRequest[] = [];
    private processingQueue: boolean = false;
    private embeddingCache: Map<string, { embedding: Float32Array, timestamp: number }> = new Map();

    private config: EmbeddingServiceConfig = {
        modelName: 'Xenova/all-MiniLM-L6-v2',
        workerUrl: '/embedding-worker.js', // Path to the worker script
        maxCacheSize: 100,
        hnswIndexFilename: 'hnsw_index_main.dat'
    };

    // --- HNSW state tracking (main thread perspective) ---
    private isHnswLibInitializedInWorker: boolean = false;
    private isHnswIndexReadyInWorker: boolean = false;
    private hnswIndexSourceProductsRef: Product[] | null = null; // To track active index in worker

    // New global index state tracking
    private isGlobalHnswIndexReadyInWorker: boolean = false; // Tracks if global index is ready
    private globalHnswIndexSourceProductsRef: Product[] | null = null; // Tracks global index product list

    // Track current worker context
    private currentWorkerIndexContext: 'global' | 'temporary' = 'global'; // Track which index the worker currently has active

    private readonly HNSW_DIMENSION = 384;
    // --- End HNSW state tracking ---

    constructor(config?: EmbeddingServiceConfig) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized || this.isLoading) {
            // If already initializing or initialized, wait for existing promise or return
            // This part might need a dedicated initialization promise if multiple calls happen
            return;
        }
        this.isLoading = true;
        try {
            this.worker = new Worker(
                new URL('./embedding-worker.ts', import.meta.url), // Ensure this path is correct
                { type: 'module' }
            );
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (error) => {
                console.error('Embedding worker error:', error);
                this.cleanupWorker();
            };

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pendingRequests.forEach(pr => pr.reject(new Error('Worker initialization timeout during initial setup')));
                    this.pendingRequests.clear();
                    reject(new Error('Worker initialization timeout'));
                }, 20000); // Increased timeout

                const tempId = nanoid(); // Use a temporary ID for this specific promise
                this.pendingRequests.set(tempId, {
                    resolve: () => { clearTimeout(timeout); resolve(); },
                    reject: (err) => { clearTimeout(timeout); reject(err); },
                    operation: 'workerReady'
                });
                // The worker will post { type: 'workerReady', id: 'worker-ready-signal' (or similar) }
                // We need a way to resolve this specific promise.
                // Let's modify handleWorkerMessage or have a dedicated handler for 'workerReady' without an ID.
            });

            // After worker is ready, explicitly initialize HNSW library in worker
            const hnswLibInitResult = await this.sendWorkerMessage({ type: 'initHnswLib' }, 'initHnswLib');
            if (!hnswLibInitResult.success) {
                throw new Error(`Failed to initialize HNSW library in worker: ${hnswLibInitResult.error}`);
            }
            this.isHnswLibInitializedInWorker = true;
            console.log('[EmbeddingService] HNSW library initialized in worker.');

            await this.loadModel(); // Load embedding model in worker
            console.log('Embedding worker and core libraries initialized successfully');
            this.isInitialized = true;

        } catch (error) {
            console.error('Failed to initialize embedding service:', error);
            this.cleanupWorker();
            this.isInitialized = false; // Ensure it's false on failure
            throw error; // Re-throw to indicate initialization failure
        } finally {
            this.isLoading = false;
        }
    }

    public async loadModel(): Promise<void> {
        if (!this.worker) throw new Error("Worker not initialized.");
        const result = await this.sendWorkerMessage({ type: 'loadModel', modelName: this.config.modelName }, 'loadModel');
        if (!result.status || result.status !== 'ready') {
            console.warn('Model loading in worker may not have completed successfully or reported status differently.', result);
        }
    }

    public async getQueryEmbedding(query: string, priority: number = 1): Promise<Float32Array | null> {
        await this.initialize(); // Always ensure initialization is complete or has been attempted
        if (!this.isInitialized) {
            console.error("EmbeddingService.getQueryEmbedding: Service not initialized after attempt.");
            throw new Error("Embedding service not initialized for getQueryEmbedding.");
        }
        if (!this.isInitialized) throw new Error("Embedding service not initialized.");
        if (!query) return null;

        const normalizedQuery = query.trim().toLowerCase();
        const cachedItem = this.embeddingCache.get(normalizedQuery);
        if (cachedItem) {
            cachedItem.timestamp = Date.now();
            return cachedItem.embedding;
        }

        try {
            return new Promise<Float32Array | null>((resolve, reject) => {
                const requestId = nanoid();
                this.pendingRequests.set(requestId, { resolve, reject, operation: 'embedQuery' });
                this.embeddingQueue.push({ id: requestId, query: normalizedQuery, priority, timestamp: Date.now(), resolve, reject });
                if (!this.processingQueue) {
                    this.processEmbeddingQueue();
                }
            });
        } catch (error) {
            console.error(`Error queuing embedding generation for query "${query}":`, error);
            return null;
        }
    }

    private async processEmbeddingQueue(): Promise<void> {
        if (this.processingQueue || this.embeddingQueue.length === 0) return;
        this.processingQueue = true;
        try {
            this.embeddingQueue.sort((a, b) => (a.priority !== b.priority) ? (b.priority - a.priority) : (a.timestamp - b.timestamp));
            const requestDetails = this.embeddingQueue.shift()!; // We are sure queue is not empty

            // Check cache again, might have been populated by another request while this one was queued
            const cachedItem = this.embeddingCache.get(requestDetails.query);
            if (cachedItem) {
                requestDetails.resolve(cachedItem.embedding);
                this.processingQueue = false; // Release queue lock
                this.processEmbeddingQueue(); // Process next
                return;
            }

            const result = await this.sendWorkerMessage({ id: requestDetails.id, type: 'embedQuery', query: requestDetails.query }, 'embedQueryDirect');

            if (result && result.success && result.data && result.data.embedding) {
                if (this.embeddingCache.size >= (this.config.maxCacheSize || 100)) this.pruneCache();
                this.embeddingCache.set(requestDetails.query, { embedding: result.data.embedding, timestamp: Date.now() });
                requestDetails.resolve(result.data.embedding);
            } else {
                console.warn(`[EmbeddingService] Query embedding failed or no embedding in result for "${requestDetails.query}". Result:`, result);
                requestDetails.resolve(null);
            }
        } catch (error) {
            // If an error occurs in sendWorkerMessage or processing, reject the promise associated with the request
            // This assumes sendWorkerMessage correctly rejects.
            // The request is already shifted, so we just log. The promise in pendingRequests would be rejected by sendWorkerMessage.
            console.error('Error processing embedding queue item:', error);
            if (this.embeddingQueue.length > 0) { // If error was for current, try to reject it
                const currentReq = this.pendingRequests.get(this.embeddingQueue[0]?.id); // This logic is tricky
                if (currentReq) currentReq.reject(error as Error);
            }
        } finally {
            this.processingQueue = false;
            if (this.embeddingQueue.length > 0) this.processEmbeddingQueue();
        }
    }

    private pruneCache(): void {
        const entries = Array.from(this.embeddingCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const removeCount = Math.ceil(entries.length * 0.2);
        for (let i = 0; i < removeCount; i++) {
            if (entries[i]) this.embeddingCache.delete(entries[i][0]);
        }
    }

    // --- HNSW Methods (now delegating to worker) ---

    public async prepareHnswIndex(
        sourceProducts: Product[],
        forceRebuild: boolean = false,
        persistIndex: boolean = true,
        customFilename?: string
    ): Promise<void> {
        // Ensure service and HNSW library in worker are initialized
        if (!this.isInitialized && !this.isLoading) {
            console.log("[EmbeddingService.prepareHnswIndex] Service not initialized, initializing now...");
            await this.initialize();
        } else if (this.isLoading) {
            console.log("[EmbeddingService.prepareHnswIndex] Service is currently loading, awaiting existing initialization...");
        }

        if (!this.isInitialized || !this.isHnswLibInitializedInWorker) {
            console.error("[EmbeddingService.prepareHnswIndex] Critical: Service or HNSW Lib in worker still not initialized.");
            throw new Error("EmbeddingService or HNSW Lib in worker not initialized. Cannot prepare index.");
        }

        const filename = customFilename || this.config.hnswIndexFilename!;
        const numSourceProducts = sourceProducts ? sourceProducts.length : 0;

        console.log(
            `[EmbeddingService PREPARE START] For ${numSourceProducts} products. Filename: "${filename}", forceRebuild: ${forceRebuild}, persistIndex: ${persistIndex}`
        );

        // --- Start of new detailed check logs ---
        console.log(`[EmbeddingService PREPARE CHECK] Current state before deciding to skip/proceed:`);
        console.log(`    - forceRebuild: ${forceRebuild}`);
        console.log(`    - this.isHnswIndexReadyInWorker: ${this.isHnswIndexReadyInWorker}`);

        if (persistIndex) {
            console.log(`    - this.isGlobalHnswIndexReadyInWorker: ${this.isGlobalHnswIndexReadyInWorker}`);
            console.log(`    - this.globalHnswIndexSourceProductsRef exists: ${!!this.globalHnswIndexSourceProductsRef}`);
            if (this.globalHnswIndexSourceProductsRef) {
                console.log(`    - this.globalHnswIndexSourceProductsRef.length: ${this.globalHnswIndexSourceProductsRef.length}`);
            }
            const isRefTheSameInstance = this.globalHnswIndexSourceProductsRef === sourceProducts;
            console.log(`    - REFERENCE CHECK: this.globalHnswIndexSourceProductsRef === sourceProducts (current call): ${isRefTheSameInstance}`);
        } else {
            console.log(`    - this.hnswIndexSourceProductsRef exists: ${!!this.hnswIndexSourceProductsRef}`);
            if (this.hnswIndexSourceProductsRef) {
                console.log(`    - this.hnswIndexSourceProductsRef.length: ${this.hnswIndexSourceProductsRef.length}`);
            }
            const isRefTheSameInstance = this.hnswIndexSourceProductsRef === sourceProducts;
            console.log(`    - REFERENCE CHECK: this.hnswIndexSourceProductsRef === sourceProducts (current call): ${isRefTheSameInstance}`);
        }
        console.log(`    - Current worker index context: ${this.currentWorkerIndexContext}`);
        // --- End of new detailed check logs ---

        // Check if we can skip index preparation based on type (global vs temporary)
        if (persistIndex) {
            // GLOBAL INDEX - check global state
            if (!forceRebuild && this.isGlobalHnswIndexReadyInWorker && this.globalHnswIndexSourceProductsRef === sourceProducts) {
                console.log(`[EmbeddingService PREPARE SKIP] GLOBAL HNSW index in worker ALREADY PREPARED for the current exact source products list (filename: "${filename}"). Skipping further action.`);
                // Still ensure active index in worker matches global
                this.hnswIndexSourceProductsRef = sourceProducts;
                this.isHnswIndexReadyInWorker = true;

                // Make sure worker has global context active if it's not already
                if (this.currentWorkerIndexContext !== 'global') {
                    console.log(`[EmbeddingService PREPARE] Switching worker context to global index for "${filename}"...`);
                    await this.ensureCorrectWorkerContext('global', filename);
                }

                return;
            }
        } else {
            // TEMPORARY INDEX - check temporary state
            if (!forceRebuild && this.isHnswIndexReadyInWorker && this.hnswIndexSourceProductsRef === sourceProducts) {
                console.log(`[EmbeddingService PREPARE SKIP] TEMPORARY HNSW index in worker ALREADY PREPARED for the current exact source products list. Skipping further action.`);

                // Make sure worker has temporary context active
                if (this.currentWorkerIndexContext !== 'temporary') {
                    console.log(`[EmbeddingService PREPARE] Switching worker context to temporary index...`);
                    await this.ensureCorrectWorkerContext('temporary');
                }

                return;
            }
        }

        console.log(`[EmbeddingService PREPARE PROCEED] Conditions not met to skip. Requesting worker to prepare HNSW index (forceRebuild: ${forceRebuild}, persist: ${persistIndex}, file: ${filename})...`);

        // Set ready flags based on index type
        if (persistIndex) {
            this.isGlobalHnswIndexReadyInWorker = false; // Mark global as not ready until completion
        }
        this.isHnswIndexReadyInWorker = false; // Mark active index as not ready

        const productsWithEmbeddingsData = sourceProducts
            .map((p, originalIndex) => ({
                embedding: p.embedding,
                originalIndex: originalIndex,
            }))
            .filter(p => p.embedding && p.embedding.length === this.HNSW_DIMENSION);

        if (productsWithEmbeddingsData.length === 0) {
            console.warn('[EmbeddingService PREPARE ABORT] No products with valid embeddings to send to worker for HNSW index build.');

            // Update state based on index type
            if (persistIndex) {
                this.globalHnswIndexSourceProductsRef = sourceProducts;
                this.isGlobalHnswIndexReadyInWorker = false;
            }
            this.hnswIndexSourceProductsRef = sourceProducts;
            this.isHnswIndexReadyInWorker = false;
            return;
        }

        let initResult;
        try {
            console.log(`[EmbeddingService PREPARE] Sending 'initHnswIndex' to worker. MaxElements: ${productsWithEmbeddingsData.length}, Filename: "${filename}", ForceRebuild: ${forceRebuild}, PersistForWorker: ${persistIndex}`);
            initResult = await this.sendWorkerMessage({
                type: 'initHnswIndex',
                data: {
                    maxElements: productsWithEmbeddingsData.length,
                    M: 16,
                    efConstruction: 200,
                    efSearch: 32,
                    filename: filename,
                    forceRebuild: forceRebuild,
                    persistIndex: persistIndex, // Worker needs to know if it should try loading from its FS
                    indexContext: persistIndex ? 'global' : 'temporary' // Tell worker which context this is for
                }
            }, 'initHnswIndex');
        } catch (error) {
            // Update state based on index type on error
            if (persistIndex) {
                this.isGlobalHnswIndexReadyInWorker = false;
                this.globalHnswIndexSourceProductsRef = null;
            }
            this.isHnswIndexReadyInWorker = false;
            this.hnswIndexSourceProductsRef = null;
            console.error(`[EmbeddingService PREPARE] Error sending 'initHnswIndex' message to worker:`, error);
            throw error; // Re-throw to be caught by caller
        }

        if (!initResult || !initResult.success) {
            // Update state based on index type on failure
            if (persistIndex) {
                this.isGlobalHnswIndexReadyInWorker = false;
                this.globalHnswIndexSourceProductsRef = null;
            }
            this.isHnswIndexReadyInWorker = false;
            this.hnswIndexSourceProductsRef = null;
            throw new Error(`[EmbeddingService PREPARE] Worker failed to initialize HNSW index: ${initResult?.error || 'Unknown worker error during init'}`);
        }

        const initData = initResult.data; // Contains { loadedFromSave: boolean, itemCount: number }

        // Update worker context tracking
        this.currentWorkerIndexContext = persistIndex ? 'global' : 'temporary';

        // CRITICAL: Update the source products reference AFTER successful init/load by worker
        // Only update global state for persistent index
        if (persistIndex) {
            this.globalHnswIndexSourceProductsRef = sourceProducts;
        }
        // Always update active index reference
        this.hnswIndexSourceProductsRef = sourceProducts;

        if (initData?.loadedFromSave) {
            console.log(`[EmbeddingService PREPARE] Worker loaded HNSW index "${filename}" with ${initData.itemCount} items. Setting index as ready.`);

            // Update state based on index type
            if (persistIndex) {
                this.isGlobalHnswIndexReadyInWorker = true;
            }
            this.isHnswIndexReadyInWorker = true;
            return; // IMPORTANT: Return here, no need to add points if loaded
        }

        // If not loaded from save, then we need to build it by adding points
        console.log(`[EmbeddingService PREPARE] Requesting worker to build HNSW index with ${productsWithEmbeddingsData.length} items for "${filename}" (since it was not loaded from save).`);

        let buildResult;
        try {
            buildResult = await this.sendWorkerMessage({
                type: 'addPointsToHnsw',
                data: {
                    points: productsWithEmbeddingsData.map(p => ({
                        embedding: p.embedding,
                        label: p.originalIndex // This originalIndex is relative to the current sourceProducts
                    })),
                    indexContext: persistIndex ? 'global' : 'temporary' // Specify which context we're adding points to
                }
            }, 'addPointsToHnsw');
        } catch (error) {
            // Update state based on index type on error
            if (persistIndex) {
                this.isGlobalHnswIndexReadyInWorker = false;
            }
            this.isHnswIndexReadyInWorker = false;
            console.error(`[EmbeddingService PREPARE] Error sending 'addPointsToHnsw' message to worker:`, error);
            throw error; // Re-throw
        }

        if (!buildResult || !buildResult.success) {
            // Update state based on index type on failure
            if (persistIndex) {
                this.isGlobalHnswIndexReadyInWorker = false;
            }
            this.isHnswIndexReadyInWorker = false;
            throw new Error(`[EmbeddingService PREPARE] Worker failed to build HNSW index: ${buildResult?.error || 'Unknown worker error during build'}`);
        }

        console.log(`[EmbeddingService PREPARE] Worker built HNSW index for "${filename}" with ${buildResult.data?.itemCount || 'unknown'} items. Setting index as ready.`);

        // Update state based on index type after successful build
        if (persistIndex) {
            this.isGlobalHnswIndexReadyInWorker = true;
        }
        this.isHnswIndexReadyInWorker = true;

        // Only attempt to save if persistIndex is true for this specific operation (passed as param)
        if (persistIndex) {
            console.log(`[EmbeddingService PREPARE] Requesting worker to save HNSW index to "${filename}" (as persistIndex is true for this call)...`);
            let saveResult;
            try {
                saveResult = await this.sendWorkerMessage({
                    type: 'saveHnswIndexFile',
                    data: {
                        filename: filename, // Worker saves its current index to this filename
                        indexContext: 'global' // Always save to global context
                    }
                }, 'saveHnswIndexFile');
            } catch (error) {
                console.warn(`[EmbeddingService PREPARE] Error sending 'saveHnswIndexFile' message to worker:`, error);
                // Decide if this is critical enough to mark index as not ready or affect persist status
            }

            if (saveResult && !saveResult.success) {
                console.warn(`[EmbeddingService PREPARE] Worker failed to save HNSW index to "${filename}": ${saveResult.error}`);
            } else if (saveResult && saveResult.success) {
                console.log(`[EmbeddingService PREPARE] Worker confirmed HNSW index saved to "${filename}".`);
            }
        } else {
            console.log(`[EmbeddingService PREPARE] Skipping save for "${filename}" (as persistIndex is false for this call).`);
        }
    }

    /**
     * Ensures the worker has the correct HNSW index context active
     */
    private async ensureCorrectWorkerContext(
        targetContext: 'global' | 'temporary',
        filename?: string
    ): Promise<void> {
        // If already in the correct context, skip
        if (this.currentWorkerIndexContext === targetContext) {
            return;
        }

        console.log(`[EmbeddingService] Switching worker HNSW context from ${this.currentWorkerIndexContext} to ${targetContext}${targetContext === 'global' && filename ? ` (${filename})` : ''}`);

        try {
            const result = await this.sendWorkerMessage({
                type: 'switchHnswContext',
                data: {
                    targetContext,
                    filename: targetContext === 'global' ? (filename || this.config.hnswIndexFilename) : undefined
                }
            }, 'switchHnswContext');

            if (result && result.success) {
                this.currentWorkerIndexContext = targetContext;
                console.log(`[EmbeddingService] Successfully switched worker HNSW context to ${targetContext}`);
            } else {
                console.error(`[EmbeddingService] Failed to switch worker HNSW context: ${result?.error || 'Unknown error'}`);
                // Don't update context tracking if switch failed
            }
        } catch (error) {
            console.error(`[EmbeddingService] Error switching worker HNSW context:`, error);
            // Don't update context tracking if switch failed
        }
    }

    public async rankBySimilarityHNSW(
        queryEmbedding: Float32Array,
        limit: number = 100
    ): Promise<Array<{ product: Product, originalProductIndex: number, similarity: number, score: number }>> {
        if (!this.isInitialized && !this.isLoading) await this.initialize();
        if (!this.isInitialized || !this.isHnswLibInitializedInWorker) {
            throw new Error("EmbeddingService or HNSW Lib in worker not initialized. Cannot search.");
        }
        if (!this.isHnswIndexReadyInWorker) {
            console.warn('[EmbeddingService] HNSW index in worker is not ready. Call prepareHnswIndex first.');
            return [];
        }
        if (!queryEmbedding || queryEmbedding.length !== this.HNSW_DIMENSION) {
            console.error('[EmbeddingService] Invalid query embedding for HNSW search.');
            return [];
        }
        if (!this.hnswIndexSourceProductsRef) {
            console.error('[EmbeddingService] hnswIndexSourceProductsRef is null. Cannot map results.');
            return [];
        }

        // Determine which index context we're using - if we're searching against the global product list,
        // make sure the worker has the global context active
        const isGlobalSearch = this.hnswIndexSourceProductsRef === this.globalHnswIndexSourceProductsRef;

        // If we're searching the global index but the worker has the temporary context active, switch contexts
        if (isGlobalSearch && this.currentWorkerIndexContext !== 'global') {
            console.log('[EmbeddingService] Need to switch to global context before searching');
            await this.ensureCorrectWorkerContext('global', this.config.hnswIndexFilename);
        }
        // If we're searching a temporary index but the worker has the global context active, switch contexts
        else if (!isGlobalSearch && this.currentWorkerIndexContext !== 'temporary') {
            console.log('[EmbeddingService] Need to switch to temporary context before searching');
            await this.ensureCorrectWorkerContext('temporary');
        }

        const result = await this.sendWorkerMessage({
            type: 'searchHnsw',
            data: {
                queryEmbedding,
                limit,
                indexContext: isGlobalSearch ? 'global' : 'temporary' // Tell worker which context to search
            }
        }, 'searchHnsw');

        if (!result.success) {
            console.error(`[EmbeddingService] HNSW search in worker failed: ${result.error}`);
            return [];
        }

        // Worker returns {neighbors: number[], distances: number[]}
        // These neighbors are the labels (original indices) we sent.
        const workerResults = result.data as { neighbors: number[], distances: number[] };
        const rankedProducts: Array<{ product: Product, originalProductIndex: number, similarity: number, score: number }> = [];

        if (workerResults && workerResults.neighbors && workerResults.distances) {
            for (let i = 0; i < workerResults.neighbors.length; i++) {
                const originalProductIndex = workerResults.neighbors[i]; // This is the originalIndex
                const distance = workerResults.distances[i];

                const product = this.hnswIndexSourceProductsRef[originalProductIndex];
                if (product) {
                    rankedProducts.push({
                        product,
                        originalProductIndex,
                        similarity: 1 - distance,
                        score: distance
                    });
                } else {
                    console.warn(`[EmbeddingService] Could not find product for originalIndex ${originalProductIndex} from HNSW search results.`);
                }
            }
        }
        return rankedProducts;
    }

    public cancelPendingRequests(): void {
        this.embeddingQueue.forEach(req => req.reject(new Error('Request cancelled by service')));
        this.embeddingQueue = [];
        this.pendingRequests.forEach((pending) => {
            if (pending.reject) {
                pending.reject(new Error(`Request cancelled: ${pending.operation || 'Unknown operation'}`));
            }
        });
        this.pendingRequests.clear();
    }

    public dispose(): void {
        this.cancelPendingRequests();
        this.cleanupWorker();
        this.isInitialized = false;
        this.isHnswLibInitializedInWorker = false;
        this.isHnswIndexReadyInWorker = false;
        this.isGlobalHnswIndexReadyInWorker = false;
        this.hnswIndexSourceProductsRef = null;
        this.globalHnswIndexSourceProductsRef = null;
        this.currentWorkerIndexContext = 'global';
        console.log("EmbeddingService disposed.");
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
        const response = event.data;

        if (response.type === 'workerReady') {
            const readyPromiseId = this.findWorkerReadyRequestId();
            if (readyPromiseId) {
                const readyPromise = this.pendingRequests.get(readyPromiseId);
                if (readyPromise) {
                    readyPromise.resolve();
                    this.pendingRequests.delete(readyPromiseId);
                }
            } else if (response.id === 'initial-worker-ready-signal') { // Direct check for the signal from worker
                // This case might be redundant if findWorkerReadyRequestId works, but good fallback
                console.log('Worker is ready (initial signal received).');
            }
            return;
        }

        if (response.type === 'hnswBuildProgress') {
            console.log(`[Main Thread] HNSW build progress from worker: ${response.data?.progress}% - ${response.data?.message}`);
            return;
        }

        if (response.type === 'modelLoadingStatusUpdate') { // New type for progress
            console.log(`[Main Thread] Model loading progress from worker:`, response.data);
            return; // Don't treat as a promise fulfillment
        }

        if (!response.id) {
            console.warn('Received worker message with no ID (and not a known ID-less type):', response);
            return;
        }

        const pendingRequest = this.pendingRequests.get(response.id);
        if (!pendingRequest) {
            console.warn(`Received response for unknown or already handled request ID: ${response.id}`, response);
            return;
        }

        this.pendingRequests.delete(response.id);

        if (response.success === false || response.error) {
            console.error(`Error from worker for operation ${pendingRequest.operation} (ID: ${response.id}):`, response.error || 'Unknown worker error', response);
            pendingRequest.reject(new Error(response.error || `Worker operation ${pendingRequest.operation} failed`));
        } else {
            // For loadModel, ensure we're getting the 'ready' status
            if (pendingRequest.operation === 'loadModel' && response.type === 'modelLoadingStatus' && response.status !== 'ready') {
                // This shouldn't happen if worker only sends final 'ready' or 'error' with ID
                console.warn(`[EmbeddingService] loadModel promise resolved with non-ready status:`, response);
                // Re-queue or handle as error? For now, let it pass but log.
                // Or, better, the worker should ONLY send the final 'ready' or 'error' with the original ID.
                pendingRequest.reject(new Error(`loadModel resolved with status: ${response.status}`));
                return;
            }
            pendingRequest.resolve(response);
        }
    }

    // Helper to find the ID used for the workerReady promise during initialization
    private findWorkerReadyRequestId(): string | undefined {
        for (const [id, req] of this.pendingRequests.entries()) {
            if (req.operation === 'workerReady') {
                return id;
            }
        }
        return undefined;
    }

    private async sendWorkerMessage(messageData: Omit<WorkerMessage, 'id'> & { id?: string }, operationName?: string): Promise<any> {
        if (!this.worker && !this.isLoading && !this.isInitialized) {
            console.log("[sendWorkerMessage] Worker not ready, attempting to initialize service first...");
            await this.initialize();
        }
        if (!this.worker) {
            const errorMsg = 'Embedding worker not available or initialization failed';
            console.error(`[sendWorkerMessage] ${errorMsg} for operation: ${operationName}`);
            return Promise.reject(new Error(errorMsg));
        }

        return new Promise((resolve, reject) => {
            const id = messageData.id || nanoid(); // Use provided ID or generate new one
            const fullMessage: WorkerMessage = { ...messageData, id, type: messageData.type };

            this.pendingRequests.set(id, { resolve, reject, operation: operationName || messageData.type });
            try {
                this.worker!.postMessage(fullMessage);
            } catch (postError) {
                console.error(`[sendWorkerMessage] Error posting message to worker for operation ${operationName}:`, postError);
                this.pendingRequests.delete(id);
                reject(postError);
            }
        });
    }

    private cleanupWorker(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        // Reject any outstanding promises
        this.pendingRequests.forEach((pending) => {
            if (pending.reject) {
                pending.reject(new Error(`Worker was terminated during operation: ${pending.operation || 'Unknown operation'}`));
            }
        });
        this.pendingRequests.clear();
        this.isInitialized = false;
        this.isHnswLibInitializedInWorker = false;
        this.isHnswIndexReadyInWorker = false;
        this.isGlobalHnswIndexReadyInWorker = false;
        this.currentWorkerIndexContext = 'global';
    }
}

// Create singleton instance
export const embeddingService = new EmbeddingService();