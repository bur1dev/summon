import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';
import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';

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
    private static client: any = null;

    /**
     * Initialize the service with Holochain client
     * Called during app initialization
     */
    static setClient(client: any): void {
        this.client = client;
    }

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
        groupHash: string,
        productIndex: number
    ): Promise<boolean> {
        if (!this.client) {
            console.error("PreferencesService: No Holochain client available");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);
        
        try {
            // Set loading state
            store.update(state => ({ ...state, loading: true }));

            // Decode hash for Holochain call
            const groupHashDecoded = decodeHashFromBase64(groupHash);

            // Call the zome function directly
            const result = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'get_product_preference_by_product',
                payload: {
                    group_hash: groupHashDecoded,
                    product_index: productIndex
                }
            });

            if (result) {
                // Result contains [hash, preference]
                const [prefHash, preference] = result;
                const preferenceData = {
                    hash: encodeHashToBase64(prefHash),
                    preference: preference
                };

                // Preference exists
                store.update(state => ({
                    ...state,
                    loading: false,
                    preference: preferenceData,
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
        groupHash: string,
        productIndex: number,
        note: string
    ): Promise<boolean> {
        if (!this.client || !note?.trim()) {
            console.error("PreferencesService: Invalid parameters for saving preference");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);

        try {
            // Convert to Holochain format
            const holochainPreference = {
                group_hash: decodeHashFromBase64(groupHash),
                product_index: productIndex,
                note: note.trim(),
                timestamp: Date.now(),
                is_default: true
            };

            // Call the zome function directly
            const hash = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'save_product_preference',
                payload: holochainPreference
            });

            const savedData = {
                hash: encodeHashToBase64(hash),
                preference: holochainPreference
            };

            // Update store with saved preference
            store.update(state => ({
                ...state,
                preference: savedData,
                savePreference: true
            }));
            console.log("Saved product preference:", savedData);
            return true;
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
        preferenceHash: string,
        groupHash: string,
        productIndex: number
    ): Promise<boolean> {
        if (!this.client || !preferenceHash) {
            console.error("PreferencesService: Invalid parameters for deleting preference");
            return false;
        }

        const store = this.getPreferenceStore(groupHash, productIndex);

        try {
            // Decode hash for Holochain call
            const prefHash = decodeHashFromBase64(preferenceHash);

            // Call the zome function directly
            await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'delete_product_preference',
                payload: prefHash
            });

            // Update store to reflect deletion
            store.update(state => ({
                ...state,
                preference: null,
                savePreference: false
            }));
            console.log("Deleted product preference");
            return true;
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