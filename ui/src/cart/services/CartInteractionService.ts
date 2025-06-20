import { addToCart } from './CartBusinessService';
import { getIncrementValue } from '../utils/cartHelpers';

/**
 * Centralized cart interaction utilities to eliminate duplicated cart logic
 * Updated to work with the new CartItem structure using product snapshots
 */

/**
 * Adds a product to cart with default quantity (1)
 * Updated to use full product object instead of hash references
 */
export async function addProductToCart(
    product: any,
    note?: string
): Promise<boolean> {
    try {
        const result = await addToCart(product, 1, note);
        return result.success;
    } catch (error) {
        console.error("Error adding to cart:", error);
        return false;
    }
}

/**
 * Increments item quantity using product-specific increment value
 */
export async function incrementItem(
    product: any,
    currentQuantity: number,
    note?: string
): Promise<boolean> {
    try {
        const incrementValue = getIncrementValue(product);
        const newQuantity = currentQuantity + incrementValue;
        const result = await addToCart(product, newQuantity, note);
        return result.success;
    } catch (error) {
        console.error("Error incrementing item:", error);
        return false;
    }
}

/**
 * Decrements item quantity using product-specific increment value
 * Removes item if quantity would be 0 or negative
 */
export async function decrementItem(
    product: any,
    currentQuantity: number,
    note?: string
): Promise<boolean> {
    try {
        const incrementValue = getIncrementValue(product);
        const newQuantity = currentQuantity - incrementValue;
        
        const result = newQuantity > 0 
            ? await addToCart(product, newQuantity, note)
            : await addToCart(product, 0, undefined);
        
        return result.success;
    } catch (error) {
        console.error("Error decrementing item:", error);
        return false;
    }
}

/**
 * Removes item completely from cart
 */
export async function removeItem(product: any): Promise<boolean> {
    try {
        const result = await addToCart(product, 0, undefined);
        return result.success;
    } catch (error) {
        console.error("Error removing item:", error);
        return false;
    }
}

/**
 * Updates item quantity to a specific value
 */
export async function updateQuantity(
    product: any,
    newQuantity: number,
    note?: string
): Promise<boolean> {
    try {
        const result = await addToCart(product, newQuantity, note);
        return result.success;
    } catch (error) {
        console.error("Error updating quantity:", error);
        return false;
    }
}

/**
 * SIMPLIFIED: Finds cart item by productId (new approach)
 */
export function findCartItem(cartItems: any[], productId: string): any | null {
    if (!cartItems || !Array.isArray(cartItems)) return null;
    
    return cartItems.find(item => 
        item && item.productId === productId
    ) || null;
}

/**
 * SIMPLIFIED: Gets current quantity for a product in cart using productId
 */
export function getCurrentQuantity(cartItems: any[], productId: string): number {
    const item = findCartItem(cartItems, productId);
    return item ? item.quantity : 0;
}

/**
 * SIMPLIFIED: Checks if item is in cart using productId
 */
export function isInCart(cartItems: any[], productId: string): boolean {
    return findCartItem(cartItems, productId) !== null;
}

// DELETED: Legacy compatibility functions - all components now use new productId API