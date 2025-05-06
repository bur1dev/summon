<script lang="ts">
    import CartItem from "./CartItem.svelte";
    import ProductDetailModal from "../ProductDetailModal.svelte";
    import { getContext } from "svelte";
    import { PencilLine } from "lucide-svelte";

    // Props - UPDATED FOR NEW STRUCTURE
    export let product;
    export let quantity;
    export let groupHash; // Changed from productHash
    export let productIndex; // Added
    export let note = null; // Added for note support
    export let isUpdating = false;

    // Get cart service directly from the context
    const cartService = getContext("cartService");

    // State for modal
    let showModal = false;

    // Determine if product is sold by weight
    const isSoldByWeight = product.sold_by === "WEIGHT";
    const displayUnit = isSoldByWeight ? "lbs" : "ct";
    const incrementValue = isSoldByWeight ? 0.25 : 1;

    // Methods - UPDATED FOR NEW STRUCTURE
    const handleDecrementItem = async () => {
        if (isUpdating || !$cartService) return;
        isUpdating = true;

        try {
            const newQuantity = quantity - incrementValue;
            if (newQuantity > 0) {
                await $cartService.addToCart(
                    groupHash,
                    productIndex,
                    newQuantity,
                    note,
                );
            } else {
                // Setting to 0 to remove item
                await $cartService.addToCart(groupHash, productIndex, 0);
            }
        } catch (error) {
            console.error("Error decreasing quantity:", error);
        } finally {
            isUpdating = false;
        }
    };

    const handleIncrementItem = async () => {
        if (isUpdating || !$cartService) return;
        isUpdating = true;

        try {
            await $cartService.addToCart(
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
        if (!$cartService) return;

        try {
            await $cartService.addToCart(groupHash, productIndex, 0);
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
            <div class="cart-item-price">
                ${product.price.toFixed(2)}{isSoldByWeight ? "/lb" : ""}
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
                    class="quantity-btn remove-btn"
                    on:click|stopPropagation={handleDecrementItem}
                    disabled={isUpdating || !$cartService}
                >
                    -
                </button>
                <span class="quantity-display">{quantity} {displayUnit}</span>
                <button
                    class="quantity-btn add-btn"
                    on:click|stopPropagation={handleIncrementItem}
                    disabled={isUpdating || !$cartService}
                >
                    +
                </button>
            </div>
            <div class="cart-item-total">
                ${(product.price * quantity).toFixed(2)}
            </div>
            <button
                class="remove-item"
                on:click|stopPropagation={handleRemove}
                disabled={!$cartService}
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
        margin-right: 15px;
        flex-shrink: 0;
    }

    .cart-item-img img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .cart-item-content {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .cart-item-left {
        flex: 1;
        margin-right: 20px;
    }

    .cart-item-name {
        font-weight: 500;
        margin-bottom: 5px;
        font-size: 16px;
    }

    .cart-item-price {
        color: #666;
        font-size: 14px;
        margin-bottom: 4px;
    }

    .cart-item-note {
        font-size: 14px;
        color: #666;
        margin-bottom: 4px;
    }

    .instructions-link {
        background: transparent;
        border: none;
        color: rgb(61, 61, 61);
        font-size: 14px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .instructions-link:hover {
        text-decoration: underline;
    }

    .cart-item-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
    }

    .quantity-control {
        display: flex;
        align-items: center;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow: hidden;
        height: 36px;
    }

    .quantity-btn {
        width: 36px;
        height: 36px;
        background: white;
        border: none;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .quantity-btn:hover {
        background: #f5f5f5;
    }

    .quantity-display {
        min-width: 40px;
        text-align: center;
        font-size: 14px;
    }

    .cart-item-total {
        font-weight: 600;
        font-size: 16px;
    }

    .remove-item {
        background: transparent;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        text-decoration: underline;
    }

    .remove-item:hover {
        color: #333;
    }
</style>
