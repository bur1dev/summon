import { writable } from 'svelte/store';
import type { SearchMethod, Product } from '../search/search-types';

// Data trigger stores - these control state that causes data fetching operations
// Changes to these stores should be carefully managed to avoid performance issues

// Category navigation state (triggers product loading)
export const selectedCategoryStore = writable<string | null>(null);
export const selectedSubcategoryStore = writable<string | null>(null);
export const selectedProductTypeStore = writable<string>('All');

// Home view state (triggers featured category loading)
export const isHomeViewStore = writable<boolean>(true);

// Search state (triggers search operations)
export const searchModeStore = writable<boolean>(false);
export const searchQueryStore = writable<string>('');

// Sort and filter state (triggers re-filtering/sorting of data)
export const sortByStore = writable<string>('best');
export const selectedBrandsStore = writable<Set<string>>(new Set());
export const selectedOrganicStore = writable<"all" | "organic" | "non-organic">("all");