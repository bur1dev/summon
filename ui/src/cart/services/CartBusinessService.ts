import { encodeHashToBase64 } from '@holochain/client';
import { writable, derived } from 'svelte/store';
import type { DataManager } from "../../services/DataManager";
import { CartPersistenceService } from "./CartPersistenceService";
import { CartCalculationService } from "./CartCalculationService";
import type { CartItem, ActionHashB64 } from '../types/CartTypes';

// Service dependencies
let client: any = null;
let persistenceService: CartPersistenceService | null = null;
let calculationService: CartCalculationService | null = null;

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
export function setCartServices(holoClient: any, dataManager?: DataManager): void {
    client = holoClient;
    persistenceService = new CartPersistenceService(holoClient);
    calculationService = new CartCalculationService(dataManager);

    cartItems.set([]);
    cartTotal.set(0);
    cartPromoTotal.set(0);
    cartLoading.set(true);

    // Initialize asynchronously
    initialize();
}

// Set DataManager reference (called from Controller)
export function setDataManager(dataManager: DataManager): void {
    if (calculationService) {
        calculationService.setDataManager(dataManager);
        // Force immediate recalculation
        setTimeout(() => recalculateCartTotal(), 0);
    }
}

async function initialize(): Promise<void> {
    if (!persistenceService) return;
    
    try {
        cartReady.set(false);
        cartLoading.set(true);

        // First check localStorage
        const localItems = await persistenceService.loadFromLocalStorage();
        if (localItems.length > 0) {
            localCartItems = localItems;
            cartItems.set(localItems);
            await recalculateCartTotal();
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
    if (!persistenceService) return;
    
    cartLoading.set(true);

    try {
        const holochainItems = await persistenceService.loadFromPrivateEntry();

        if (holochainItems.length > 0) {
            if (localCartItems.length > 0) {
                console.log("Merging Holochain cart with local cart");
                localCartItems = persistenceService.mergeLocalAndHolochainCarts(
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
            persistenceService.saveToLocalStorage(localCartItems);

            // Recalculate cart total after loading items
            await recalculateCartTotal();
        } else if (localCartItems.length > 0) {
            // If we have local items but nothing in Holochain, sync to Holochain
            persistenceService.forceSyncToHolochain(localCartItems);
        }
    } catch (error) {
        console.error('Error loading cart from Holochain:', error);
    }

    cartLoading.set(false);
}

// Add product to cart (or update quantity)
export async function addToCart(groupHash: ActionHashB64, productIndex: number, quantity: number = 1, note?: string, product?: any) {
    if (!persistenceService) return { success: false, error: "Service not initialized", local: true };
    
    try {
        if (!groupHash) {
            console.error("Cannot add item to cart: missing groupHash");
            return { success: false, error: "Invalid product reference", local: true };
        }

        console.log(`Adding to cart: groupHash=${groupHash}, productIndex=${productIndex}, quantity=${quantity}, note=${note}`);

        // Handle different hash formats - standardize to base64
        let standardizedHash = groupHash;
        if (typeof groupHash === 'string' && groupHash.includes(',')) {
            console.log("Converting comma-separated hash to base64");
            const byteArray = new Uint8Array(groupHash.split(',').map(Number));
            standardizedHash = encodeHashToBase64(byteArray);
        }

        // Get current item quantity for price delta calculation
        const currentItem = localCartItems.find(item =>
            item.groupHash === standardizedHash && item.productIndex === productIndex
        );
        const oldQuantity = currentItem ? currentItem.quantity : 0;
        const quantityDelta = quantity - oldQuantity;

        // Update local cart
        updateLocalCart(standardizedHash, productIndex, quantity, note);

        // Calculate price delta instead of full recalculation
        await updateCartTotalDelta(standardizedHash, productIndex, quantityDelta, product);

        // Schedule sync to Holochain
        persistenceService.scheduleSyncToHolochain(localCartItems);

        return { success: true, local: true };
    } catch (error) {
        console.error('Error adding to cart:', error);
        return { success: false, error, local: true };
    }
}

// Update cart total with delta calculation
async function updateCartTotalDelta(groupHash: ActionHashB64, productIndex: number, quantityDelta: number, product?: any): Promise<void> {
    if (quantityDelta === 0 || !calculationService) return;

    try {
        const delta = await calculationService.calculateItemDelta(groupHash, productIndex, quantityDelta, product);

        cartTotal.update(current => {
            const newTotal = current + delta.regular;
            return newTotal < 0 ? 0 : newTotal;
        });

        cartPromoTotal.update(current => {
            const newTotal = current + delta.promo;
            return newTotal < 0 ? 0 : newTotal;
        });
    } catch (error) {
        console.error('Error updating cart total delta:', error);
        recalculateCartTotal();
    }
}

// Clear cart
export async function clearCart() {
    if (!persistenceService) return { success: false, error: "Service not initialized" };
    
    try {
        // Clear local cart immediately
        localCartItems = [];
        cartItems.set([]);
        cartTotal.set(0);
        cartPromoTotal.set(0);
        persistenceService.saveToLocalStorage([]);

        // Schedule sync to Holochain
        persistenceService.scheduleSyncToHolochain([]);

        return { success: true };
    } catch (error) {
        console.error('Error clearing cart:', error);
        return { success: false, error };
    }
}

function updateLocalCart(groupHash: ActionHashB64, productIndex: number, quantity: number, note?: string): void {
    if (!persistenceService) return;
    
    const currentTime = Date.now();
    const itemIndex = localCartItems.findIndex(item =>
        item.groupHash === groupHash && item.productIndex === productIndex
    );

    if (quantity === 0) {
        // Remove item if quantity is 0
        if (itemIndex >= 0) {
            localCartItems.splice(itemIndex, 1);
        }
    } else {
        // Update existing or add new
        if (itemIndex >= 0) {
            localCartItems[itemIndex].quantity = quantity;
            localCartItems[itemIndex].timestamp = currentTime;
            localCartItems[itemIndex].note = note;
        } else {
            localCartItems.push({
                groupHash,
                productIndex,
                quantity,
                timestamp: currentTime,
                note
            });
        }
    }

    // Update the store for UI
    cartItems.set([...localCartItems]);

    // Save to localStorage
    persistenceService.saveToLocalStorage(localCartItems);
}

// Recalculate cart total completely
async function recalculateCartTotal(): Promise<void> {
    if (!calculationService) return;
    
    try {
        const totals = await calculationService.calculateCartTotals(localCartItems);
        cartTotal.set(totals.regular);
        cartPromoTotal.set(totals.promo);
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

// Expose persistence service for other services
export function getPersistenceService(): CartPersistenceService | null {
    return persistenceService;
}

// Expose calculation service for product data access
export function getCalculationService(): CartCalculationService | null {
    return calculationService;
}

// Restore cart items from checked-out cart (used by CheckedOutCartsService)
export async function restoreCartItems(cart: any): Promise<void> {
    if (!persistenceService) return;
    
    console.log("Adding products back to cart:", cart.products.length);

    // Clear existing cart
    localCartItems = [];

    // Add each product
    for (const product of cart.products) {
        if (product && product.groupHash) {
            localCartItems.push({
                groupHash: product.groupHash,
                productIndex: product.productIndex,
                quantity: product.quantity,
                timestamp: Date.now(),
                note: product.note
            });
        }
    }

    // Update UI
    cartItems.set([...localCartItems]);

    // Save to localStorage
    persistenceService.saveToLocalStorage(localCartItems);

    // Recalculate total
    await recalculateCartTotal();
}

// Force sync to Holochain (used after zome calls)
export function forceSyncToHolochain(): void {
    if (persistenceService) {
        persistenceService.forceSyncToHolochain(localCartItems);
    }
}