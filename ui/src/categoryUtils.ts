import { mainCategories } from './categoryData';

export interface SubcategoryConfig {
    name: string;
    gridOnly?: boolean;
    productTypes?: string[];
}

export interface CategoryConfig {
    name: string;
    subcategories: SubcategoryConfig[];
}

/**
 * Get the full category configuration
 */
export function getCategoryConfig(category: string): CategoryConfig | null {
    return mainCategories.find(c => c.name === category) || null;
}

/**
 * Get subcategory configuration
 */
export function getSubcategoryConfig(category: string, subcategory: string): SubcategoryConfig | null {
    const categoryConfig = getCategoryConfig(category);
    return categoryConfig?.subcategories.find(s => s.name === subcategory) || null;
}

/**
 * Check if a subcategory is grid-only (no product type rows)
 */
export function isGridOnlySubcategory(category: string, subcategory: string): boolean {
    const subcategoryConfig = getSubcategoryConfig(category, subcategory);
    return subcategoryConfig?.gridOnly === true;
}

/**
 * Check if we're currently viewing a specific product type
 */
export function isProductTypeView(category: string, subcategory: string, productType: string): boolean {
    if (!category || !subcategory || !productType || productType === "All") {
        return false;
    }

    const subcategoryConfig = getSubcategoryConfig(category, subcategory);
    return subcategoryConfig?.productTypes?.includes(productType) === true;
}

/**
 * Get available product types for a subcategory
 */
export function getAvailableProductTypes(category: string, subcategory: string): string[] {
    const subcategoryConfig = getSubcategoryConfig(category, subcategory);
    return subcategoryConfig?.productTypes || [];
}

/**
 * Check if a subcategory has product types
 */
export function hasProductTypes(category: string, subcategory: string): boolean {
    const productTypes = getAvailableProductTypes(category, subcategory);
    return productTypes.length > 0 && !isGridOnlySubcategory(category, subcategory);
}

/**
 * Determine if sort/filter controls should be shown
 * Controls are shown for:
 * 1. Grid-only subcategories
 * 2. Specific product type views (not "All")
 */
export function shouldShowSortControls(category: string, subcategory: string, productType: string): boolean {
    if (!category || !subcategory) {
        return false;
    }

    const isGridOnly = isGridOnlySubcategory(category, subcategory);
    const isSpecificProductType = isProductTypeView(category, subcategory, productType);

    return isGridOnly || isSpecificProductType;
}

/**
 * Get filtered product types (excluding "All")
 */
export function getFilteredProductTypes(category: string, subcategory: string): string[] {
    const productTypes = getAvailableProductTypes(category, subcategory);
    return productTypes.filter(pt => pt !== "All");
}

/**
 * Get all subcategories for a category
 */
export function getAllSubcategories(category: string): SubcategoryConfig[] {
    const categoryConfig = getCategoryConfig(category);
    return categoryConfig?.subcategories || [];
}

/**
 * Check if product type navigation should be shown
 */
export function shouldShowProductTypeNav(category: string, subcategory: string): boolean {
    if (!category || !subcategory) {
        return false;
    }

    const subcategoryConfig = getSubcategoryConfig(category, subcategory);
    return !!(subcategoryConfig?.productTypes &&
        subcategoryConfig.productTypes.length > 1 &&
        !subcategoryConfig.gridOnly);
}