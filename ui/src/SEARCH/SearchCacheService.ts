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
    static async getSearchIndex(store: any, forceRefresh: boolean = true): Promise<any[]> {
        // Always clear cache when forceRefresh is true (app initialization)
        if (forceRefresh) {
            this.clearCache();
            return this.buildIndexFromCategories(store);
        }

        // Check if we have valid cache
        const cachedDataString = localStorage.getItem(CACHE_KEY);

        if (cachedDataString) {
            try {
                const cachedData: CachedData = JSON.parse(cachedDataString);
                // Only use cache if it has products AND is not expired
                if (cachedData.products &&
                    cachedData.products.length > 0 &&
                    Date.now() - cachedData.timestamp < CACHE_TIMEOUT) {

                    // Validate a sample of products to ensure data integrity
                    const hasValidData = this.validateCachedProducts(cachedData.products);
                    if (!hasValidData) {
                        return this.buildIndexFromCategories(store);
                    }

                    return cachedData.products;
                } else {
                }
            } catch (error) {
                console.error('Error parsing cache:', error);
                this.clearCache();
            }
        } else {
        }

        // Load products using category structure
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
        const limit = 1000; // Products per category


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

                    if (response && response.products && response.products.length > 0) {

                        // Log a sample product record before decoding
                        if (response.products.length > 0) {
                        }

                        const products = response.products.map(record => {
                            try {
                                const decoded = decode(record.entry.Present.entry) as DecodedProduct;
                                return {
                                    ...decoded,
                                    hash: record.signed_action.hashed.hash
                                };
                            } catch (error) {
                                console.error(`Error decoding product:`, error);
                                return null;
                            }
                        }).filter(p => p !== null && p.name); // Filter out null/undefined products

                        // Log sample of decoded products
                        if (products.length > 0) {
                        }

                        allProducts = [...allProducts, ...products];

                        // Update cache incrementally after each category
                        this.updateCache(allProducts);
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

                    if (response && response.products && response.products.length > 0) {

                        const products = response.products.map(record => {
                            try {
                                const decoded = decode(record.entry.Present.entry) as DecodedProduct;
                                return {
                                    ...decoded,
                                    hash: record.signed_action.hashed.hash
                                };
                            } catch (error) {
                                console.error(`Error decoding product:`, error);
                                return null;
                            }
                        }).filter(p => p !== null && p.name);

                        allProducts = [...allProducts, ...products];

                        // Update cache incrementally after each category
                        this.updateCache(allProducts);
                    }
                } catch (error) {
                    console.error(`Error loading category ${category}:`, error);
                }
            }
            // Log sample products from final index
            if (allProducts.length > 0) {
            }

            return allProducts;

        } catch (error) {
            console.error("Error building search index:", error);
            return []; // Return empty array on error instead of partial results
        }
    }

    private static updateCache(products: any[]): void {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            products
        }));
    }

    static clearCache(): void {
        localStorage.removeItem(CACHE_KEY);
    }
}