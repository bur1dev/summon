import { decodeHashFromBase64 } from '@holochain/client';
import { writable, get } from 'svelte/store';
import type { CheckoutDetails } from '../types/CartTypes';
import { getCartItems, forceSyncToHolochain, clearCart } from './CartBusinessService';

// Store and service references
export const savedDeliveryDetails = writable<CheckoutDetails>({});
let client: any = null;

// Initialize services
export function setCheckoutServices(holoClient: any) {
    client = holoClient;
}

// Checkout cart with delivery details
export async function checkoutCart(details: CheckoutDetails) {
    if (!client) return { success: false, message: "No Holochain client available" };
    
    try {
        forceSyncToHolochain();
        const localCartItems = getCartItems();
        
        const cartProducts = localCartItems.map(item => {
            try {
                const groupHash = decodeHashFromBase64(item.groupHash);
                return {
                    group_hash: groupHash,
                    product_index: item.productIndex,
                    quantity: item.quantity,
                    timestamp: item.timestamp,
                    note: item.note
                };
            } catch (e) {
                console.error(`Invalid group hash format: ${item.groupHash}`, e);
                return null;
            }
        }).filter(Boolean);
        
        if (cartProducts.length === 0) return { success: false, message: "Cart is empty" };
        
        const payload: any = {
            address_hash: details.addressHash ? (() => {
                try {
                    return decodeHashFromBase64(details.addressHash);
                } catch {
                    throw new Error('Invalid address hash format');
                }
            })() : null,
            delivery_instructions: details.deliveryInstructions || null,
            delivery_time: details.deliveryTime || null,
            cart_products: cartProducts
        };
        
        console.log("Checking out cart with details:", payload);
        const checkoutResult = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'checkout_cart',
            payload
        });
        
        console.log("Checkout result:", checkoutResult);
        await clearCart();
        savedDeliveryDetails.set({});
        
        return { success: true, data: checkoutResult };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error checking out cart:', error);
        return { success: false, message: errorMessage };
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