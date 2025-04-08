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

    // Checkout the current cart
    public async checkoutCart() {
        try {
            if (this.client) {
                // Call Holochain checkout function
                console.log("Checking out cart...");
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'checkout_cart',
                    payload: null
                });

                console.log("Checkout result:", result);

                // Clear local cart after successful checkout
                await this.loadCart();

                return { success: true, data: result };
            } else {
                console.warn("No Holochain client available for checkout");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            console.error('Error checking out cart:', error);
            return { success: false, message: error.toString() };
        }
    }

    // Load checked out carts
    public async loadCheckedOutCarts() {
        try {
            if (this.client) {
                console.log("Loading checked out carts...");
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'get_checked_out_carts',
                    payload: null
                });

                console.log("Loaded checked out carts:", result);
                console.log("Checked out carts with status details:",
                    result.data ? result.data.map(cart => ({
                        id: cart.id,
                        cartHash: cart.cartHash,
                        status: cart.status,
                        productCount: cart.products.length
                    })) : []);

                // Process the results to make them easier to use in the UI
                const processedCarts = await this.processCheckedOutCarts(result);

                return { success: true, data: processedCarts };
            } else {
                console.warn("No Holochain client available for loading checked out carts");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            console.error('Error loading checked out carts:', error);
            return { success: false, message: error.toString() };
        }
    }

    // Process checked out carts to add product details
    private async processCheckedOutCarts(carts) {
        console.log("Raw checked out carts from Holochain:", carts);

        if (!this.productStore) {
            return carts;
        }

        // For each cart, enrich products with details
        return Promise.all(carts.map(async (cart) => {
            const cartHash = encodeHashToBase64(cart.cart_hash);
            const { id, products, total, created_at, status } = cart.cart;

            // Get product details for each product
            const productsWithDetails = await Promise.all(products.map(async (product) => {
                const productHash = encodeHashToBase64(product.product_hash);
                let details = null;

                try {
                    details = await this.productStore.getProductByHash(
                        decodeHashFromBase64(productHash)
                    );
                } catch (error) {
                    console.error(`Failed to get product details for ${productHash}:`, error);
                }

                return {
                    id: productHash,
                    quantity: product.quantity,
                    details
                };
            }));

            // Calculate actual total based on current prices
            let calculatedTotal = 0;
            for (const product of productsWithDetails) {
                if (product.details && product.details.price) {
                    calculatedTotal += product.details.price * product.quantity;
                }
            }

            // Format creation date
            const creationDate = new Date(created_at / 1000);
            const formattedDate = creationDate.toLocaleString();

            return {
                id,
                cartHash,
                products: productsWithDetails,
                total: calculatedTotal > 0 ? calculatedTotal : total,
                createdAt: formattedDate,
                status,
                productIds: productsWithDetails.map(p => p.id),
                // Include raw state for CheckedOutCarts.svelte compatibility
                state: {
                    products: productsWithDetails.map(p => ({
                        id: p.id,
                        props: {
                            text: this.formatProductText(p.details, p.quantity),
                            color: "white"
                        }
                    }))
                }
            };
        }));
    }

    // Helper to format product text for compatibility with old code
    private formatProductText(product, quantity) {
        if (!product) {
            return "Unknown Product";
        }

        return `NAME:${product.name}\nSIZE:${product.size || 'Standard'}\nPRICE:${product.price || 0}\nQUANTITY:${quantity}\nIMAGE:${product.image_url || ''}`;
    }

    // Return a checked out cart to shopping
    public async returnToShopping(cartHash: ActionHashB64) {
        try {
            if (this.client) {
                console.log("Returning cart to shopping:", cartHash);
                await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'return_to_shopping',
                    payload: decodeHashFromBase64(cartHash)
                });

                // Update local cart state
                await this.loadCart();

                return { success: true };
            } else {
                console.warn("No Holochain client available for returning to shopping");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            console.error('Error returning cart to shopping:', error);
            return { success: false, message: error.toString() };
        }
    }

    // Calculate total for a specific group of stickies (for compatibility)
    public calculateGroupTotal(stickyIds, stickies) {
        let total = 0;
        for (const id of stickyIds) {
            const sticky = stickies.find(s => s.id === id);
            if (sticky && sticky.props && sticky.props.text) {
                // Extract price and quantity from sticky text
                const priceMatch = sticky.props.text.match(/PRICE:(\d+(\.\d+)?)/);
                const quantityMatch = sticky.props.text.match(/QUANTITY:(\d+)/);

                if (priceMatch && quantityMatch) {
                    const price = parseFloat(priceMatch[1]);
                    const quantity = parseInt(quantityMatch[1]);
                    total += price * quantity;
                }
            }
        }
        return total;
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