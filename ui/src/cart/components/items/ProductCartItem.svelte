<script lang="ts">
    import CartItem from "./CartItem.svelte";
    import ProductDetailModal from "../../../products/components/modal/ProductDetailModal.svelte";
    import { getContext } from "svelte";
    import { PencilLine, Plus, Minus } from "lucide-svelte";
    import type { Writable } from "svelte/store";
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import { PriceService } from "../../../services/PriceService";
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

    // Use PriceService for calculations
    $: itemTotals = PriceService.calculateItemTotal(product, quantity);
    $: hasPromo = PriceService.hasPromoPrice(product);

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

            <!-- UPDATED: Price display using PriceService -->
            <div class="cart-item-price">
                <span
                    >{PriceService.formatPriceWithUnit(
                        product.price,
                        product.sold_by,
                    )}</span
                >
                {#if hasPromo}
                    <span class="price-separator">/</span>
                    <span class="promo-price">
                        {PriceService.formatPriceWithUnit(
                            product.promo_price,
                            product.sold_by,
                        )}
                    </span>
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

            <!-- UPDATED: Total price using PriceService -->
            <div class="cart-item-total">
                <span class="total-regular"
                    >{PriceService.formatTotal(itemTotals.regular)}</span
                >
                {#if hasPromo}
                    <span class="total-promo"
                        >{PriceService.formatTotal(itemTotals.promo)}</span
                    >
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
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        max-width: 100%;
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
