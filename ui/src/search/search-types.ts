// Type definitions for the search system

// Updated to support composite hash structure
export interface Product {
    name: string;
    hash: CompositeHash;  // Changed from ActionHash to CompositeHash
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

// Traditional ActionHash type (maintained for compatibility)
export type ActionHash = Uint8Array | any;

// New composite hash type that contains group hash and index
export interface CompositeHash {
    groupHash: ActionHash;
    index: number;
    toString: () => string;  // Method to convert to string for comparison
}

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

// Updated to work with composite hashes
export interface SearchEventDetail {
    hash: CompositeHash;
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

// Product reference for backend API
export interface ProductReference {
    group_hash: ActionHash;
    index: number;
}