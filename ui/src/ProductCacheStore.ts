import { writable, get } from 'svelte/store';

interface CachedProducts {
    data: any[];
    timestamp: number;
    total: number;
}

interface RowNavigationCache {
    products: any[];
    rangeStart: number;
    rangeEnd: number;
    timestamp: number;
    total: number;
}

interface CategoryCache {
    [key: string]: {
        all?: CachedProducts;
        subcategories: {
            [key: string]: {
                all?: CachedProducts;
                productTypes: {
                    [key: string]: {
                        preview?: CachedProducts;
                        full?: CachedProducts;
                    }
                };
                // Add this new property
                rowNavigation?: {
                    [key: string]: RowNavigationCache;
                }
            }
        }
    }
}

export class ProductCacheStore {
    private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private cache = writable<CategoryCache>({});

    isCacheValid(timestamp: number): boolean {
        return Date.now() - timestamp < this.CACHE_TTL;
    }

    getCachedProducts(category: string, subcategory?: string, productType?: string, isPreview: boolean = false): CachedProducts | null {
        const cacheData = get(this.cache);
        const cacheKey = isPreview ? 'preview' : 'full';

        try {
            if (!subcategory) {
                const categoryCache = cacheData[category]?.all;
                if (categoryCache && this.isCacheValid(categoryCache.timestamp)) {
                    return categoryCache;
                }
            } else if (!productType) {
                const subCache = cacheData[category]?.subcategories[subcategory]?.all;
                if (subCache && this.isCacheValid(subCache.timestamp)) {
                    return subCache;
                }
            } else {
                const typeCache = cacheData[category]?.subcategories[subcategory]?.productTypes[productType]?.[cacheKey];
                if (typeCache && this.isCacheValid(typeCache.timestamp)) {
                    return typeCache;
                }
            }
        } catch (error) {
            console.error('Cache retrieval error:', error);
        }

        return null;
    }

    setCachedProducts(products: any[], total: number, category: string, subcategory?: string, productType?: string, isPreview: boolean = false): void {
        const cacheEntry = {
            data: products,
            timestamp: Date.now(),
            total
        };
        const cacheKey = isPreview ? 'preview' : 'full';

        this.cache.update(cache => {
            if (!cache[category]) {
                cache[category] = { subcategories: {} };
            }

            if (!subcategory) {
                cache[category].all = cacheEntry;
            } else {
                if (!cache[category].subcategories[subcategory]) {
                    cache[category].subcategories[subcategory] = {
                        productTypes: {}
                    };
                }

                if (!productType) {
                    cache[category].subcategories[subcategory].all = cacheEntry;
                } else {
                    if (!cache[category].subcategories[subcategory].productTypes[productType]) {
                        cache[category].subcategories[subcategory].productTypes[productType] = {};
                    }
                    cache[category].subcategories[subcategory].productTypes[productType][cacheKey] = cacheEntry;
                }
            }

            return cache;
        });

    }

    getRowNavigationCache(category: string, subcategory: string, rowKey: string): RowNavigationCache | null {
        const cacheData = get(this.cache);

        try {
            const rowCache = cacheData[category]?.subcategories[subcategory]?.rowNavigation?.[rowKey];
            if (rowCache && this.isCacheValid(rowCache.timestamp)) {
                return rowCache;
            }
        } catch (error) {
            console.error('Row cache retrieval error:', error);
        }

        return null;
    }

    setRowNavigationCache(products: any[], total: number, rangeStart: number, category: string, subcategory: string, rowKey: string): void {
        this.cache.update(cache => {
            if (!cache[category]) {
                cache[category] = { subcategories: {} };
            }

            if (!cache[category].subcategories[subcategory]) {
                cache[category].subcategories[subcategory] = {
                    productTypes: {}
                };
            }

            if (!cache[category].subcategories[subcategory].rowNavigation) {
                cache[category].subcategories[subcategory].rowNavigation = {};
            }

            // Check if we already have a cache for this row
            const existingCache = cache[category].subcategories[subcategory].rowNavigation[rowKey];

            if (!existingCache) {
                // No existing cache, create a new one
                cache[category].subcategories[subcategory].rowNavigation[rowKey] = {
                    products,
                    rangeStart,
                    rangeEnd: rangeStart + products.length,
                    timestamp: Date.now(),
                    total
                };

            } else {
                // Create a sparse array of all products by index
                const productMap = {};

                // Add existing products to map
                existingCache.products.forEach((product, idx) => {
                    const index = existingCache.rangeStart + idx;
                    productMap[index] = product;
                });

                // Add new products to map
                products.forEach((product, idx) => {
                    const index = rangeStart + idx;
                    productMap[index] = product;
                });

                // Calculate new range
                const newRangeStart = Math.min(existingCache.rangeStart, rangeStart);
                const newRangeEnd = Math.max(existingCache.rangeEnd, rangeStart + products.length);

                // Convert back to array
                const mergedProducts = [];
                for (let i = newRangeStart; i < newRangeEnd; i++) {
                    if (productMap[i]) {
                        mergedProducts.push(productMap[i]);
                    }
                }

                // Update cache
                cache[category].subcategories[subcategory].rowNavigation[rowKey] = {
                    products: mergedProducts,
                    rangeStart: newRangeStart,
                    rangeEnd: newRangeEnd,
                    timestamp: Date.now(),
                    total: Math.max(existingCache.total, total)
                };

            }

            return cache;
        });
    }

    clearCache(): void {
        this.cache.set({});
    }

    invalidateCategory(category: string): void {
        this.cache.update(cache => {
            delete cache[category];
            return cache;
        });
    }
}