// Web Worker for embedding calculations AND HNSW operations
import { pipeline, env as transformersEnv } from '@xenova/transformers';
import { loadHnswlib } from 'hnswlib-wasm'; // For HNSW operations

// Configure Transformers.js for query embedding
transformersEnv.allowLocalModels = false;
transformersEnv.allowRemoteModels = true;
transformersEnv.useBrowserCache = true;

// Types for messages (should align with EmbeddingService.ts WorkerMessage)
interface WorkerMessage {
    id: string;
    type: 'loadModel' | 'embedQuery' | 'rankSimilarity' | // Original types
    'initHnswLib' | 'initHnswIndex' | 'addPointsToHnsw' | 'searchHnsw' |
    'loadHnswIndexFile' | 'saveHnswIndexFile' | 'switchHnswContext';
    [key: string]: any;
}

// --- HNSW State within Worker ---
let hnswlib: any = null; // Loaded HNSW library instance (e.g., the object from loadHnswlib())

// New HNSW index management with separate contexts
interface HnswIndexContext {
    index: any;                             // The HNSW index instance
    internalLabelMap: number[];             // Maps internal HNSW labels to original indices
    populated: boolean;                     // Whether points have been added
    initialized: boolean;                   // Whether index has been initialized
    maxElements: number;                    // Capacity of the index
    filename?: string;                      // Associated filename (for global context)
}

// Storage for different HNSW index contexts
const hnswContexts: Record<string, HnswIndexContext> = {
    global: {
        index: null,
        internalLabelMap: [],
        populated: false,
        initialized: false,
        maxElements: 0
    },
    temporary: {
        index: null,
        internalLabelMap: [],
        populated: false,
        initialized: false,
        maxElements: 0
    }
};

// Track the active context
let activeHnswContext: 'global' | 'temporary' = 'global';

const HNSW_DIMENSION = 384;
let isHnswLibCurrentlyLoading = false;
// --- End HNSW State ---

// --- Embedding Model State ---
let embeddingPipeline: any = null;
let embeddingModelName = 'Xenova/all-MiniLM-L6-v2';
let isEmbeddingModelLoading = false;
// --- End Embedding Model State ---

// Initialize worker and handle incoming messages
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    try {
        switch (message.type) {
            // Embedding model operations
            case 'loadModel':
                await handleLoadEmbeddingModel(message);
                break;
            case 'embedQuery':
                await handleEmbedQuery(message);
                break;
            case 'rankSimilarity': // Brute-force, deprecated but kept for reference
                await handleRankSimilarityBruteForce(message);
                break;

            // HNSW operations
            case 'initHnswLib':
                await handleInitHnswLib(message);
                break;
            case 'initHnswIndex': // Initializes or loads an index structure
                await handleInitHnswIndex(message);
                break;
            case 'addPointsToHnsw': // Adds points to the currently initialized index
                await handleAddPointsToHnsw(message);
                break;
            case 'searchHnsw':
                await handleSearchHnsw(message);
                break;
            case 'saveHnswIndexFile': // Explicit save command
                await handleSaveHnswIndexFile(message);
                break;
            case 'switchHnswContext': // New handler for switching between contexts
                await handleSwitchHnswContext(message);
                break;

            default:
                console.error(`[Worker] Unknown message type: ${message.type}`, message);
                sendMessage({ id: message.id, type: `${message.type}Result`, success: false, error: `Unknown message type: ${message.type}` });
        }
    } catch (error: any) {
        console.error(`[Worker] Top-level error handling message type ${message.type} (ID: ${message.id}):`, error);
        sendMessage({ id: message.id, type: `${message.type}Result`, success: false, error: error.message || 'Unknown error in worker main handler' });
    }
};

async function handleLoadEmbeddingModel(message: WorkerMessage) {
    const originalMessageId = message.id; // Store the ID for the final response

    if (message.modelName) embeddingModelName = message.modelName;

    if (embeddingPipeline) {
        return sendMessage({
            id: originalMessageId, // Use original ID
            type: 'modelLoadingStatus',
            status: 'ready',
            data: { message: `Model ${embeddingModelName} already loaded` },
            success: true
        });
    }
    if (isEmbeddingModelLoading) {
        // If already loading, we can't easily tie this new request to the ongoing load's promise.
        // For now, just inform. A more robust system might queue this or use a shared promise.
        return sendMessage({
            id: originalMessageId, // Use original ID
            type: 'modelLoadingStatus',
            status: 'loading',
            data: { message: `Model ${embeddingModelName} is already loading by a previous request.` },
            success: false // Indicate it's not fulfilling *this* specific request immediately
        });
    }

    isEmbeddingModelLoading = true;
    try {
        embeddingPipeline = await pipeline('feature-extraction', embeddingModelName, {
            progress_callback: (progress: any) => {
                // Send progress messages without an ID, or with a generic one not tied to a promise
                // These are "fire and forget" informational messages.
                sendMessage({
                    type: 'modelLoadingStatusUpdate', // Different type for progress
                    status: 'loading',
                    data: {
                        progress: progress.progress ? Math.round(progress.progress * 100) : undefined,
                        message: `${progress.status}: ${progress.file || ''}`
                    }
                });
            }
        });
        sendMessage({
            id: originalMessageId, // Use original ID for final success
            type: 'modelLoadingStatus',
            status: 'ready',
            data: { message: `Model ${embeddingModelName} loaded successfully` },
            success: true
        });
    } catch (error: any) {
        sendMessage({
            id: originalMessageId, // Use original ID for final error
            type: 'modelLoadingStatus',
            status: 'error',
            error: `Error loading model: ${error.message || 'Unknown error'}`,
            success: false
        });
    } finally {
        isEmbeddingModelLoading = false;
    }
}

async function handleEmbedQuery(message: WorkerMessage) {
    const { query } = message;
    if (!query || typeof query !== 'string') {
        return sendMessage({ id: message.id, type: 'queryEmbeddingResult', data: { embedding: null }, error: 'Invalid query', success: false });
    }
    if (!embeddingPipeline) {
        if (isEmbeddingModelLoading) {
            // If model is currently loading, wait for it to finish
            // This requires a promise or a polling mechanism. For simplicity, let's just inform and fail for now.
            // A more robust solution would be to queue this request until model is loaded.
            console.warn('[Worker] Embedding model is loading, query will likely fail or be delayed.');
            // To actually wait, handleLoadEmbeddingModel would need to return a promise that resolves when loading is done.
            // For now, let's ensure it tries to load if not loading.
            await handleLoadEmbeddingModel({ ...message, type: 'loadModel' }); // Try to load
        } else {
            // If not loaded and not currently loading, trigger load
            await handleLoadEmbeddingModel({ ...message, type: 'loadModel' });
        }
        // Check again after attempting to load
        if (!embeddingPipeline) {
            return sendMessage({ id: message.id, type: 'queryEmbeddingResult', data: { embedding: null }, error: 'Embedding model could not be loaded.', success: false });
        }
    }
    try {
        const embeddingTensor = await embeddingPipeline(query, { pooling: 'mean', normalize: true });
        const embedding = new Float32Array(embeddingTensor.data);
        sendMessage({ id: message.id, type: 'queryEmbeddingResult', data: { embedding }, success: true }, [embedding.buffer]);
    } catch (error: any) {
        sendMessage({ id: message.id, type: 'queryEmbeddingResult', data: { embedding: null }, error: `Error generating embedding: ${error.message || 'Unknown error'}`, success: false });
    }
}

// --- HNSW Handlers ---

async function ensureHnswLibLoadedInternal(): Promise<boolean> {
    if (hnswlib) return true;
    if (isHnswLibCurrentlyLoading) {
        // Simple wait mechanism if already loading
        await new Promise(resolve => setTimeout(resolve, 200)); // Check again
        return !!hnswlib;
    }
    isHnswLibCurrentlyLoading = true;
    console.log('[Worker HNSW] Loading hnswlib-wasm library in worker...');
    try {
        hnswlib = await loadHnswlib();
        console.log('[Worker HNSW] hnswlib-wasm library loaded successfully in worker.');
        return true;
    } catch (error: any) {
        console.error('[Worker HNSW] Failed to load hnswlib-wasm in worker:', error);
        hnswlib = null;
        throw error; // Re-throw to be caught by the calling handler
    } finally {
        isHnswLibCurrentlyLoading = false;
    }
}

async function handleInitHnswLib(message: WorkerMessage) {
    try {
        await ensureHnswLibLoadedInternal();
        sendMessage({ id: message.id, type: 'initHnswLibResult', success: true });
    } catch (error: any) {
        sendMessage({ id: message.id, type: 'initHnswLibResult', success: false, error: error.message });
    }
}

async function handleInitHnswIndex(message: WorkerMessage) {
    try {
        if (!await ensureHnswLibLoadedInternal()) {
            throw new Error('HNSW library failed to load or was not ready.');
        }

        const {
            maxElements,
            M = 16,
            efConstruction = 200,
            efSearch = 32,
            filename,
            forceRebuild = false,
            persistIndex = true, // This tells the worker if it *should attempt* to load/use persisted file
            indexContext = 'global' // Default to global if not specified
        } = message.data;

        // Validate context
        if (indexContext !== 'global' && indexContext !== 'temporary') {
            throw new Error(`Invalid indexContext "${indexContext}". Must be "global" or "temporary".`);
        }

        // Switch active context
        activeHnswContext = indexContext;

        // Get context object
        const context = hnswContexts[activeHnswContext];

        if (typeof maxElements !== 'number' || maxElements <= 0) {
            throw new Error('Invalid maxElements parameter for HNSW index initialization.');
        }

        // Reset state flags before attempting init/load
        context.initialized = false;
        context.populated = false;
        context.index = null; // Ensure we are not reusing a stale index object by mistake
        context.internalLabelMap = [];

        // For global context, store the filename
        if (indexContext === 'global' && filename) {
            context.filename = filename;
        }

        let loadedFromSave = false;
        let itemCount = 0;

        // Attempt to load from file only if global context, not forcing rebuild AND persistIndex is true
        if (indexContext === 'global' && !forceRebuild && persistIndex && filename) {
            console.log(`[Worker HNSW] Attempting to load index from "${filename}" (forceRebuild: false, persistIndex: true).`);
            try {
                await hnswlib.EmscriptenFileSystemManager.syncFS(true, undefined); // Sync to read from IDBFS
                const exists = hnswlib.EmscriptenFileSystemManager.checkFileExists(filename);
                if (exists) {
                    console.log(`[Worker HNSW] Found existing index file "${filename}". Loading...`);
                    const tempIndex = new hnswlib.HierarchicalNSW('cosine', HNSW_DIMENSION, "");
                    // The maxElements for readIndex is a limit on how many elements to load if the file is larger,
                    // not a re-initialization of capacity. The file stores its own capacity.
                    // We pass the expected maxElements based on current data to ensure compatibility.
                    await tempIndex.readIndex(filename, maxElements);

                    context.index = tempIndex; // Successfully loaded, assign to context
                    context.maxElements = maxElements;
                    tempIndex.setEfSearch(efSearch);
                    itemCount = tempIndex.getCurrentCount();

                    if (itemCount > 0) { // If items were loaded
                        context.populated = true;
                        // Reconstruct the label map. HNSW internal labels are 0 to itemCount-1.
                        // These directly map to the indices of the sourceProducts array
                        context.internalLabelMap = Array.from({ length: itemCount }, (_, i) => i);
                        console.log(`[Worker HNSW] Reconstructed internalLabelMap for ${itemCount} loaded items.`);
                    }
                    loadedFromSave = true;
                    console.log(`[Worker HNSW] Index loaded from "${filename}" with ${itemCount} items. Populated: ${context.populated}`);
                } else {
                    console.log(`[Worker HNSW] Index file "${filename}" not found. Will initialize a new one.`);
                }
            } catch (loadError: any) {
                console.warn(`[Worker HNSW] Failed to load index from "${filename}", will initialize a new one. Error:`, loadError.message);
                context.index = null; // Ensure it's null if load failed
                // loadedFromSave remains false, so it will proceed to new index initialization
            }
        }

        // If not loaded from save (either file didn't exist, load failed, forceRebuild=true, or not global context)
        if (!loadedFromSave) {
            console.log(`[Worker HNSW] Initializing NEW HNSW index for "${indexContext}" context (maxElements: ${maxElements}, M: ${M}, efC: ${efConstruction}).`);
            context.index = new hnswlib.HierarchicalNSW('cosine', HNSW_DIMENSION, "");
            context.index.initIndex(maxElements, M, efConstruction, 100); // 4th param seed
            context.index.setEfSearch(efSearch);
            context.internalLabelMap = []; // Reset for a completely new index
            context.maxElements = maxElements;
            itemCount = 0; // New index has 0 items
            context.populated = false; // Not populated until points are added
        }

        context.initialized = true; // The HNSW object exists and is configured.

        sendMessage({
            id: message.id,
            type: 'initHnswIndexResult',
            success: true,
            data: {
                loadedFromSave: loadedFromSave,
                itemCount: itemCount, // This is count from loaded index, or 0 if new
                context: indexContext
            }
        });

    } catch (error: any) {
        console.error('[Worker HNSW] Error in handleInitHnswIndex:', error);

        // Reset context state on error
        if (activeHnswContext && hnswContexts[activeHnswContext]) {
            hnswContexts[activeHnswContext].initialized = false;
            hnswContexts[activeHnswContext].populated = false;
            hnswContexts[activeHnswContext].index = null;
        }

        sendMessage({ id: message.id, type: 'initHnswIndexResult', success: false, error: error.message });
    }
}

async function handleAddPointsToHnsw(message: WorkerMessage) {
    // Get context to use (default to active if not specified)
    const contextName = message.data.indexContext || activeHnswContext;
    const context = hnswContexts[contextName];

    if (!context || !context.index || !context.initialized) {
        return sendMessage({
            id: message.id,
            type: 'addPointsToHnswResult',
            success: false,
            error: `HNSW index not initialized in worker for context "${contextName}".`
        });
    }

    console.log(`[Worker HNSW AddPoints] Adding points to "${contextName}" context. Current maxElements: ${context.maxElements}`);
    console.log(`[Worker HNSW AddPoints] Current index.getCurrentCount(): ${context.index.getCurrentCount()}`);
    console.log(`[Worker HNSW AddPoints] isPopulated flag: ${context.populated}`);

    const { points } = message.data; // points = Array<{ embedding: number[], label: number (originalIndex) }>
    if (!points || !Array.isArray(points)) {
        return sendMessage({ id: message.id, type: 'addPointsToHnswResult', success: false, error: 'Invalid points data.' });
    }

    try {
        console.time('[Worker HNSW] Add points time');
        // If this is a fresh build (not adding to an existing populated index), reset labels
        if (!context.populated || context.index.getCurrentCount() === 0) {
            context.internalLabelMap = [];
        }

        let addedCountSinceLastCall = 0;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (point.embedding && point.embedding.length === HNSW_DIMENSION && typeof point.label === 'number') {
                // Ensure embedding is Float32Array
                const embeddingArray = point.embedding instanceof Float32Array ? point.embedding : new Float32Array(point.embedding);

                const internalLabel = context.index.getCurrentCount(); // Use current count as the next internal label
                context.index.addPoint(embeddingArray, internalLabel, false); // 3rd param replaceDeleted
                context.internalLabelMap[internalLabel] = point.label; // Map HNSW's internal label to original product index
                addedCountSinceLastCall++;
            }
            // Progress update
            if (i > 0 && i % Math.max(1, Math.floor(points.length / 20)) === 0) {
                self.postMessage({ type: 'hnswBuildProgress', data: { progress: Math.round(((i + 1) / points.length) * 100), message: `Adding point ${i + 1}/${points.length}` } });
            }
        }
        console.timeEnd('[Worker HNSW] Add points time');
        context.populated = context.index.getCurrentCount() > 0;
        self.postMessage({ type: 'hnswBuildProgress', data: { progress: 100, message: `Finished adding points. Total items: ${context.index.getCurrentCount()}` } });
        sendMessage({
            id: message.id,
            type: 'addPointsToHnswResult',
            success: true,
            data: {
                itemCount: context.index.getCurrentCount(),
                context: contextName
            }
        });
    } catch (error: any) {
        console.error('[Worker HNSW] Error adding points to HNSW index:', error);
        sendMessage({ id: message.id, type: 'addPointsToHnswResult', success: false, error: error.message });
    }
}

async function handleSearchHnsw(message: WorkerMessage) {
    // Get context to use (default to active if not specified)
    const contextName = message.data.indexContext || activeHnswContext;
    const context = hnswContexts[contextName];

    if (!context || !context.index || !context.initialized || !context.populated) {
        return sendMessage({
            id: message.id,
            type: 'searchHnswResult',
            success: false,
            error: `HNSW index not ready or not populated in worker for context "${contextName}".`
        });
    }

    const { queryEmbedding, limit = 100 } = message.data;
    if (!queryEmbedding || queryEmbedding.length !== HNSW_DIMENSION) {
        return sendMessage({ id: message.id, type: 'searchHnswResult', success: false, error: 'Invalid query embedding.' });
    }

    try {
        console.log(`[Worker HNSW] Searching in context "${contextName}" with limit ${limit} (max elements: ${context.maxElements})`);

        const queryEmbeddingF32 = queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);

        // Ensure limit doesn't exceed maxElements
        const effectiveLimit = Math.min(limit, context.maxElements);

        const rawResults = context.index.searchKnn(queryEmbeddingF32, effectiveLimit, undefined); // 3rd param filter

        const finalResults = {
            // Map internal HNSW labels back to the original product indices
            neighbors: rawResults.neighbors.map((internalLabel: number) => context.internalLabelMap[internalLabel]),
            distances: rawResults.distances
        };

        // Filter out any undefined mappings (if internalLabelMap was somehow incomplete)
        const validNeighbors: number[] = [];
        const validDistances: number[] = [];
        finalResults.neighbors.forEach((origIdx, i) => {
            if (typeof origIdx === 'number') {
                validNeighbors.push(origIdx);
                validDistances.push(finalResults.distances[i]);
            }
        });

        sendMessage({
            id: message.id,
            type: 'searchHnswResult',
            success: true,
            data: {
                neighbors: validNeighbors,
                distances: validDistances,
                context: contextName
            }
        });
    } catch (error: any) {
        console.error('[Worker HNSW] Error searching HNSW index:', error);
        sendMessage({ id: message.id, type: 'searchHnswResult', success: false, error: error.message });
    }
}

async function handleSaveHnswIndexFile(message: WorkerMessage) {
    // Get context to use (default to global since only global indices are saved)
    const contextName = message.data.indexContext || 'global';

    // Only allow saving global context
    if (contextName !== 'global') {
        return sendMessage({
            id: message.id,
            type: 'saveHnswIndexFileResult',
            success: false,
            error: 'Only the global context can be saved to a file.'
        });
    }

    const context = hnswContexts[contextName];

    if (!context || !context.index || !context.initialized || !context.populated) {
        return sendMessage({
            id: message.id,
            type: 'saveHnswIndexFileResult',
            success: false,
            error: `HNSW index not ready or not populated in worker for context "${contextName}", cannot save.`
        });
    }

    const { filename } = message.data;
    const actualFilename = filename || context.filename;

    if (!actualFilename) {
        return sendMessage({
            id: message.id,
            type: 'saveHnswIndexFileResult',
            success: false,
            error: 'Filename not provided for saving index.'
        });
    }

    try {
        console.log(`[Worker HNSW] Saving index to "${actualFilename}"...`);
        await context.index.writeIndex(actualFilename);
        await hnswlib.EmscriptenFileSystemManager.syncFS(false, undefined); // Persist to IDBFS
        console.log(`[Worker HNSW] Index successfully saved to "${actualFilename}".`);

        // Update filename in context if it changed
        context.filename = actualFilename;

        sendMessage({
            id: message.id,
            type: 'saveHnswIndexFileResult',
            success: true,
            data: { context: contextName }
        });
    } catch (error: any) {
        console.error(`[Worker HNSW] Error saving HNSW index to "${actualFilename}":`, error);
        sendMessage({
            id: message.id,
            type: 'saveHnswIndexFileResult',
            success: false,
            error: error.message
        });
    }
}

/**
 * Handle requests to switch between global and temporary HNSW contexts
 */
async function handleSwitchHnswContext(message: WorkerMessage) {
    try {
        const { targetContext, filename } = message.data;

        if (targetContext !== 'global' && targetContext !== 'temporary') {
            throw new Error(`Invalid targetContext "${targetContext}". Must be "global" or "temporary".`);
        }

        console.log(`[Worker HNSW] Switching from "${activeHnswContext}" to "${targetContext}" context`);

        // If we're already in the requested context, just confirm success
        if (activeHnswContext === targetContext) {
            console.log(`[Worker HNSW] Already in "${targetContext}" context`);
            return sendMessage({
                id: message.id,
                type: 'switchHnswContextResult',
                success: true,
                data: { context: targetContext }
            });
        }

        // If switching to global context and it's not initialized but we have a filename,
        // try to load it from disk if available (without rebuilding)
        if (targetContext === 'global' && !hnswContexts.global.initialized && filename) {
            console.log(`[Worker HNSW] Global context not initialized. Attempting to load from "${filename}"...`);

            try {
                await hnswlib.EmscriptenFileSystemManager.syncFS(true, undefined);
                const exists = hnswlib.EmscriptenFileSystemManager.checkFileExists(filename);

                if (exists) {
                    console.log(`[Worker HNSW] Found existing global index file "${filename}". Loading...`);
                    const globalIndex = new hnswlib.HierarchicalNSW('cosine', HNSW_DIMENSION, "");
                    await globalIndex.readIndex(filename);

                    const globalContext = hnswContexts.global;
                    globalContext.index = globalIndex;
                    globalContext.initialized = true;
                    globalContext.filename = filename;

                    const itemCount = globalIndex.getCurrentCount();
                    globalContext.populated = itemCount > 0;
                    globalContext.maxElements = globalIndex.getMaxElements();

                    if (itemCount > 0) {
                        // Reconstruct label map
                        globalContext.internalLabelMap = Array.from({ length: itemCount }, (_, i) => i);
                    }

                    console.log(`[Worker HNSW] Successfully loaded global index from "${filename}" with ${itemCount} items.`);
                } else {
                    console.log(`[Worker HNSW] Global index file "${filename}" not found. Can't initialize global context.`);
                }
            } catch (loadError) {
                console.error(`[Worker HNSW] Error loading global index:`, loadError);
                // Continue with context switch even if load failed
            }
        }

        // Check if the requested context is initialized
        if (!hnswContexts[targetContext].initialized) {
            console.warn(`[Worker HNSW] Target context "${targetContext}" is not initialized yet.`);
        }

        // Switch the active context
        activeHnswContext = targetContext;

        sendMessage({
            id: message.id,
            type: 'switchHnswContextResult',
            success: true,
            data: {
                context: targetContext,
                initialized: hnswContexts[targetContext].initialized,
                populated: hnswContexts[targetContext].populated,
                maxElements: hnswContexts[targetContext].maxElements
            }
        });
    } catch (error: any) {
        console.error('[Worker HNSW] Error switching context:', error);
        sendMessage({
            id: message.id,
            type: 'switchHnswContextResult',
            success: false,
            error: error.message
        });
    }
}

// --- Utility Functions ---
function sendMessage(message: any, transfer?: Transferable[]) {
    self.postMessage(message, transfer || []);
}

// Notify main thread that worker is ready for initial setup
// The main thread's initialize() method sets up a promise that listens for this.
// It's important that the ID here is either not used by main thread to track a specific promise,
// or that the main thread has a special way to handle this one-off "ready" signal.
sendMessage({ type: 'workerReady', id: 'initial-worker-ready-signal' }); // Use a distinct ID or convention