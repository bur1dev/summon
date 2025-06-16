import { encodeHash, decodeHash, callZome } from '../utils/zomeHelpers';
import { createSuccessResult, createErrorResult, validateClient } from '../utils/errorHelpers';
import type { ActionHashB64, DecodedProductGroup } from '../types/CartTypes';
import { getClient, restoreCartItems, forceSyncToHolochain } from './CartBusinessService';

let client: any = null;

export function setOrdersClient(holoClient: any) {
    client = holoClient;
}

// Load orders
export async function loadOrders() {
    const clientError = validateClient(client, 'loading checked out carts');
    if (clientError) return clientError;

    try {
        console.log("Loading checked out carts...");
        const result = await callZome(client, 'cart', 'get_checked_out_carts', null);
        console.log("Loaded checked out carts:", result);

        // Process the results to make them easier to use in the UI
        const processedCarts = await processOrders(result);
        return createSuccessResult(processedCarts);
    } catch (error) {
        console.error('Error loading checked out carts:', error);
        return createErrorResult(error);
    }
}

// Helper: Get product details with direct zome call fallback
async function getProductDetails(product: any) {
    if (!product?.group_hash) return null;
    
    const groupHash = encodeHash(product.group_hash);
    
    // Direct zome call for product details
    try {
        const result = await callZome(client, 'products', 'get_product_group', decodeHash(groupHash));
        
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
        const cartHash = encodeHash(cart.cart_hash);
        const { id, products, total, created_at, status, address_hash, delivery_instructions, delivery_time } = cart.cart;

        // Get product details
        const productsWithDetails = await Promise.all(products.map(async (product: any) => {
            if (!product?.group_hash) {
                return { groupHash: "", productIndex: 0, quantity: 0, details: null, note: null };
            }

            const details = await getProductDetails(product);
            return {
                groupHash: encodeHash(product.group_hash),
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
            addressHash: address_hash ? encodeHash(address_hash) : null,
            deliveryInstructions: delivery_instructions,
            deliveryTime: formatDeliveryTime(delivery_time)
        };
    }));
}

// Return to shopping
export async function returnToShopping(cartHash: ActionHashB64) {
    const clientError = validateClient(client, 'return to shopping');
    if (clientError) return clientError;

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
        const result = await callZome(client, 'cart', 'return_to_shopping', decodeHash(cartHash));
        
        console.log("SUCCESS: Zome call result:", result);
        forceSyncToHolochain();

        return createSuccessResult();
    } catch (error) {
        console.error('Error returning cart to shopping:', error);
        return createErrorResult(error);
    }
}