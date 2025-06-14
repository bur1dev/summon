import { PriceService } from "../../services/PriceService";
import { encodeHashToBase64 } from "@holochain/client";
import type { DataManager } from "../../services/DataManager";

interface CartItem {
    groupHash: string;
    productIndex: number;
    quantity: number;
    timestamp: number;
    note?: string;
}

interface CartTotals {
    regular: number;
    promo: number;
}

interface Product {
    price: number;
    promo_price?: number;
    sold_by?: string;
}

export class CartCalculationService {
    private dataManager?: DataManager;

    constructor(dataManager?: DataManager) {
        this.dataManager = dataManager;
    }

    // Set DataManager reference
    setDataManager(dataManager: DataManager): void {
        this.dataManager = dataManager;
    }

    // Calculate complete cart totals
    async calculateCartTotals(cartItems: CartItem[]): Promise<CartTotals> {
        if (!this.dataManager) {
            console.log("Cannot calculate cart total - DataManager not set");
            return { regular: 0, promo: 0 };
        }

        if (cartItems.length === 0) {
            return { regular: 0, promo: 0 };
        }

        let regularTotal = 0;
        let promoTotal = 0;

        for (const item of cartItems) {
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

                // Use DataManager to get product details
                const rawProduct = await this.dataManager.getProductByReference(groupHashBase64, item.productIndex);

                if (rawProduct && typeof rawProduct.price === 'number') {
                    // Convert to Product type for PriceService
                    const product: Product = {
                        price: rawProduct.price,
                        promo_price: rawProduct.promo_price,
                        sold_by: rawProduct.sold_by
                    };

                    // Use PriceService for calculations
                    const itemTotals = PriceService.calculateItemTotal(product, item.quantity);
                    regularTotal += itemTotals.regular;
                    promoTotal += itemTotals.promo;
                }
            } catch (error) {
                console.error('Error calculating cart total:', error);
            }
        }

        console.log(`Calculated cart totals - Regular: ${regularTotal}, Promo: ${promoTotal}`);
        return { regular: regularTotal, promo: promoTotal };
    }

    // Calculate price delta for a single item change
    async calculateItemDelta(groupHashBase64: string, productIndex: number, quantityDelta: number, product?: any): Promise<CartTotals> {
        if (quantityDelta === 0) {
            return { regular: 0, promo: 0 };
        }

        try {
            let productData: any = null;

            // Use provided product data if available (synchronous path)
            if (product && typeof product.price === 'number') {
                productData = product;
            } else if (this.dataManager) {
                // Fallback to fetching from DataManager (async path)
                productData = await this.dataManager.getProductByReference(groupHashBase64, productIndex);
            } else {
                return { regular: 0, promo: 0 };
            }

            if (productData && typeof productData.price === 'number') {
                // Convert to Product type for PriceService
                const productForCalculation: Product = {
                    price: productData.price,
                    promo_price: productData.promo_price,
                    sold_by: productData.sold_by
                };

                // Use PriceService for calculations
                const itemTotals = PriceService.calculateItemTotal(productForCalculation, Math.abs(quantityDelta));

                // Apply sign for delta
                const sign = quantityDelta > 0 ? 1 : -1;
                return {
                    regular: itemTotals.regular * sign,
                    promo: itemTotals.promo * sign
                };
            }
        } catch (error) {
            console.error('Error calculating item delta:', error);
        }

        return { regular: 0, promo: 0 };
    }

    // Validate quantity change
    validateQuantityChange(currentQuantity: number, newQuantity: number, isSoldByWeight: boolean): boolean {
        const incrementValue = isSoldByWeight ? 0.25 : 1;

        // Must be positive
        if (newQuantity < 0) return false;

        // Must be in valid increments
        if (isSoldByWeight) {
            // For weight items, allow quarter-pound increments
            const remainder = (newQuantity * 4) % 1;
            return Math.abs(remainder) < 0.001; // Account for floating point precision
        } else {
            // For count items, must be whole numbers
            return newQuantity % 1 === 0;
        }
    }

    // Calculate savings
    calculateSavings(regularTotal: number, promoTotal: number): number {
        return PriceService.calculateSavings(regularTotal, promoTotal);
    }
}