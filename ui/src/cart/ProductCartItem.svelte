<script lang="ts">
    import CartItem from "./CartItem.svelte";
    import ProductDetailModal from "../ProductDetailModal.svelte";
    import { getContext } from "svelte";
    import { PencilLine, Plus, Minus } from "lucide-svelte";
    import type { Writable } from "svelte/store";
    import type { SimpleCartService } from "./SimpleCartService"; // Assuming this is the correct type/interface

    // Props - UPDATED FOR NEW STRUCTURE
    export let product;
    export let quantity;
    export let groupHash; // Changed from productHash
    export let productIndex; // Added
    export let note = null; // Added for note support
    export let isUpdating = false;

    // Get cart service directly from the context
    const cartServiceStore =
        getContext<Writable<SimpleCartService | null>>("cartService");

    // State for modal
    let showModal = false;

    // Determine if product is sold by weight
    const isSoldByWeight = product.sold_by === "WEIGHT";
    const displayUnit = isSoldByWeight ? "lbs" : "ct";
    const incrementValue = isSoldByWeight ? 0.25 : 1;

    // NEW: Calculate totals
    $: regularTotal = product.price * quantity;
    $: promoTotal = (product.promo_price || product.price) * quantity;
    $: hasPromo = product.promo_price && product.promo_price < product.price;

    // Methods - UPDATED FOR NEW STRUCTURE
    const handleDecrementItem = async () => {
        if (isUpdating || !$cartServiceStore) return;
        isUpdating = true;

        try {
            const newQuantity = quantity - incrementValue;
            if (newQuantity > 0) {
                await $cartServiceStore.addToCart(
                    groupHash,
                    productIndex,
                    newQuantity,
                    note,
                );
            } else {
                // Setting to 0 to remove item
                await $cartServiceStore.addToCart(groupHash, productIndex, 0);
            }
        } catch (error) {
            console.error("Error decreasing quantity:", error);
        } finally {
            isUpdating = false;
        }
    };

    const handleIncrementItem = async () => {
        if (isUpdating || !$cartServiceStore) return;
        isUpdating = true;

        try {
            await $cartServiceStore.addToCart(
                groupHash,
                productIndex,
                quantity + incrementValue,
                note,
            );
        } catch (error) {
            console.error("Error increasing quantity:", error);
        } finally {
            isUpdating = false;
        }
    };

    const handleRemove = async () => {
        if (!$cartServiceStore) return;

        try {
            await $cartServiceStore.addToCart(groupHash, productIndex, 0);
        } catch (error) {
            console.error("Error removing item:", error);
        }
    };

    const handleInstructionsClick = () => {
        showModal = true;
    };
</script>

<CartItem id={`${groupHash}_${productIndex}`}>
    <div class="cart-item-img">
        {#if product.image_url}
            <img src={product.image_url} alt={product.name} />
        {/if}
    </div>

    <div class="cart-item-content">
        <div class="cart-item-left">
            <div class="cart-item-name">
                {product.name}
            </div>

            <!-- UPDATED: Price display section -->
            <div class="cart-item-price">
                <span
                    >${product.price.toFixed(2)}{isSoldByWeight
                        ? "/lb"
                        : ""}</span
                >
                {#if hasPromo}
                    <span class="price-separator">/</span>
                    <span class="promo-price"
                        >${product.promo_price.toFixed(2)}{isSoldByWeight
                            ? "/lb"
                            : ""}</span
                    >
                {/if}
            </div>

            {#if note}
                <div class="cart-item-note">
                    Shopper note: {note}
                </div>
            {/if}
            <button
                class="instructions-link"
                on:click|stopPropagation={handleInstructionsClick}
            >
                <PencilLine size={16} />
                <span
                    >{note && note.trim().length > 0
                        ? "Edit instructions"
                        : "Add instructions"}</span
                >
            </button>
        </div>

        <div class="cart-item-right">
            <div class="quantity-control">
                <button
                    class="quantity-btn minus-btn"
                    on:click|stopPropagation={handleDecrementItem}
                    disabled={isUpdating || !$cartServiceStore}
                >
                    <Minus size={16} />
                </button>
                <span class="quantity-display">{quantity} {displayUnit}</span>
                <button
                    class="quantity-btn plus-btn"
                    on:click|stopPropagation={handleIncrementItem}
                    disabled={isUpdating || !$cartServiceStore}
                >
                    <Plus size={16} />
                </button>
            </div>

            <!-- UPDATED: Total price with both regular and promo totals -->
            <div class="cart-item-total">
                <span class="total-regular">${regularTotal.toFixed(2)}</span>
                {#if hasPromo}
                    <span class="total-promo">${promoTotal.toFixed(2)}</span>
                {/if}
            </div>

            <button
                class="remove-item"
                on:click|stopPropagation={handleRemove}
                disabled={!$cartServiceStore}
            >
                Remove
            </button>
        </div>
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
    .cart-item-img {
        width: 70px;
        height: 70px;
        margin-right: var(--spacing-md);
        flex-shrink: 0;
        overflow: hidden;
        border-radius: var(--card-border-radius);
    }

    .cart-item-img img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: top;
    }

    .cart-item-content {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .cart-item-left {
        flex: 1;
        margin-right: var(--spacing-lg);
    }

    .cart-item-name {
        font-weight: var(--font-weight-semibold);
        margin-bottom: var(--spacing-xs);
        font-size: var(--font-size-md);
        color: var(--text-primary);
    }

    /* UPDATED: Price styling */
    .cart-item-price {
        font-size: var(--font-size-sm);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        color: var(--text-secondary);
    }

    .price-separator {
        margin: 0 4px;
        color: var(--text-secondary);
    }

    .promo-price {
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
    }

    .cart-item-note {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        margin-bottom: 4px;
        background-color: var(--surface);
        padding: 4px var(--spacing-xs);
        border-radius: 4px;
        border-left: var(--border-width) solid var(--primary);
    }

    .instructions-link {
        background: transparent;
        border: none;
        color: var(--primary);
        font-size: var(--font-size-sm);
        cursor: pointer;
        padding: 4px var(--spacing-xs);
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: var(--btn-border-radius);
        transition: var(--btn-transition);
    }

    .instructions-link:hover {
        background-color: var(--surface);
        transform: translateY(var(--hover-lift));
    }

    .cart-item-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--spacing-xs);
    }

    .quantity-control {
        width: 140px;
        height: var(--btn-height-sm);
        border-radius: 30px;
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        display: flex;
        justify-content: space-between;
        padding: 0;
        overflow: hidden;
        border: none;
        box-shadow: var(--shadow-button);
    }

    .quantity-btn {
        width: var(--btn-height-sm);
        height: var(--btn-height-sm);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--btn-transition);
        background-color: rgba(0, 0, 0, 0.15);
        border-radius: 50%;
    }

    .quantity-btn.minus-btn {
        margin-right: -5px;
    }

    .quantity-btn.plus-btn {
        margin-left: -5px;
    }

    .quantity-btn:hover {
        background-color: rgba(0, 0, 0, 0.3);
        transform: scale(var(--hover-scale-subtle));
    }

    :global(.quantity-btn svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .quantity-btn:disabled {
        background-color: rgba(0, 0, 0, 0.1);
        cursor: not-allowed;
        opacity: 0.7;
    }

    :global(.quantity-btn:disabled svg) {
        color: var(--button-text);
        opacity: 0.5;
        stroke: var(--button-text);
    }

    .quantity-display {
        min-width: 60px;
        text-align: center;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--button-text);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        padding: 0 var(--spacing-xs);
    }

    /* UPDATED: Total price styling */
    .cart-item-total {
        text-align: right;
    }

    .total-regular {
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-md);
        color: var(--text-primary);
        display: block;
    }

    .total-promo {
        font-size: var(--font-size-sm);
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
        display: block;
    }

    .remove-item {
        background: transparent;
        border: none;
        color: var(--error);
        cursor: pointer;
        font-size: var(--font-size-sm);
        padding: 4px var(--spacing-xs);
        border-radius: var(--btn-border-radius);
        transition: var(--btn-transition);
    }

    .remove-item:hover {
        background-color: rgba(211, 47, 47, 0.1);
        text-decoration: underline;
    }
</style>
