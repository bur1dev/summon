<script lang="ts">
    import CheckoutOrderItem from "./CheckoutOrderItem.svelte";

    import { createEventDispatcher } from "svelte";
    
    // Props
    export let cartItems: any[] = [];
    export let isEntering = true;
    export let isExiting = false;
    
    // Local container for binding
    let orderItemsContainer: HTMLElement | undefined;
    
    const dispatch = createEventDispatcher();
    
    // Update parent when container is bound
    $: if (orderItemsContainer) {
        dispatch('containerBound', orderItemsContainer);
    }


</script>

<div class="summary-section">
    <h3 class={isEntering ? "slide-in-left" : isExiting ? "slide-out-left" : ""}>Order Details</h3>
    <div class="order-items" bind:this={orderItemsContainer}>
        {#each [...cartItems].sort((a, b) => a.groupHash.localeCompare(b.groupHash) || a.productIndex - b.productIndex) as item}
            <CheckoutOrderItem
                {item}
            />
        {/each}
    </div>
</div>

<style>
    .summary-section {
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