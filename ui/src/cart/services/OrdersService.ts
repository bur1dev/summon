import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import type { ActionHashB64, DecodedProductGroup } from '../types/CartTypes';
import { getCalculationService, restoreCartItems, forceSyncToHolochain } from './CartBusinessService';

let client: any = null;

export function setOrdersClient(holoClient: any) {
    client = holoClient;
}

// Load orders
export async function loadOrders() {
    try {
        if (client) {
            console.log("Loading checked out carts...");
            const result = await client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'get_checked_out_carts',
                payload: null
            });

            console.log("Loaded checked out carts:", result);

            // Process the results to make them easier to use in the UI
            const processedCarts = await processOrders(result);

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

// Helper: Get product details with simplified fallback
async function getProductDetails(product: any) {
    if (!product?.group_hash) return null;
    
    const groupHash = encodeHashToBase64(product.group_hash);
    
    // Try DataManager if available
    const calculationService = getCalculationService();
    if (calculationService && (calculationService as any).dataManager) {
        try {
            return await (calculationService as any).dataManager.getProductByReference(groupHash, product.product_index);
        } catch (error) {
            console.error(`DataManager failed for ${groupHash}:${product.product_index}`, error);
        }
    }
    
    // Fallback to direct zome call
    try {
        const result = await client.callZome({
            role_name: 'grocery',
            zome_name: 'products', 
            fn_name: 'get_product_group',
            payload: decodeHashFromBase64(groupHash)
        });
        
        if (result) {
            const { decode } = await import("@msgpack/msgpack");
            const group = decode(result.entry.Present.entry) as DecodedProductGroup;
            return group?.products?.[product.product_index] || null;
        }
    } catch (error) {
        console.error(`Direct zome call failed for ${groupHash}:${product.product_index}`, error);
    }
    
    return null;
}

// Helper: Format delivery time
function formatDeliveryTime(delivery_time: any) {
    if (!delivery_time) return null;
    
    const deliveryDate = new Date(delivery_time.date);
    return {
        date: deliveryDate.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        }),
        time: delivery_time.time_slot,
        raw: delivery_time
    };
}

// Process orders to add product details and delivery info
async function processOrders(carts: any[]) {
    console.log("Processing checked out carts from Holochain:", carts);

    return Promise.all(carts.map(async (cart) => {
        const cartHash = encodeHashToBase64(cart.cart_hash);
        const { id, products, total, created_at, status, address_hash, delivery_instructions, delivery_time } = cart.cart;

        // Get product details
        const productsWithDetails = await Promise.all(products.map(async (product: any) => {
            if (!product?.group_hash) {
                return { groupHash: "", productIndex: 0, quantity: 0, details: null, note: null };
            }

            const details = await getProductDetails(product);
            return {
                groupHash: encodeHashToBase64(product.group_hash),
                productIndex: product.product_index,
                quantity: product.quantity,
                details,
                note: product.note
            };
        }));

        // Calculate total
        const calculatedTotal = productsWithDetails.reduce((sum, p) => 
            sum + (p.details?.price * p.quantity || 0), 0);

        return {
            id,
            cartHash,
            products: productsWithDetails,
            total: calculatedTotal > 0 ? calculatedTotal : total,
            createdAt: new Date(created_at / 1000).toLocaleString(),
            status,
            addressHash: address_hash ? encodeHashToBase64(address_hash) : null,
            deliveryInstructions: delivery_instructions,
            deliveryTime: formatDeliveryTime(delivery_time)
        };
    }));
}

// Return to shopping
export async function returnToShopping(cartHash: ActionHashB64) {
    if (!client) {
        return { success: false, message: "No Holochain client available" };
    }

    try {
        console.log("START: returnToShopping for hash:", cartHash);
        
        // Find and restore cart
        const cartsResult = await loadOrders();
        if (!cartsResult.success || !Array.isArray(cartsResult.data)) {
            throw new Error("Failed to load orders for cart restoration");
        }

        const cart = cartsResult.data.find(c => c.cartHash === cartHash);
        if (cart) {
            await restoreCartItems(cart);
        }

        // Call zome function then sync
        const result = await client.callZome({
            role_name: 'grocery',
            zome_name: 'cart',
            fn_name: 'return_to_shopping',
            payload: decodeHashFromBase64(cartHash)
        });
        
        console.log("SUCCESS: Zome call result:", result);
        forceSyncToHolochain();

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error returning cart to shopping:', error);
        return { success: false, message: errorMessage };
    }
}