import { addToCart } from './CartBusinessService';
import { getIncrementValue } from '../utils/cartHelpers';

/**
 * Centralized cart interaction service to eliminate duplicated cart logic
 * Following the PriceService pattern for clean, reusable cart operations
 */
export class CartInteractionService {

    /**
     * Adds a product to cart with default quantity (1)
     */
    static async addToCart(
        groupHash: string,
        productIndex: number,
        note?: string,
        product?: any
    ): Promise<boolean> {
        try {
            const result = await addToCart(groupHash, productIndex, 1, note, product);
            return result.success;
        } catch (error) {
            console.error("Error adding to cart:", error);
            return false;
        }
    }

    /**
     * Increments item quantity using product-specific increment value
     */
    static async incrementItem(
        groupHash: string,
        productIndex: number,
        currentQuantity: number,
        product: any,
        note?: string
    ): Promise<boolean> {
        try {
            const incrementValue = getIncrementValue(product);
            const newQuantity = currentQuantity + incrementValue;
            const result = await addToCart(groupHash, productIndex, newQuantity, note, product);
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
    static async decrementItem(
        groupHash: string,
        productIndex: number,
        currentQuantity: number,
        product: any,
        note?: string
    ): Promise<boolean> {
        try {
            const incrementValue = getIncrementValue(product);
            const newQuantity = currentQuantity - incrementValue;
            
            const result = newQuantity > 0 
                ? await addToCart(groupHash, productIndex, newQuantity, note, product)
                : await addToCart(groupHash, productIndex, 0, undefined, product);
            
            return result.success;
        } catch (error) {
            console.error("Error decrementing item:", error);
            return false;
        }
    }

    /**
     * Removes item completely from cart
     */
    static async removeItem(
        groupHash: string,
        productIndex: number,
        product?: any
    ): Promise<boolean> {
        try {
            const result = await addToCart(groupHash, productIndex, 0, undefined, product);
            return result.success;
        } catch (error) {
            console.error("Error removing item:", error);
            return false;
        }
    }

    /**
     * Updates item quantity to a specific value
     */
    static async updateQuantity(
        groupHash: string,
        productIndex: number,
        newQuantity: number,
        note?: string,
        product?: any
    ): Promise<boolean> {
        try {
            const result = await addToCart(groupHash, productIndex, newQuantity, note, product);
            return result.success;
        } catch (error) {
            console.error("Error updating quantity:", error);
            return false;
        }
    }

    /**
     * Finds cart item by groupHash and productIndex
     */
    static findCartItem(cartItems: any[], groupHash: string, productIndex: number): any | null {
        if (!cartItems || !Array.isArray(cartItems)) return null;
        
        return cartItems.find(item => 
            item && 
            item.groupHash === groupHash && 
            item.productIndex === productIndex
        ) || null;
    }

    /**
     * Gets current quantity for a product in cart
     */
    static getCurrentQuantity(cartItems: any[], groupHash: string, productIndex: number): number {
        const item = this.findCartItem(cartItems, groupHash, productIndex);
        return item ? item.quantity : 0;
    }

    /**
     * Checks if item is in cart
     */
    static isInCart(cartItems: any[], groupHash: string, productIndex: number): boolean {
        return this.findCartItem(cartItems, groupHash, productIndex) !== null;
    }
}