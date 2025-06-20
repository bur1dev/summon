import { callZome } from '../utils/zomeHelpers';
import { createSuccessResult, createErrorResult, validateClient } from '../utils/errorHelpers';
import { writable, get } from 'svelte/store';
import type { CheckoutDetails } from '../types/CartTypes';
import { getCartItems, forceSyncToHolochain, clearCart } from './CartBusinessService';
import { clearSessionPreferences } from '../../products/services/PreferencesService';
import { mapCartItemsToPayload } from '../utils/cartHelpers';
import { createAddress, getAddress } from './AddressService';
import { decodeHash } from '../utils/zomeHelpers';

// Functional store exports
export const savedDeliveryDetails = writable<CheckoutDetails>({});
let client: any = null;

// Initialize services
export function setCheckoutServices(holoClient: any) {
    client = holoClient;
}


// SECURE: Two-step checkout process with private address
export async function checkoutCart(details: CheckoutDetails) {
    const clientError = validateClient(client, 'checkout cart');
    if (clientError) return { success: false, message: clientError.message };
    
    try {
        await forceSyncToHolochain();
        const localCartItems = getCartItems();
        
        // Map cart items to backend structure
        const cartProducts = mapCartItemsToPayload(localCartItems);
        
        if (cartProducts.length === 0) return { success: false, message: "Cart is empty" };
        
        if (!details.addressHash) {
            return { success: false, message: "Address is required" };
        }
        
        // STEP 1: Create immutable private address copy for this order
        // Get address data from user's address book
        const addressData = getAddress(details.addressHash);
        if (!addressData) {
            return { success: false, message: "Address not found in address book" };
        }
        
        // Create permanent, private address entry for order historical integrity
        const privateAddressResult = await createAddress(addressData);
        if (!privateAddressResult.success) {
            return { success: false, message: `Failed to create private address copy: ${privateAddressResult.message}` };
        }
        
        const privateAddressHash = privateAddressResult.data.hash;
        console.log("Created immutable address copy for order:", privateAddressHash);
        
        // STEP 2: Checkout cart with private address hash
        const payload: any = {
            private_address_hash: decodeHash(privateAddressHash),
            delivery_time: details.deliveryTime || null,
            cart_products: cartProducts
        };
        
        console.log("Checking out cart with private address:", payload);
        const checkoutResult = await callZome(client, 'cart', 'checkout_cart', payload);
        
        console.log("Checkout result:", checkoutResult);
        await clearCart();
        clearSessionPreferences(); // Clear temporary preference data
        savedDeliveryDetails.set({});
        
        return createSuccessResult(checkoutResult);
    } catch (error) {
        console.error('Error checking out cart:', error);
        return createErrorResult(error);
    }
}

// Generate delivery time slots
export function generateDeliveryTimeSlots(startDate = new Date()) {
    const slots = [
        { start: '7am', end: '9am', hour: 7 }, { start: '8am', end: '10am', hour: 8 },
        { start: '7am', end: '10am', hour: 7 }, { start: '9am', end: '11am', hour: 9 },
        { start: '8am', end: '11am', hour: 8 }, { start: '10am', end: 'Noon', hour: 10 },
        { start: '11am', end: '1pm', hour: 11 }, { start: 'Noon', end: '2pm', hour: 12 },
        { start: '1pm', end: '3pm', hour: 13 }, { start: '2pm', end: '4pm', hour: 14 },
        { start: '3pm', end: '5pm', hour: 15 }, { start: '4pm', end: '6pm', hour: 16 },
        { start: '5pm', end: '7pm', hour: 17 }, { start: '6pm', end: '8pm', hour: 18 }
    ];
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const currentHour = now.getHours();
    
    return Array.from({ length: 9 }, (_, i) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);
        
        const isToday = date.getDate() === now.getDate() && 
                       date.getMonth() === now.getMonth() && 
                       date.getFullYear() === now.getFullYear();
        
        const timeSlots = slots.map((slot, index) => {
            if (isToday && slot.hour <= currentHour + 1) return null;
            
            const slotDate = new Date(date);
            slotDate.setHours(slot.hour, 0, 0, 0);
            
            return {
                id: `${i}-${index}`,
                display: `${slot.start}–${slot.end}`,
                timestamp: slotDate.getTime(),
                slot: `${slot.start}–${slot.end}`
            };
        }).filter(Boolean);
        
        return timeSlots.length > 0 ? {
            date,
            dateFormatted: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            dayOfWeek: days[date.getDay()],
            timeSlots
        } : null;
    }).filter(Boolean);
}

// Delivery details functions
export function getSavedDeliveryDetails(): CheckoutDetails {
    return get(savedDeliveryDetails);
}

export function setSavedDeliveryDetails(details: CheckoutDetails): void {
    savedDeliveryDetails.set(details);
}

export function clearSavedDeliveryDetails(): void {
    savedDeliveryDetails.set({});
}