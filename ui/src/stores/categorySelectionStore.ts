// categorySelectionStore.ts
import { writable } from 'svelte/store';

interface CategorySelection {
    category: string | null;
    subcategory: string | null;
    productType: string | null;
}

export const lastCategorySelection = writable<CategorySelection>({
    category: null,
    subcategory: null,
    productType: null
});