<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { ShoppingCart, ArrowLeft } from "lucide-svelte";
  import { writable, type Writable } from "svelte/store";

  // Get cart service directly from the context
  const cartService = getContext("cartService") as Writable<any>;

  let isLoading = true;
  let checkedOutCarts = [];
  let errorMessage = "";

  onMount(async () => {
    try {
      await loadCheckedOutCarts();
    } catch (error) {
      console.error("Error in onMount:", error);
      errorMessage = "Failed to load checked out carts: " + error.toString();
      isLoading = false;
    }
  });

  async function loadCheckedOutCarts() {
    try {
      isLoading = true;
      errorMessage = "";

      // Use SimpleCartService's loadCheckedOutCarts method
      const result = await $cartService.loadCheckedOutCarts();

      if (result.success) {
        checkedOutCarts = result.data || [];
        console.log("Loaded checked out carts:", checkedOutCarts.length);
      } else {
        console.error("Error loading checked out carts:", result.message);
        errorMessage = "Error loading checked out carts: " + result.message;
        checkedOutCarts = [];
      }

      isLoading = false;
    } catch (error) {
      console.error("Error loading checked out carts:", error);
      errorMessage = "Error loading checked out carts: " + error.toString();
      isLoading = false;
      checkedOutCarts = [];
    }
  }

  // Function to return a cart to shopping
  async function returnToShopping(item) {
    try {
      console.log("Returning cart to shopping:", item.id);

      // Use SimpleCartService's returnToShopping method
      const result = await $cartService.returnToShopping(item.cartHash);

      if (result.success) {
        // Refresh the list of checked-out carts
        await loadCheckedOutCarts();
        console.log("Cart returned to shopping:", item.id);
      } else {
        console.error("Error returning cart to shopping:", result.message);
        errorMessage = "Error returning cart to shopping: " + result.message;
      }
    } catch (error) {
      console.error("Error returning cart to shopping:", error);
      errorMessage = "Error returning cart to shopping: " + error.toString();
    }
  }
</script>

<div class="checkout-view">
  <div class="fixed-header">
    <h1>Checked Out Carts</h1>
    <p>These carts have been checked out and are in processing</p>
  </div>

  <div class="scrollable-content">
    {#if isLoading}
      <div class="loading">Loading checked out carts...</div>
    {:else if errorMessage}
      <div class="error-message">{errorMessage}</div>
    {:else if checkedOutCarts.length === 0}
      <div class="empty-state">
        <ShoppingCart size={64} color="#cccccc" />
        <h2>No Checked Out Carts</h2>
        <p>Your checked out carts will appear here.</p>
      </div>
    {:else}
      <div class="carts-grid">
        {#each checkedOutCarts as item}
          <div class="cart-card">
            <div class="cart-header">
              <h2>Cart ${item.total.toFixed(2)}</h2>
              <div class="cart-date">{item.createdAt}</div>
              <div class="cart-status">Status: {item.status}</div>
            </div>

            <div class="cart-items">
              {#each item.products as product}
                <div class="cart-product">
                  <div class="product-image">
                    {#if product.details?.image_url}
                      <img
                        src={product.details.image_url}
                        alt={product.details.name}
                      />
                    {/if}
                  </div>
                  <div class="product-details">
                    <div class="product-name">
                      {product.details?.name || "Unknown Product"}
                    </div>
                    <div class="product-size">
                      {product.details?.size || "Standard"}
                    </div>
                    <div class="product-quantity">
                      {product.quantity} × ${(
                        product.details?.price || 0
                      ).toFixed(2)}
                    </div>
                  </div>
                  <div class="product-price">
                    ${(
                      (product.details?.price || 0) * product.quantity
                    ).toFixed(2)}
                  </div>
                </div>
              {/each}
            </div>

            <button
              class="return-button"
              on:click={() => returnToShopping(item)}
            >
              <ArrowLeft size={16} />
              Return to Shopping
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .checkout-view {
    width: 100%;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    overflow: hidden;
    padding: 0;
  }

  .fixed-header {
    padding: 10px;
    text-align: center;
    background: white;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .fixed-header h1 {
    font-size: 24px;
    margin-bottom: 0px;
    color: #333;
  }

  .fixed-header p {
    color: #666;
    margin: 0;
    font-size: 15px;
  }

  .scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    height: 100%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    text-align: center;
    color: #666;
  }

  .empty-state h2 {
    margin: 20px 0 10px;
    font-size: 20px;
    color: #333;
  }

  .empty-state p {
    margin: 0;
  }

  .error-message {
    margin: 20px;
    padding: 15px;
    background-color: #ffebee;
    color: #c62828;
    border-radius: 4px;
    font-size: 14px;
    text-align: center;
  }

  .carts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 24px;
    padding-bottom: 40px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .cart-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .cart-header {
    padding: 16px;
    border-bottom: 1px solid #f0f0f0;
    background: #f9f9f9;
  }

  .cart-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .cart-date {
    font-size: 14px;
    color: #666;
    margin-top: 4px;
  }

  .cart-status {
    font-size: 14px;
    font-weight: 500;
    margin-top: 4px;
    color: #1a8b51;
  }

  .cart-items {
    padding: 16px;
    overflow-y: auto;
    max-height: 300px;
    flex: 1;
  }

  .cart-product {
    display: flex;
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
    align-items: center;
  }

  .product-image {
    width: 50px;
    height: 50px;
    margin-right: 16px;
    flex-shrink: 0;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .product-details {
    flex: 1;
    min-width: 0;
  }

  .product-name {
    font-weight: 500;
    margin-bottom: 4px;
    font-size: 15px;
  }

  .product-size {
    color: #666;
    font-size: 13px;
    margin-bottom: 2px;
  }

  .product-quantity {
    font-size: 13px;
    color: #666;
  }

  .product-price {
    font-weight: 600;
    font-size: 15px;
    margin-left: 12px;
  }

  .return-button {
    margin: 16px;
    padding: 10px 16px;
    background: #1a8b51;
    border: 2px solid rgb(32, 200, 51);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background-color 0.2s;
  }

  .return-button:hover {
    background: #156e40;
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 40px;
    font-size: 18px;
    color: #666;
  }
</style>
