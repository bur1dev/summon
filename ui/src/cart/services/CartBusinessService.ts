import { writable, derived } from 'svelte/store';
import type { CartItem } from '../types/CartTypes';
import { parseProductHash, getIncrementValue } from '../utils/cartHelpers';
import { callZome } from '../utils/zomeHelpers';
import { getSessionData } from './CheckoutService';

// Service dependencies
let client: any = null;

// Core stores
export const cartItems = writable<CartItem[]>([]);
export const cartTotal = writable(0);
export const cartPromoTotal = writable(0);
export const cartReady = writable(false);
export const cartLoading = writable(false);

// Session status store - centralized session state management
export const sessionStatus = writable<string>('Shopping');
export const isCheckoutSession = derived(sessionStatus, status => status === 'Checkout');

// Derived stores for UI
export const itemCount = derived(cartItems, items =>
    items.reduce((sum, item) => sum + item.quantity, 0)
);
export const uniqueItemCount = derived(cartItems, items => items.length);
export const hasItems = derived(cartItems, items => items.length > 0);

// Service initialization
export function setCartServices(holoClient: any): void {
    client = holoClient;
    loadCart();
    updateSessionStatus(); // Load initial session status
}

export function setDataManager(_dataManager: any): void {
    // No-op: DataManager no longer needed for cart calculations
}

// Load cart from backend and aggregate by productId
export async function loadCart(): Promise<void> {
    if (!client) return;
    
    cartLoading.set(true);
    
    try {
        const backendItems = await callZome(client, 'cart', 'cart', 'get_current_items', null);
        
        if (backendItems && Array.isArray(backendItems)) {
            // Convert backend format to CartItem and aggregate by productId
            const aggregated = aggregateByProductId(backendItems);
            cartItems.set(aggregated);
            calculateTotals(aggregated);
        } else {
            cartItems.set([]);
            cartTotal.set(0);
            cartPromoTotal.set(0);
        }
    } catch (error) {
        console.error('Error loading cart:', error);
        cartItems.set([]);
        cartTotal.set(0);
        cartPromoTotal.set(0);
    }
    
    cartLoading.set(false);
    cartReady.set(true);
}

// Aggregate multiple backend entries by productId (sum quantities)
function aggregateByProductId(backendItems: any[]): CartItem[] {
    const aggregated = new Map<string, CartItem>();
    
    for (const item of backendItems) {
        // Backend returns flattened format, not nested under 'product'
        const existing = aggregated.get(item.product_id);
        
        if (existing) {
            // Sum quantities
            existing.quantity += item.quantity;
            existing.timestamp = Math.max(existing.timestamp, item.timestamp);
        } else {
            // First occurrence
            aggregated.set(item.product_id, {
                productId: item.product_id,
                upc: item.upc,
                productName: item.product_name,
                productImageUrl: item.product_image_url,
                priceAtCheckout: item.price_at_checkout || 0,
                promoPrice: item.promo_price,
                soldBy: item.sold_by || "UNIT",
                quantity: item.quantity || 1,
                timestamp: item.timestamp || Date.now(),
                note: item.note
            });
        }
    }
    
    return Array.from(aggregated.values());
}

// Add product to cart
export async function addToCart(product: any, quantity: number = 1, note?: string) {
    if (!client) return { success: false, error: "Service not initialized" };
    
    try {
        const { productId } = parseProductHash(product);
        if (!productId) return { success: false, error: "Invalid product" };
        
        // Get increment value for uniform entry sizes
        const incrementValue = getIncrementValue(product);
        
        // Create uniform entries (always 0.25 for WEIGHT, always 1 for UNIT)
        const cartProduct = {
            product_id: productId,
            upc: product.upc,
            product_name: product.name,
            product_image_url: product.image_url,
            price_at_checkout: product.price || 0,
            promo_price: product.promo_price,
            sold_by: product.sold_by || "UNIT",
            quantity: incrementValue, // Always uniform: 0.25 for WEIGHT, 1 for UNIT
            timestamp: Date.now(),
            note
        };
        
        // Create multiple entries if needed
        const entriesToCreate = Math.ceil(quantity / incrementValue);
        for (let i = 0; i < entriesToCreate; i++) {
            await callZome(client, 'cart', 'cart', 'add_item', cartProduct);
        }
        
        await loadCart();
        return { success: true };
    } catch (error) {
        console.error('Error adding to cart:', error);
        return { success: false, error };
    }
}

// Remove specific quantity of a product from cart
export async function removeSpecificQuantity(product: any, quantityToRemove: number) {
    if (!client) return { success: false, error: "Service not initialized" };
    
    try {
        const { productId } = parseProductHash(product);
        if (!productId) return { success: false, error: "Invalid product" };
        
        // Get all backend items and remove specific quantity
        const backendItems = await callZome(client, 'cart', 'cart', 'get_current_items', null);
        
        if (backendItems && Array.isArray(backendItems)) {
            let removedQuantity = 0;
            
            for (const item of backendItems) {
                if (item.product_id === productId && removedQuantity < quantityToRemove) {
                    const itemQuantity = item.quantity || 1;
                    await callZome(client, 'cart', 'cart', 'remove_item', item.action_hash);
                    removedQuantity += itemQuantity;
                    
                    // Stop when we've removed enough
                    if (removedQuantity >= quantityToRemove) break;
                }
            }
        }
        
        await loadCart();
        return { success: true };
    } catch (error) {
        console.error('Error removing specific quantity:', error);
        return { success: false, error };
    }
}

// Remove all instances of a product from cart
export async function removeItemFromCart(product: any) {
    if (!client) return { success: false, error: "Service not initialized" };
    
    try {
        const { productId } = parseProductHash(product);
        if (!productId) return { success: false, error: "Invalid product" };
        
        // Get all backend items and remove all with matching productId
        const backendItems = await callZome(client, 'cart', 'cart', 'get_current_items', null);
        
        if (backendItems && Array.isArray(backendItems)) {
            for (const item of backendItems) {
                if (item.product_id === productId) {
                    await callZome(client, 'cart', 'cart', 'remove_item', item.action_hash);
                }
            }
        }
        
        await loadCart();
        return { success: true };
    } catch (error) {
        console.error('Error removing item:', error);
        return { success: false, error };
    }
}

// Clear cart
export async function clearCart() {
    if (!client) return { success: false, error: "Service not initialized" };
    
    try {
        const backendItems = await callZome(client, 'cart', 'cart', 'get_current_items', null);
        
        if (backendItems && Array.isArray(backendItems)) {
            for (const item of backendItems) {
                await callZome(client, 'cart', 'cart', 'remove_item', item.action_hash);
            }
        }
        
        await loadCart();
        return { success: true };
    } catch (error) {
        console.error('Error clearing cart:', error);
        return { success: false, error };
    }
}

// Calculate totals
function calculateTotals(items: CartItem[]): void {
    const regularTotal = items.reduce((sum, item) => sum + (item.priceAtCheckout * item.quantity), 0);
    const promoTotal = items.reduce((sum, item) => sum + ((item.promoPrice || item.priceAtCheckout) * item.quantity), 0);
    
    cartTotal.set(regularTotal);
    cartPromoTotal.set(promoTotal);
}

// Get current cart items
export function getCartItems(): CartItem[] {
    let items: CartItem[] = [];
    cartItems.subscribe(value => items = value)();
    return items;
}

// Subscribe to cart changes
export function subscribe(callback: (items: CartItem[]) => void) {
    return cartItems.subscribe(callback);
}

// Get client
export function getClient(): any {
    return client;
}

// Update session status from DHT data
export async function updateSessionStatus(): Promise<void> {
    if (!client) return;
    
    try {
        const result = await getSessionData();
        if (result.success && result.data.session_status_decoded) {
            sessionStatus.set(result.data.session_status_decoded);
        }
    } catch (error) {
        console.error('Error updating session status:', error);
        // Default to Shopping on error
        sessionStatus.set('Shopping');
    }
}

// Restore cart items (used by OrdersService)
export async function restoreCartItems(cart: any): Promise<void> {
    console.log("TODO: Restore cart items", cart);
}

