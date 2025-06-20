import { encodeHash, decodeHash, callZome } from '../utils/zomeHelpers';
import { createSuccessResult, createErrorResult, validateClient } from '../utils/errorHelpers';
import type { ActionHashB64 } from '../types/CartTypes';
import { restoreCartItems, forceSyncToHolochain } from './CartBusinessService';

let client: any = null;

export function setOrdersClient(holoClient: any) {
    client = holoClient;
}

// Get address for a specific order (secure private address retrieval)
export async function getOrderAddress(cartHash: ActionHashB64) {
    const clientError = validateClient(client, 'get order address');
    if (clientError) return clientError;

    try {
        console.log("Getting address for order:", cartHash);
        const result = await callZome(client, 'cart', 'get_address_for_order', decodeHash(cartHash));
        console.log("Retrieved order address:", result);
        return createSuccessResult(result);
    } catch (error) {
        console.error('Error getting order address:', error);
        return createErrorResult(error);
    }
}

// SIMPLIFIED: Load orders - no product lookups needed!
export async function loadOrders() {
    const clientError = validateClient(client, 'loading checked out carts');
    if (clientError) return clientError;

    try {
        console.log("Loading checked out carts...");
        const result = await callZome(client, 'cart', 'get_checked_out_carts', null);
        console.log("Loaded checked out carts:", result);

        // SIMPLIFIED: Process the results - all data is already here!
        const processedCarts = processOrders(result);
        return createSuccessResult(processedCarts);
    } catch (error) {
        console.error('Error loading checked out carts:', error);
        return createErrorResult(error);
    }
}

// DELETED: getProductDetails function - no longer needed!

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

// SECURE: Process orders - no address data in public cart entries
function processOrders(carts: any[]) {
    console.log("Processing checked out carts from Holochain:", carts);

    return carts.map((cart) => {
        const cartHash = encodeHash(cart.cart_hash);
        const { id, products, total, created_at, status, delivery_time } = cart.cart;

        // All product data is already in the cart.products array!
        const productsWithDetails = products.map((product: any) => ({
            productId: product.product_id,
            productName: product.product_name,
            productImageUrl: product.product_image_url,
            priceAtCheckout: product.price_at_checkout,
            promoPrice: product.promo_price,
            quantity: product.quantity,
            note: product.note,
            // For backward compatibility with UI that might expect these fields:
            details: {
                name: product.product_name,
                image_url: product.product_image_url,
                price: product.price_at_checkout,
                promo_price: product.promo_price
            }
        }));

        // Calculate total from frozen prices (already in cart)
        const calculatedTotal = productsWithDetails.reduce((sum: number, p: any) => 
            sum + (p.priceAtCheckout * p.quantity), 0);

        return {
            id,
            cartHash,
            products: productsWithDetails,
            total: calculatedTotal > 0 ? calculatedTotal : total,
            createdAt: new Date(created_at / 1000).toLocaleString(),
            status,
            // Address is now retrieved securely via getOrderAddress() when needed
            addressHash: null, // No longer stored in public cart entry
            deliveryInstructions: null, // Removed for privacy 
            deliveryTime: formatDeliveryTime(delivery_time)
        };
    });
}

// SIMPLIFIED: Return to shopping - faster and more reliable
export async function returnToShopping(cartHash: ActionHashB64) {
    const clientError = validateClient(client, 'return to shopping');
    if (clientError) return clientError;

    try {
        console.log("START: returnToShopping for hash:", cartHash);
        
        // SIMPLIFIED: Find and restore cart - no complex lookups needed
        const cartsResult = await loadOrders();
        if (!cartsResult.success || !Array.isArray(cartsResult.data)) {
            throw new Error("Failed to load orders for cart restoration");
        }

        const cart = cartsResult.data.find(c => c.cartHash === cartHash);
        if (cart) {
            // All product data is already available for restoration
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