import { decode } from "@msgpack/msgpack";
import { encodeHashToBase64 } from "@holochain/client";

// SearchCacheService.ts
interface CachedData {
    timestamp: number;
    products: any[];
}

interface DecodedProduct {
    name: string;
    price: number;
    size: string;
    category: string;
    subcategory?: string;
    product_type?: string;
    image_url?: string;
    [key: string]: any;
}

// Lookup table interfaces for string normalization
interface LookupTable {
    [key: string]: number;
}

interface ReverseLookupTable {
    [key: number]: string;
}

interface NormalizedLookupTables {
    categories: LookupTable;
    reverseCategories: ReverseLookupTable;
    subcategories: LookupTable;
    reverseSubcategories: ReverseLookupTable;
    productTypes: LookupTable;
    reverseProductTypes: ReverseLookupTable;
    brands: LookupTable;
    reverseBrands: ReverseLookupTable;
    // Add other lookup tables as needed
}

const CACHE_KEY = 'product_search_index_cache';
const CACHE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const LOOKUP_TABLES_KEY = 'lookup_tables_v1';
const CACHE_VERSION = 1; // Increment when changing cache structure

// Top categories to load first for better user experience
const TOP_CATEGORIES = ["Produce", "Beverages", "Dairy & Eggs", "Snacks & Candy", "Meat & Seafood"];
// All remaining categories
const ALL_CATEGORIES = ["Wine", "Frozen", "Prepared Foods", "Liquor", "Floral", "Household", "Bakery",
    "Deli", "Canned Goods & Soups", "Beer", "Pets", "Breakfast", "Condiments & Sauces",
    "Personal Care", "Dry Goods & Pasta", "Oils, Vinegars, & Spices", "Health Care",
    "Baking Essentials", "Kitchen Supplies", "Hard Beverages", "Miscellaneous",
    "Party & Gift Supplies", "Office & Craft", "Baby"];

export default class SearchCacheService {
    // Class variable for database connection
    private static dbPromise: Promise<IDBDatabase> | null = null;

    // Lookup tables for string normalization
    private static lookupTables: NormalizedLookupTables = {
        categories: {},
        reverseCategories: {},
        subcategories: {},
        reverseSubcategories: {},
        productTypes: {},
        reverseProductTypes: {},
        brands: {},
        reverseBrands: {}
    };

    // Open database connection
    private static openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('product-search-cache', 4); // Increased version for lookup tables

            request.onerror = (event) => {
                console.error('IndexedDB error:', event);
                reject('Error opening database');
            };

            request.onsuccess = (event) => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = request.result;

                // Check if products object store already exists and delete if upgrading
                if (db.objectStoreNames.contains('products')) {
                    db.deleteObjectStore('products');
                }

                // Create fresh products store
                db.createObjectStore('products', { keyPath: 'id' });
                console.log('Created new products object store with version 4 (optimized with lookup tables)');
            };
        });
    }

    static async getSearchIndex(store: any, forceRefresh: boolean = false): Promise<any[]> {
        // Always clear cache when forceRefresh is true (app initialization)
        if (forceRefresh) {
            await this.clearCache();
            return this.buildIndexFromCategories(store);
        }

        try {
            // Initialize DB if needed
            if (!this.dbPromise) {
                this.dbPromise = this.openDatabase();
            }
            const db = await this.dbPromise;

            // Get metadata
            const tx = db.transaction('products', 'readonly');

            // Get all keys for debugging
            const keysRequest = tx.objectStore('products').getAllKeys();
            const keys = await new Promise<string[]>((resolve, reject) => {
                keysRequest.onsuccess = () => resolve(keysRequest.result as string[]);
                keysRequest.onerror = () => reject(keysRequest.error);
            });
            console.log(`[SearchCacheService] Found ${keys.length} keys in cache:`, keys.slice(0, 5));

            // Check if we have lookup tables
            const hasLookupTables = keys.includes(LOOKUP_TABLES_KEY);

            // Now get the metadata using the proper key
            const metadataRequest = tx.objectStore('products').get('metadata_v1');
            const metadataItem = await new Promise((resolve, reject) => {
                metadataRequest.onsuccess = () => resolve(metadataRequest.result);
                metadataRequest.onerror = () => reject(metadataRequest.error);
            });

            // Check if cache is valid with better debugging
            const cacheAge = metadataItem?.timestamp ? Date.now() - metadataItem.timestamp : Infinity;
            const isValid = metadataItem &&
                metadataItem.timestamp &&
                metadataItem.productCount > 0 &&
                cacheAge < CACHE_TIMEOUT &&
                metadataItem.version === CACHE_VERSION;

            if (isValid) {
                console.log(`[SearchCacheService] Valid cache found with ${metadataItem.productCount} products, age: ${Math.floor(cacheAge / (60 * 60 * 1000))} hours`);

                // Load lookup tables first if available
                if (hasLookupTables) {
                    const lookupRequest = tx.objectStore('products').get(LOOKUP_TABLES_KEY);
                    const lookupData = await new Promise((resolve, reject) => {
                        lookupRequest.onsuccess = () => resolve(lookupRequest.result);
                        lookupRequest.onerror = () => reject(lookupRequest.error);
                    });

                    if (lookupData) {
                        this.lookupTables = lookupData.tables;
                        console.log(`[SearchCacheService] Loaded lookup tables with ${Object.keys(this.lookupTables.categories).length} categories, ${Object.keys(this.lookupTables.subcategories).length} subcategories, ${Object.keys(this.lookupTables.productTypes).length} product types`);
                    } else {
                        console.warn('[SearchCacheService] Lookup tables key exists but data not found');
                    }
                }

                // Collect all chunks
                const allProducts = [];
                let chunkIndex = 0;
                let hasMoreChunks = true;
                let totalEmbeddingCount = 0;
                let productsWithEmbeddings = 0;
                let arrayBufferCount = 0;

                while (hasMoreChunks) {
                    const chunkId = `chunk_${chunkIndex}`;

                    try {
                        const chunkRequest = tx.objectStore('products').get(chunkId);
                        const chunk = await new Promise((resolve, reject) => {
                            chunkRequest.onsuccess = () => resolve(chunkRequest.result);
                            chunkRequest.onerror = () => reject(chunkRequest.error);
                        });

                        if (chunk && chunk.products && chunk.products.length > 0) {
                            // Process products in chunk
                            const processedProducts = chunk.products.map(product => {
                                // Denormalize product if using lookup tables
                                if (hasLookupTables && metadataItem.normalized) {
                                    product = this.denormalizeProduct(product);
                                }

                                // Convert embedding buffer back to Float32Array if it exists
                                if (product.embeddingBuffer) {
                                    try {
                                        product.embedding = new Float32Array(product.embeddingBuffer);
                                        arrayBufferCount++;
                                        // Remove the buffer property as it's no longer needed
                                        delete product.embeddingBuffer;
                                    } catch (err) {
                                        console.error('Error converting ArrayBuffer to Float32Array:', err);
                                        product.embedding = []; // Fallback to empty array
                                    }
                                } else if (product.embedding && Array.isArray(product.embedding)) {
                                    // Convert regular arrays to Float32Array for consistency
                                    try {
                                        product.embedding = new Float32Array(product.embedding);
                                        productsWithEmbeddings++;
                                    } catch (err) {
                                        console.error('Error converting array to Float32Array:', err);
                                    }
                                }

                                // Recreate hash toString method
                                if (product.hash) {
                                    // For normalized hash data
                                    if (typeof product.hash === 'string' && product.hash.includes(':')) {
                                        const [groupHashStr, indexStr] = product.hash.split(':');
                                        product.hash = {
                                            groupHash: groupHashStr,
                                            index: parseInt(indexStr, 10),
                                            toString: function () {
                                                return `${this.groupHash}:${this.index}`;
                                            }
                                        };
                                    }
                                    // For legacy hash objects that need toString restored
                                    else if (product.hash.needsToString) {
                                        product.hash.toString = function () {
                                            const groupHashStr = (this.groupHash instanceof Uint8Array)
                                                ? encodeHashToBase64(this.groupHash)
                                                : String(this.groupHash);
                                            return `${groupHashStr}:${this.index}`;
                                        };
                                        delete product.hash.needsToString;
                                    }
                                }

                                return product;
                            });

                            allProducts.push(...processedProducts);
                            chunkIndex++;
                        } else {
                            hasMoreChunks = false;
                        }
                    } catch (error) {
                        console.error(`[SearchCacheService] Error loading chunk ${chunkId}:`, error);
                        hasMoreChunks = false;
                    }
                }

                console.log(`[SearchCacheService] Loaded ${allProducts.length} products from cache. Found ${arrayBufferCount} products with ArrayBuffer embeddings and ${productsWithEmbeddings} with array embeddings.`);

                // Validate data integrity
                const hasValidData = this.validateCachedProducts(allProducts);
                if (!hasValidData) {
                    console.log('[SearchCacheService] Cache validation failed, rebuilding index from DHT');
                    return this.buildIndexFromCategories(store);
                }

                return allProducts;
            } else {
                console.log('[SearchCacheService] Cache invalid or expired, rebuilding index from DHT');
            }
        } catch (error) {
            console.error('[SearchCacheService] Error accessing IndexedDB cache:', error);
        }

        // If cache invalid or error occurred, build from categories
        return this.buildIndexFromCategories(store);
    }

    private static validateCachedProducts(products: any[]): boolean {
        if (!products.length) {
            console.log('[SearchCacheService] No products found in cache');
            return false;
        }

        const sampleSize = Math.min(10, products.length);
        const sampleProducts = products.slice(0, sampleSize);

        // Check if essential properties exist
        for (const product of sampleProducts) {
            if (!product.name || !product.category) {
                console.log('[SearchCacheService] Product missing essential properties (name or category)');
                return false;
            }
        }

        // Sample embedding information for diagnostic purposes
        const withEmbeddings = products.filter(p => p.embedding && (p.embedding.length > 0)).length;
        const withTypedEmbeddings = products.filter(p => p.embedding instanceof Float32Array).length;
        console.log(`[SearchCacheService] Product cache stats: ${withEmbeddings}/${products.length} have embeddings, ${withTypedEmbeddings} are Float32Arrays`);

        return true;
    }

    private static async buildIndexFromCategories(store: any): Promise<any[]> {
        let allProducts = [];
        const limit = 1000; // ProductGroups per category (each group can contain up to ~100 products)
        let totalProductCount = 0;

        // Reset lookup tables
        this.initializeLookupTables();

        try {
            console.log('[SearchCacheService] Building search index from Holochain DHT');

            // First load top categories for better UX
            for (const category of TOP_CATEGORIES) {
                try {
                    const response = await store.service.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_products_by_category",
                        payload: {
                            category,
                            limit
                        },
                    });

                    if (response && response.product_groups && response.product_groups.length > 0) {
                        const productsFromGroups = this.extractProductsFromGroups(response.product_groups);
                        allProducts = [...allProducts, ...productsFromGroups];
                        totalProductCount += productsFromGroups.length;
                        console.log(`[SearchCacheService] Loaded ${productsFromGroups.length} products from category ${category}`);
                    }
                } catch (error) {
                    console.error(`[SearchCacheService] Error loading category ${category}:`, error);
                }
            }

            // Load remaining categories
            for (const category of ALL_CATEGORIES) {
                // Skip if already loaded in top categories
                if (TOP_CATEGORIES.includes(category)) continue;

                try {
                    const response = await store.service.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_products_by_category",
                        payload: {
                            category,
                            limit
                        },
                    });

                    if (response && response.product_groups && response.product_groups.length > 0) {
                        const productsFromGroups = this.extractProductsFromGroups(response.product_groups);
                        allProducts = [...allProducts, ...productsFromGroups];
                        totalProductCount += productsFromGroups.length;
                        console.log(`[SearchCacheService] Loaded ${productsFromGroups.length} products from category ${category}`);
                    }
                } catch (error) {
                    console.error(`[SearchCacheService] Error loading category ${category}:`, error);
                }
            }

            // Log lookup table stats
            console.log(`[SearchCacheService] Lookup tables created:`, {
                categories: Object.keys(this.lookupTables.categories).length,
                subcategories: Object.keys(this.lookupTables.subcategories).length,
                productTypes: Object.keys(this.lookupTables.productTypes).length,
                brands: Object.keys(this.lookupTables.brands).length
            });

            // Update cache once with all products after everything is loaded
            console.log(`[SearchCacheService] Writing complete cache with ${allProducts.length} products...`);
            await this.updateCache(allProducts);

            console.log(`[SearchCacheService] Search index initialized with ${allProducts.length} products from ${totalProductCount} total products`);
            return allProducts;
        } catch (error) {
            console.error("[SearchCacheService] Error building search index:", error);
            return []; // Return empty array on error instead of partial results
        }
    }

    /**
     * Initialize empty lookup tables
     */
    private static initializeLookupTables(): void {
        this.lookupTables = {
            categories: {},
            reverseCategories: {},
            subcategories: {},
            reverseSubcategories: {},
            productTypes: {},
            reverseProductTypes: {},
            brands: {},
            reverseBrands: {}
        };
    }

    /**
     * Add a value to the appropriate lookup table if it doesn't exist
     */
    private static addToLookupTable(value: string | null | undefined, table: LookupTable, reverseTable: ReverseLookupTable): number {
        // Handle null or undefined
        if (value === null || value === undefined || value === '') {
            return 0; // Use 0 to represent null/undefined/empty values
        }

        // If already in lookup table, return existing ID
        if (table[value] !== undefined) {
            return table[value];
        }

        // Otherwise add to lookup table with new ID
        const newId = Object.keys(table).length + 1; // Start at 1 (0 reserved for null/undefined)
        table[value] = newId;
        reverseTable[newId] = value;
        return newId;
    }

    /**
     * Get a value from the reverse lookup table
     */
    private static getFromReverseLookup(id: number, reverseTable: ReverseLookupTable): string | null {
        if (id === 0) return null; // 0 represents null/undefined/empty
        return reverseTable[id] || null;
    }

    /**
     * Extract products from Holochain product groups and collect unique values for lookup tables
     */
    private static extractProductsFromGroups(productGroups: any[]): any[] {
        let extractedProducts: any[] = [];
        let productsWithEmbeddings = 0;
        let totalProducts = 0;

        for (const record of productGroups) {
            try {
                // Get the group hash (ActionHash of the ProductGroup entry)
                const groupHash = record.signed_action.hashed.hash;

                // Decode the ProductGroup entry data
                const groupEntry = decode(record.entry.Present.entry);

                // Check if it's a valid ProductGroup with a products array
                if (groupEntry && Array.isArray(groupEntry.products)) {
                    totalProducts += groupEntry.products.length;

                    groupEntry.products.forEach((product: any, index: number) => {
                        // Convert embedding to Float32Array if it exists
                        let embeddingTypedArray = null;
                        if (product.embedding && Array.isArray(product.embedding)) {
                            try {
                                embeddingTypedArray = new Float32Array(product.embedding);
                                productsWithEmbeddings++;
                            } catch (err) {
                                console.error('Error converting to Float32Array:', err);
                                embeddingTypedArray = null;
                            }
                        }

                        // Add values to lookup tables
                        const categoryId = this.addToLookupTable(
                            product.category,
                            this.lookupTables.categories,
                            this.lookupTables.reverseCategories
                        );

                        const subcategoryId = this.addToLookupTable(
                            product.subcategory,
                            this.lookupTables.subcategories,
                            this.lookupTables.reverseSubcategories
                        );

                        const productTypeId = this.addToLookupTable(
                            product.product_type,
                            this.lookupTables.productTypes,
                            this.lookupTables.reverseProductTypes
                        );

                        // Extract potential brand from name (simplified approach)
                        let brand = null;
                        if (product.name) {
                            // Try to extract brand from first part of name
                            const parts = product.name.split(' ');
                            if (parts.length > 0) {
                                brand = parts[0];
                            }
                        }

                        const brandId = this.addToLookupTable(
                            brand,
                            this.lookupTables.brands,
                            this.lookupTables.reverseBrands
                        );

                        // Simplified hash string instead of object with methods
                        const hashString = `${groupHash instanceof Uint8Array ? encodeHashToBase64(groupHash) : groupHash}:${index}`;

                        // Construct the product object for the client-side index
                        extractedProducts.push({
                            // Essential fields remain as-is
                            name: product.name,
                            price: product.price,
                            promo_price: product.promo_price,
                            size: product.size,
                            stocks_status: product.stocks_status,

                            // Normalized fields (will be lookup IDs in storage)
                            categoryId: categoryId,
                            subcategoryId: subcategoryId,
                            productTypeId: productTypeId,
                            brandId: brandId,

                            // Non-normalized fields for initial client use
                            category: product.category,
                            subcategory: product.subcategory,
                            product_type: product.product_type,
                            image_url: product.image_url,
                            sold_by: product.sold_by,
                            productId: product.product_id,

                            // Store the embedding as a Float32Array or empty array if conversion failed
                            embedding: embeddingTypedArray || new Float32Array(0),

                            // Simplified hash
                            hash: {
                                groupHash,
                                index,
                                toString: function () {
                                    const groupHashStr = (this.groupHash instanceof Uint8Array)
                                        ? encodeHashToBase64(this.groupHash)
                                        : String(this.groupHash);
                                    return `${groupHashStr}:${this.index}`;
                                }
                            },

                            // Simplified hash string for storage
                            hashString: hashString
                        });
                    });
                }
            } catch (error) {
                console.error("Error extracting products from group:", error);
            }
        }

        console.log(`[SearchCacheService] Extracted ${extractedProducts.length} products from ${productGroups.length} groups. ${productsWithEmbeddings}/${totalProducts} have embeddings.`);
        return extractedProducts;
    }

    /**
     * Normalize a product for storage by replacing strings with IDs
     */
    private static normalizeProduct(product: any): any {
        const normalized = { ...product };

        // Remove redundant category/subcategory/product_type strings (already stored as IDs)
        delete normalized.category;
        delete normalized.subcategory;
        delete normalized.product_type;

        // Replace hash object with string representation
        if (normalized.hash && typeof normalized.hash === 'object') {
            if (normalized.hashString) {
                normalized.hash = normalized.hashString;
            } else if (normalized.hash.toString) {
                normalized.hash = normalized.hash.toString();
            }
        }
        delete normalized.hashString;

        return normalized;
    }

    /**
     * Denormalize a product by replacing IDs with string values
     */
    private static denormalizeProduct(product: any): any {
        const denormalized = { ...product };

        // Restore category/subcategory/product_type from IDs
        denormalized.category = this.getFromReverseLookup(product.categoryId, this.lookupTables.reverseCategories);
        denormalized.subcategory = this.getFromReverseLookup(product.subcategoryId, this.lookupTables.reverseSubcategories);
        denormalized.product_type = this.getFromReverseLookup(product.productTypeId, this.lookupTables.reverseProductTypes);

        // Keep the IDs for potential internal use but these won't be needed by the client

        return denormalized;
    }

    private static async updateCache(products: any[]): Promise<void> {
        try {
            // Verify product embedding data before caching
            let productsWithTypedEmbeddings = 0;
            let productsWithArrayEmbeddings = 0;
            let totalEmbeddingDimensions = 0;

            // Check if we already have an open database connection
            if (!this.dbPromise) {
                this.dbPromise = this.openDatabase();
            }
            const db = await this.dbPromise;

            const tx = db.transaction('products', 'readwrite');
            const store = tx.objectStore('products');

            // Store lookup tables first
            try {
                const lookupTablesRecord = {
                    id: LOOKUP_TABLES_KEY,
                    tables: this.lookupTables,
                    timestamp: Date.now()
                };

                const lookupPutRequest = store.put(lookupTablesRecord);
                await new Promise((resolve, reject) => {
                    lookupPutRequest.onsuccess = resolve;
                    lookupPutRequest.onerror = reject;
                });

                console.log(`[SearchCacheService] Stored lookup tables with ${Object.keys(this.lookupTables.categories).length} categories, ${Object.keys(this.lookupTables.subcategories).length} subcategories, ${Object.keys(this.lookupTables.productTypes).length} product types`);
            } catch (lookupError) {
                console.error('[SearchCacheService] Error storing lookup tables:', lookupError);
            }

            // Store metadata with version and normalized flag
            try {
                const metadata = {
                    id: 'metadata_v1',
                    timestamp: Date.now(),
                    productCount: products.length,
                    lastUpdate: new Date().toISOString(),
                    version: CACHE_VERSION,
                    normalized: true // Flag that indicates we're using normalized data
                };
                const metadataPutRequest = store.put(metadata);
                await new Promise((resolve, reject) => {
                    metadataPutRequest.onsuccess = resolve;
                    metadataPutRequest.onerror = reject;
                });
                console.log(`[SearchCacheService] Stored metadata for ${products.length} products`);
            } catch (metadataError) {
                console.error('[SearchCacheService] Error storing metadata:', metadataError);
            }

            // Store products in chunks to avoid transaction size limits
            const CHUNK_SIZE = 250; // Reduced from 500 to be safer with IndexedDB limits
            let totalBufferSize = 0;

            for (let i = 0; i < products.length; i += CHUNK_SIZE) {
                const chunkId = `chunk_${Math.floor(i / CHUNK_SIZE)}`;
                const chunk = products.slice(i, i + CHUNK_SIZE);

                // Make a clone of the chunk and optimize for storage
                const serializableChunk = chunk.map(product => {
                    // Normalize the product using lookup tables
                    const normalizedProduct = this.normalizeProduct(product);

                    // Handle embedding - convert Float32Array to ArrayBuffer for storage
                    if (normalizedProduct.embedding instanceof Float32Array && normalizedProduct.embedding.length > 0) {
                        try {
                            // Create a copy of the buffer to avoid potential shared references
                            normalizedProduct.embeddingBuffer = normalizedProduct.embedding.buffer.slice(0);
                            productsWithTypedEmbeddings++;
                            totalBufferSize += normalizedProduct.embeddingBuffer.byteLength;
                            // Remove the embedding property as we're storing it as a buffer
                            delete normalizedProduct.embedding;
                        } catch (err) {
                            console.error('Error creating ArrayBuffer from Float32Array:', err);
                            normalizedProduct.embedding = []; // Fallback
                            productsWithArrayEmbeddings++;
                        }
                    } else if (normalizedProduct.embedding && Array.isArray(normalizedProduct.embedding) && normalizedProduct.embedding.length > 0) {
                        // If it's a regular array, convert to Float32Array then to ArrayBuffer
                        try {
                            const typedArray = new Float32Array(normalizedProduct.embedding);
                            normalizedProduct.embeddingBuffer = typedArray.buffer.slice(0);
                            productsWithArrayEmbeddings++;
                            totalBufferSize += normalizedProduct.embeddingBuffer.byteLength;
                            delete normalizedProduct.embedding;
                        } catch (err) {
                            console.error('Error converting array to ArrayBuffer:', err);
                            normalizedProduct.embedding = []; // Fallback
                        }
                    } else {
                        // No valid embedding, keep as empty array
                        normalizedProduct.embedding = [];
                    }

                    return normalizedProduct;
                });

                try {
                    // Store the serializable chunk
                    const putRequest = store.put({
                        id: chunkId,
                        products: serializableChunk
                    });

                    await new Promise((resolve, reject) => {
                        putRequest.onsuccess = resolve;
                        putRequest.onerror = reject;
                    });

                    console.log(`[SearchCacheService] Stored chunk ${chunkId} with ${serializableChunk.length} products`);
                } catch (chunkError) {
                    console.error(`[SearchCacheService] Error storing chunk ${chunkId}:`, chunkError);

                    // Try again without embeddings if it failed - likely a size issue
                    try {
                        const slimChunk = serializableChunk.map(product => {
                            // Create a new object without the embedding field
                            const { embeddingBuffer, embedding, ...slimProduct } = product;
                            return slimProduct;
                        });

                        const fallbackPutRequest = store.put({
                            id: chunkId,
                            products: slimChunk
                        });

                        await new Promise((resolve, reject) => {
                            fallbackPutRequest.onsuccess = resolve;
                            fallbackPutRequest.onerror = reject;
                        });

                        console.log(`[SearchCacheService] Stored slim chunk ${chunkId} without embeddings`);
                    } catch (slimChunkError) {
                        console.error(`[SearchCacheService] Error storing slim chunk ${chunkId}:`, slimChunkError);
                    }
                }
            }

            // Wait for transaction to complete
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });

            console.log(`[SearchCacheService] Cached ${products.length} products in IndexedDB. ` +
                `${productsWithTypedEmbeddings} have typed embeddings, ${productsWithArrayEmbeddings} have array embeddings. ` +
                `Total buffer size: ${(totalBufferSize / (1024 * 1024)).toFixed(2)}MB`);
        } catch (error) {
            console.error('[SearchCacheService] Error updating IndexedDB cache:', error);
        }
    }

    static async clearCache(): Promise<void> {
        try {
            // If database doesn't exist yet, nothing to clear
            if (!indexedDB.databases) {
                console.log('[SearchCacheService] No IndexedDB to clear - none exists yet');
                return;
            }

            if (!this.dbPromise) {
                this.dbPromise = this.openDatabase();
            }

            const db = await this.dbPromise;

            try {
                // Simpler approach - just clear the object store
                const tx = db.transaction('products', 'readwrite');
                const store = tx.objectStore('products');
                const clearRequest = store.clear();

                await new Promise((resolve, reject) => {
                    clearRequest.onsuccess = resolve;
                    clearRequest.onerror = reject;
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = reject;
                });

                console.log('[SearchCacheService] IndexedDB cache cleared');

                // Reset lookup tables
                this.initializeLookupTables();
            } catch (innerError) {
                console.error('[SearchCacheService] Error clearing IndexedDB store:', innerError);
            }
        } catch (error) {
            console.error('[SearchCacheService] Error clearing IndexedDB cache:', error);
            // Continue without failing - it's ok if clearing fails
        }
    }
}