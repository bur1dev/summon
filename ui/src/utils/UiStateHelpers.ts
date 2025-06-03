// Helper functions that coordinate between UI-only and data trigger stores
// These functions are safe because they're explicit operations, not reactive cascades

import type { SearchMethod, Product } from '../search/search-types';

// Import from both store files
import {
    productNameStore,
    selectedProductHashStore,
    searchResultsStore,
    isViewAllStore,
    searchMethodStore
} from '../stores/UiOnlyStore';

import {
    searchModeStore,
    searchQueryStore,
    sortByStore,
    selectedBrandsStore,
    selectedOrganicStore
} from '../stores/DataTriggerStore';

// Helper function to set search-related state across both stores
// This is safe because it's an explicit function call, not a reactive statement
export function setSearchState(params: {
    searchMode?: boolean,
    searchQuery?: string,
    productName?: string,
    selectedProductHash?: string | null,
    searchResults?: Product[],
    isViewAll?: boolean,
    searchMethod?: SearchMethod
}) {
    // Update data trigger stores (these might cause data operations)
    if (params.searchMode !== undefined) searchModeStore.set(params.searchMode);
    if (params.searchQuery !== undefined) searchQueryStore.set(params.searchQuery);

    // Update UI-only stores (these are just for display)
    if (params.productName !== undefined) productNameStore.set(params.productName);
    if (params.selectedProductHash !== undefined) selectedProductHashStore.set(params.selectedProductHash);
    if (params.searchResults !== undefined) searchResultsStore.set(params.searchResults);
    if (params.isViewAll !== undefined) isViewAllStore.set(params.isViewAll);
    if (params.searchMethod !== undefined) searchMethodStore.set(params.searchMethod);
}

// Helper function to reset search state across both stores
export function resetSearchState() {
    // Reset data trigger stores
    searchModeStore.set(false);
    searchQueryStore.set('');
    sortByStore.set('best');
    selectedBrandsStore.set(new Set());
    selectedOrganicStore.set("all");

    // Reset UI-only stores
    productNameStore.set('');
    selectedProductHashStore.set(null);
    searchResultsStore.set([]);
    isViewAllStore.set(false);
    searchMethodStore.set('');
}