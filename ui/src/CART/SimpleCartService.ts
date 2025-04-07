import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, derived, get } from 'svelte/store';

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

export class SimpleCartService {
    // Stores
    private cartItems = writable<Array<{
        productHash: ActionHashB64,
        quantity: number,
        timestamp: number
    }>>([]);

    // Derived stores for UI
    public readonly itemCount = derived(this.cartItems, items =>
        items.reduce((sum, item) => sum + item.quantity, 0)
    );

    public readonly hasItems = derived(this.cartItems, items => items.length > 0);

    // Cart total store - initialized to 0
    public cartTotal = writable(0);

    // Ready state to track initialization
    public ready = writable(false);

    // Product store reference for price lookup
    private productStore: any = null;

    constructor(private client: any) {
        this.cartItems.set([]);
        console.log("SimpleCartService initialized");

        // Initialize asynchronously
        this.initialize();
    }

    // Set product store reference (called from Controller)
    public setProductStore(productStore: any) {
        console.log("Setting product store in SimpleCartService");
        this.productStore = productStore;

        // Force immediate recalculation
        setTimeout(() => this.recalculateCartTotal(), 0);
    }

    private async initialize() {
        try {
            await this.loadCart();
            // Signal service is ready
            this.ready.set(true);
            console.log("Cart service ready");
        } catch (error) {
            console.error("Cart service initialization failed:", error);
            // Still set ready to allow UI to work in degraded mode
            this.ready.set(true);
        }
    }

    // Recalculate cart total from items and product prices
    private async recalculateCartTotal() {
        console.log("Recalculating cart total");
        if (!this.productStore) {
            console.log("Cannot calculate cart total - product store not set");
            return;
        }

        const items = get(this.cartItems);
        console.log(`Calculating total for ${items.length} items`);

        let total = 0;
        for (const item of items) {
            try {
                const product = await this.productStore.getProductByHash(
                    decodeHashFromBase64(item.productHash)
                );
                if (product && product.price) {
                    total += product.price * item.quantity;
                    console.log(`Added ${product.price * item.quantity} for ${product.name} (${item.quantity}x)`);
                }
            } catch (error) {
                console.error('Error calculating cart total:', error);
            }
        }

        console.log(`Setting cart total to ${total}`);
        this.cartTotal.set(total);
    }

    // Load cart from Holochain or initialize empty
    public async loadCart() {
        try {
            if (this.client) {
                // Try to load from Holochain
                console.log("Fetching cart from Holochain");
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'get_cart',
                    payload: null
                });

                // Convert to our internal format
                if (Array.isArray(result)) {
                    const items = result.map(item => ({
                        productHash: encodeHashToBase64(item.product_hash),
                        quantity: item.quantity,
                        timestamp: item.timestamp
                    }));
                    this.cartItems.set(items);
                    console.log("Loaded cart with", items.length, "items");

                    // Recalculate total if product store is available
                    if (this.productStore) {
                        this.recalculateCartTotal();
                    }
                    return;
                }
            }

            // If we reach here, either client is null or result wasn't as expected
            console.log("Using in-memory cart implementation");
            this.cartItems.set([]);

        } catch (error) {
            console.error('Error loading cart:', error);
            // Fall back to empty cart
            this.cartItems.set([]);
        }
    }

    // Add product to cart (or update quantity)
    public async addToCart(productHash: ActionHashB64, quantity: number = 1) {
        try {
            if (this.client) {
                // For Holochain, we need to convert the base64 hash to ActionHash
                let actionHash;
                try {
                    actionHash = decodeHashFromBase64(productHash);
                } catch (e) {
                    console.error('Invalid product hash format:', e);
                    return { success: false, error: 'Invalid hash format' };
                }

                // Call Holochain
                await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'add_to_cart',
                    payload: {
                        product_hash: actionHash,
                        quantity
                    }
                });

                // Update local state to reflect changes
                await this.loadCart();
                return { success: true };
            } else {
                // Use in-memory implementation
                this.updateCartItemLocally(productHash, quantity);
                return { success: true, local: true };
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            // Update local state anyway to maintain UI consistency
            this.updateCartItemLocally(productHash, quantity);
            return { success: false, error, local: true };
        }
    }

    // Get current cart items
    public getCartItems() {
        return get(this.cartItems);
    }

    // Subscribe to cart changes
    public subscribe(callback: (items: any[]) => void) {
        return this.cartItems.subscribe(callback);
    }

    // Update cart item in memory
    private updateCartItemLocally(productHash: ActionHashB64, quantity: number) {
        const currentItems = this.getCartItems();

        // Remove item if quantity is 0
        if (quantity === 0) {
            const updatedItems = currentItems.filter(item => item.productHash !== productHash);
            this.cartItems.set(updatedItems);
        } else {
            // Update or add item
            const existingIndex = currentItems.findIndex(item => item.productHash === productHash);

            if (existingIndex >= 0) {
                const updatedItems = [...currentItems];
                updatedItems[existingIndex] = {
                    ...updatedItems[existingIndex],
                    quantity,
                    timestamp: Date.now()
                };
                this.cartItems.set(updatedItems);
            } else {
                this.cartItems.set([
                    ...currentItems,
                    {
                        productHash,
                        quantity,
                        timestamp: Date.now()
                    }
                ]);
            }
        }

        // Recalculate cart total if product store is available
        if (this.productStore) {
            this.recalculateCartTotal();
        }
    }
}