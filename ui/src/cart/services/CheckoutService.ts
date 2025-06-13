import { decodeHashFromBase64 } from '@holochain/client';
import { writable, get } from 'svelte/store';
import type { CheckoutDetails, TimeSlot } from '../types/CartTypes';
import type { CartPersistenceService } from './CartPersistenceService';
import type { CartBusinessService } from './CartBusinessService';

export class CheckoutService {
    // Store for saved delivery details
    private savedDeliveryDetails = writable<CheckoutDetails>({});

    constructor(
        private client: any,
        private persistenceService: CartPersistenceService,
        private cartBusinessService: CartBusinessService
    ) {}

    // Checkout the current cart with delivery details
    public async checkoutCart(details: CheckoutDetails) {
        try {
            if (this.client) {
                // Cancel any pending sync
                this.persistenceService.forceSyncToHolochain([]);

                // Get cart items from the main cart service
                const localCartItems = this.cartBusinessService.getCartItems();

                let cartProducts = localCartItems.map(item => {
                    let groupHash;
                    try {
                        groupHash = decodeHashFromBase64(item.groupHash);
                    } catch (e) {
                        console.error(`Invalid group hash format: ${item.groupHash}`, e);
                        return null;
                    }

                    return groupHash ? {
                        group_hash: groupHash,
                        product_index: item.productIndex,
                        quantity: item.quantity,
                        timestamp: item.timestamp,
                        note: item.note
                    } : null;
                }).filter(item => item !== null);

                if (cartProducts.length === 0) {
                    return { success: false, message: "Cart is empty" };
                }

                // Prepare the input for checkout
                const payload: any = {
                    address_hash: null,
                    delivery_instructions: details.deliveryInstructions || null,
                    delivery_time: details.deliveryTime || null,
                    cart_products: cartProducts
                };

                // Convert address hash if provided
                if (details.addressHash) {
                    try {
                        payload.address_hash = decodeHashFromBase64(details.addressHash);
                    } catch (e) {
                        console.error('Invalid address hash format:', e);
                        return { success: false, error: 'Invalid address hash format' };
                    }
                }

                // Call Holochain checkout function
                console.log("Checking out cart with details:", payload);
                const checkoutResult = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'checkout_cart',
                    payload
                });

                console.log("Checkout result:", checkoutResult);

                // Clear cart through main cart service
                await this.cartBusinessService.clearCart();

                // Clear saved delivery details
                this.savedDeliveryDetails.set({});

                return { success: true, data: checkoutResult };
            } else {
                console.warn("No Holochain client available for checkout");
                return { success: false, message: "No Holochain client available" };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error checking out cart:', error);
            return { success: false, message: errorMessage };
        }
    }

    // Generate available delivery time slots
    public generateDeliveryTimeSlots(startDate = new Date()): {
        date: Date,
        dateFormatted: string,
        dayOfWeek: string,
        timeSlots: TimeSlot[]
    }[] {
        const days = [];
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDate = new Date();
        const currentHour = currentDate.getHours();

        // Generate slots for the next 9 days
        for (let i = 0; i < 9; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);

            // Reset time
            date.setHours(0, 0, 0, 0);

            const dateFormatted = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            });

            const dayOfWeek = daysOfWeek[date.getDay()];

            // Time slots for this day
            const timeSlots: TimeSlot[] = [];

            // Add time slots
            const slotTimes = [
                { start: '7am', end: '9am', hour: 7 },
                { start: '8am', end: '10am', hour: 8 },
                { start: '7am', end: '10am', hour: 7 },
                { start: '9am', end: '11am', hour: 9 },
                { start: '8am', end: '11am', hour: 8 },
                { start: '10am', end: 'Noon', hour: 10 },
                { start: '11am', end: '1pm', hour: 11 },
                { start: 'Noon', end: '2pm', hour: 12 },
                { start: '1pm', end: '3pm', hour: 13 },
                { start: '2pm', end: '4pm', hour: 14 },
                { start: '3pm', end: '5pm', hour: 15 },
                { start: '4pm', end: '6pm', hour: 16 },
                { start: '5pm', end: '7pm', hour: 17 },
                { start: '6pm', end: '8pm', hour: 18 }
            ];

            slotTimes.forEach((slot, index) => {
                // For today, skip time slots that have already passed
                const isToday = date.getDate() === currentDate.getDate() &&
                    date.getMonth() === currentDate.getMonth() &&
                    date.getFullYear() === currentDate.getFullYear();

                // Skip if it's today and the slot has passed (add 2 hours buffer)
                if (isToday && slot.hour <= currentHour + 1) {
                    return;
                }

                // Create a timestamp for the slot
                const slotDate = new Date(date);
                slotDate.setHours(slot.hour, 0, 0, 0);

                timeSlots.push({
                    id: `${i}-${index}`,
                    display: `${slot.start}–${slot.end}`,
                    timestamp: slotDate.getTime(),
                    slot: `${slot.start}–${slot.end}`
                });
            });

            // Only add days with available time slots
            if (timeSlots.length > 0) {
                days.push({
                    date,
                    dateFormatted,
                    dayOfWeek,
                    timeSlots
                });
            }
        }

        return days;
    }

    // Delivery details management
    public getSavedDeliveryDetails(): CheckoutDetails {
        return get(this.savedDeliveryDetails);
    }

    public subscribeSavedDeliveryDetails(callback: (details: CheckoutDetails) => void) {
        return this.savedDeliveryDetails.subscribe(callback);
    }

    public setSavedDeliveryDetails(details: CheckoutDetails): void {
        this.savedDeliveryDetails.set(details);
    }

    public clearSavedDeliveryDetails(): void {
        this.savedDeliveryDetails.set({});
    }
}