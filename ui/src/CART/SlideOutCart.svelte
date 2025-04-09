<script lang="ts">
  import { getContext, onMount } from "svelte";
  import CartHeader from "./CartHeader.svelte";
  import ProductCartItem from "./ProductCartItem.svelte";
  import CheckoutFlow from "./CheckoutFlow.svelte";
  import { decodeHashFromBase64 } from "@holochain/client";

  // Props
  export let isOpen = false;
  export let onClose = () => {};

  // Get cart service directly from the context
  const cartService = getContext("cartService");
  console.log(
    "SlideOutCart - cartService:",
    $cartService ? "AVAILABLE" : "MISSING",
  );

  // Get the store for product info
  const { getStore } = getContext("store");
  const store = getStore();
  const productStore = store?.productStore;

  console.log("SlideOutCart - store object:", store ? "AVAILABLE" : "MISSING");
  console.log(
    "SlideOutCart - productStore:",
    productStore ? "AVAILABLE" : "MISSING",
  );

  // State
  let cartItems = [];
  let productDetails = {};
  let isLoading = true;
  let isCheckingOut = false;
  let isShowingCheckoutFlow = false;
  let checkoutError = "";

  // Subscribe to cart changes
  let unsubscribe;

  onMount(async () => {
    if ($cartService && typeof $cartService.subscribe === "function") {
      console.log("Setting up cart subscription in SlideOutCart");

      unsubscribe = $cartService.subscribe(async (items) => {
        cartItems = items || [];
        console.log("Cart items updated:", cartItems.length);

        // Fetch product details for each item if not already loaded
        for (const item of items) {
          if (!productDetails[item.productHash]) {
            try {
              const product = await fetchProductDetails(item.productHash);
              productDetails[item.productHash] = product;
            } catch (e) {
              console.error(`Failed to load product ${item.productHash}:`, e);
              productDetails[item.productHash] = {
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
    } else {
      console.warn("Cart service not available in SlideOutCart");
      cartItems = [];
      isLoading = false;
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  // Product fetching
  async function fetchProductDetails(hashB64) {
    console.log("Fetching product details for:", hashB64);
    try {
      // Try direct product lookup from internal data
      if (
        store &&
        store.productStore &&
        typeof store.productStore.getProductByHash === "function"
      ) {
        console.log("Using store.productStore.getProductByHash");

        try {
          const hash = decodeHashFromBase64(hashB64);
          console.log("Decoded hash successfully:", !!hash);
          console.log("Calling getProductByHash with:", hash);
          const product = await store.productStore.getProductByHash(hash);
          console.log("Product fetch result:", product);
          return product;
        } catch (error) {
          console.error("Error using getProductByHash:", error);
        }
      }

      // If we got here, fallback to generic data
      console.log("Using fallback product data (lookup failed)");
      return {
        name: "Product " + hashB64.substring(0, 8),
        price: 9.99,
        size: "Standard",
        image_url: "",
      };
    } catch (e) {
      console.error("Error fetching product:", e);
      console.error("Error details:", e.message);
      return {
        name: "Unknown Product",
        price: 0,
        size: "N/A",
        image_url: "",
      };
    }
  }

  // Calculate cart total
  $: cartTotal = cartItems.reduce((total, item) => {
    const product = productDetails[item.productHash];
    return total + (product?.price || 0) * item.quantity;
  }, 0);

  // Clear cart
  async function clearCart() {
    try {
      if ($cartService) {
        // Remove all items by setting quantity to 0
        for (const item of cartItems) {
          await $cartService.addToCart(item.productHash, 0);
        }
      }
      onClose();
    } catch (error) {
      console.error("Error clearing cart:", error);
    }
  }

  // Start checkout flow
  function startCheckout() {
    isShowingCheckoutFlow = true;
  }

  // Handle checkout success
  function handleCheckoutSuccess(event) {
    console.log("Checkout success:", event.detail);
    onClose();
  }

  // Close checkout flow
  function closeCheckoutFlow() {
    isShowingCheckoutFlow = false;
  }

  // Get the client for checkout component
  $: client = $cartService ? $cartService.client : null;
</script>

<div class="overlay" class:visible={isOpen} on:click={onClose}>
  <div class="cart-container" class:open={isOpen} on:click|stopPropagation>
    {#if isShowingCheckoutFlow}
      <CheckoutFlow
        {client}
        cartService={$cartService}
        {cartItems}
        {productDetails}
        {cartTotal}
        onClose={closeCheckoutFlow}
        on:checkout-success={handleCheckoutSuccess}
      />
    {:else}
      <CartHeader {onClose} />

      <div class="cart-content">
        <div class="cart-main">
          <div class="cart-main-header">
            <div class="cart-title">
              Cart (Total: ${cartTotal.toFixed(2)})
            </div>
            <button class="delete-cart-btn" on:click={clearCart}>×</button>
          </div>

          <div class="cart-items">
            {#if isLoading}
              <div class="loading">Loading cart items...</div>
            {:else if cartItems.length === 0}
              <div class="empty-cart">Your cart is empty</div>
            {:else}
              <!-- Sort items by productHash to maintain consistent order -->
              {#each [...cartItems].sort( (a, b) => a.productHash.localeCompare(b.productHash), ) as item (item.productHash)}
                {#if productDetails[item.productHash]}
                  <ProductCartItem
                    product={productDetails[item.productHash]}
                    quantity={item.quantity}
                    productHash={item.productHash}
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
              class="checkout-button"
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
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    z-index: 2000;
  }

  .overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .cart-container {
    position: fixed;
    top: 0;
    right: -480px;
    width: 480px;
    height: 100vh;
    background: #ffffff;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
    transition: right 0.3s ease;
    display: flex;
    flex-direction: column;
    z-index: 2001;
  }

  .cart-container.open {
    right: 0;
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
    background-color: #ffffff;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .cart-main-header {
    padding: 15px 20px;
    position: sticky;
    top: 0;
    background: #ffffff;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e0e0e0;
  }

  .cart-title {
    font-size: 18px;
    font-weight: 600;
  }

  .delete-cart-btn {
    background: transparent;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0 5px;
  }

  .cart-items {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 10px 20px;
    min-height: 0;
  }

  .error-message {
    margin: 15px 0;
    padding: 10px;
    background-color: #ffebee;
    color: #c62828;
    border-radius: 4px;
    font-size: 14px;
  }

  .empty-cart {
    padding: 30px 0;
    text-align: center;
    color: #888;
    font-size: 16px;
  }

  .loading {
    padding: 30px 0;
    text-align: center;
    color: #888;
    font-size: 16px;
  }

  .checkout-button-container {
    padding: 20px;
    background: #ffffff;
    border-top: 1px solid #e0e0e0;
    margin-top: auto;
  }

  .checkout-button {
    width: 100%;
    padding: 14px;
    background: #1a8b51;
    border: 2px solid rgb(32, 200, 51);
    color: white;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: background-color 0.2s;
  }

  .checkout-button:hover:not([disabled]) {
    background: #156e40;
  }

  .checkout-button[disabled] {
    background: #cccccc;
    border-color: #bbbbbb;
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
