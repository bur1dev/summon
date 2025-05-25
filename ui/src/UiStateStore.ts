import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { SearchMethod, Product } from './search/search-types'; // Added import, Added Product

// UI state types
export type CurrentView = 'active' | 'checked-out';

// Create UI state stores with initial values
export const currentViewStore = writable<CurrentView>('active');
export const isCartOpenStore = writable<boolean>(false);
export const selectedCategoryStore = writable<string | null>(null);
export const selectedSubcategoryStore = writable<string | null>(null);
export const selectedProductTypeStore = writable<string>('All');
export const showReportDialogStore = writable<boolean>(false);
export const reportedProductStore = writable<any>(null);
export const showMenuStore = writable<boolean>(false);
export const bgUrlStore = writable<string>('');

// Home view state
export const isHomeViewStore = writable<boolean>(true);

// Featured subcategories for home view
export const featuredSubcategories = [
    { category: 'Produce', subcategory: 'Fresh Fruits' },
    { category: 'Produce', subcategory: 'Fresh Vegetables' },
    { category: 'Dairy & Eggs', subcategory: 'Eggs' },
    { category: 'Dairy & Eggs', subcategory: 'Milk' },
    { category: 'Bakery', subcategory: 'Bread' },
    { category: 'Snacks & Candy', subcategory: 'Chocolate & Candy' },
    { category: 'Wine', subcategory: 'White Wine' },
    { category: 'Meat & Seafood', subcategory: 'Chicken' },
    { category: 'Beverages', subcategory: 'Juice' },
    { category: 'Frozen', subcategory: 'Frozen Desserts' },
    { category: 'Dairy & Eggs', subcategory: 'Yogurt' },
    { category: 'Breakfast', subcategory: null },
    { category: 'Frozen', subcategory: 'Frozen Snacks' },
    { category: 'Dairy & Eggs', subcategory: 'Cheese' },
    { category: 'Dairy & Eggs', subcategory: 'Sour Cream & Cream Cheese' }
];

// Search state
export const searchModeStore = writable<boolean>(false);
export const searchQueryStore = writable<string>('');
export const productNameStore = writable<string>('');
export const selectedProductHashStore = writable<string | null>(null);
export const searchResultsStore = writable<Product[]>([]); // Changed from fuseResultsStore, Changed any[] to Product[]
export const isViewAllStore = writable<boolean>(false);
export const searchMethodStore = writable<SearchMethod>(''); // Changed type to SearchMethod

// Sort and filter state
export const sortByStore = writable<string>('best');
export const selectedBrandsStore = writable<Set<string>>(new Set());
export const selectedOrganicStore = writable<"all" | "organic" | "non-organic">("all");

// Helper functions
export function setSearchState(params: {
    searchMode?: boolean,
    searchQuery?: string,
    productName?: string,
    selectedProductHash?: string | null,
    searchResults?: Product[], // Changed from fuseResults, Changed any[] to Product[]
    isViewAll?: boolean,
    searchMethod?: SearchMethod // Changed type to SearchMethod
}) {
    if (params.searchMode !== undefined) searchModeStore.set(params.searchMode);
    if (params.searchQuery !== undefined) searchQueryStore.set(params.searchQuery);
    if (params.productName !== undefined) productNameStore.set(params.productName);
    if (params.selectedProductHash !== undefined) selectedProductHashStore.set(params.selectedProductHash);
    if (params.searchResults !== undefined) searchResultsStore.set(params.searchResults); // Changed from fuseResults
    if (params.isViewAll !== undefined) isViewAllStore.set(params.isViewAll);
    if (params.searchMethod !== undefined) searchMethodStore.set(params.searchMethod);
}

export function resetSearchState() {
    searchModeStore.set(false);
    searchQueryStore.set('');
    productNameStore.set('');
    selectedProductHashStore.set(null);
    searchResultsStore.set([]); // Changed from fuseResultsStore
    isViewAllStore.set(false);
    searchMethodStore.set('');
    sortByStore.set('best');
    selectedBrandsStore.set(new Set());
    selectedOrganicStore.set("all");
}
