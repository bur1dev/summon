import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { get } from 'svelte/store';
import type { ActionHashB64, DecodedProductGroup, CheckoutDetails } from '../types/CartTypes';
import { getCalculationService, restoreCartItems, forceSyncToHolochain } from './CartBusinessService';

export class CheckedOutCartsService {
    constructor(
        private client: any
    ) {}

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
                    // Use ProductDataService if available from cart business service
                    const calculationService = getCalculationService();
                    if (calculationService && (calculationService as any)['productDataService']) {
                        details = await (calculationService as any)['productDataService'].getProductByReference(groupHash, product.product_index);
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
                        // Use the main cart service to restore the cart
                        await restoreCartItems(cart);

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

                            // Sync to Holochain after successful zome call
                            forceSyncToHolochain();
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
}