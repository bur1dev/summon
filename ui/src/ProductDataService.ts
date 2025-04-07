import { decode } from "@msgpack/msgpack";
import type { ProductCacheStore } from "./ProductCacheStore";

export class ProductDataService {
    private store: any;
    private productCache: ProductCacheStore;

    constructor(store: any, productCache: ProductCacheStore) {
        this.store = store;
        this.productCache = productCache;
    }

    /**
     * Load and cache products for a category, subcategory, or product type
     */
    async loadAndCacheProducts(
        category: string,
        subcategory?: string,
        productType?: string,
        limit?: number,
        isPreview = false
    ) {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products",
                fn_name: subcategory
                    ? "get_products_by_category"
                    : "get_all_category_products",
                payload: subcategory
                    ? {
                        category,
                        subcategory,
                        product_type: productType,
                        offset: 0,
                        limit: isPreview ? limit : 2000, // Only use limit for previews
                    }
                    : category,
            });

            const products = response.products.map((record) => ({
                ...decode(record.entry.Present.entry),
                hash: record.signed_action.hashed.hash,
            }));

            if (products.length) {
                this.productCache.setCachedProducts(
                    products,
                    response.total,
                    category,
                    subcategory,
                    productType,
                    isPreview
                );
            }

            return {
                products,
                total: response.total,
                name: subcategory,
                type: productType,
            };
        } catch (error) {
            console.error("Error in loadAndCacheProducts:", error);
            return null;
        }
    }

    /**
     * Load products for a specific subcategory with capacity limit
     */
    async loadSubcategoryProducts(
        category: string,
        subcategory: string,
        containerCapacity: number
    ) {
        try {
            // Check cache first
            const cached = this.productCache.getCachedProducts(
                category,
                subcategory,
                undefined,
                true
            );

            if (cached?.data) {
                return {
                    name: subcategory,
                    products: cached.data,
                    total: cached.total,
                };
            }

            // Fetch from backend if not cached
            return await this.loadAndCacheProducts(
                category,
                subcategory,
                undefined,
                containerCapacity,
                true
            );
        } catch (error) {
            console.error(`Error loading subcategory ${subcategory}:`, error);
            return null;
        }
    }

    /**
     * Load products for a specific product type
     */
    async loadProductTypeProducts(
        category: string,
        subcategory: string,
        productType: string,
        isPreview: boolean = false,
        containerCapacity?: number
    ) {
        try {
            const cached = this.productCache.getCachedProducts(
                category,
                subcategory,
                productType,
                isPreview
            );

            if (cached?.data) {
                return {
                    type: productType,
                    products: cached.data,
                    total: cached.total,
                };
            }

            return await this.loadAndCacheProducts(
                category,
                subcategory,
                productType,
                containerCapacity,
                isPreview
            );
        } catch (error) {
            console.error(`Error loading product type ${productType}:`, error);
            return null;
        }
    }

    /**
     * Load all products for a grid view of a category
     */
    async loadAllCategoryProducts(category: string) {
        try {
            const cached = this.productCache.getCachedProducts(category);
            if (cached) {
                return {
                    products: cached.data,
                    total: cached.total
                };
            }

            return await this.loadAndCacheProducts(category);
        } catch (error) {
            console.error(`Error loading all products for category ${category}:`, error);
            return null;
        }
    }

    /**
     * Load products for navigation with specified range
     */
    async loadProductsForNavigation(
        category: string,
        subcategory: string,
        productType: string | undefined,
        offset: number,
        limit: number,
        isProductType: boolean = false
    ) {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products",
                fn_name: "get_products_by_category",
                payload: {
                    category: category,
                    subcategory: isProductType ? subcategory : subcategory,
                    product_type: isProductType ? productType : undefined,
                    offset: offset,
                    limit: limit,
                },
            });

            if (!response.products.length) {
                return { products: [], total: 0 };
            }

            const products = response.products.map((record) => ({
                ...decode(record.entry.Present.entry),
                hash: record.signed_action.hashed.hash,
            }));

            // Generate row key for cache
            const rowKey = isProductType ? `${subcategory}_${productType}` : subcategory;

            // Cache the results
            this.productCache.setRowNavigationCache(
                products,
                response.total,
                offset,
                category,
                isProductType ? subcategory : subcategory,
                rowKey
            );

            return {
                products,
                total: response.total
            };
        } catch (error) {
            console.error("Error in loadProductsForNavigation:", error);
            return { products: [], total: 0 };
        }
    }
}