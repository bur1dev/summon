import type { ProductDataService, NavigationParams, NavigationResult } from './ProductDataService';

/**
 * Centralized Data Manager - Single gateway for all data operations
 * Step 2: This class becomes the exclusive interface for data fetching,
 * preventing scattered productDataService calls throughout components
 */
export class DataManager {
    private productDataService: ProductDataService;

    constructor(productDataService: ProductDataService) {
        this.productDataService = productDataService;
    }

    // === PRODUCT REFERENCE METHODS ===
    async getProductByReference(groupHashB64: string, productIndex: number) {
        return this.productDataService.getProductByReference(groupHashB64, productIndex);
    }

    // === NAVIGATION METHODS ===
    async navigate(direction: "left" | "right", params: NavigationParams): Promise<NavigationResult> {
        return this.productDataService.navigate(direction, params);
    }

    async loadProductsForNavigation(
        category: string,
        subcategory: string,
        productType: string | undefined,
        groupOffset: number,
        groupLimit: number,
        isProductType: boolean = false
    ) {
        return this.productDataService.loadProductsForNavigation(
            category, subcategory, productType, groupOffset, groupLimit, isProductType
        );
    }

    // === CATEGORY LOADING METHODS ===
    async loadSubcategoryProducts(
        category: string,
        subcategory: string,
        containerCapacity: number
    ) {
        return this.productDataService.loadSubcategoryProducts(category, subcategory, containerCapacity);
    }

    async loadProductTypeProducts(
        category: string,
        subcategory: string,
        productType: string | null,
        isPreview: boolean = false,
        containerCapacity?: number
    ) {
        return this.productDataService.loadProductTypeProducts(
            category, subcategory, productType, isPreview, containerCapacity
        );
    }

    async loadAllCategoryProducts(category: string) {
        return this.productDataService.loadAllCategoryProducts(category);
    }

    // === UTILITY METHODS ===
    extractProductsFromGroups(groupRecords: any[]) {
        return this.productDataService.extractProductsFromGroups(groupRecords);
    }

    // === FUTURE: Add analytics, caching, request deduplication here ===
    // This is where we can add:
    // - Request deduplication
    // - Analytics tracking
    // - Centralized error handling
    // - Request prioritization
    // - Background prefetching
}