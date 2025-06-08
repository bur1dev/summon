import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';
import type { CartBusinessService } from '../../cart/services/CartBusinessService';

interface PreferenceState {
    loading: boolean;
    preference: any | null;
    savePreference: boolean;
}

/**
 * Centralized preferences service following established service patterns
 * Provides reactive stores for preference state and methods for preference operations
 */
export class PreferencesService {
    private static stores = new Map<string, Writable<PreferenceState>>();

    /**
     * Gets or creates a reactive store for a specific product's preference
     * Following the reactive store pattern like other services
     */
    static getPreferenceStore(groupHash: string, productIndex: number): Writable<PreferenceState> {
        const key = this.getStoreKey(groupHash, productIndex);
        
        if (!this.stores.has(key)) {
            this.stores.set(key, writable({
                loading: false,
                preference: null,
                savePreference: false
            }));
        }
        
        return this.stores.get(key)!;
    }

    /**
     * Loads preference for a product from Holochain
     * Updates the reactive store with loading state and result
     */
    static async loadPreference(
        cartService: CartBusinessService | null,
        groupHash: string,
        productIndex: number
    ): Promise<boolean> {
        if (!cartService) {
            console.error("PreferencesService: Cart service not available");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);
        
        try {
            // Set loading state
            store.update(state => ({ ...state, loading: true }));

            const result = await cartService.getProductPreference(groupHash, productIndex);
            
            if (result && result.success && result.data) {
                // Preference exists
                store.update(state => ({
                    ...state,
                    loading: false,
                    preference: result.data.preference,
                    savePreference: true
                }));
            } else {
                // No preference found
                store.update(state => ({
                    ...state,
                    loading: false,
                    preference: null,
                    savePreference: false
                }));
            }
            return true;
        } catch (error) {
            console.error("Error loading product preference:", error);
            store.update(state => ({
                ...state,
                loading: false,
                preference: null,
                savePreference: false
            }));
            return false;
        }
    }

    /**
     * Saves preference for a product to Holochain
     * Updates the reactive store with the saved preference
     */
    static async savePreference(
        cartService: CartBusinessService | null,
        groupHash: string,
        productIndex: number,
        note: string
    ): Promise<boolean> {
        if (!cartService || !note?.trim()) {
            console.error("PreferencesService: Invalid parameters for saving preference");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);

        try {
            const result = await cartService.saveProductPreference({
                groupHash,
                productIndex,
                note: note.trim(),
                is_default: true,
            });

            if (result && result.success) {
                // Update store with saved preference
                store.update(state => ({
                    ...state,
                    preference: result.data,
                    savePreference: true
                }));
                console.log("Saved product preference:", result.data);
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error saving product preference:", error);
            return false;
        }
    }

    /**
     * Deletes preference for a product from Holochain
     * Updates the reactive store to reflect deletion
     */
    static async deletePreference(
        cartService: CartBusinessService | null,
        preferenceHash: any,
        groupHash: string,
        productIndex: number
    ): Promise<boolean> {
        if (!cartService || !preferenceHash) {
            console.error("PreferencesService: Invalid parameters for deleting preference");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);

        try {
            const result = await cartService.deleteProductPreference(preferenceHash);
            
            if (result && result.success) {
                // Update store to reflect deletion
                store.update(state => ({
                    ...state,
                    preference: null,
                    savePreference: false
                }));
                console.log("Deleted product preference");
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error deleting product preference:", error);
            return false;
        }
    }

    /**
     * Updates the save preference toggle state
     * Used when user toggles the "remember preferences" checkbox
     */
    static updateSavePreference(
        groupHash: string,
        productIndex: number,
        savePreference: boolean
    ): void {
        const store = this.getPreferenceStore(groupHash, productIndex);
        store.update(state => ({
            ...state,
            savePreference
        }));
    }

    /**
     * Clears preference state for a product
     * Useful for cleanup when components unmount
     */
    static clearPreferenceState(groupHash: string, productIndex: number): void {
        const key = this.getStoreKey(groupHash, productIndex);
        if (this.stores.has(key)) {
            this.stores.delete(key);
        }
    }

    /**
     * Gets the store key for a product preference
     */
    private static getStoreKey(groupHash: string, productIndex: number): string {
        return `${groupHash}_${productIndex}`;
    }
}