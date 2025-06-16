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


let dataManager: DataManager | null = null;

export function setCalculationDataManager(dm: DataManager): void {
    dataManager = dm;
}

// Calculate complete cart totals
export async function calculateCartTotals(cartItems: CartItem[]): Promise<CartTotals> {
    if (!dataManager || !cartItems.length) {
        return { regular: 0, promo: 0 };
    }

    let regularTotal = 0;
    let promoTotal = 0;

    for (const item of cartItems) {
        if (!item?.groupHash) continue;

        try {
            // Normalize hash format if needed
            const groupHashBase64 = item.groupHash.includes(',') 
                ? encodeHashToBase64(new Uint8Array(item.groupHash.split(',').map(Number)))
                : item.groupHash;

            const rawProduct = await dataManager.getProductByReference(groupHashBase64, item.productIndex);
            if (rawProduct && typeof rawProduct.price === 'number') {
                const itemTotals = PriceService.calculateItemTotal(rawProduct as any, item.quantity);
                regularTotal += itemTotals.regular;
                promoTotal += itemTotals.promo;
            }
        } catch (error) {
            console.error('Error calculating cart total:', error);
        }
    }

    return { regular: regularTotal, promo: promoTotal };
}

// Calculate price delta for a single item change
export async function calculateItemDelta(groupHashBase64: string, productIndex: number, quantityDelta: number, product?: any): Promise<CartTotals> {
    if (quantityDelta === 0) return { regular: 0, promo: 0 };

    try {
        const productData = product?.price ? product : (dataManager ? await dataManager.getProductByReference(groupHashBase64, productIndex) : null);
        
        if (productData && typeof productData.price === 'number') {
            const itemTotals = PriceService.calculateItemTotal(productData, Math.abs(quantityDelta));
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
export function validateQuantityChange(newQuantity: number, isSoldByWeight: boolean): boolean {
    if (newQuantity < 0) return false;

    if (isSoldByWeight) {
        // Quarter-pound increments for weight items
        return Math.abs((newQuantity * 4) % 1) < 0.001;
    } else {
        // Whole numbers for count items
        return newQuantity % 1 === 0;
    }
}

// Calculate savings
export function calculateSavings(regularTotal: number, promoTotal: number): number {
    return PriceService.calculateSavings(regularTotal, promoTotal);
}

// Legacy class for backward compatibility
export class CartCalculationService {
    constructor(dataManager?: DataManager) {
        if (dataManager) setCalculationDataManager(dataManager);
    }

    setDataManager(dm: DataManager): void {
        setCalculationDataManager(dm);
    }

    async calculateCartTotals(cartItems: CartItem[]): Promise<CartTotals> {
        return calculateCartTotals(cartItems);
    }

    async calculateItemDelta(groupHashBase64: string, productIndex: number, quantityDelta: number, product?: any): Promise<CartTotals> {
        return calculateItemDelta(groupHashBase64, productIndex, quantityDelta, product);
    }

    validateQuantityChange(_currentQuantity: number, newQuantity: number, isSoldByWeight: boolean): boolean {
        return validateQuantityChange(newQuantity, isSoldByWeight);
    }

    calculateSavings(regularTotal: number, promoTotal: number): number {
        return calculateSavings(regularTotal, promoTotal);
    }
}