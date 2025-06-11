<script lang="ts">
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import {
        getCartItemKey,
    } from "../../utils/cartHelpers";
    import CheckoutOrderItem from "./CheckoutOrderItem.svelte";

    // Props
    export let cartItems: any[] = [];

    // Track which items are being updated - using composite key for groupHash_productIndex
    let updatingProducts = new Map<string, number>(); // Map to store timestamps

    // To detect new cart items
    let previousCartItems: any[] = [...cartItems];

    // Watch for cart changes to clear updating status
    $: {
        // When cartItems changes, check if any updating products have been modified
        if (cartItems && cartItems.length > 0) {
            // For each updating product, check if quantity changed
            for (const [key, timestamp] of updatingProducts.entries()) {
                // Parse the key back into groupHash and productIndex
                const [groupHash, productIndexStr] = key.split("_");
                const productIndex = parseInt(productIndexStr);

                const oldItem = previousCartItems.find(
                    (item: any) =>
                        item.groupHash === groupHash &&
                        item.productIndex === productIndex,
                );
                const newItem = cartItems.find(
                    (item: any) =>
                        item.groupHash === groupHash &&
                        item.productIndex === productIndex,
                );

                // If quantity changed or update is older than 5 seconds, clear update status
                if (
                    !oldItem ||
                    !newItem ||
                    oldItem.quantity !== newItem.quantity ||
                    Date.now() - timestamp > 5000
                ) {
                    updatingProducts.delete(key);
                }
            }

            // Update previous cart items for next comparison
            previousCartItems = [...cartItems];
        }
    }

</script>

<div class="summary-section">
    <h3>Order Details</h3>
    <div class="order-items">
        {#each [...cartItems].sort((a, b) => a.groupHash.localeCompare(b.groupHash) || a.productIndex - b.productIndex) as item}
            <CheckoutOrderItem
                {item}
                {updatingProducts}
            />
        {/each}
    </div>
</div>

<style>
    .summary-section {
        border-bottom: var(--border-width-thin) solid var(--border);
        padding-bottom: var(--spacing-md);
    }

    .summary-section h3 {
        margin: 0 0 var(--spacing-sm) 0;
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .order-items {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }
</style>