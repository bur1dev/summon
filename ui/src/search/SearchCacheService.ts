import { decode } from "@msgpack/msgpack";

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

const CACHE_KEY = 'product_search_index_cache';
const CACHE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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

    // Open database connection
    private static openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('product-search-cache', 1);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event);
                reject('Error opening database');
            };

            request.onsuccess = (event) => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = request.result;
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'id' });
                }
            };
        });
    }

    static async getSearchIndex(store: any, forceRefresh: boolean = true): Promise<any[]> {
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
            const metadataItem = await tx.objectStore('products').get('metadata');

            // Check if cache is valid
            if (metadataItem &&
                metadataItem.timestamp &&
                metadataItem.productCount > 0 &&
                Date.now() - metadataItem.timestamp < CACHE_TIMEOUT) {

                console.log(`Found valid cache with ${metadataItem.productCount} products`);

                // Collect all chunks
                const allProducts = [];
                let chunkIndex = 0;
                let hasMoreChunks = true;

                while (hasMoreChunks) {
                    const chunkId = `chunk_${chunkIndex}`;
                    const chunk = await tx.objectStore('products').get(chunkId);

                    if (chunk && chunk.products && chunk.products.length > 0) {
                        // Add toString function back to hash objects
                        const processedProducts = chunk.products.map(product => {
                            if (product.hash && product.hash.groupHash && typeof product.hash.index === 'number') {
                                // Recreate hash with toString function
                                product.hash.toString = function () {
                                    return `${this.groupHash}:${this.index}`;
                                };
                            }
                            return product;
                        });

                        allProducts.push(...processedProducts);
                        chunkIndex++;
                    } else {
                        hasMoreChunks = false;
                    }
                }

                console.log(`Loaded ${allProducts.length} products from cache`);

                // Validate data integrity
                const hasValidData = this.validateCachedProducts(allProducts);
                if (!hasValidData) {
                    return this.buildIndexFromCategories(store);
                }

                return allProducts;
            }
        } catch (error) {
            console.error('Error accessing IndexedDB cache:', error);
        }

        // If cache invalid or error occurred, build from categories
        return this.buildIndexFromCategories(store);
    }

    private static validateCachedProducts(products: any[]): boolean {
        if (!products.length) return false;

        const sampleSize = Math.min(10, products.length);
        const sampleProducts = products.slice(0, sampleSize);

        // Check if essential properties exist
        for (const product of sampleProducts) {
            if (!product.name || !product.category) {
                return false;
            }
        }

        return true;
    }

    private static async buildIndexFromCategories(store: any): Promise<any[]> {
        let allProducts = [];
        const limit = 1000; // ProductGroups per category (each group can contain up to ~100 products)
        let totalProductCount = 0;

        try {
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
                        console.log(`Loaded ${productsFromGroups.length} products from category ${category}`);

                        // Update cache incrementally after each category
                        await this.updateCache(allProducts);
                    }
                } catch (error) {
                    console.error(`Error loading category ${category}:`, error);
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
                        console.log(`Loaded ${productsFromGroups.length} products from category ${category}`);

                        // Update cache incrementally after each category
                        await this.updateCache(allProducts);
                    }
                } catch (error) {
                    console.error(`Error loading category ${category}:`, error);
                }
            }

            console.log(`Search index initialized with ${allProducts.length} products from ${totalProductCount} total products`);

            return allProducts;
        } catch (error) {
            console.error("Error building search index:", error);
            return []; // Return empty array on error instead of partial results
        }
    }

    private static extractProductsFromGroups(productGroups: any[]): any[] {
        let extractedProducts: any[] = [];

        for (const record of productGroups) {
            try {
                // Get the group hash
                const groupHash = record.signed_action.hashed.hash;

                // Decode the ProductGroup
                const groupEntry = decode(record.entry.Present.entry);

                // If this is a ProductGroup with products array
                if (groupEntry && Array.isArray(groupEntry.products)) {
                    // Extract each product and add composite ID (groupHash + index)
                    groupEntry.products.forEach((product: any, index: number) => {
                        extractedProducts.push({
                            name: product.name,
                            price: product.price,
                            size: product.size,
                            category: product.category,
                            subcategory: product.subcategory,
                            product_type: product.product_type,
                            brand: product.brand,
                            image_url: product.image_url,
                            // Store hash components without function
                            hash: {
                                groupHash,
                                index,
                                stringValue: `${groupHash}:${index}` // Store as string instead of function
                            }
                        });
                    });
                }
            } catch (error) {
                console.error("Error extracting products from group:", error);
            }
        }

        return extractedProducts;
    }

    private static async updateCache(products: any[]): Promise<void> {
        try {
            // Check if we already have an open database connection
            if (!this.dbPromise) {
                this.dbPromise = this.openDatabase();
            }
            const db = await this.dbPromise;

            const tx = db.transaction('products', 'readwrite');
            const store = tx.objectStore('products');

            // Store metadata
            await store.put({
                id: 'metadata',
                timestamp: Date.now(),
                productCount: products.length
            });

            // Store products in chunks to avoid transaction size limits
            const CHUNK_SIZE = 500;
            for (let i = 0; i < products.length; i += CHUNK_SIZE) {
                const chunk = products.slice(i, i + CHUNK_SIZE);
                await store.put({
                    id: `chunk_${Math.floor(i / CHUNK_SIZE)}`,
                    products: chunk
                });
            }

            await tx.done;
            console.log(`Cached ${products.length} products in IndexedDB`);
        } catch (error) {
            console.error('Error updating IndexedDB cache:', error);
        }
    }

    static async clearCache(): Promise<void> {
        try {
            // If database doesn't exist yet, nothing to clear
            if (!indexedDB.databases) {
                console.log('No IndexedDB to clear - none exists yet');
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
                await store.clear();
                await tx.done;
                console.log('IndexedDB cache cleared');
            } catch (innerError) {
                console.error('Error clearing IndexedDB store:', innerError);
            }
        } catch (error) {
            console.error('Error clearing IndexedDB cache:', error);
            // Continue without failing - it's ok if clearing fails
        }
    }
}