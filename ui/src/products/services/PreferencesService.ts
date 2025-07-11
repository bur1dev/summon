import { writable } from 'svelte/store';

interface PreferenceState {
    loading: boolean;
    preference: any | null;
}

type PreferencesMap = Record<string, PreferenceState>;

// Single store for all preferences - no complex maps needed!
export const preferences = writable<PreferencesMap>({});

let client: any = null;

export function setPreferencesClient(holochainClient: any): void {
    client = holochainClient;
}

// Generate preference key from UPC
export function getPreferenceKey(upc: string): string {
    return `upc_${upc}`;
}

export async function loadPreference(upc: string): Promise<boolean> {
    if (!client) return false;
    
    const key = getPreferenceKey(upc);
    updatePreference(key, { loading: true });
    
    try {
        const result = await client.callZome({
            role_name: 'preferences_role',
            zome_name: 'preferences',
            fn_name: 'get_preference',
            payload: { upc }
        });

        if (result) {
            updatePreference(key, {
                loading: false,
                preference: { note: result.note }
            });
        } else {
            updatePreference(key, { loading: false, preference: null });
        }
        return true;
    } catch (error) {
        console.error("Error loading preference:", error);
        updatePreference(key, { loading: false, preference: null });
        return false;
    }
}

export async function savePreference(upc: string, note: string): Promise<boolean> {
    if (!client || !note?.trim()) return false;
    
    try {
        await client.callZome({
            role_name: 'preferences_role',
            zome_name: 'preferences',
            fn_name: 'save_preference',
            payload: {
                upc,
                note: note.trim()
            }
        });

        const key = getPreferenceKey(upc);
        updatePreference(key, {
            preference: { note: note.trim() }
        });
        return true;
    } catch (error) {
        console.error("Error saving preference:", error);
        return false;
    }
}

export async function deletePreference(upc: string): Promise<boolean> {
    if (!client || !upc) return false;
    
    try {
        await client.callZome({
            role_name: 'preferences_role',
            zome_name: 'preferences',
            fn_name: 'delete_preference',
            payload: { upc }
        });

        const key = getPreferenceKey(upc);
        updatePreference(key, { preference: null });
        return true;
    } catch (error) {
        console.error("Error deleting preference:", error);
        return false;
    }
}



// Helper to update preference state
function updatePreference(key: string, updates: Partial<PreferenceState>) {
    preferences.update(prefs => ({
        ...prefs,
        [key]: { ...prefs[key], ...updates }
    }));
}