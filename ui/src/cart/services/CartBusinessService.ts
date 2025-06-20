import { writable, derived } from 'svelte/store';
import type { DataManager } from "../../services/DataManager";
import { 
    setPersistenceClient, 
    loadFromLocalStorage, 
    loadFromPrivateEntry, 
    saveToLocalStorage, 
    scheduleSyncToHolochain, 
    forceSyncToHolochain as persistenceForceSyncToHolochain, 
    mergeLocalAndHolochainCarts 
} from "./CartPersistenceService";
import type { CartItem } from '../types/CartTypes';
import { parseProductHash } from '../utils/cartHelpers';

// Service dependencies
let client: any = null;

// Core stores
export const cartItems = writable<CartItem[]>([]);
export const cartTotal = writable(0);
export const cartPromoTotal = writable(0);
export const cartReady = writable(false);
export const cartLoading = writable(true);

// Derived stores for UI
export const itemCount = derived(cartItems, items =>
    items.reduce((sum, item) => sum + item.quantity, 0)
);
export const uniqueItemCount = derived(cartItems, items => items.length);
export const hasItems = derived(cartItems, items => items.length > 0);

// Local cart management
let localCartItems: CartItem[] = [];

// Service initialization
export function setCartServices(holoClient: any, _dataManager?: DataManager): void {
    client = holoClient;
    setPersistenceClient(holoClient);

    cartItems.set([]);
    cartTotal.set(0);
    cartPromoTotal.set(0);
    cartLoading.set(true);

    // Initialize asynchronously
    initialize();
}

// SIMPLIFIED: DataManager no longer needed for cart calculations (stub for backward compatibility)
export function setDataManager(_dataManager: DataManager): void {
    // No-op: Cart service now does simple local calculations instead of complex product lookups
    // DataManager injection no longer needed in simplified architecture
}

async function initialize(): Promise<void> {
    if (!client) return;
    
    try {
        cartReady.set(false);
        cartLoading.set(true);

        // First check localStorage
        const localItems = await loadFromLocalStorage();
        if (localItems.length > 0) {
            localCartItems = localItems;
            cartItems.set(localItems);
            recalculateCartTotal();
        }

        if (client) {
            // Wait a bit to ensure Holochain connection is ready
            await new Promise(resolve => setTimeout(resolve, 500));

            // Load cart from Holochain (will merge with local if needed)
            await loadCart();
        } else {
            console.warn("No Holochain client available for cart initialization");
        }

        // Signal service is ready
        cartLoading.set(false);
        cartReady.set(true);
    } catch (error) {
        console.error("Cart service initialization failed:", error);
        cartLoading.set(false);
        cartReady.set(true);
    }
}

// Load cart from Holochain
export async function loadCart(): Promise<void> {
    if (!client) return;
    
    cartLoading.set(true);

    try {
        const holochainItems = await loadFromPrivateEntry();

        if (holochainItems.length > 0) {
            if (localCartItems.length > 0) {
                console.log("Merging Holochain cart with local cart");
                localCartItems = mergeLocalAndHolochainCarts(
                    localCartItems,
                    holochainItems
                );
            } else {
                // No local items, just use Holochain items
                localCartItems = holochainItems;
            }

            // Update the svelte store
            cartItems.set([...localCartItems]);

            // Save to localStorage
            saveToLocalStorage(localCartItems);

            // Recalculate cart total after loading items
            recalculateCartTotal();
        } else if (localCartItems.length > 0) {
            // If we have local items but nothing in Holochain, sync to Holochain
            persistenceForceSyncToHolochain(localCartItems);
        }
    } catch (error) {
        console.error('Error loading cart from Holochain:', error);
    }

    cartLoading.set(false);
}

// Add product to cart - THE ONLY BRIDGE TO PRODUCT CATALOG
export async function addToCart(product: any, quantity: number = 1, note?: string) {
    if (!client) return { success: false, error: "Service not initialized", local: true };
    
    try {
        const validation = validateProductForCart(product);
        if (!validation.success) return validation;
        
        const cartItem = createCartItemFromProduct(product, quantity, note);
        updateLocalCartState(cartItem);
        scheduleHolochainSync();
        
        return { success: true, local: true };
    } catch (error) {
        console.error('Error adding to cart:', error);
        return { success: false, error, local: true };
    }
}

function validateProductForCart(product: any) {
    if (!product) {
        console.error("Cannot add item to cart: missing product");
        return { success: false, error: "Invalid product", local: true };
    }

    const { productId } = parseProductHash(product);
    
    if (!productId) {
        console.error("Cannot add item to cart: invalid product hash", product);
        return { success: false, error: "Invalid product identifier", local: true };
    }
    
    return { success: true, productId };
}

function createCartItemFromProduct(product: any, quantity: number, note?: string): CartItem {
    const { productId } = parseProductHash(product);
    
    return {
        productId: productId!,
        productName: product.name || 'Unknown Product',
        productImageUrl: product.image_url,
        priceAtCheckout: product.price || 0, // Frozen regular price at time of adding
        promoPrice: product.promo_price, // Frozen promo price (if available)
        quantity,
        timestamp: Date.now(),
        note
    };
}

function updateLocalCartState(newCartItem: CartItem): void {
    updateLocalCart(newCartItem);
    recalculateCartTotal();
}

function scheduleHolochainSync(): void {
    scheduleSyncToHolochain(localCartItems);
}

// Clear cart
export async function clearCart() {
    if (!client) return { success: false, error: "Service not initialized" };
    
    try {
        // Clear local cart immediately
        localCartItems = [];
        cartItems.set([]);
        cartTotal.set(0);
        cartPromoTotal.set(0);
        saveToLocalStorage([]);

        // Schedule sync to Holochain
        scheduleSyncToHolochain([]);

        return { success: true };
    } catch (error) {
        console.error('Error clearing cart:', error);
        return { success: false, error };
    }
}

function updateLocalCart(newItem: CartItem): void {
    if (!client) return;
    
    const itemIndex = localCartItems.findIndex(item =>
        item.productId === newItem.productId
    );

    if (newItem.quantity === 0) {
        // Remove item if quantity is 0
        if (itemIndex >= 0) {
            localCartItems.splice(itemIndex, 1);
        }
    } else {
        // Update existing or add new
        if (itemIndex >= 0) {
            localCartItems[itemIndex].quantity = newItem.quantity;
            localCartItems[itemIndex].timestamp = newItem.timestamp;
            localCartItems[itemIndex].note = newItem.note;
        } else {
            localCartItems.push(newItem);
        }
    }

    // Update the store for UI
    cartItems.set([...localCartItems]);

    // Save to localStorage
    saveToLocalStorage(localCartItems);
}

// SIMPLIFIED: Recalculate cart total completely - no more complex zome calls
function recalculateCartTotal(): void {
    try {
        // Calculate both regular and promo totals
        const regularTotal = localCartItems.reduce((sum, item) => 
            sum + (item.priceAtCheckout * item.quantity), 0
        );
        
        const promoTotal = localCartItems.reduce((sum, item) => 
            sum + ((item.promoPrice || item.priceAtCheckout) * item.quantity), 0
        );
        
        cartTotal.set(regularTotal);
        cartPromoTotal.set(promoTotal);
    } catch (error) {
        console.error('Error recalculating cart total:', error);
    }
}

// Get current cart items
export function getCartItems(): CartItem[] {
    return localCartItems;
}

// Subscribe to cart changes
export function subscribe(callback: (items: CartItem[]) => void) {
    callback(localCartItems);
    return cartItems.subscribe(callback);
}

// Helper methods for other services

// Get client for other services (backward compatibility)
export function getClient(): any {
    return client;
}

// SIMPLIFIED: Restore cart items from checked-out cart (used by OrdersService)
export async function restoreCartItems(cart: any): Promise<void> {
    if (!client) return;
    
    console.log("Adding products back to cart:", cart.products.length);

    // Clear existing cart
    localCartItems = [];

    // Add each product - all data is already in the cart.products
    for (const product of cart.products) {
        if (product && product.productId) {
            localCartItems.push({
                productId: product.productId,
                productName: product.productName || product.product_name,
                productImageUrl: product.productImageUrl || product.product_image_url,
                priceAtCheckout: product.priceAtCheckout || product.price_at_checkout,
                promoPrice: product.promoPrice || product.promo_price,
                quantity: product.quantity,
                timestamp: Date.now(),
                note: product.note
            });
        }
    }

    // Update UI
    cartItems.set([...localCartItems]);

    // Save to localStorage
    saveToLocalStorage(localCartItems);

    // Recalculate total
    recalculateCartTotal();
}

// Force sync to Holochain (used after zome calls)
export async function forceSyncToHolochain(): Promise<void> {
    if (client) {
        await persistenceForceSyncToHolochain(localCartItems);
    }
}