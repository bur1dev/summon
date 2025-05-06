import { decode } from "@msgpack/msgpack";

export class ProductDataService {
    private store: any;
    private readonly PRODUCTS_PER_GROUP = 100; // Define backend constant here

    constructor(store: any) {
        this.store = store;
    }

    private extractProductsFromGroups(groupRecords: any[]): any[] {
        if (!groupRecords || groupRecords.length === 0) return [];
        let allProducts = [];
        for (const record of groupRecords) {
            try {
                const group = decode(record.entry.Present.entry);
                const groupHash = record.signed_action.hashed.hash;
                if (group.products && Array.isArray(group.products)) {
                    const productsWithHash = group.products.map((product, index) => ({
                        ...product,
                        hash: `${groupHash}_${index}`
                    }));
                    allProducts = [...allProducts, ...productsWithHash];
                }
            } catch (error) {
                console.error('Error decoding product group:', error);
            }
        }
        return allProducts;
    }

    // This is the core function making the API call

    private async fetchProductsFromApi(
        category: string,
        subcategory?: string,
        productType?: string,
        groupOffset: number = 0,
        groupLimit?: number
    ) {
        try {
            const fn_name = subcategory
                ? "get_products_by_category"
                : "get_all_category_products";

            const payload = subcategory
                ? {
                    category,
                    subcategory,
                    product_type: productType,
                    offset: groupOffset,
                    limit: groupLimit !== undefined ? groupLimit : 5,
                }
                : category;



            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products",
                fn_name: fn_name,
                payload: payload,
            });

            const products = this.extractProductsFromGroups(response.product_groups || []);
            const totalProducts = response.total_products || 0;
            const hasMore = response.has_more ?? false;

            return {
                products,
                total: totalProducts,
                name: subcategory,
                type: productType,
                hasMore,
            };
        } catch (error) {
            console.error("Error fetching products from API:", { category, subcategory, productType, groupOffset, groupLimit, error });
            return null;
        }
    }

    // Loads initial products for a subcategory row (preview)
    async loadSubcategoryProducts(
        category: string,
        subcategory: string,
        containerCapacity: number
    ) {
        try {
            // Start with 1 group and fetch more if needed
            let groupLimit = 1;
            let result;

            // Keep fetching more groups until we have enough products
            while (true) {
                result = await this.fetchProductsFromApi(
                    category,
                    subcategory,
                    undefined,
                    0,
                    groupLimit
                );

                // If we have enough products or no more groups, break
                if (result?.products?.length >= containerCapacity || !result?.hasMore) {
                    break;
                }

                // Try with more groups
                groupLimit++;
            }

            return result;
        } catch (error) {
            console.error(`Error loading initial subcategory ${subcategory}:`, error);
            return null;
        }
    }

    // Loads products for a product type row (preview) or grid (all)
    async loadProductTypeProducts(
        category: string,
        subcategory: string,
        productType: string | null, // Allow null for grid-only subcategories
        isPreview: boolean = false,
        containerCapacity?: number // Number of products needed for preview
    ) {
        try {
            if (isPreview && containerCapacity !== undefined) {
                // Use incremental fetching for preview
                let groupLimit = 1;
                let result;

                while (true) {
                    result = await this.fetchProductsFromApi(
                        category,
                        subcategory,
                        productType || undefined,
                        0,
                        groupLimit
                    );

                    // If we have enough products or no more groups, break
                    if (result?.products?.length >= containerCapacity || !result?.hasMore) {
                        break;
                    }

                    // Try with more groups
                    groupLimit++;
                }

                return result;

            } else if (!isPreview) {
                // Fetch all for grid - use a large limit
                const groupLimit = 100; // Fetch up to 100 groups (2000 products) for the grid view

                const result = await this.fetchProductsFromApi(
                    category,
                    subcategory,
                    productType || undefined,
                    0,
                    groupLimit
                );

                if (result) {
                    return result;
                }
                return null;
            }

        } catch (error) {
            console.error(`Error loading product type ${productType}:`, error);
            return null;
        }
    }

    // Loads all products for the main category grid
    async loadAllCategoryProducts(category: string) {
        try {
            // Call the specific backend function which fetches all groups for the category path
            const result = await this.fetchProductsFromApi(
                category,
                undefined, // No subcategory for this call
                undefined, // No product type
                0,         // Offset likely ignored by get_all_category_products
                undefined  // Limit likely ignored by get_all_category_products
            );

            if (result) {
            }
            return result;

        } catch (error) {
            console.error(`Error loading all products for category ${category}:`, error);
            return null;
        }
    }

    // This function is called by NavigationArrows and needs correct GROUP offset/limit
    async loadProductsForNavigation(
        category: string,
        subcategory: string,
        productType: string | undefined,
        groupOffset: number, // EXPECTING GROUP OFFSET NOW
        groupLimit: number,  // EXPECTING GROUP LIMIT NOW
        isProductType: boolean = false // Keep for determining payload structure if needed
    ) {
        try {
            // Directly use the provided group offset and limit
            const response = await this.fetchProductsFromApi(
                category,
                subcategory,
                productType,
                groupOffset,
                groupLimit
            );

            if (!response) {
                // Attempt to get total from a separate call? Or rely on previous estimate?
                // For now, return empty products and 0 total on error.
                return { products: [], total: 0, hasMore: false };
            }

            if (!response.products || response.products.length === 0) {
                // Return empty products but the total estimate and hasMore from the response
                return { products: [], total: response.total || 0, hasMore: response.hasMore };
            }


            // Return the fetched products, estimated total, and hasMore for the category path
            return {
                products: response.products,
                total: response.total || 0,
                hasMore: response.hasMore
            };
        } catch (error) {
            // Error is already logged in fetchProductsFromApi
            console.error("Error caught in loadProductsForNavigation wrapper:", error);
            return { products: [], total: 0, hasMore: false }; // Return empty on error
        }
    }
}