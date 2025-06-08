import { encodeHashToBase64 } from '@holochain/client';

/**
 * Cart helper utilities to eliminate duplicated logic across components
 * Following the PriceService pattern for centralized utility functions
 */

export interface ParsedProductHash {
    groupHash: string;
    productIndex: number;
}

/**
 * Determines increment value based on product type
 * Weight products: 0.25 lb increments
 * Unit products: 1 ct increments
 */
export function getIncrementValue(product: any): number {
    return product?.sold_by === "WEIGHT" ? 0.25 : 1;
}

/**
 * Gets display unit based on product type
 * Weight products: "lbs"
 * Unit products: "ct"
 */
export function getDisplayUnit(product: any): string {
    return product?.sold_by === "WEIGHT" ? "lbs" : "ct";
}

/**
 * Checks if product is sold by weight
 */
export function isSoldByWeight(product: any): boolean {
    return product?.sold_by === "WEIGHT";
}

/**
 * Parses product hash handling all format variations
 * Supports comma-separated, base64, composite hashes, and objects
 */
export function parseProductHash(hash: any): ParsedProductHash {
    let groupHashOriginal: string = "";
    let groupHashBase64: string = "";
    let productIndex: number = 0;

    if (hash && typeof hash === "string" && hash.includes("_")) {
        // Format: "hash_index"
        const lastUnderscoreIndex = hash.lastIndexOf("_");
        groupHashOriginal = hash.substring(0, lastUnderscoreIndex);
        productIndex = parseInt(hash.substring(lastUnderscoreIndex + 1)) || 0;

        // Convert comma-separated to base64 if needed
        if (groupHashOriginal.includes(",")) {
            try {
                const byteArray = new Uint8Array(
                    groupHashOriginal.split(",").map(Number)
                );
                groupHashBase64 = encodeHashToBase64(byteArray);
            } catch (e) {
                console.error("Error converting hash format:", e);
                groupHashBase64 = groupHashOriginal;
            }
        } else {
            // Already in base64 format
            groupHashBase64 = groupHashOriginal;
        }
    } else if (hash && typeof hash === "object") {
        // Check if it's a composite hash from search with groupHash and index
        if (hash.groupHash && typeof hash.index === "number") {
            // It's a composite hash - extract components
            if (typeof hash.groupHash === "string") {
                // GroupHash is already a string (likely base64)
                groupHashOriginal = hash.groupHash;
                groupHashBase64 = hash.groupHash;
            } else {
                // GroupHash is a Uint8Array
                groupHashOriginal = String(hash.groupHash);
                groupHashBase64 = encodeHashToBase64(hash.groupHash);
            }
            // Use the index from composite hash
            productIndex = hash.index;
        } else {
            // Fallback for backward compatibility - treat as Uint8Array
            groupHashOriginal = String(hash);
            groupHashBase64 = encodeHashToBase64(hash);
            productIndex = 0; // Assume index 0 if not specified
        }
    } else if (hash && typeof hash === "string" && !hash.includes("_")) {
        // It's already a base64 string
        groupHashOriginal = hash;
        groupHashBase64 = hash;
        productIndex = 0;
    }

    return {
        groupHash: groupHashBase64,
        productIndex
    };
}

/**
 * Gets the effective hash from various possible hash sources
 */
export function getEffectiveHash(product: any, actionHash?: any): any {
    return actionHash ||
           product?.hash ||
           product?.action_hash ||
           product?.entry_hash ||
           product?.actionHash;
}

/**
 * Creates a unique key for cart item tracking
 */
export function getCartItemKey(groupHash: string, productIndex: number): string {
    return `${groupHash}_${productIndex}`;
}

/**
 * Formats quantity for display based on product type
 */
export function formatQuantityDisplay(quantity: number, product: any): string {
    const unit = getDisplayUnit(product);
    return `${quantity} ${unit}`;
}