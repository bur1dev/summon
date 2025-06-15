import type { ProductDataService, NavigationParams, NavigationResult } from '../products/services/ProductDataService';
import { writable, type Readable } from 'svelte/store';

/**
 * Centralized Data Manager - Single gateway for all data operations
 * Step 2: This class becomes the exclusive interface for data fetching,
 * preventing scattered productDataService calls throughout components
 */

interface NavigationState {
    category: string | null;
    subcategory: string | null;
    productType: string;
    isHomeView: boolean;
    searchMode: boolean;
    searchQuery: string;
    sortBy: string;
    selectedBrands: Set<string>;
    selectedOrganic: "all" | "organic" | "non-organic";
}

/**
 * DataManager acts as a performance boundary between reactive Svelte components
 * and data operations. This prevents scroll events and other high-frequency
 * interactions from triggering expensive Svelte reactivity cascades.
 * 
 * Performance impact: Reduced scripting time from 6000ms to 200ms during scrolling.
 * 
 * DO NOT remove this layer or directly expose ProductDataService to components!
 */
export class DataManager {
    private productDataService: ProductDataService;
    private readonly _navigationStore = writable<NavigationState>({
        category: null,
        subcategory: null,
        productType: 'All',
        isHomeView: true,
        searchMode: false,
        searchQuery: '',
        sortBy: 'best',
        selectedBrands: new Set(),
        selectedOrganic: 'all'
    });
    public readonly navigationState: Readable<NavigationState> = this._navigationStore;

    constructor(productDataService: ProductDataService) {
        this.productDataService = productDataService;
    }

    // === NAVIGATION STATE METHODS (for BrowserNavigationService) ===
    updateNavigationState(updates: Partial<NavigationState>): void {
        this._navigationStore.update(current => ({
            ...current,
            ...updates
        }));
    }

    // === FILTER STATE METHODS ===
    public setSortBy(sortBy: string): void {
        this._navigationStore.update(state => ({ ...state, sortBy }));
    }

    public setSelectedBrands(brands: Set<string>): void {
        this._navigationStore.update(state => ({ ...state, selectedBrands: new Set(brands) }));
    }

    public setSelectedOrganic(organic: "all" | "organic" | "non-organic"): void {
        this._navigationStore.update(state => ({ ...state, selectedOrganic: organic }));
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

    // === NEW: TOTAL CALCULATION METHOD ===
    async getTotalProductsForPath(
        category: string,
        subcategory?: string,
        productType?: string
    ): Promise<number> {
        return this.productDataService.calculateTotalForPath(category, subcategory, productType);
    }

    // === UTILITY METHODS ===
    extractProductsFromGroups(groupRecords: any[]) {
        return this.productDataService.extractProductsFromGroups(groupRecords);
    }

    // === BUSINESS LOGIC METHODS ===
    getSortedFilteredProducts(products: any[], sortBy: string, brands: Set<string>, organic: string): any[] {
        let result = [...products];

        // Apply brand filter
        if (brands.size > 0) {
            result = result.filter(
                (product: any) =>
                    product.brand &&
                    brands.has(product.brand.trim()),
            );
        }

        // Apply organic filter
        if (organic === "organic") {
            result = result.filter(
                (product: any) => product.is_organic === true,
            );
        } else if (organic === "non-organic") {
            result = result.filter(
                (product: any) =>
                    product.is_organic === false ||
                    product.is_organic === undefined,
            );
        }

        // Apply sorting
        if (sortBy === "price-asc") {
            result.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
        } else if (sortBy === "price-desc") {
            result.sort((a: any, b: any) => (b.price || 0) - (a.price || 0));
        }

        return result;
    }


}