<!-- Original content with fixed fetchProductDetails function -->
<script lang="ts">
  import { getContext, onMount } from "svelte";
  import CartHeader from "./CartHeader.svelte";
  import ProductCartItem from "./ProductCartItem.svelte";
  import CheckoutFlow from "./CheckoutFlow.svelte";
  import { decodeHashFromBase64, encodeHashToBase64 } from "@holochain/client";
  import { decode } from "@msgpack/msgpack";
  import { X } from "lucide-svelte";

  // Props
  export let isOpen = false;
  export let onClose = () => {};

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  // Get the store for product info
  const { getStore } = getContext("store");
  const store = getStore();
  const productStore = store?.productStore;

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
      unsubscribe = $cartService.subscribe(async (items) => {
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
    } else {
      console.warn("Cart service not available in SlideOutCart");
      cartItems = [];
      isLoading = false;
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  // Product fetching - FIXED: Handle undefined hashB64
  async function fetchProductDetails(groupHashB64, productIndex) {
    try {
      if (!groupHashB64) {
        console.error("Missing groupHash - cannot fetch product details");
        return {
          name: "Invalid Product",
          price: 0,
          size: "N/A",
          image_url: "",
        };
      }

      if (store && store.productStore && store.productStore.client) {
        try {
          let groupHashBase64 = groupHashB64;
          if (typeof groupHashB64 === "string" && groupHashB64.includes(",")) {
            // It's a comma-separated string, convert to proper base64
            const byteArray = new Uint8Array(
              groupHashB64.split(",").map(Number),
            );
            groupHashBase64 = encodeHashToBase64(byteArray);
          }

          const groupHash = decodeHashFromBase64(groupHashBase64);
          const result = await store.productStore.client.callZome({
            role_name: "grocery",
            zome_name: "products",
            fn_name: "get_product_group",
            payload: groupHash,
          });

          if (result) {
            const group = decode(result.entry.Present.entry);

            if (group && group.products && group.products[productIndex]) {
              return group.products[productIndex];
            }
          }
        } catch (error) {
          console.error("Error fetching product details:", error);
        }
      }

      // If we got here, fallback to generic data
      return {
        name: "Product",
        price: 0,
        size: "N/A",
        image_url: "",
      };
    } catch (e) {
      console.error("Error fetching product:", e);
      return {
        name: "Unknown Product",
        price: 0,
        size: "N/A",
        image_url: "",
      };
    }
  }

  // Calculate cart total - using the cart service's total
  let cartTotal = 0;
  $: if ($cartService) {
    $cartService.cartTotal.subscribe((total) => {
      cartTotal = total;
    });
  }

  // Clear cart
  async function clearCart() {
    try {
      if ($cartService) {
        // Remove all items by setting quantity to 0
        for (const item of cartItems) {
          if (item && item.groupHash) {
            await $cartService.addToCart(item.groupHash, item.productIndex, 0);
          }
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
    onClose();
  }

  // Close checkout flow
  function closeCheckoutFlow() {
    isShowingCheckoutFlow = false;
  }

  // Get the client for checkout component
  $: client = $cartService ? $cartService.client : null;

  // Safe compare function for sorting
  function safeCompare(a, b) {
    // Handle undefined values
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    // Compare strings
    return String(a).localeCompare(String(b));
  }
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
            <button class="delete-cart-btn" on:click={clearCart}>
              <X size={20} color="#343538" />
            </button>
          </div>

          <div class="cart-items">
            {#if isLoading}
              <div class="loading">Loading cart items...</div>
            {:else if cartItems.length === 0}
              <div class="empty-cart">Your cart is empty</div>
            {:else}
              <!-- FIXED: Safe sorting of cart items -->
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
    background: rgb(61, 61, 61);
    border: none;
    color: white;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: background-color 0.2s;
  }

  .checkout-button:hover:not([disabled]) {
    background: rgb(98, 98, 98);
  }

  .checkout-button[disabled] {
    background: #cccccc;
    border-color: #bbbbbb;
    cursor: not-allowed;
    opacity: 0.7;
  }
</style>
