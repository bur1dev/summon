import { callZome } from '../utils/zomeHelpers';
import type { CartItem } from '../types/CartTypes';
import { mapCartItemsToPayload } from '../utils/cartHelpers';

let client: any = null;
let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
const syncInterval = 3000; // 3 seconds

export function setPersistenceClient(holoClient: any): void {
    client = holoClient;
    
    // Add event listener for page unload to sync cart
    window.addEventListener('beforeunload', () => {
        forceSyncToHolochain([]);
    });
}

// Load cart from localStorage
export async function loadFromLocalStorage(): Promise<CartItem[]> {
    try {
        const storedCart = localStorage.getItem('cart');
        if (storedCart) {
            const parsedCart = JSON.parse(storedCart);
            return Array.isArray(parsedCart) ? parsedCart : [];
        }
        return [];
    } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        return [];
    }
}

// Save cart to localStorage
export function saveToLocalStorage(cartItems: CartItem[]): void {
    try {
        localStorage.setItem('cart', JSON.stringify(cartItems));
    } catch (error) {
        console.error('Error saving cart to localStorage:', error);
    }
}

// SIMPLIFIED: Load cart from Holochain private entry - no hash decoding needed
export async function loadFromPrivateEntry(): Promise<CartItem[]> {
    if (!client) return [];

    try {
        const result = await callZome(client, 'cart', 'get_private_cart', null);

        if (result?.items) {
            // Direct mapping - no hash decoding needed with new structure
            return result.items
                .map((item: any) => ({
                    productId: item.product_id,
                    productName: item.product_name,
                    productImageUrl: item.product_image_url,
                    priceAtCheckout: item.price_at_checkout,
                    promoPrice: item.promo_price,
                    quantity: item.quantity,
                    timestamp: item.timestamp,
                    note: item.note
                }))
                .filter((item: any) => item?.productId && item.quantity > 0);
        }
        return [];
    } catch (error) {
        console.error('Error loading cart from private entry:', error);
        return [];
    }
}

// Schedule sync to Holochain with debounce
export function scheduleSyncToHolochain(cartItems: CartItem[]): void {
    if (syncTimeoutId) clearTimeout(syncTimeoutId);
    syncTimeoutId = setTimeout(() => syncToHolochain(cartItems), syncInterval);
}

// Force immediate sync to Holochain
export async function forceSyncToHolochain(cartItems: CartItem[]): Promise<void> {
    if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
        syncTimeoutId = null;
    }
    if (cartItems.length > 0) {
        await syncToHolochain(cartItems);
    }
}

// SIMPLIFIED: Sync cart to Holochain - direct mapping, no hash encoding
async function syncToHolochain(cartItems: CartItem[]): Promise<void> {
    if (!client) return;

    try {
        // Syncing cart to Holochain
        
        // Direct mapping to backend structure - no hash encoding needed
        const payload = {
            items: mapCartItemsToPayload(cartItems),
            last_updated: Date.now()
        };

        await callZome(client, 'cart', 'replace_private_cart', payload);
        
        console.log("Cart successfully synced to Holochain");
        localStorage.removeItem('cart');
    } catch (error) {
        console.error('Error syncing cart to Holochain:', error);
    } finally {
        syncTimeoutId = null;
    }
}

// SIMPLIFIED: Merge local and Holochain carts using productId
export function mergeLocalAndHolochainCarts(localItems: CartItem[], holochainItems: CartItem[]): CartItem[] {
    const itemMap = new Map<string, CartItem>();
    
    // Add all items, newer timestamp wins
    [...localItems, ...holochainItems].forEach(item => {
        const key = item.productId;
        const existing = itemMap.get(key);
        if (!existing || item.timestamp > existing.timestamp) {
            itemMap.set(key, item);
        }
    });
    
    // Return items with quantity > 0
    return Array.from(itemMap.values()).filter(item => item.quantity > 0);
}