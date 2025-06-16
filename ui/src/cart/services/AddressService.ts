import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, get } from 'svelte/store';

// Type for Address object
export interface Address {
    street: string;
    unit?: string | null;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    is_default: boolean;
    label?: string | null;
}

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

// Type for the addresses map
type AddressMap = Record<ActionHashB64, Address>;

// Core stores
export const addresses = writable<AddressMap>({});
export const addressesLoading = writable<boolean>(false);

let client: any = null;

// Initialize
export function setAddressClient(holoClient: any) {
    client = holoClient;
    loadAddresses();
}

// Load addresses
export async function loadAddresses() {
    if (!client) return;
    
    addressesLoading.set(true);
    try {
        const result = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'get_addresses',
            payload: null
        });

        if (Array.isArray(result)) {
            const addressMap: AddressMap = {};
            result.forEach(([hash, address]) => {
                addressMap[encodeHashToBase64(hash)] = address;
            });
            addresses.set(addressMap);
        }
    } finally {
        addressesLoading.set(false);
    }
}

// Create address
export async function createAddress(address: Address) {
    if (!client) return { success: false, error: 'Client not available' };
    
    try {
        const result = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'create_address',
            payload: address
        });

        const hashB64 = encodeHashToBase64(result);
        addresses.update(current => ({ ...current, [hashB64]: address }));
        
        if (address.is_default) {
            updateDefaultAddress(hashB64);
        }

        return { success: true, hash: hashB64 };
    } catch (error) {
        return { success: false, error };
    }
}

// Update address
export async function updateAddress(hashB64: ActionHashB64, address: Address) {
    if (!client) return { success: false, error: 'Client not available' };
    
    try {
        await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'update_address',
            payload: [decodeHashFromBase64(hashB64), address]
        });

        addresses.update(current => ({ ...current, [hashB64]: address }));
        
        if (address.is_default) {
            updateDefaultAddress(hashB64);
        }

        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

// Delete address
export async function deleteAddress(hashB64: ActionHashB64) {
    if (!client) return { success: false, error: 'Client not available' };
    
    try {
        await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'delete_address',
            payload: decodeHashFromBase64(hashB64)
        });

        addresses.update(current => {
            const { [hashB64]: deleted, ...remaining } = current;
            return remaining;
        });

        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

// Get address (for compatibility)
export function getAddress(hashB64: ActionHashB64) {
    return get(addresses)[hashB64];
}


// Validate address
export async function validateAddress(address: Address) {
    try {
        const query = encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zip}`);
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${query}&addressdetails=1`,
            { headers: { 'Accept': 'application/json', 'User-Agent': 'SummonGrocery/1.0' } }
        );

        const data = await response.json();
        if (!data?.length) return { valid: false, message: 'Address could not be validated.' };

        const { lat: latStr, lon: lngStr } = data[0];
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Distance to Ralphs Encinitas - inline calculation
        const toRad = (deg: number) => deg * (Math.PI / 180);
        const R = 3958.8;
        const dLat = toRad(33.0382 - lat);
        const dLng = toRad(-117.2613 - lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(33.0382)) * Math.sin(dLng / 2) ** 2;
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return distance <= 3 
            ? { valid: true, lat, lng }
            : { valid: false, lat, lng, message: `Address is ${distance.toFixed(1)} miles away. We only deliver within 3 miles.` };
    } catch {
        return { valid: false, message: 'Error validating address.' };
    }
}

// Helper to update default address
function updateDefaultAddress(defaultHashB64: ActionHashB64) {
    addresses.update(current => {
        const updated = { ...current };
        Object.keys(updated).forEach(hash => {
            if (hash !== defaultHashB64 && updated[hash].is_default) {
                updated[hash] = { ...updated[hash], is_default: false };
            }
        });
        return updated;
    });
}