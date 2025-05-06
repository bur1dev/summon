import { decodeHashFromBase64 } from '@holochain/client';
import { derived } from 'svelte/store';

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

// This adapter helps integrate the SimpleCartService with the product catalog
export class ProductIntegration {
    constructor(private simpleCartService, private productStore) { }

    // Calculate cart total using product prices from the product store
    // In ProductIntegration.ts
    setupCartTotal() {
        console.log("Setting up cart total calculation");
        return derived(this.simpleCartService.cartItems, async (items) => {
            console.log("Cart items changed, recalculating total. Items:", items);
            let total = 0;

            for (const item of items) {
                try {
                    console.log("Getting product details for:", item.productHash);
                    const product = await this.getProductDetails(item.productHash);
                    console.log("Got product:", product);
                    total += (product?.price || 0) * item.quantity;
                    console.log("Running total:", total);
                } catch (error) {
                    console.error('Error calculating cart total:', error);
                }
            }

            console.log("Final total calculated:", total);
            return total;
        });
    }

    // Helper to get product details from hash
    async getProductDetails(hashB64: ActionHashB64) {
        try {
            const hash = decodeHashFromBase64(hashB64);
            return await this.productStore.getProductByHash(hash);
        } catch (error) {
            console.error('Error getting product details:', error);
            return null;
        }
    }

    // Get product details for all cart items
    async getCartProductDetails() {
        const cartItems = this.simpleCartService.getCartItems();
        const productDetails = {};

        for (const item of cartItems) {
            productDetails[item.productHash] = await this.getProductDetails(item.productHash);
        }

        return productDetails;
    }
}