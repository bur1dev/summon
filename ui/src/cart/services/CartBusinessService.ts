import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import type { ProductDataService } from "../../products/services/ProductDataService";
import { CartPersistenceService } from "./CartPersistenceService";
import { CartCalculationService } from "./CartCalculationService";

// Type for delivery time
export interface DeliveryTimeSlot {
    date: number; // Unix timestamp
    time_slot: string; // e.g. "2pm-4pm"
}

// Type for checkout details
export interface CheckoutDetails {
    addressHash?: string;
    deliveryInstructions?: string | null;
    deliveryTime?: DeliveryTimeSlot;
}

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

interface CartItem {
    groupHash: ActionHashB64;
    productIndex: number;
    quantity: number;
    timestamp: number;
    note?: string;
}

// Define the ProductGroup interface for decoded data
interface DecodedProductGroup {
    products: any[];
    category: string;
    subcategory?: string;
    product_type?: string;
    additional_categorizations?: any[];
}

interface TimeSlot {
    id: string;
    display: string;
    timestamp: number;
    slot: string;
}

export class CartBusinessService {
    // Services
    private persistenceService: CartPersistenceService;
    private calculationService: CartCalculationService;

    // Stores
    private cartItems = writable<CartItem[]>([]);

    // Local cart management
    private localCartItems: CartItem[] = [];
    private isInitialized = false;

    // Store for saved delivery details
    private savedDeliveryDetails = writable<CheckoutDetails>({});

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

    constructor(public client: any, productDataService?: ProductDataService) {
        this.persistenceService = new CartPersistenceService(client);
        this.calculationService = new CartCalculationService(productDataService);

        this.cartItems.set([]);
        this.cartTotal.set(0);
        this.cartPromoTotal.set(0);
        this.loading.set(true);

        // Initialize asynchronously
        this.initialize();
    }

    // Set ProductDataService reference (called from Controller)
    public setProductDataService(productDataService: ProductDataService): void {
        this.calculationService.setProductDataService(productDataService);

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
            this.isInitialized = true;
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

            // Get current item quantity for price delta calculation
            const currentItem = this.localCartItems.find(item =>
                item.groupHash === standardizedHash && item.productIndex === productIndex
            );
            const oldQuantity = currentItem ? currentItem.quantity : 0;
            const quantityDelta = quantity - oldQuantity;

            // Update local cart
            this.updateLocalCart(standardizedHash, productIndex, quantity, note);

            // Calculate price delta instead of full recalculation
            await this.updateCartTotalDelta(standardizedHash, productIndex, quantityDelta);

            // Schedule sync to Holochain
            this.persistenceService.scheduleSyncToHolochain(this.localCartItems);

            return { success: true, local: true };
        } catch (error) {
            console.error('Error adding to cart:', error);
            return { success: false, error, local: true };
        }
    }

    // Update cart total with delta calculation
    private async updateCartTotalDelta(groupHash: ActionHashB64, productIndex: number, quantityDelta: number): Promise<void> {
        if (quantityDelta === 0) return;

        try {
            const delta = await this.calculationService.calculateItemDelta(groupHash, productIndex, quantityDelta);

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

    // Checkout the current cart with delivery details
    public async checkoutCart(details: CheckoutDetails) {
        try {
            if (this.client) {
                // Cancel any pending sync
                this.persistenceService.forceSyncToHolochain([]);

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
                this.cartPromoTotal.set(0);
                this.persistenceService.saveToLocalStorage([]);

                // Clear saved delivery details
                this.savedDeliveryDetails.set({});

                return { success: true, data: checkoutResult };
            } else {
                console.warn("No Holochain client available for checkout");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error checking out cart:', error);
            return { success: false, message: errorMessage };
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

    // Generate available delivery time slots
    public generateDeliveryTimeSlots(startDate = new Date()): {
        date: Date,
        dateFormatted: string,
        dayOfWeek: string,
        timeSlots: TimeSlot[]
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
            const timeSlots: TimeSlot[] = [];

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

    // Delivery details management
    public getSavedDeliveryDetails(): CheckoutDetails {
        return get(this.savedDeliveryDetails);
    }

    public subscribeSavedDeliveryDetails(callback: (details: CheckoutDetails) => void) {
        return this.savedDeliveryDetails.subscribe(callback);
    }

    public setSavedDeliveryDetails(details: CheckoutDetails): void {
        this.savedDeliveryDetails.set(details);
    }

    public clearSavedDeliveryDetails(): void {
        this.savedDeliveryDetails.set({});
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error loading checked out carts:', error);
            return { success: false, message: errorMessage };
        }
    }

    // Process checked out carts to add product details and delivery info
    private async processCheckedOutCarts(carts: any[]) {
        console.log("Processing checked out carts from Holochain:", carts);

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
            const productsWithDetails = await Promise.all(products.map(async (product: any) => {
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
                    // Use ProductDataService if available
                    if (this.calculationService && this.calculationService['productDataService']) {
                        details = await this.calculationService['productDataService'].getProductByReference(groupHash, product.product_index);
                    } else {
                        // Fallback to direct zome call
                        const groupHashDecoded = decodeHashFromBase64(groupHash);
                        const result = await this.client.callZome({
                            role_name: 'grocery',
                            zome_name: 'products',
                            fn_name: 'get_product_group',
                            payload: groupHashDecoded
                        });

                        if (result) {
                            const { decode } = await import("@msgpack/msgpack");
                            const group = decode(result.entry.Present.entry) as DecodedProductGroup;

                            if (group && group.products && group.products[product.product_index]) {
                                details = group.products[product.product_index];
                            }
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

    // Return to shopping
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
                            addressHash: cart.addressHash ?? undefined,
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
                        this.persistenceService.saveToLocalStorage(this.localCartItems);

                        // Recalculate total
                        await this.recalculateCartTotal();

                        // First call the zome function BEFORE syncing to avoid source chain errors
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
                            this.persistenceService.forceSyncToHolochain(this.localCartItems);
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error returning cart to shopping:', error);
            return { success: false, message: errorMessage };
        }
    }

    // Product preference management
    public async getProductPreference(groupHashB64: ActionHashB64, productIndex: number) {
        try {
            if (!this.client) {
                console.warn("No client available for getProductPreference");
                return { success: false, message: "No Holochain client available" };
            }

            // Decode hash
            const groupHash = decodeHashFromBase64(groupHashB64);

            // Call the zome function
            const result = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'get_product_preference_by_product',
                payload: {
                    group_hash: groupHash,
                    product_index: productIndex
                }
            });

            if (result) {
                // Result contains [hash, preference]
                const [prefHash, preference] = result;
                return {
                    success: true,
                    data: {
                        hash: encodeHashToBase64(prefHash),
                        preference: preference
                    }
                };
            }

            return { success: false, message: "No preference found" };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error getting product preference:', error);
            return { success: false, message: errorMessage };
        }
    }

    // Save product preference
    public async saveProductPreference(preference: {
        groupHash: string,
        productIndex: number,
        note: string,
        is_default: boolean
    }) {
        try {
            if (!this.client) return { success: false, message: "No client available" };

            // Convert to Holochain format
            const holochainPreference = {
                group_hash: decodeHashFromBase64(preference.groupHash),
                product_index: preference.productIndex,
                note: preference.note,
                timestamp: Date.now(),
                is_default: preference.is_default
            };

            // Call the zome function
            const hash = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'save_product_preference',
                payload: holochainPreference
            });

            return { success: true, data: { hash: encodeHashToBase64(hash), preference: holochainPreference } };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error saving preference:', error);
            return { success: false, message: errorMessage };
        }
    }

    // Delete product preference
    public async deleteProductPreference(prefHashB64: ActionHashB64) {
        try {
            if (!this.client) {
                console.warn("No client available for deleteProductPreference");
                return { success: false, message: "No Holochain client available" };
            }

            // Decode hash
            const prefHash = decodeHashFromBase64(prefHashB64);

            // Call the zome function
            await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'delete_product_preference',
                payload: prefHash
            });

            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error deleting product preference:', error);
            return { success: false, message: errorMessage };
        }
    }
}