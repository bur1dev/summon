import { writable, get } from 'svelte/store';
import { callZome } from '../utils/zomeHelpers';
import { createSuccessResult, createErrorResult, validateClient } from '../utils/errorHelpers';
import type { Address } from './AddressService';

// Store for the currently selected public address in the cart
export const selectedCartAddress = writable<Address | null>(null);
export const selectedCartAddressHash = writable<string | null>(null);

let client: any = null;

// Initialize service
export function setCartAddressClient(holoClient: any) {
    client = holoClient;
}

// Set delivery address for the first time in the cart session
export async function setDeliveryAddress(address: Address) {
    const clientError = validateClient(client, 'setDeliveryAddress');
    if (clientError) return clientError;
    
    console.log('🛒 FRONTEND: Setting PUBLIC address in cart.dna (first time):', `${address.street}, ${address.city}, ${address.state}`);
    
    try {
        const result = await callZome(client, 'cart', 'cart', 'set_delivery_address', address);
        
        console.log('✅ FRONTEND: Public address set successfully with hash:', result);
        
        // Update local state
        selectedCartAddress.set(address);
        selectedCartAddressHash.set(result);
        
        return createSuccessResult({ hash: result });
    } catch (error) {
        return createErrorResult(error);
    }
}

// Update delivery address in the cart session
export async function updateDeliveryAddress(previousHashB64: string, newAddress: Address) {
    const clientError = validateClient(client, 'updateDeliveryAddress');
    if (clientError) return clientError;
    
    console.log('🔄 FRONTEND: Updating PUBLIC address in cart.dna from hash:', previousHashB64, 'to:', `${newAddress.street}, ${newAddress.city}, ${newAddress.state}`);
    
    try {
        // Create input struct for backend
        const input = {
            previous_address_hash: previousHashB64,
            new_address: newAddress
        };
        
        const result = await callZome(client, 'cart', 'cart', 'update_delivery_address', input);
        
        console.log('✅ FRONTEND: Public address updated successfully with new hash:', result);
        
        // Update local state
        selectedCartAddress.set(newAddress);
        selectedCartAddressHash.set(result);
        
        return createSuccessResult({ hash: result });
    } catch (error) {
        return createErrorResult(error);
    }
}

// Get current cart session data including address
export async function getCartSessionData() {
    const clientError = validateClient(client, 'getSessionData');
    if (clientError) return clientError;
    
    try {
        const result = await callZome(client, 'cart', 'cart', 'get_session_data', null);
        
        // Update local state if address exists
        if (result.address) {
            // Extract address data from Record
            const addressData = result.address.entry;
            selectedCartAddress.set(addressData);
            selectedCartAddressHash.set(result.address.action_hash);
        }
        
        return createSuccessResult(result);
    } catch (error) {
        return createErrorResult(error);
    }
}

// Clear selected address
export function clearSelectedAddress() {
    selectedCartAddress.set(null);
    selectedCartAddressHash.set(null);
}

// Get current selected address
export function getSelectedAddress(): Address | null {
    return get(selectedCartAddress);
}

// Get current selected address hash
export function getSelectedAddressHash(): string | null {
    return get(selectedCartAddressHash);
}