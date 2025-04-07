// Type definitions for the search system

export interface Product {
    name: string;
    hash: ActionHash;
    category?: string;
    subcategory?: string;
    product_type?: string;
    price?: number;
    size?: string;
    stocks_status?: string;
    image_url?: string;
    brand?: string;
    [key: string]: any;
}

export type ActionHash = Uint8Array | any;

export interface SearchResult {
    item: Product;
    score?: number;
    matches?: any[];
}

export interface FuseProductResult {
    item: Product;
    score: number;
    matches?: any[];
}

export interface ProductTypeGroup {
    type: string;
    count: number;
    sample: Product;
    isType: boolean;
}

export interface CategoryGroupedProducts {
    sameTypeProducts: Product[];
    sameSubcategoryProducts: Product[];
    sameCategoryProducts: Product[];
    otherProducts: Product[];
}

export interface SearchEventDetail {
    hash: ActionHash;
    productName: string;
    originalQuery: string;
    category?: string;
    subcategory?: string;
    product_type?: string;
    fuseResults?: Product[];
}

export interface ViewAllEventDetail {
    query: string;
    fuseResults?: Product[];
    isViewAll?: boolean;
    selectedType?: string;
}