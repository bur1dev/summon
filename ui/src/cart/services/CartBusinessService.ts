import { encodeHashToBase64 } from '@holochain/client';
import { writable, derived } from 'svelte/store';
import type { DataManager } from "../../services/DataManager";
import { CartPersistenceService } from "./CartPersistenceService";
import { CartCalculationService } from "./CartCalculationService";
import type { CartItem, ActionHashB64 } from '../types/CartTypes';

export class CartBusinessService {
    // Services
    private persistenceService: CartPersistenceService;
    private calculationService: CartCalculationService;

    // Stores
    private cartItems = writable<CartItem[]>([]);

    // Local cart management
    private localCartItems: CartItem[] = [];

    // Derived stores for UI
    public readonly itemCount = derived(this.cartItems, items =>
        items.reduce((sum, item) => sum + item.quantity, 0)
    );

    public readonly uniqueItemCount = derived(this.cartItems, items => items.length);

    public readonly hasItems = derived(this.cartItems, items => items.length > 0);

    // Cart total stores - regular and promo
    public cartTotal = writable(0);
    public cartPromoTotal = writable(0);

    // Ready state to track initialization
    public ready = writable(false);

    // Loading state to track data loading operations
    public loading = writable(true);

    constructor(public client: any, dataManager?: DataManager) {
        this.persistenceService = new CartPersistenceService(client);
        this.calculationService = new CartCalculationService(dataManager);

        this.cartItems.set([]);
        this.cartTotal.set(0);
        this.cartPromoTotal.set(0);
        this.loading.set(true);

        // Initialize asynchronously
        this.initialize();
    }

    // Set DataManager reference (called from Controller)
    public setDataManager(dataManager: DataManager): void {
        this.calculationService.setDataManager(dataManager);

        // Force immediate recalculation
        setTimeout(() => this.recalculateCartTotal(), 0);
    }

    private async initialize(): Promise<void> {
        try {
            this.ready.set(false);
            this.loading.set(true);

            // First check localStorage
            const localItems = await this.persistenceService.loadFromLocalStorage();
            if (localItems.length > 0) {
                this.localCartItems = localItems;
                this.cartItems.set(localItems);
                await this.recalculateCartTotal();
            }

            if (this.client) {
                // Wait a bit to ensure Holochain connection is ready
                await new Promise(resolve => setTimeout(resolve, 500));

                // Load cart from Holochain (will merge with local if needed)
                await this.loadCart();
            } else {
                console.warn("No Holochain client available for cart initialization");
            }

            // Signal service is ready
            this.loading.set(false);
            this.ready.set(true);
        } catch (error) {
            console.error("Cart service initialization failed:", error);
            this.loading.set(false);
            this.ready.set(true);
        }
    }

    // Load cart from Holochain
    public async loadCart(): Promise<void> {
        this.loading.set(true);

        try {
            const holochainItems = await this.persistenceService.loadFromPrivateEntry();

            if (holochainItems.length > 0) {
                if (this.localCartItems.length > 0) {
                    console.log("Merging Holochain cart with local cart");
                    this.localCartItems = this.persistenceService.mergeLocalAndHolochainCarts(
                        this.localCartItems,
                        holochainItems
                    );
                } else {
                    // No local items, just use Holochain items
                    this.localCartItems = holochainItems;
                }

                // Update the svelte store
                this.cartItems.set([...this.localCartItems]);

                // Save to localStorage
                this.persistenceService.saveToLocalStorage(this.localCartItems);

                // Recalculate cart total after loading items
                await this.recalculateCartTotal();
            } else if (this.localCartItems.length > 0) {
                // If we have local items but nothing in Holochain, sync to Holochain
                this.persistenceService.forceSyncToHolochain(this.localCartItems);
            }
        } catch (error) {
            console.error('Error loading cart from Holochain:', error);
        }

        this.loading.set(false);
    }

    // Add product to cart (or update quantity)
    public async addToCart(groupHash: ActionHashB64, productIndex: number, quantity: number = 1, note?: string, product?: any) {
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
            const currentItem = this.localCartItems.find(item =>
                item.groupHash === standardizedHash && item.productIndex === productIndex
            );
            const oldQuantity = currentItem ? currentItem.quantity : 0;
            const quantityDelta = quantity - oldQuantity;

            // Update local cart
            this.updateLocalCart(standardizedHash, productIndex, quantity, note);

            // Calculate price delta instead of full recalculation
            await this.updateCartTotalDelta(standardizedHash, productIndex, quantityDelta, product);

            // Schedule sync to Holochain
            this.persistenceService.scheduleSyncToHolochain(this.localCartItems);

            return { success: true, local: true };
        } catch (error) {
            console.error('Error adding to cart:', error);
            return { success: false, error, local: true };
        }
    }

    // Update cart total with delta calculation
    private async updateCartTotalDelta(groupHash: ActionHashB64, productIndex: number, quantityDelta: number, product?: any): Promise<void> {
        if (quantityDelta === 0) return;

        try {
            const delta = await this.calculationService.calculateItemDelta(groupHash, productIndex, quantityDelta, product);

            this.cartTotal.update(current => {
                const newTotal = current + delta.regular;
                return newTotal < 0 ? 0 : newTotal;
            });

            this.cartPromoTotal.update(current => {
                const newTotal = current + delta.promo;
                return newTotal < 0 ? 0 : newTotal;
            });
        } catch (error) {
            console.error('Error updating cart total delta:', error);
            this.recalculateCartTotal();
        }
    }

    // Clear cart
    public async clearCart() {
        try {
            // Clear local cart immediately
            this.localCartItems = [];
            this.cartItems.set([]);
            this.cartTotal.set(0);
            this.cartPromoTotal.set(0);
            this.persistenceService.saveToLocalStorage([]);

            // Schedule sync to Holochain
            this.persistenceService.scheduleSyncToHolochain([]);

            return { success: true };
        } catch (error) {
            console.error('Error clearing cart:', error);
            return { success: false, error };
        }
    }

    private updateLocalCart(groupHash: ActionHashB64, productIndex: number, quantity: number, note?: string): void {
        const currentTime = Date.now();
        const itemIndex = this.localCartItems.findIndex(item =>
            item.groupHash === groupHash && item.productIndex === productIndex
        );

        if (quantity === 0) {
            // Remove item if quantity is 0
            if (itemIndex >= 0) {
                this.localCartItems.splice(itemIndex, 1);
            }
        } else {
            // Update existing or add new
            if (itemIndex >= 0) {
                this.localCartItems[itemIndex].quantity = quantity;
                this.localCartItems[itemIndex].timestamp = currentTime;
                this.localCartItems[itemIndex].note = note;
            } else {
                this.localCartItems.push({
                    groupHash,
                    productIndex,
                    quantity,
                    timestamp: currentTime,
                    note
                });
            }
        }

        // Update the store for UI
        this.cartItems.set([...this.localCartItems]);

        // Save to localStorage
        this.persistenceService.saveToLocalStorage(this.localCartItems);
    }

    // Recalculate cart total completely
    private async recalculateCartTotal(): Promise<void> {
        try {
            const totals = await this.calculationService.calculateCartTotals(this.localCartItems);
            this.cartTotal.set(totals.regular);
            this.cartPromoTotal.set(totals.promo);
        } catch (error) {
            console.error('Error recalculating cart total:', error);
        }
    }


    // Get current cart items
    public getCartItems(): CartItem[] {
        return this.localCartItems;
    }

    // Subscribe to cart changes
    public subscribe(callback: (items: CartItem[]) => void) {
        callback(this.localCartItems);
        return this.cartItems.subscribe(callback);
    }

    // Helper methods for other services
    
    // Expose persistence service for other services
    public getPersistenceService(): CartPersistenceService {
        return this.persistenceService;
    }

    // Expose calculation service for product data access
    public getCalculationService(): CartCalculationService {
        return this.calculationService;
    }


    // Restore cart items from checked-out cart (used by CheckedOutCartsService)
    public async restoreCartItems(cart: any): Promise<void> {
        console.log("Adding products back to cart:", cart.products.length);

        // Clear existing cart
        this.localCartItems = [];

        // Add each product
        for (const product of cart.products) {
            if (product && product.groupHash) {
                this.localCartItems.push({
                    groupHash: product.groupHash,
                    productIndex: product.productIndex,
                    quantity: product.quantity,
                    timestamp: Date.now(),
                    note: product.note
                });
            }
        }

        // Update UI
        this.cartItems.set([...this.localCartItems]);

        // Save to localStorage
        this.persistenceService.saveToLocalStorage(this.localCartItems);

        // Recalculate total
        await this.recalculateCartTotal();
    }

    // Force sync to Holochain (used after zome calls)
    public forceSyncToHolochain(): void {
        this.persistenceService.forceSyncToHolochain(this.localCartItems);
    }

}