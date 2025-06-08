<script lang="ts">
    import CartItem from "./CartItem.svelte";
    import ProductCartItemDisplay from "./ProductCartItemDisplay.svelte";
    import ProductCartItemActions from "./ProductCartItemActions.svelte";
    import ProductDetailModal from "../../../products/components/modal/ProductDetailModal.svelte";
    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import { CartInteractionService } from "../../services/CartInteractionService";
    import {
        getIncrementValue,
        getDisplayUnit,
        isSoldByWeight,
    } from "../../utils/cartHelpers";

    // Props - UPDATED FOR NEW STRUCTURE
    export let product: any;
    export let quantity: number;
    export let groupHash: string; // Changed from productHash
    export let productIndex: number; // Added
    export let note: string | null = null; // Added for note support
    export let isUpdating = false;

    // Get cart service directly from the context
    const cartServiceStore =
        getContext<Writable<CartBusinessService | null>>("cartService");

    // State for modal
    let showModal = false;

    // Use cart helpers for product properties
    const productIsSoldByWeight = isSoldByWeight(product);
    const displayUnit = getDisplayUnit(product);
    const incrementValue = getIncrementValue(product);

    // Cart interactions using centralized service
    const handleDecrementItem = async () => {
        if (isUpdating) return;
        isUpdating = true;

        try {
            await CartInteractionService.decrementItem(
                cartServiceStore,
                groupHash,
                productIndex,
                quantity,
                product,
                note || undefined,
            );
        } finally {
            isUpdating = false;
        }
    };

    const handleIncrementItem = async () => {
        if (isUpdating) return;
        isUpdating = true;

        try {
            await CartInteractionService.incrementItem(
                cartServiceStore,
                groupHash,
                productIndex,
                quantity,
                product,
                note || undefined,
            );
        } finally {
            isUpdating = false;
        }
    };

    const handleRemove = async () => {
        await CartInteractionService.removeItem(
            cartServiceStore,
            groupHash,
            productIndex,
        );
    };

    const handleInstructionsClick = () => {
        showModal = true;
    };
</script>

<CartItem id={`${groupHash}_${productIndex}`}>
    <div class="cart-item-content">
        <ProductCartItemDisplay 
            {product} 
            {note} 
            onInstructions={handleInstructionsClick}
        />
        <ProductCartItemActions 
            {quantity} 
            {displayUnit} 
            {isUpdating}
            {product}
            onIncrement={handleIncrementItem}
            onDecrement={handleDecrementItem}
            onRemove={handleRemove}
            cartServiceAvailable={!!$cartServiceStore}
        />
    </div>
</CartItem>

<!-- Add the ProductDetailModal with forced preferences display -->
<ProductDetailModal
    bind:isOpen={showModal}
    {product}
    groupHashBase64={groupHash}
    {productIndex}
    forceShowPreferences={true}
/>

<style>
    .cart-item-content {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }
</style>
