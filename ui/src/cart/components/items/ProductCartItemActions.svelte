<script lang="ts">
    import { Plus, Minus } from "lucide-svelte";
    import { PriceService } from "../../../services/PriceService";

    // Props
    export let quantity: number;
    export let displayUnit: string;
    export let isUpdating: boolean;
    export let onIncrement: () => Promise<void>;
    export let onDecrement: () => Promise<void>;
    export let onRemove: () => Promise<void>;
    export let cartServiceAvailable: boolean;
    export let product: any;

    // Use PriceService for calculations
    $: itemTotals = PriceService.calculateItemTotal(product, quantity);
    $: hasPromo = PriceService.hasPromoPrice(product);
</script>

<div class="cart-item-right">
    <div class="quantity-control">
        <button
            class="quantity-btn minus-btn"
            on:click|stopPropagation={onDecrement}
            disabled={isUpdating || !cartServiceAvailable}
        >
            <Minus size={16} />
        </button>
        <span class="quantity-display">{quantity} {displayUnit}</span>
        <button
            class="quantity-btn plus-btn"
            on:click|stopPropagation={onIncrement}
            disabled={isUpdating || !cartServiceAvailable}
        >
            <Plus size={16} />
        </button>
    </div>

    <!-- Total price using PriceService -->
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
        on:click|stopPropagation={onRemove}
        disabled={!cartServiceAvailable}
    >
        Remove
    </button>
</div>

<style>
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