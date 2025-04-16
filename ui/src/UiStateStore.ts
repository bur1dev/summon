import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

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

// Search state
export const searchModeStore = writable<boolean>(false);
export const searchQueryStore = writable<string>('');
export const productNameStore = writable<string>('');
export const selectedProductHashStore = writable<string | null>(null);
export const fuseResultsStore = writable<any[]>([]);
export const isViewAllStore = writable<boolean>(false);

// Helper functions
export function setSearchState(params: {
    searchMode?: boolean,
    searchQuery?: string,
    productName?: string,
    selectedProductHash?: string | null,
    fuseResults?: any[],
    isViewAll?: boolean
}) {
    if (params.searchMode !== undefined) searchModeStore.set(params.searchMode);
    if (params.searchQuery !== undefined) searchQueryStore.set(params.searchQuery);
    if (params.productName !== undefined) productNameStore.set(params.productName);
    if (params.selectedProductHash !== undefined) selectedProductHashStore.set(params.selectedProductHash);
    if (params.fuseResults !== undefined) fuseResultsStore.set(params.fuseResults);
    if (params.isViewAll !== undefined) isViewAllStore.set(params.isViewAll);
}

export function resetSearchState() {
    searchModeStore.set(false);
    searchQueryStore.set('');
    productNameStore.set('');
    selectedProductHashStore.set(null);
    fuseResultsStore.set([]);
    isViewAllStore.set(false);
}