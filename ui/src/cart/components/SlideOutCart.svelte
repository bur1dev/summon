<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { Writable } from "svelte/store";
  import { Frown } from "lucide-svelte";
  import type { CartBusinessService } from "../services/CartBusinessService";
  import type { ProductDataService } from "../../products/services/ProductDataService";
  import CartHeader from "./CartHeader.svelte";
  import UnifiedCartItem from "./UnifiedCartItem.svelte";
  import CheckoutFlow from "./checkout/CheckoutFlow.svelte";
  import { PriceService } from "../../services/PriceService";
  import { clickable } from "../../shared/actions/clickable";
  import { AnimationService } from "../../services/AnimationService";

  // Props
  export let isOpen = false;
  export let onClose = () => {};

  // Reset animation flag when cart opens
  $: if (isOpen) {
    hasTriggeredInitialZipper = false;
  }

  // Get cart service directly from the context
  const cartServiceStore =
    getContext<Writable<CartBusinessService | null>>("cartService");


  // Get ProductDataService from context (must be at top level)
  const productDataService =
    getContext<ProductDataService>("productDataService");

  // State
  let cartItems: any[] = [];
  let enrichedCartItems: any[] = [];
  let isLoading = true;
  
  // Smart enrichment cache - Map of itemKey -> enrichedItem
  let enrichmentCache = new Map<string, any>();
  let isShowingCheckoutFlow = false;
  let checkoutError = "";
  let isClosing = false;
  let isTransitioningToCheckout = false;
  let cartTotalUnsubscribe: (() => void) | null = null;
  let cartPromoTotalUnsubscribe: (() => void) | null = null;
  let cartTotal = 0;
  let cartPromoTotal = 0;

  // Animation
  let cartContainer: HTMLElement;
  let hasTriggeredInitialZipper = false;

  // Subscribe to cart changes
  let unsubscribe: (() => void) | null = null;

  // Helper function to create unique key for cart items
  function getItemKey(item: any): string {
    return `${item.groupHash}_${item.productIndex}`;
  }

  // Smart enrichment function - only fetches new items
  async function updateEnrichedItems(newCartItems: any[]) {
    const newEnrichedItems: any[] = [];
    
    for (const item of newCartItems) {
      const itemKey = getItemKey(item);
      
      // Check if we already have this item enriched
      if (enrichmentCache.has(itemKey)) {
        // Update existing enriched item with new quantity/note
        const cachedItem = enrichmentCache.get(itemKey)!;
        const updatedItem = {
          ...cachedItem,
          quantity: item.quantity,
          note: item.note,
          timestamp: item.timestamp
        };
        enrichmentCache.set(itemKey, updatedItem);
        newEnrichedItems.push(updatedItem);
      } else {
        // New item - fetch product details
        try {
          const product = await fetchProductDetails(
            item.groupHash,
            item.productIndex,
          );
          const enrichedItem = {
            ...item,
            productDetails: product,
          };
          enrichmentCache.set(itemKey, enrichedItem);
          newEnrichedItems.push(enrichedItem);
        } catch (e) {
          console.error(`Failed to load product ${item.groupHash}_${item.productIndex}:`, e);
          const enrichedItem = {
            ...item,
            productDetails: {
              name: "Unknown Product",
              price: 0,
              size: "N/A",
              image_url: "",
            },
          };
          enrichmentCache.set(itemKey, enrichedItem);
          newEnrichedItems.push(enrichedItem);
        }
      }
    }
    
    // Clean up cache for items no longer in cart
    const currentKeys = new Set(newCartItems.map(getItemKey));
    for (const cachedKey of enrichmentCache.keys()) {
      if (!currentKeys.has(cachedKey)) {
        enrichmentCache.delete(cachedKey);
      }
    }
    
    enrichedCartItems = newEnrichedItems;
  }

  onMount(() => {
    if (
      $cartServiceStore &&
      typeof $cartServiceStore.subscribe === "function"
    ) {
      unsubscribe = $cartServiceStore.subscribe(async (items) => {
        // Filter out any invalid items - ones with no groupHash
        cartItems = (items || []).filter((item) => item && item.groupHash);

        // Use smart enrichment - only fetch new items
        await updateEnrichedItems(cartItems);

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
    if (cartContainer) AnimationService.stopCartZipper(cartContainer);

    // Wait for animation to complete, then close
    setTimeout(() => {
      onClose();
      isClosing = false;
    }, AnimationService.getAnimationDuration("smooth"));
  }

  // Start checkout flow
  function startCheckout() {
    isTransitioningToCheckout = true;
    if (cartContainer) AnimationService.stopCartZipper(cartContainer);

    setTimeout(() => {
      isShowingCheckoutFlow = true;
      isTransitioningToCheckout = false;
    }, AnimationService.getAnimationDuration("smooth"));
  }

  // Handle checkout success
  function handleCheckoutSuccess() {
    closeCart();
  }

  // Close checkout flow - simple switch back to cart
  function closeCheckoutFlow() {
    // Simple immediate switch - CheckoutFlow handles its own exit animation
    isShowingCheckoutFlow = false;
    // Reset flag so zipper animation can trigger when returning to cart
    hasTriggeredInitialZipper = false;
  }


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

  // Trigger zipper animation ONLY on initial cart load
  $: if (!isLoading && enrichedCartItems.length > 0 && cartContainer && !hasTriggeredInitialZipper) {
    AnimationService.startCartZipper(cartContainer);
    hasTriggeredInitialZipper = true;
    
    // Remove the animation class after it completes to prevent re-animation on DOM changes
    setTimeout(() => {
      if (cartContainer) {
        cartContainer.classList.remove('zipper-enter');
      }
    }, AnimationService.getAnimationDuration('smooth'));
  }
</script>

{#if isOpen}
  <div
    class="overlay {isClosing ? 'fade-out pointer-events-none' : 'fade-in'}"
    use:clickable={closeCart}
  >
    <div
      class="cart-container {isClosing ? 'slide-out-right' : 'slide-in-right'}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-title"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      {#if isShowingCheckoutFlow && $cartServiceStore}
        <CheckoutFlow
          cartService={$cartServiceStore}
          cartItems={enrichedCartItems}
          onClose={closeCheckoutFlow}
          isClosingCart={isClosing}
          on:checkout-success={handleCheckoutSuccess}
        />
      {:else}
        <CartHeader
          onClose={closeCart}
          isClosing={isClosing || isTransitioningToCheckout}
        />

        <div class="cart-content">
          <div class="cart-main">
            <div class="cart-main-header">
              <div
                class="cart-title {isClosing
                  ? 'slide-out-left'
                  : isTransitioningToCheckout
                    ? 'slide-out-left'
                    : 'slide-in-left'}"
                id="cart-title"
              >
                Cart ({enrichedCartItems.length} item{enrichedCartItems.length !== 1
                  ? "s"
                  : ""})
              </div>
              <div
                class="clear-cart-btn-wrapper {isClosing
                  ? 'slide-out-right'
                  : isTransitioningToCheckout
                    ? 'slide-out-right'
                    : 'slide-in-right'}"
              >
                <button
                  class="clear-cart-btn btn btn-text"
                  on:click={clearCart}
                >
                  Clear this cart
                </button>
              </div>
            </div>

            <!-- UPDATED: Price display using PriceService -->
            <div
              class="cart-totals-section {isClosing
                ? 'slide-out-left'
                : isTransitioningToCheckout
                  ? 'slide-out-left'
                  : 'slide-in-left'}"
            >
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

            <div class="cart-items" bind:this={cartContainer}>
              {#if isLoading}
                <div class="loading">Loading cart items...</div>
              {:else if enrichedCartItems.length === 0}
                <div class="empty-cart">
                  <Frown size={48} class="empty-cart-icon" />
                  <span class="empty-cart-text">Your cart is empty</span>
                </div>
              {:else}
                {#each [...enrichedCartItems]
                  .filter((item) => item && item.groupHash && item.productDetails)
                  .sort((a, b) => safeCompare(a.groupHash, b.groupHash) || a.productIndex - b.productIndex) as item (`${item.groupHash}_${item.productIndex}`)}
                  <UnifiedCartItem
                    product={item.productDetails}
                    quantity={item.quantity}
                    groupHash={item.groupHash}
                    productIndex={item.productIndex}
                    note={item.note}
                    variant="cart"
                  />
                {/each}
              {/if}

              {#if checkoutError}
                <div class="error-message">
                  {checkoutError}
                </div>
              {/if}
            </div>

            <div class="checkout-button-container {isClosing
              ? 'slide-out-down'
              : isTransitioningToCheckout
                ? 'slide-out-down'
                : 'slide-in-up'}">
              <button
                class="checkout-button btn btn-primary btn-lg"
                disabled={enrichedCartItems.length === 0}
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
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--overlay-dark);
    z-index: var(--z-index-highest);
  }

  .overlay.fade-in {
    animation: fadeIn var(--transition-smooth) ease-out forwards;
  }

  .overlay.fade-out {
    animation: fadeOut var(--transition-smooth) ease-in forwards;
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
    overflow: hidden;
  }

  .cart-container.slide-in-right {
    animation: slideInRight var(--transition-normal) ease-out forwards;
  }

  .cart-container.slide-out-right {
    animation: slideOutRight var(--transition-normal) ease-in forwards;
  }

  .cart-content {
    flex: 1;
    overflow: hidden;
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

  .clear-cart-btn {
    color: var(--error);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .clear-cart-btn:hover {
    background-color: rgba(211, 47, 47, 0.1);
    color: var(--error);
    text-decoration: underline;
  }

  .cart-items {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-sm) var(--spacing-lg) 0 var(--spacing-lg);
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
  }

  .empty-cart :global(.empty-cart-icon) {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .empty-cart-text {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
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
    margin-top: calc(-1 * var(--border-width-thin));
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

  .pointer-events-none {
    pointer-events: none;
  }
</style>
