import { writable } from 'svelte/store';
import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';

interface PreferenceState {
    loading: boolean;
    preference: any | null;
    savePreference: boolean;
}

type PreferencesMap = Record<string, PreferenceState>;

// Single store for all preferences - no complex maps needed!
export const preferences = writable<PreferencesMap>({});

let client: any = null;

export function setPreferencesClient(holochainClient: any): void {
    client = holochainClient;
}

export function getPreferenceKey(groupHash: string, productIndex: number): string {
    return `${groupHash}_${productIndex}`;
}

export async function loadPreference(groupHash: string, productIndex: number): Promise<boolean> {
    if (!client) return false;
    
    const key = getPreferenceKey(groupHash, productIndex);
    
    // Set loading state
    preferences.update(prefs => ({
        ...prefs,
        [key]: { ...prefs[key], loading: true }
    }));
    
    try {
        const result = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'get_product_preference_by_product',
            payload: {
                group_hash: decodeHashFromBase64(groupHash),
                product_index: productIndex
            }
        });

        if (result) {
            const [prefHash, preference] = result;
            preferences.update(prefs => ({
                ...prefs,
                [key]: {
                    loading: false,
                    preference: { hash: encodeHashToBase64(prefHash), preference },
                    savePreference: true
                }
            }));
        } else {
            preferences.update(prefs => ({
                ...prefs,
                [key]: { loading: false, preference: null, savePreference: false }
            }));
        }
        return true;
    } catch (error) {
        console.error("Error loading preference:", error);
        preferences.update(prefs => ({
            ...prefs,
            [key]: { loading: false, preference: null, savePreference: false }
        }));
        return false;
    }
}

export async function savePreference(groupHash: string, productIndex: number, note: string): Promise<boolean> {
    if (!client || !note?.trim()) return false;
    
    try {
        const hash = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'save_product_preference',
            payload: {
                group_hash: decodeHashFromBase64(groupHash),
                product_index: productIndex,
                note: note.trim(),
                timestamp: Date.now(),
                is_default: true
            }
        });

        const key = getPreferenceKey(groupHash, productIndex);
        preferences.update(prefs => ({
            ...prefs,
            [key]: {
                ...prefs[key],
                preference: { hash: encodeHashToBase64(hash), preference: { note: note.trim() } },
                savePreference: true
            }
        }));
        return true;
    } catch (error) {
        console.error("Error saving preference:", error);
        return false;
    }
}

export async function deletePreference(preferenceHash: string, groupHash: string, productIndex: number): Promise<boolean> {
    if (!client || !preferenceHash) return false;
    
    try {
        await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'delete_product_preference',
            payload: decodeHashFromBase64(preferenceHash)
        });

        const key = getPreferenceKey(groupHash, productIndex);
        preferences.update(prefs => ({
            ...prefs,
            [key]: { ...prefs[key], preference: null, savePreference: false }
        }));
        return true;
    } catch (error) {
        console.error("Error deleting preference:", error);
        return false;
    }
}

export function updateSavePreference(groupHash: string, productIndex: number, value: boolean): void {
    const key = getPreferenceKey(groupHash, productIndex);
    preferences.update(prefs => ({
        ...prefs,
        [key]: { ...prefs[key], savePreference: value }
    }));
}