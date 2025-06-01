import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';

interface CartItem {
    groupHash: string;
    productIndex: number;
    quantity: number;
    timestamp: number;
    note?: string;
}

export class CartPersistenceService {
    private client: any;
    private syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private readonly syncInterval = 3000; // 3 seconds

    constructor(client: any) {
        this.client = client;

        // Add event listener for page unload to sync cart
        window.addEventListener('beforeunload', () => {
            this.forceSyncToHolochain([]);
        });
    }

    // Load cart from localStorage
    async loadFromLocalStorage(): Promise<CartItem[]> {
        try {
            const storedCart = localStorage.getItem('cart');
            if (storedCart) {
                const parsedCart = JSON.parse(storedCart);
                console.log("Loaded cart from localStorage:", parsedCart);

                if (Array.isArray(parsedCart)) {
                    return parsedCart;
                }
            }
            return [];
        } catch (error) {
            console.error('Error loading cart from localStorage:', error);
            return [];
        }
    }

    // Save cart to localStorage
    saveToLocalStorage(cartItems: CartItem[]): void {
        try {
            localStorage.setItem('cart', JSON.stringify(cartItems));
        } catch (error) {
            console.error('Error saving cart to localStorage:', error);
        }
    }

    // Load cart from Holochain private entry
    async loadFromPrivateEntry(): Promise<CartItem[]> {
        try {
            if (!this.client) {
                console.warn("No client available for loadFromPrivateEntry");
                return [];
            }

            const result = await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'get_private_cart',
                payload: null
            });

            if (result && result.items) {
                // Transform items to the expected format
                const cartItems = result.items.map((item: any) => {
                    const hashBase64 = encodeHashToBase64(item.group_hash);

                    return {
                        groupHash: hashBase64,
                        productIndex: item.product_index,
                        quantity: item.quantity,
                        timestamp: item.timestamp,
                        note: item.note
                    };
                });

                // Filter out any invalid items
                return cartItems.filter((item: any) =>
                    item && item.groupHash && item.productIndex !== undefined);
            }

            return [];
        } catch (error) {
            console.error('Error loading cart from private entry:', error);
            return [];
        }
    }

    // Schedule sync to Holochain with debounce
    scheduleSyncToHolochain(cartItems: CartItem[]): void {
        if (this.syncTimeoutId) {
            clearTimeout(this.syncTimeoutId);
        }

        this.syncTimeoutId = setTimeout(() => {
            this.syncToHolochain(cartItems);
        }, this.syncInterval);
    }

    // Force immediate sync to Holochain
    forceSyncToHolochain(cartItems: CartItem[]): void {
        if (this.syncTimeoutId) {
            clearTimeout(this.syncTimeoutId);
            this.syncTimeoutId = null;
        }

        // Only sync if there are items
        if (cartItems.length > 0) {
            this.syncToHolochain(cartItems);
        }
    }

    // Sync cart to Holochain
    private async syncToHolochain(cartItems: CartItem[]): Promise<void> {
        if (!this.client) return;

        try {
            console.log("Syncing cart to Holochain:", cartItems);

            await this.client.callZome({
                role_name: 'grocery',
                zome_name: 'cart',
                fn_name: 'replace_private_cart',
                payload: {
                    items: cartItems,
                    last_updated: Date.now()
                }
            });

            console.log("Cart successfully synced to Holochain");

            // Clear localStorage after successful sync to avoid stale data
            localStorage.removeItem('cart');
        } catch (error) {
            console.error('Error syncing cart to Holochain:', error);
        } finally {
            this.syncTimeoutId = null;
        }
    }

    // Merge local and Holochain carts
    mergeLocalAndHolochainCarts(localItems: CartItem[], holochainItems: CartItem[]): CartItem[] {
        // Create a map of Holochain items for quick lookup
        const holochainItemsMap = new Map();
        holochainItems.forEach(item => {
            const key = `${item.groupHash}_${item.productIndex}`;
            holochainItemsMap.set(key, item);
        });

        // Create a map of local items
        const localItemsMap = new Map();
        localItems.forEach(item => {
            const key = `${item.groupHash}_${item.productIndex}`;
            localItemsMap.set(key, item);
        });

        // Merge strategy: Use the item with the most recent timestamp
        const mergedItems: CartItem[] = [];

        // Add all local items, updating with Holochain items if needed
        for (const [key, localItem] of localItemsMap.entries()) {
            const holochainItem = holochainItemsMap.get(key);

            if (holochainItem && holochainItem.timestamp > localItem.timestamp) {
                // Holochain item is newer
                mergedItems.push(holochainItem);
            } else {
                // Local item is newer or no Holochain item
                mergedItems.push(localItem);
            }

            // Remove from Holochain map to track what's been processed
            holochainItemsMap.delete(key);
        }

        // Add remaining Holochain items that aren't in local
        for (const holochainItem of holochainItemsMap.values()) {
            mergedItems.push(holochainItem);
        }

        // Filter out zero quantity items
        return mergedItems.filter(item => item.quantity > 0);
    }
}