<script lang="ts">
    import CartItem from "./CartItem.svelte";
    import { getContext } from "svelte";

    // Props
    export let product;
    export let quantity;
    export let productHash;
    export let isUpdating = false;

    console.log("ProductCartItem - Rendering with:", {
        productHash,
        quantity,
        productName: product?.name,
        productPrice: product?.price,
        productSize: product?.size,
        hasImage: !!product?.image_url,
        productKeys: product ? Object.keys(product) : "N/A",
    });

    // Get cart service directly from the context
    const cartService = getContext("cartService");

    // Methods
    const handleDecrementItem = async () => {
        if (isUpdating || !$cartService) return;
        isUpdating = true;

        try {
            if (quantity > 1) {
                await $cartService.addToCart(productHash, quantity - 1);
            } else {
                // Setting to 0 to remove item
                await $cartService.addToCart(productHash, 0);
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
            await $cartService.addToCart(productHash, quantity + 1);
        } catch (error) {
            console.error("Error increasing quantity:", error);
        } finally {
            isUpdating = false;
        }
    };

    const handleRemove = async () => {
        if (!$cartService) return;

        try {
            await $cartService.addToCart(productHash, 0);
        } catch (error) {
            console.error("Error removing item:", error);
        }
    };
</script>

<CartItem id={productHash}>
    <div class="cart-item-img">
        {#if product.image_url}
            <img src={product.image_url} alt={product.name} />
        {/if}
    </div>

    <div class="cart-item-content">
        <div class="cart-item-top">
            <div class="cart-item-details">
                <div class="cart-item-name">
                    {product.name}
                </div>
                <div class="cart-item-size">
                    {product.size}
                </div>
            </div>

            <div class="cart-item-price">
                ${(product.price * quantity).toFixed(2)}
            </div>
        </div>

        <div class="cart-item-actions">
            <div class="quantity-control">
                <button
                    class="quantity-btn remove-btn"
                    on:click|stopPropagation={handleDecrementItem}
                    disabled={isUpdating || !$cartService}
                >
                    -
                </button>
                <span class="quantity-display">{quantity} ct</span>
                <button
                    class="quantity-btn add-btn"
                    on:click|stopPropagation={handleIncrementItem}
                    disabled={isUpdating || !$cartService}
                >
                    +
                </button>
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
        flex-direction: column;
        justify-content: space-between;
    }

    .cart-item-top {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
    }

    .cart-item-details {
        flex: 1;
    }

    .cart-item-name {
        font-weight: 500;
        margin-bottom: 5px;
        font-size: 16px;
    }

    .cart-item-size {
        color: #666;
        font-size: 14px;
    }

    .cart-item-price {
        font-weight: 600;
        font-size: 16px;
        margin-left: 10px;
    }

    .cart-item-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
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

    .remove-item {
        background: transparent;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        padding: 5px 10px;
        text-decoration: underline;
    }

    .remove-item:hover {
        color: #333;
    }
</style>
