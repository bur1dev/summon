import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, derived, get } from 'svelte/store';
import { decode } from "@msgpack/msgpack";

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
        groupHash: ActionHashB64,
        productIndex: number,
        quantity: number,
        timestamp: number,
        note?: string
    }>>([]);

    // Local cart management - NEW
    private localCartItems: Array<{
        groupHash: ActionHashB64,
        productIndex: number,
        quantity: number,
        timestamp: number,
        note?: string
    }> = [];
    private syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private syncInterval = 3000; // 3 seconds
    private isInitialized = false;

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

    // Loading state to track data loading operations
    public loading = writable(true);

    // Product store reference for price lookup
    private productStore: any = null;

    constructor(public client: any) {
        this.cartItems.set([]);
        this.cartTotal.set(0);
        this.loading.set(true);
        console.log("SimpleCartService initialized");

        // Add event listener for page unload to sync cart
        window.addEventListener('beforeunload', () => {
            this.forceSyncToHolochain();
        });

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
            console.log("SimpleCartService: Beginning initialization");
            this.ready.set(false);
            this.loading.set(true);

            // First check localStorage
            await this.loadFromLocalStorage();

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
            this.isInitialized = true;
            console.log("SimpleCartService: Initialization complete, setting ready=true");
            this.ready.set(true);
        } catch (error) {
            console.error("Cart service initialization failed:", error);
            this.loading.set(false);
            this.ready.set(true);
        }
    }

    // NEW: Load cart from localStorage
    private async loadFromLocalStorage() {
        try {
            const storedCart = localStorage.getItem('cart');
            if (storedCart) {
                const parsedCart = JSON.parse(storedCart);
                console.log("Loaded cart from localStorage:", parsedCart);

                if (Array.isArray(parsedCart)) {
                    this.localCartItems = parsedCart;
                    this.cartItems.set(parsedCart);

                    // Calculate cart total based on local items
                    await this.recalculateCartTotal();
                }
            }
        } catch (error) {
            console.error('Error loading cart from localStorage:', error);
        }
    }

    // NEW: Save cart to localStorage
    private saveToLocalStorage() {
        try {
            localStorage.setItem('cart', JSON.stringify(this.localCartItems));
        } catch (error) {
            console.error('Error saving cart to localStorage:', error);
        }
    }

    // NEW: Schedule sync to Holochain with debounce
    private scheduleSyncToHolochain() {
        if (this.syncTimeoutId) {
            clearTimeout(this.syncTimeoutId);
        }

        this.syncTimeoutId = setTimeout(() => {
            this.syncToHolochain();
        }, this.syncInterval);
    }

    // NEW: Force immediate sync to Holochain
    private forceSyncToHolochain() {
        if (this.syncTimeoutId) {
            clearTimeout(this.syncTimeoutId);
            this.syncTimeoutId = null;
        }

        // Only sync if there are items and we're initialized
        if (this.isInitialized && this.localCartItems.length > 0) {
            this.syncToHolochain();
        }
    }

    // NEW: Sync cart to Holochain
    private async syncToHolochain() {
        if (!this.client || !this.isInitialized) return;

        try {
            console.log("Syncing cart to Holochain:", this.localCartItems);

            await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'replace_private_cart',
                payload: {
                    items: this.localCartItems,
                    last_updated: Date.now()
                }
            });

            console.log("Cart successfully synced to Holochain");

            // Clear localStorage after successful sync to avoid stale data
            // We'll keep the memory version but not persist old data
            localStorage.removeItem('cart');
        } catch (error) {
            console.error('Error syncing cart to Holochain:', error);
        } finally {
            this.syncTimeoutId = null;
        }
    }

    // Load cart from Holochain private entry - MODIFIED
    private async loadFromPrivateEntry() {
        try {
            if (!this.client) {
                console.warn("No client available for loadFromPrivateEntry");
                return;
            }

            console.log("SimpleCartService: Loading cart from Holochain private entry");
            const result = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'get_private_cart',
                payload: null
            });

            if (result && result.items) {
                // Transform items to the expected format
                const cartItems = result.items.map(item => {
                    const hashBase64 = encodeHashToBase64(item.group_hash);

                    return {
                        groupHash: hashBase64,
                        productIndex: item.product_index,
                        quantity: item.quantity,
                        timestamp: item.timestamp,
                        note: item.note
                    };
                });

                // Filter out any invalid items
                const validItems = cartItems.filter(item =>
                    item && item.groupHash && item.productIndex !== undefined);

                console.log(`SimpleCartService: Loaded ${validItems.length} items from Holochain`);

                // Merge with local cart if needed
                if (this.localCartItems.length > 0) {
                    console.log("Merging Holochain cart with local cart");
                    this.mergeLocalAndHolochainCarts(validItems);
                } else {
                    // No local items, just use Holochain items
                    this.localCartItems = validItems;
                }

                // Update the svelte store
                this.cartItems.set([...this.localCartItems]);

                // Save to localStorage
                this.saveToLocalStorage();

                // Recalculate cart total after loading items
                await this.recalculateCartTotal();
            } else {
                console.log("No items in private cart or invalid result");

                // If we have local items but nothing in Holochain, sync to Holochain
                if (this.localCartItems.length > 0) {
                    this.forceSyncToHolochain();
                }
            }
        } catch (error) {
            console.error('Error loading cart from private entry:', error);
        }
    }

    // NEW: Merge local and Holochain carts
    private mergeLocalAndHolochainCarts(holochainItems: Array<{
        groupHash: ActionHashB64,
        productIndex: number,
        quantity: number,
        timestamp: number,
        note?: string
    }>) {
        // Create a map of Holochain items for quick lookup
        const holochainItemsMap = new Map();
        holochainItems.forEach(item => {
            const key = `${item.groupHash}_${item.productIndex}`;
            holochainItemsMap.set(key, item);
        });

        // Create a map of local items
        const localItemsMap = new Map();
        this.localCartItems.forEach(item => {
            const key = `${item.groupHash}_${item.productIndex}`;
            localItemsMap.set(key, item);
        });

        // Merge strategy: Use the item with the most recent timestamp
        const mergedItems: Array<{
            groupHash: ActionHashB64,
            productIndex: number,
            quantity: number,
            timestamp: number,
            note?: string
        }> = [];

        // Add all local items, updating with Holochain items if needed
        for (const [key, localItem] of localItemsMap.entries()) {
            const holochainItem = holochainItemsMap.get(key);

            if (holochainItem && holochainItem.timestamp > localItem.timestamp) {
                // Holochain item is newer
                mergedItems.push(holochainItem);
            } else {
                // Local item is newer or no Holochain item
                mergedItems.push(localItem);
            }

            // Remove from Holochain map to track what's been processed
            holochainItemsMap.delete(key);
        }

        // Add remaining Holochain items that aren't in local
        for (const [key, holochainItem] of holochainItemsMap.entries()) {
            mergedItems.push(holochainItem);
        }

        // Filter out zero quantity items
        const filteredItems = mergedItems.filter(item => item.quantity > 0);

        // Update local cart
        this.localCartItems = filteredItems;
    }

    // Load cart from Holochain
    public async loadCart() {
        this.loading.set(true);
        await this.loadFromPrivateEntry();
        this.loading.set(false);
    }

    // Add product to cart (or update quantity) - MODIFIED for notes
    public async addToCart(groupHash: ActionHashB64, productIndex: number, quantity: number = 1, note?: string) {
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

            // Update local cart
            this.updateLocalCart(standardizedHash, productIndex, quantity, note);

            // Schedule sync to Holochain
            this.scheduleSyncToHolochain();

            return { success: true, local: true };
        } catch (error) {
            console.error('Error adding to cart:', error);
            return { success: false, error, local: true };
        }
    }

    // NEW: Update local cart
    private updateLocalCart(groupHash: ActionHashB64, productIndex: number, quantity: number, note?: string) {
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
        this.saveToLocalStorage();

        // Update cart total
        this.recalculateCartTotal();
    }

    // Force sync before checkout
    public async syncBeforeCheckout() {
        return this.forceSyncToHolochain();
    }

    // Checkout the current cart with delivery details
    public async checkoutCart(details: CheckoutDetails) {
        try {
            if (this.client) {
                // Skip force sync to avoid race condition
                // Cancel any pending sync
                if (this.syncTimeoutId) {
                    clearTimeout(this.syncTimeoutId);
                    this.syncTimeoutId = null;
                }

                // Use local cart items directly
                let cartProducts = this.localCartItems.map(item => {
                    let groupHash;
                    try {
                        groupHash = decodeHashFromBase64(item.groupHash);
                    } catch (e) {
                        console.error(`Invalid group hash format: ${item.groupHash}`, e);
                        return null;
                    }

                    return groupHash ? {
                        group_hash: groupHash,
                        product_index: item.productIndex,
                        quantity: item.quantity,
                        timestamp: item.timestamp,
                        note: item.note
                    } : null;
                }).filter(item => item !== null);

                if (cartProducts.length === 0) {
                    return { success: false, message: "Cart is empty" };
                }

                // Prepare the input for checkout
                const payload: any = {
                    address_hash: null,
                    delivery_instructions: details.deliveryInstructions || null,
                    delivery_time: details.deliveryTime || null,
                    cart_products: cartProducts
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
                const checkoutResult = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'checkout_cart',
                    payload
                });

                console.log("Checkout result:", checkoutResult);

                // Clear local cart on successful checkout
                this.localCartItems = [];
                this.cartItems.set([]);
                this.cartTotal.set(0);
                this.saveToLocalStorage();

                // Clear saved delivery details
                this.savedDeliveryDetails.set({});

                return { success: true, data: checkoutResult };
            } else {
                console.warn("No Holochain client available for checkout");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            console.error('Error checking out cart:', error);
            return { success: false, message: error.toString() };
        }
    }

    // Recalculate cart total from items and product prices - MODIFIED to use local cart
    private async recalculateCartTotal() {
        console.log("Recalculating cart total");
        if (!this.productStore) {
            console.log("Cannot calculate cart total - product store not set");
            return;
        }

        if (this.localCartItems.length === 0) {
            console.log("Cart is empty, setting total to 0");
            this.cartTotal.set(0);
            return;
        }

        let total = 0;
        for (const item of this.localCartItems) {
            try {
                // Skip invalid items
                if (!item || !item.groupHash) {
                    console.warn("Skipping invalid cart item", item);
                    continue;
                }

                // Check if the groupHash needs to be converted from comma-separated to base64
                let groupHashBase64 = item.groupHash;
                if (typeof item.groupHash === 'string' && item.groupHash.includes(',')) {
                    // It's a comma-separated string, convert to proper base64
                    const byteArray = new Uint8Array(item.groupHash.split(',').map(Number));
                    groupHashBase64 = encodeHashToBase64(byteArray);
                }

                // Get the product group using the proper method
                const groupHash = decodeHashFromBase64(groupHashBase64);
                const result = await this.productStore.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'products',
                    fn_name: 'get_product_group',
                    payload: groupHash
                });

                if (result) {
                    const group = decode(result.entry.Present.entry);

                    // Extract the specific product from the group by index
                    if (group && group.products && group.products[item.productIndex]) {
                        const product = group.products[item.productIndex];
                        if (product && product.price) {
                            total += product.price * item.quantity;
                            console.log(`Added ${product.price * item.quantity} for ${product.name} (${item.quantity}x)`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error calculating cart total:', error);
            }
        }

        console.log(`Setting cart total to ${total}`);
        this.cartTotal.set(total);
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
                if (!product || !product.group_hash) {
                    return {
                        groupHash: "",
                        productIndex: 0,
                        quantity: 0,
                        details: null,
                        note: null
                    };
                }

                const groupHash = encodeHashToBase64(product.group_hash);
                let details = null;

                try {
                    // Use zome call instead of store method to get proper group format
                    const groupHashDecoded = decodeHashFromBase64(groupHash);
                    const result = await this.client.callZome({
                        role_name: 'grocery',
                        zome_name: 'products',
                        fn_name: 'get_product_group',
                        payload: groupHashDecoded
                    });

                    if (result) {
                        const group = decode(result.entry.Present.entry);

                        if (group && group.products && group.products[product.product_index]) {
                            details = group.products[product.product_index];
                        }
                    }
                } catch (error) {
                    console.error(`Failed to get product details for group ${groupHash} index ${product.product_index}:`, error);
                }

                return {
                    groupHash: groupHash,
                    productIndex: product.product_index,
                    quantity: product.quantity,
                    details,
                    note: product.note
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
                addressHash: addressHashString,
                deliveryInstructions: delivery_instructions,
                deliveryTime: formattedDeliveryTime
            };
        }));
    }

    // Return to shopping - FIXED RACE CONDITION
    public async returnToShopping(cartHash: ActionHashB64) {
        try {
            if (this.client) {
                console.log("START: returnToShopping for hash:", cartHash);
                // Get the cart details before returning to shopping
                const cartsResult = await this.loadCheckedOutCarts();
                console.log("Cart lookup result:", cartsResult);

                if (cartsResult.success && Array.isArray(cartsResult.data)) {
                    const cart = cartsResult.data.find(c => c.cartHash === cartHash);
                    console.log("Found cart to return:", cart);

                    if (cart) {
                        // Save delivery details before returning to shopping
                        this.savedDeliveryDetails.set({
                            addressHash: cart.addressHash,
                            deliveryInstructions: cart.deliveryInstructions,
                            deliveryTime: cart.deliveryTime?.raw
                        });

                        console.log("Saved delivery details:", get(this.savedDeliveryDetails));

                        // Add products back to local cart first
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
                        this.saveToLocalStorage();

                        // Recalculate total
                        await this.recalculateCartTotal();

                        // IMPORTANT: First call the zome function BEFORE syncing to avoid source chain errors
                        console.log("CALLING zome: return_to_shopping with hash:", cartHash);
                        try {
                            const result = await this.client.callZome({
                                role_name: 'grocery',
                                zome_name: 'cart',
                                fn_name: 'return_to_shopping',
                                payload: decodeHashFromBase64(cartHash)
                            });
                            console.log("SUCCESS: Zome call result:", result);

                            // Only force sync to Holochain AFTER zome call completes successfully
                            await this.forceSyncToHolochain();
                        } catch (e) {
                            console.error("ERROR: Zome call failed:", e);
                            throw e;
                        }
                    }
                }

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
        // Return local cart items
        return this.localCartItems;
    }

    // Subscribe to cart changes
    public subscribe(callback: (items: any[]) => void) {
        // Initial callback with current state
        callback(this.localCartItems);
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