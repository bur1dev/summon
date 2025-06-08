<script lang="ts">
    import { PencilLine } from "lucide-svelte";
    import { PriceService } from "../../../services/PriceService";

    // Props
    export let product: any;
    export let note: string | null = null;
    export let onInstructions: () => void;

    // Use PriceService for calculations
    $: hasPromo = PriceService.hasPromoPrice(product);
</script>

<div class="cart-item-img">
    {#if product.image_url}
        <img src={product.image_url} alt={product.name} />
    {/if}
</div>

<div class="cart-item-left">
    <div class="cart-item-name">
        {product.name}
    </div>

    <!-- Price display using PriceService -->
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
        on:click|stopPropagation={onInstructions}
    >
        <PencilLine size={16} />
        <span
            >{note && note.trim().length > 0
                ? "Edit instructions"
                : "Add instructions"}</span
        >
    </button>
</div>

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
</style>