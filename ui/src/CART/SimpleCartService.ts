import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, derived, get } from 'svelte/store';

// Type for delivery time
export interface DeliveryTimeSlot {
    date: number; // Unix timestamp
    time_slot: string; // e.g. "2pm-4pm"
}

// Type for checkout details
export interface CheckoutDetails {
    addressHash?: string;
    deliveryInstructions?: string;
    deliveryTime?: DeliveryTimeSlot;
}

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

export class SimpleCartService {
    // Stores
    private cartItems = writable<Array<{
        productHash: ActionHashB64,
        quantity: number,
        timestamp: number
    }>>([]);

    // New store for saved delivery details
    private savedDeliveryDetails = writable<CheckoutDetails>({});

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

    // Checkout the current cart with delivery details
    public async checkoutCart(details: CheckoutDetails) {
        try {
            if (this.client) {
                // Prepare the input for checkout with delivery details
                const payload: any = {
                    address_hash: null,
                    delivery_instructions: details.deliveryInstructions || null,
                    delivery_time: details.deliveryTime || null
                };

                // Convert address hash if provided
                if (details.addressHash) {
                    try {
                        payload.address_hash = decodeHashFromBase64(details.addressHash);
                    } catch (e) {
                        console.error('Invalid address hash format:', e);
                        return { success: false, error: 'Invalid address hash format' };
                    }
                }

                // Call Holochain checkout function
                console.log("Checking out cart with details:", payload);
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'checkout_cart',
                    payload
                });

                console.log("Checkout result:", result);

                // Clear local cart after successful checkout
                await this.loadCart();

                // Clear saved delivery details after successful checkout
                this.savedDeliveryDetails.set({});

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

    // Process checked out carts to add product details and delivery info
    private async processCheckedOutCarts(carts) {
        console.log("Processing checked out carts from Holochain:", carts);

        if (!this.productStore) {
            return carts;
        }

        // For each cart, enrich products with details
        return Promise.all(carts.map(async (cart) => {
            const cartHash = encodeHashToBase64(cart.cart_hash);
            const {
                id,
                products,
                total,
                created_at,
                status,
                address_hash,
                delivery_instructions,
                delivery_time
            } = cart.cart;

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

            // Add delivery info
            let addressHashString = null;
            if (address_hash) {
                addressHashString = encodeHashToBase64(address_hash);
            }

            // Format delivery time if available
            let formattedDeliveryTime = null;
            if (delivery_time) {
                const deliveryDate = new Date(delivery_time.date);
                formattedDeliveryTime = {
                    date: deliveryDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    }),
                    time: delivery_time.time_slot,
                    raw: delivery_time
                };
            }

            return {
                id,
                cartHash,
                products: productsWithDetails,
                total: calculatedTotal > 0 ? calculatedTotal : total,
                createdAt: formattedDate,
                status,
                productIds: productsWithDetails.map(p => p.id),
                addressHash: addressHashString,
                deliveryInstructions: delivery_instructions,
                deliveryTime: formattedDeliveryTime
            };
        }));
    }

    // Return a checked out cart to shopping
    public async returnToShopping(cartHash: ActionHashB64) {
        try {
            if (this.client) {
                // Get the cart details before returning to shopping
                const cartsResult = await this.loadCheckedOutCarts();

                if (cartsResult.success && Array.isArray(cartsResult.data)) {
                    const cart = cartsResult.data.find(c => c.cartHash === cartHash);

                    if (cart) {
                        // Save delivery details before returning to shopping
                        this.savedDeliveryDetails.set({
                            addressHash: cart.addressHash,
                            deliveryInstructions: cart.deliveryInstructions,
                            deliveryTime: cart.deliveryTime?.raw
                        });

                        console.log("Saved delivery details:", get(this.savedDeliveryDetails));
                    }
                }

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

    // Get current cart items
    public getCartItems() {
        return get(this.cartItems);
    }

    // Subscribe to cart changes
    public subscribe(callback: (items: any[]) => void) {
        return this.cartItems.subscribe(callback);
    }

    // Get saved delivery details
    public getSavedDeliveryDetails() {
        return get(this.savedDeliveryDetails);
    }

    // Subscribe to saved delivery details changes
    public subscribeSavedDeliveryDetails(callback: (details: CheckoutDetails) => void) {
        return this.savedDeliveryDetails.subscribe(callback);
    }

    // Set saved delivery details
    public setSavedDeliveryDetails(details: CheckoutDetails) {
        this.savedDeliveryDetails.set(details);
    }

    // Clear saved delivery details
    public clearSavedDeliveryDetails() {
        this.savedDeliveryDetails.set({});
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

    // Generate available delivery time slots
    public generateDeliveryTimeSlots(startDate = new Date()): {
        date: Date,
        dateFormatted: string,
        dayOfWeek: string,
        timeSlots: {
            id: string,
            display: string,
            timestamp: number,
            slot: string
        }[]
    }[] {
        const days = [];
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDate = new Date();
        const currentHour = currentDate.getHours();

        // Generate slots for the next 9 days
        for (let i = 0; i < 9; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);

            // Reset time
            date.setHours(0, 0, 0, 0);

            const dateFormatted = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            });

            const dayOfWeek = daysOfWeek[date.getDay()];

            // Time slots for this day
            const timeSlots = [];

            // Add time slots
            const slotTimes = [
                { start: '7am', end: '9am', hour: 7 },
                { start: '8am', end: '10am', hour: 8 },
                { start: '7am', end: '10am', hour: 7 },
                { start: '9am', end: '11am', hour: 9 },
                { start: '8am', end: '11am', hour: 8 },
                { start: '10am', end: 'Noon', hour: 10 },
                { start: '11am', end: '1pm', hour: 11 },
                { start: 'Noon', end: '2pm', hour: 12 },
                { start: '1pm', end: '3pm', hour: 13 },
                { start: '2pm', end: '4pm', hour: 14 },
                { start: '3pm', end: '5pm', hour: 15 },
                { start: '4pm', end: '6pm', hour: 16 },
                { start: '5pm', end: '7pm', hour: 17 },
                { start: '6pm', end: '8pm', hour: 18 }
            ];

            slotTimes.forEach((slot, index) => {
                // For today, skip time slots that have already passed
                const isToday = date.getDate() === currentDate.getDate() &&
                    date.getMonth() === currentDate.getMonth() &&
                    date.getFullYear() === currentDate.getFullYear();

                // Skip if it's today and the slot has passed (add 2 hours buffer)
                if (isToday && slot.hour <= currentHour + 1) {
                    return;
                }

                // Create a timestamp for the slot
                const slotDate = new Date(date);
                slotDate.setHours(slot.hour, 0, 0, 0);

                timeSlots.push({
                    id: `${i}-${index}`,
                    display: `${slot.start}–${slot.end}`,
                    timestamp: slotDate.getTime(),
                    slot: `${slot.start}–${slot.end}`
                });
            });

            // Only add days with available time slots
            if (timeSlots.length > 0) {
                days.push({
                    date,
                    dateFormatted,
                    dayOfWeek,
                    timeSlots
                });
            }
        }

        return days;
    }
}