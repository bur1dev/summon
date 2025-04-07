import { decodeProducts } from "./search-utils";
import type { Product } from "./search-types";

/**
 * API client for search-related operations
 */
export class SearchApiClient {
    private store: any;

    constructor(store: any) {
        this.store = store;
    }

    /**
     * Fetch product by hash
     */
    async getProductByHash(hash: any): Promise<Product | null> {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products", fn_name: "get_products_by_hashes",
                payload: [hash],
            });

            if (!response.products?.length) return null;

            const products = decodeProducts(response.products);

            // Find all products with matching hash
            const hashStr = JSON.stringify(hash);
            return products.find(p => JSON.stringify(p.hash) === hashStr) || null;
        } catch (error) {
            console.error("Error fetching product by hash:", error);
            return null;
        }
    }

    /**
     * Fetch all matching products by hash
     */
    async getAllProductVersionsByHash(hash: any): Promise<Product[]> {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products", fn_name: "get_products_by_hashes",
                payload: [hash],
            });

            if (!response.products?.length) return [];

            const products = decodeProducts(response.products);

            // Find all products with matching hash
            const hashStr = JSON.stringify(hash);
            return products.filter(p => JSON.stringify(p.hash) === hashStr);
        } catch (error) {
            console.error("Error fetching products by hash:", error);
            return [];
        }
    }

    /**
     * Fetch products by category, subcategory, and product type
     */
    async getProductsByType(
        category: string,
        subcategory: string | null | undefined,
        productType: string | null | undefined,
        limit: number = 200
    ): Promise<{ products: Product[], total: number }> {
        const logKey = `api-getProductsByType-${category}-${subcategory || 'none'}-${productType || 'none'}`;
        console.time(logKey);
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products", fn_name: "get_products_by_category",
                payload: {
                    category,
                    subcategory,
                    product_type: productType,
                    limit,
                },
            });

            const products = decodeProducts(response.products || []);
            console.timeEnd(logKey);
            console.log(`Fetched ${products.length}/${response.total || 0} products from ${category}/${subcategory || 'none'}/${productType || 'none'}`);

            return {
                products,
                total: response.total || 0
            };
        } catch (error) {
            console.timeEnd(logKey);
            console.error(`Error fetching products by type from ${category}/${subcategory || 'none'}/${productType || 'none'}:`, error);
            return { products: [], total: 0 };
        }
    }

    /**
     * Fetch additional subcategory products
     */
    async getAdditionalSubcategoryProducts(
        category: string,
        subcategory: string,
        excludedProductType: string | null | undefined,
        limit: number = 20
    ): Promise<Product[]> {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products", fn_name: "get_products_by_category",
                payload: {
                    category,
                    subcategory,
                    limit,
                },
            });

            if (!response.products?.length) return [];

            return decodeProducts(response.products).filter(
                p => p.product_type !== excludedProductType
            );
        } catch (error) {
            console.error("Error fetching subcategory products:", error);
            return [];
        }
    }

    /**
     * Fetch all products from a category
     */
    async getAllCategoryProducts(category: string): Promise<Product[]> {
        try {
            const response = await this.store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products",
                fn_name: "get_all_category_products",
                payload: category,
            });

            if (!response.products?.length) return [];

            return decodeProducts(response.products);
        } catch (error) {
            console.error("Error fetching category products:", error);
            return [];
        }
    }
}