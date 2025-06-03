<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { Writable } from "svelte/store";
  import type { CartBusinessService } from "./CartBusinessService";
  import type { ProductDataService } from "../services/ProductDataService";
  import CartHeader from "./CartHeader.svelte";
  import ProductCartItem from "./ProductCartItem.svelte";
  import CheckoutFlow from "./CheckoutFlow.svelte";
  import { X } from "lucide-svelte";
  import { PriceService } from "../services/PriceService";

  // Props
  export let isOpen = false;
  export let onClose = () => {};

  // Get cart service directly from the context
  const cartServiceStore =
    getContext<Writable<CartBusinessService | null>>("cartService");

  // Get the store for product info
  const storeContext = getContext<import("../store").StoreContext>("store");
  const store = storeContext.getStore();

  // Get ProductDataService from context (must be at top level)
  const productDataService =
    getContext<ProductDataService>("productDataService");

  // State
  let cartItems: any[] = [];
  let productDetails: Record<string, any> = {};
  let isLoading = true;
  let isCheckingOut = false;
  let isShowingCheckoutFlow = false;
  let checkoutError = "";
  let isClosing = false;
  let cartTotalUnsubscribe: (() => void) | null = null;
  let cartPromoTotalUnsubscribe: (() => void) | null = null;
  let cartTotal = 0;
  let cartPromoTotal = 0;

  // Subscribe to cart changes
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    if (
      $cartServiceStore &&
      typeof $cartServiceStore.subscribe === "function"
    ) {
      unsubscribe = $cartServiceStore.subscribe(async (items) => {
        // Filter out any invalid items - ones with no groupHash
        cartItems = (items || []).filter((item) => item && item.groupHash);

        // Fetch product details for each item if not already loaded
        for (const item of cartItems) {
          if (!item || !item.groupHash) continue;

          const detailsKey = `${item.groupHash}_${item.productIndex}`;
          if (!productDetails[detailsKey]) {
            try {
              const product = await fetchProductDetails(
                item.groupHash,
                item.productIndex,
              );
              productDetails[detailsKey] = product;
            } catch (e) {
              console.error(`Failed to load product ${detailsKey}:`, e);
              productDetails[detailsKey] = {
                name: "Unknown Product",
                price: 0,
                size: "N/A",
                image_url: "",
              };
            }
          }
        }

        isLoading = false;
      });

      // Subscribe to cart totals
      cartTotalUnsubscribe = $cartServiceStore.cartTotal.subscribe((total) => {
        cartTotal = total;
      });

      cartPromoTotalUnsubscribe = $cartServiceStore.cartPromoTotal.subscribe(
        (total) => {
          cartPromoTotal = total;
        },
      );
    } else {
      console.warn("Cart service not available in SlideOutCart");
      cartItems = [];
      isLoading = false;
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (cartTotalUnsubscribe) cartTotalUnsubscribe();
      if (cartPromoTotalUnsubscribe) cartPromoTotalUnsubscribe();
    };
  });

  // Product fetching using ProductDataService
  async function fetchProductDetails(
    groupHashB64: string,
    productIndex: number,
  ) {
    if (!groupHashB64) {
      throw new Error("Missing groupHash");
    }

    if (!productDataService) {
      throw new Error("ProductDataService not available");
    }

    const product = await productDataService.getProductByReference(
      groupHashB64,
      productIndex,
    );

    if (!product) {
      throw new Error(`Product not found: ${groupHashB64}_${productIndex}`);
    }

    return product;
  }

  // Clear cart
  async function clearCart() {
    try {
      if (
        $cartServiceStore &&
        typeof $cartServiceStore.clearCart === "function"
      ) {
        await $cartServiceStore.clearCart();
      }
      closeCart();
    } catch (error) {
      console.error("Error clearing cart:", error);
    }
  }
  // Close cart with animation
  function closeCart() {
    isClosing = true;
    setTimeout(() => {
      isOpen = false;
      isClosing = false;
      onClose();
    }, 300); // Match animation duration
  }

  // Start checkout flow
  function startCheckout() {
    isShowingCheckoutFlow = true;
  }

  // Handle checkout success
  function handleCheckoutSuccess(event: CustomEvent) {
    closeCart();
  }

  // Close checkout flow
  function closeCheckoutFlow() {
    isShowingCheckoutFlow = false;
  }

  // Get the client for checkout component
  $: client = $cartServiceStore ? $cartServiceStore.client : null;

  // Safe compare function for sorting
  function safeCompare(a: any, b: any) {
    // Handle undefined values
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    // Compare strings
    return String(a).localeCompare(String(b));
  }

  // Use PriceService for savings calculation
  $: totalSavings = PriceService.calculateSavings(cartTotal, cartPromoTotal);
</script>

<div
  class="overlay {isOpen ? (isClosing ? 'fade-out' : 'fade-in') : ''}"
  class:visible={isOpen}
  role="button"
  tabindex="0"
  on:click={closeCart}
  on:keydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      closeCart();
    }
  }}
>
  <div
    class="cart-container {isClosing ? 'slide-out-right' : 'slide-in-right'}"
    class:open={isOpen}
    role="dialog"
    aria-modal="true"
    aria-labelledby="cart-title"
    on:click|stopPropagation
    on:keydown|stopPropagation
  >
    {#if isShowingCheckoutFlow && $cartServiceStore}
      <CheckoutFlow
        {client}
        cartService={$cartServiceStore}
        {cartItems}
        onClose={closeCheckoutFlow}
        on:checkout-success={handleCheckoutSuccess}
      />
    {:else}
      <CartHeader onClose={closeCart} />

      <div class="cart-content">
        <div class="cart-main">
          <div class="cart-main-header">
            <div class="cart-title" id="cart-title">
              Cart ({cartItems.length} item{cartItems.length !== 1 ? "s" : ""})
            </div>
            <button
              class="delete-cart-btn btn btn-icon btn-icon-primary btn-icon-sm"
              on:click={clearCart}
            >
              <X size={20} />
            </button>
          </div>

          <!-- UPDATED: Price display using PriceService -->
          <div class="cart-totals-section">
            <div class="cart-total-regular">
              Total: {PriceService.formatTotal(cartTotal)}
            </div>
            <div class="cart-total-promo">
              With loyalty card: {PriceService.formatTotal(cartPromoTotal)}
            </div>
            {#if totalSavings > 0}
              <div class="savings-amount">
                You save: {PriceService.formatSavings(totalSavings)}
              </div>
            {/if}
          </div>

          <div class="cart-items">
            {#if isLoading}
              <div class="loading">Loading cart items...</div>
            {:else if cartItems.length === 0}
              <div class="empty-cart">Your cart is empty</div>
            {:else}
              {#each [...cartItems]
                .filter((item) => item && item.groupHash)
                .sort((a, b) => safeCompare(a.groupHash, b.groupHash) || a.productIndex - b.productIndex) as item (`${item.groupHash}_${item.productIndex}`)}
                {@const detailsKey = `${item.groupHash}_${item.productIndex}`}
                {#if productDetails[detailsKey]}
                  <ProductCartItem
                    product={productDetails[detailsKey]}
                    quantity={item.quantity}
                    groupHash={item.groupHash}
                    productIndex={item.productIndex}
                    note={item.note}
                    isUpdating={false}
                  />
                {/if}
              {/each}
            {/if}

            {#if checkoutError}
              <div class="error-message">
                {checkoutError}
              </div>
            {/if}
          </div>

          <div class="checkout-button-container">
            <button
              class="checkout-button btn btn-primary btn-lg"
              disabled={cartItems.length === 0}
              on:click={startCheckout}
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--overlay-dark);
    opacity: 0;
    pointer-events: none;
    z-index: var(--z-index-highest);
  }

  .overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .overlay.fade-in {
    animation: fadeIn var(--transition-fast) ease forwards;
  }

  .overlay.fade-out {
    animation: fadeOut var(--transition-fast) ease forwards;
  }

  .cart-container {
    position: fixed;
    top: 0;
    right: 0;
    width: 480px;
    height: 100vh;
    background: var(--background);
    box-shadow: var(--shadow-sidebar);
    display: flex;
    flex-direction: column;
    z-index: var(--z-index-highest);
  }

  .cart-container.slide-in-right {
    animation: slideInRight var(--transition-normal) ease forwards;
  }

  .cart-container.slide-out-right {
    animation: slideOutRight var(--transition-normal) ease forwards;
  }

  .cart-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .cart-main {
    position: relative;
    border: none;
    margin: 0;
    padding: 0;
    background-color: var(--background);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .cart-main-header {
    height: var(--component-header-height);
    min-height: var(--component-header-height);
    box-sizing: border-box;
    padding: 0 var(--spacing-lg);
    position: sticky;
    top: 0;
    background: var(--background);
    z-index: var(--z-index-sticky);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: var(--border-width-thin) solid var(--border);
  }

  .cart-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .cart-totals-section {
    padding: var(--spacing-sm) var(--spacing-lg);
    background: linear-gradient(
      135deg,
      rgba(86, 98, 189, 0.05),
      rgba(112, 70, 168, 0.05)
    );
    border-bottom: var(--border-width-thin) solid var(--border);
  }

  .cart-total-regular {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .cart-total-promo {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--primary);
  }

  .savings-amount {
    font-size: var(--font-size-sm);
    color: var(--success);
    font-weight: var(--font-weight-semibold);
    margin-top: 4px;
  }

  :global(.delete-cart-btn svg) {
    color: var(--button-text);
    stroke: var(--button-text);
  }

  .cart-items {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--spacing-sm) var(--spacing-lg);
    min-height: 0;
  }

  .error-message {
    margin: var(--spacing-md) 0;
    padding: var(--spacing-sm);
    background-color: rgba(211, 47, 47, 0.1);
    color: var(--error);
    border-radius: var(--card-border-radius);
    font-size: var(--font-size-sm);
  }

  .empty-cart {
    padding: var(--spacing-xxl) 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--font-size-md);
  }

  .loading {
    padding: var(--spacing-xxl) 0;
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--font-size-md);
  }

  .checkout-button-container {
    padding: var(--spacing-lg);
    background: var(--background);
    border-top: var(--border-width-thin) solid var(--border);
    margin-top: auto;
  }

  .checkout-button {
    width: 100%;
  }

  .checkout-button[disabled] {
    background: var(--surface);
    border: var(--border-width-thin) solid var(--border);
    color: var(--text-secondary);
    cursor: not-allowed;
    opacity: 0.7;
    box-shadow: none;
    transform: none;
  }
</style>
