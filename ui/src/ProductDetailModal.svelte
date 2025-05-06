<script lang="ts">
    import {
        createEventDispatcher,
        getContext,
        onMount,
        onDestroy,
    } from "svelte";
    import { X, Plus, Minus } from "lucide-svelte";

    const dispatch = createEventDispatcher();
    const cartService = getContext("cartService");

    export let isOpen = false;
    export let product;
    export let groupHashBase64: string;
    export let productIndex: number;
    export let forceShowPreferences = false; // New prop for forcing preferences display

    let quantity = 1;
    let isInCart = false;
    let unsubscribeCartState;
    let note = "";
    let existingNote = "";
    let showPreferences = false;
    let showButtons = false;
    let noteChanged = false;

    $: isSoldByWeight = product?.sold_by === "WEIGHT";
    $: incrementValue = isSoldByWeight ? 0.25 : 1;

    function formatQuantity(qty) {
        return isSoldByWeight ? `${qty} lb` : qty;
    }

    function closeModal() {
        isOpen = false;
        showPreferences = false;
        showButtons = false;
        note = existingNote;
    }

    function handleOverlayClick(e) {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    }

    async function addToCart() {
        if (!$cartService) return;

        try {
            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                existingNote || undefined,
            );
            isInCart = true;
            showPreferences = true;
            showButtons = false;
        } catch (error) {
            console.error("Error adding to cart:", error);
        }
    }

    async function incrementQuantity() {
        quantity += incrementValue;
        if (isInCart) {
            await updateCartQuantity();
        }
    }

    async function decrementQuantity() {
        quantity = Math.max(0, quantity - incrementValue);
        if (quantity === 0) {
            isInCart = false;
            showPreferences = false;
            quantity = incrementValue;
        }
        if (isInCart) {
            await updateCartQuantity();
        }
    }

    async function updateCartQuantity() {
        if (!$cartService) return;
        try {
            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                existingNote || undefined,
            );
        } catch (error) {
            console.error("Error updating cart:", error);
        }
    }

    function checkCartStatus() {
        if (!$cartService) return;
        const items = $cartService.getCartItems();
        const item = items.find(
            (item) =>
                item &&
                item.groupHash === groupHashBase64 &&
                item.productIndex === productIndex,
        );

        if (item) {
            isInCart = true;
            quantity = item.quantity;
            showPreferences = true; // Always show preferences for items in cart
            if (item.note) {
                existingNote = item.note;
                note = item.note;
            } else {
                existingNote = "";
                note = "";
            }
        } else {
            isInCart = false;
            quantity = isSoldByWeight ? 1 : 1;
            showPreferences = false;
        }
    }

    function portal(node) {
        let target = document.body;

        function update() {
            target.appendChild(node);
        }

        function destroy() {
            node.parentNode?.removeChild(node);
        }

        update();

        return {
            update,
            destroy,
        };
    }

    function handleNoteInput() {
        showButtons = note !== existingNote;
        noteChanged = note !== existingNote;
    }

    async function saveInstructions() {
        if (!$cartService) return;
        try {
            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                note || undefined,
            );
            existingNote = note;
            showButtons = false;
            noteChanged = false;
        } catch (error) {
            console.error("Error saving instructions:", error);
        }
    }

    function cancelPreferences() {
        note = existingNote;
        showButtons = false;
        noteChanged = false;
    }

    onMount(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            checkCartStatus();

            // Force show preferences when opened from cart item
            if (forceShowPreferences || isInCart) {
                showPreferences = true;
            }
        }

        if ($cartService) {
            unsubscribeCartState = $cartService.subscribe(() => {
                checkCartStatus();
            });
        }
    });

    onDestroy(() => {
        document.body.style.overflow = "";
        if (unsubscribeCartState) unsubscribeCartState();
    });

    $: if (isOpen) {
        document.body.style.overflow = "hidden";
        // Ensure preferences are shown if opening from cart
        if (forceShowPreferences || isInCart) {
            showPreferences = true;
        }
    } else {
        document.body.style.overflow = "";
    }
</script>

{#if isOpen}
    <div class="overlay" on:click={handleOverlayClick} use:portal>
        <div class="modal">
            <div class="modal-header">
                <button class="back-button" on:click={closeModal}>
                    ← Back
                </button>
                <button class="close-button" on:click={closeModal}>
                    <X size={24} color="#343538" />
                </button>
            </div>

            <div class="modal-content">
                <div class="product-image-container">
                    {#if product.image_url}
                        <img
                            src={product.image_url}
                            alt={product.name}
                            class="product-image"
                        />
                    {/if}
                </div>

                <div class="product-info">
                    <div class="stock-status">
                        {#if product.stocks_status === "HIGH"}
                            Many in stock
                        {:else if product.stocks_status === "LOW"}
                            Low stock
                        {:else}
                            Maybe out
                        {/if}
                    </div>

                    <h1 class="product-title">{product.name}</h1>
                    <div class="shop-all">Shop all {product.category}</div>

                    <div class="product-details">
                        <h3>Details</h3>
                        <div class="details-content">
                            <p>{product.size || "1 each"}</p>
                        </div>
                    </div>
                </div>

                <div class="purchase-section">
                    <div class="product-price">
                        {#if product.promo_price && product.promo_price < product.price}
                            <div class="promo-price-line">
                                <span class="promo-price"
                                    >${Number(product.promo_price).toFixed(
                                        2,
                                    )}</span
                                >
                                {#if isSoldByWeight}
                                    <span class="price-unit">/lb</span>
                                {/if}
                            </div>
                            <div class="regular-price-line">
                                <span class="regular-price"
                                    >reg. ${Number(product.price).toFixed(
                                        2,
                                    )}</span
                                >
                                {#if isSoldByWeight}
                                    <span class="price-unit">/lb</span>
                                {/if}
                            </div>
                            <div class="loyalty-label">With loyalty card</div>
                        {:else}
                            <div class="current-price-line">
                                <span class="current-price"
                                    >${Number(product.price).toFixed(2)}</span
                                >
                                {#if isSoldByWeight}
                                    <span class="price-unit">/lb</span>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    {#if !isInCart}
                        <div class="quantity-wrapper">
                            <div class="quantity-selector">
                                <button
                                    class="quantity-button"
                                    on:click={decrementQuantity}
                                    disabled={quantity <= incrementValue}
                                >
                                    <Minus size={20} />
                                </button>
                                <span class="quantity-display"
                                    >{formatQuantity(quantity)}</span
                                >
                                <button
                                    class="quantity-button"
                                    on:click={incrementQuantity}
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <button
                                class="add-to-cart-button"
                                on:click={addToCart}
                            >
                                Add to cart
                            </button>
                        </div>
                    {:else}
                        <div class="in-cart-control">
                            <button
                                class="in-cart-button"
                                on:click|preventDefault={() => {}}
                            >
                                <button
                                    class="cart-quantity-button minus"
                                    on:click|stopPropagation={decrementQuantity}
                                >
                                    <Minus size={20} color="white" />
                                </button>
                                <span class="cart-quantity-display"
                                    >{formatQuantity(quantity)} in cart</span
                                >
                                <button
                                    class="cart-quantity-button plus"
                                    on:click|stopPropagation={incrementQuantity}
                                >
                                    <Plus size={20} color="white" />
                                </button>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>

            {#if showPreferences}
                <div class="preferences-section">
                    <h2>Your preferences</h2>
                    <p class="preferences-label">Special instructions</p>
                    <input
                        type="text"
                        bind:value={note}
                        on:input={handleNoteInput}
                        placeholder="I would like my shopper to..."
                        class="preferences-input {noteChanged ? 'active' : ''}"
                    />
                    {#if showButtons}
                        <div class="preferences-buttons">
                            <button
                                class="cancel-button"
                                on:click={cancelPreferences}
                            >
                                Cancel
                            </button>
                            <button
                                class="save-button"
                                on:click={saveInstructions}
                            >
                                Save instructions
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        touch-action: none;
    }

    .modal {
        background: white;
        width: 95%;
        max-width: 1600px;
        min-height: 80vh;
        margin: 20px auto;
        border-radius: 16px;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid #e0e0e0;
    }

    .back-button {
        display: flex;
        align-items: center;
        gap: 8px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 16px;
        color: #343538;
        padding: 0;
    }

    .close-button {
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
    }

    .close-button:hover {
        background: #f5f5f5;
    }

    .modal-content {
        display: grid;
        grid-template-columns: 1fr 1.2fr 0.8fr;
        gap: 60px;
        padding: 60px;
        flex: 1;
    }

    .product-image-container {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: 40px;
    }

    .product-image {
        max-width: 100%;
        max-height: 600px;
        object-fit: contain;
    }

    .product-info {
        display: flex;
        flex-direction: column;
    }

    .stock-status {
        font-size: 14px;
        color: #666;
        margin-bottom: 12px;
    }

    .product-title {
        font-size: 40px;
        font-weight: 600;
        margin: 0 0 12px 0;
        color: #343538;
        line-height: 1.2;
    }

    .shop-all {
        font-size: 18px;
        color: #0066cc;
        margin-bottom: 24px;
        cursor: pointer;
    }

    .product-details {
        margin-top: 30px;
        border-top: 1px solid #e0e0e0;
        padding-top: 20px;
    }

    .product-details h3 {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 12px 0;
        color: #343538;
        cursor: pointer;
    }

    .details-content {
        font-size: 18px;
        color: #666;
    }

    .purchase-section {
        display: flex;
        flex-direction: column;
        gap: 30px;
    }

    .product-price {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .promo-price-line,
    .current-price-line,
    .regular-price-line {
        display: flex;
        align-items: baseline;
    }

    .promo-price,
    .current-price {
        font-size: 40px;
        font-weight: bold;
        color: #000;
        line-height: 1;
    }

    .price-unit {
        font-size: 28px;
        color: #666;
        line-height: 1;
        margin-left: 4px;
    }

    .regular-price {
        font-size: 18px;
        color: #666;
        text-decoration: line-through;
        line-height: 1;
    }

    .regular-price-line .price-unit {
        font-size: 18px;
    }

    .loyalty-label {
        background-color: #faf0dc;
        color: #8f6c00;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        display: inline-block;
        width: fit-content;
    }

    .quantity-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .quantity-selector {
        display: flex;
        align-items: center;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
        width: fit-content;
    }

    .quantity-button {
        width: 60px;
        height: 60px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #343538;
    }

    .quantity-button:hover:not(:disabled) {
        background: #f5f5f5;
    }

    .quantity-button:disabled {
        color: #ccc;
        cursor: not-allowed;
    }

    .quantity-display {
        min-width: 120px;
        text-align: center;
        font-size: 22px;
        font-weight: 600;
        color: #343538;
        padding: 0 16px;
    }

    .add-to-cart-button {
        width: 100%;
        height: 64px;
        background: rgb(61, 61, 61);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 20px;
        font-weight: 600;
        cursor: pointer;
    }

    .add-to-cart-button:hover {
        background: #157d47;
    }

    .in-cart-control {
        width: 100%;
    }

    .in-cart-button {
        width: 100%;
        height: 64px;
        background: rgb(61, 61, 61);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 20px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0;
        overflow: hidden;
    }

    .cart-quantity-button {
        width: 64px;
        height: 100%;
        border: none;
        background: transparent;
        color: white;
        font-size: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
    }

    .cart-quantity-button:hover {
        background: rgba(0, 0, 0, 0.1);
    }

    .cart-quantity-display {
        flex: 1;
        text-align: center;
        font-size: 20px;
        font-weight: 600;
        color: white;
    }

    .preferences-section {
        background: #f7f7f7;
        border-top: 1px solid #e0e0e0;
        padding: 40px 60px;
        width: 100%;
    }

    .preferences-section h2 {
        font-size: 28px;
        font-weight: 600;
        margin: 0 0 16px 0;
        color: #343538;
    }

    .preferences-label {
        font-size: 16px;
        color: #343538;
        margin-bottom: 12px;
    }

    .preferences-input {
        width: 100%;
        height: 60px;
        padding: 16px;
        border: 1px solid #c0c0c0;
        border-radius: 12px;
        font-size: 16px;
        background: #ffffff;
    }

    .preferences-input:focus {
        outline: none;
        border-color: #3f8ae0;
    }

    .preferences-input.active {
        border-color: #3f8ae0;
    }

    .preferences-input::placeholder {
        color: #999;
    }

    .preferences-buttons {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-top: 30px;
    }

    .cancel-button,
    .save-button {
        padding: 14px 32px;
        border-radius: 30px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        min-width: 160px;
    }

    .cancel-button {
        background: #e0e0e0;
        border: none;
        color: #343538;
    }

    .save-button {
        background: rgb(61, 61, 61);
        border: none;
        color: white;
    }

    @media (max-width: 1024px) {
        .modal-content {
            grid-template-columns: 1fr;
            padding: 20px;
        }

        .product-image-container {
            padding-top: 0;
        }

        .preferences-section {
            padding: 20px;
        }
    }
</style>
