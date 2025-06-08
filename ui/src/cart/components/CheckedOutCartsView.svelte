<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { ShoppingCart, ArrowLeft, MapPin, Clock, X } from "lucide-svelte";
  import type { Writable } from "svelte/store";
  import { AddressService } from "../services/AddressService";
  import { currentViewStore } from "../../stores/UiOnlyStore";
  import type { ShopStore } from "../../store"; // Adjust path if store.ts is elsewhere

  interface ControllerStoreContext {
    getStore: () => ShopStore;
  }

  // Import agent-avatar component
  import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

  // Get cart service directly from the context
  const cartService = getContext("cartService") as Writable<any>;

  // Get the store for the client
  const storeContext = getContext<ControllerStoreContext>("store");
  const store = storeContext.getStore();

  // Get profiles store from context
  const profilesStore = getContext("profiles-store");

  // Services
  let addressService: AddressService;

  // State
  let isLoading = true;
  let checkedOutCarts: any[] = [];
  let errorMessage = "";
  let addressCache = new Map();
  let isClosing = false;

  onMount(async () => {
    try {
      // Initialize address service to fetch address details
      if (store && store.client) {
        addressService = new AddressService(store.client);

        // Subscribe to addresses to populate cache
        const unsubscribe = addressService
          .getAddresses()
          .subscribe((addresses) => {
            addressCache = addresses;
          });
      }

      await loadCheckedOutCarts();
    } catch (error) {
      console.error("Error in onMount:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorMessage = "Failed to load checked out carts: " + errorMsg;
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
        console.log("Loaded checked out carts:", checkedOutCarts);
      } else {
        console.error("Error loading checked out carts:", result.message);
        errorMessage = "Error loading checked out carts: " + result.message;
        checkedOutCarts = [];
      }

      isLoading = false;
    } catch (error) {
      console.error("Error loading checked out carts:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorMessage = "Error loading checked out carts: " + errorMsg;
      isLoading = false;
      checkedOutCarts = [];
    }
  }

  // Function to return a cart to shopping
  async function returnToShopping(item: any) {
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorMessage = "Error returning cart to shopping: " + errorMsg;
    }
  }

  // Format status for display
  function formatStatus(status: any): string {
    switch (status) {
      case "processing":
        return "Processing";
      case "completed":
        return "Completed";
      case "returned":
        return "Returned to Cart";
      default:
        return status;
    }
  }

  // Get address from cache
  function getAddressFromCache(addressHash: any) {
    if (!addressHash) return null;
    return addressCache.get(addressHash);
  }

  // Go back to store view
  function goBackToStore() {
    isClosing = true;
    setTimeout(() => {
      $currentViewStore = "active";
      isClosing = false;
    }, 300); // Match animation duration
  }
</script>

<div
  class="checkout-view"
  class:fade-out={isClosing}
  class:fade-in={!isClosing}
>
  <div class="fixed-header">
    <button class="back-button" on:click={goBackToStore}>
      <X size={24} />
    </button>
    <h1>Checked Out Orders</h1>
    <p>View the status of your checked out orders</p>
  </div>

  <div class="scrollable-content">
    {#if isLoading}
      <div class="loading">Loading checked out orders...</div>
    {:else if errorMessage}
      <div class="error-message">{errorMessage}</div>
    {:else if checkedOutCarts.length === 0}
      <div class="empty-state scale-in">
        <ShoppingCart size={64} color="var(--border)" />
        <h2>No Checked Out Orders</h2>
        <p>Your checked out orders will appear here.</p>
      </div>
    {:else}
      <div class="carts-grid">
        {#each checkedOutCarts as item}
          <div class="cart-card scale-in">
            <div class="cart-header">
              <div class="order-info">
                {#if item.total}
                  {@const estimatedTax =
                    Math.round(item.total * 0.0775 * 100) / 100}
                  {@const orderTotal = item.total + estimatedTax}
                  <h2>Order ${orderTotal.toFixed(2)}</h2>
                  <div class="cart-pricing">
                    <span class="subtotal">Items: ${item.total.toFixed(2)}</span
                    >
                    <span class="tax">Tax: ${estimatedTax.toFixed(2)}</span>
                  </div>
                {:else}
                  <h2>Order</h2>
                {/if}
                <div class="cart-date">{item.createdAt}</div>
                <div class="cart-status status-{item.status}">
                  Status: {formatStatus(item.status)}
                </div>
              </div>

              <div class="agent-avatar-container">
                <agent-avatar
                  size="40"
                  agent-pub-key={store.myAgentPubKeyB64}
                  disable-tooltip={true}
                  disable-copy={true}
                ></agent-avatar>
              </div>
            </div>

            {#if item.addressHash || item.deliveryTime}
              <div class="delivery-details">
                {#if item.addressHash && addressCache.has(item.addressHash)}
                  {@const address = addressCache.get(item.addressHash)}
                  <div class="delivery-address">
                    <div class="delivery-icon">
                      <MapPin size={16} />
                    </div>
                    <div class="delivery-content">
                      <div class="delivery-label">Delivery Address:</div>
                      <div class="address-line">
                        {address.street}
                        {#if address.unit}
                          <span class="unit">{address.unit}</span>
                        {/if}
                      </div>
                      <div class="address-line">
                        {address.city}, {address.state}
                        {address.zip}
                      </div>
                    </div>
                  </div>
                {/if}

                {#if item.deliveryTime}
                  <div class="delivery-time">
                    <div class="delivery-icon">
                      <Clock size={16} />
                    </div>
                    <div class="delivery-content">
                      <div class="delivery-label">Delivery Time:</div>
                      <div>
                        {item.deliveryTime.date} at {item.deliveryTime.time}
                      </div>
                    </div>
                  </div>
                {/if}

                {#if item.deliveryInstructions}
                  <div class="delivery-instructions">
                    <div class="delivery-label">Instructions:</div>
                    <div>{item.deliveryInstructions}</div>
                  </div>
                {/if}
              </div>
            {/if}

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
    height: 100%;
    overflow: hidden;
    padding: 0;
  }

  .checkout-view.fade-in {
    animation: fadeIn var(--transition-normal) ease forwards;
  }

  .checkout-view.fade-out {
    animation: fadeOut var(--transition-normal) ease forwards;
  }

  .fixed-header {
    padding: var(--spacing-md);
    text-align: center;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    z-index: var(--z-index-sticky);
    box-shadow: var(--shadow-medium);
    border-radius: var(--card-border-radius);
    border-bottom: none;
    position: relative;
  }

  .fixed-header h1 {
    font-size: var(--spacing-xl);
    margin-bottom: 0;
    color: var(--button-text);
  }

  .fixed-header p {
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    font-size: var(--font-size-md);
  }

  .back-button {
    position: absolute;
    right: var(--spacing-md); /* Changed 'left' to 'right' */
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--btn-icon-size);
    height: var(--btn-icon-size);
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: var(--btn-transition);
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-50%) scale(var(--hover-scale));
  }

  :global(.back-button svg) {
    color: var(--button-text);
    stroke: var(--button-text);
  }

  .scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
    height: 100%;
    background-color: var(--surface);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xxxl) 0;
    text-align: center;
    color: var(--text-secondary);
    border-radius: var(--card-border-radius);
    box-shadow: var(--shadow-subtle);
    margin: var(--spacing-lg) auto;
    max-width: 500px;
    padding: var(--spacing-xxxl) var(--spacing-lg);
  }

  .scale-in {
    animation: scaleIn var(--transition-normal) ease forwards;
  }

  .empty-state h2 {
    margin: var(--spacing-lg) 0 var(--spacing-sm);
    font-size: var(--spacing-lg);
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
  }

  .error-message {
    margin: var(--spacing-lg);
    padding: var(--spacing-md);
    background-color: rgba(211, 47, 47, 0.1);
    color: var(--error);
    border-radius: var(--card-border-radius);
    font-size: var(--font-size-sm);
    text-align: center;
    border-left: 3px solid var(--error);
  }

  .carts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: var(--spacing-xl);
    padding-bottom: var(--spacing-xl);
    max-width: 1400px;
    margin: 0 auto;
  }

  .cart-card {
    background: var(--background);
    border-radius: var(--card-border-radius);
    box-shadow: var(--shadow-medium);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: var(--card-transition);
  }

  .cart-card:hover {
    transform: translateY(var(--hover-lift));
    box-shadow: var(--shadow-medium);
  }

  .cart-header {
    padding: var(--spacing-md);
    border-bottom: var(--border-width-thin) solid var(--border);
    background: linear-gradient(
      135deg,
      rgba(86, 98, 189, 0.1),
      rgba(112, 70, 168, 0.1)
    );
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .order-info {
    flex: 1;
  }

  .cart-header h2 {
    margin: 0;
    font-size: var(--btn-font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .cart-date {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .cart-status {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    margin-top: 4px;
  }

  .agent-avatar-container {
    margin-left: var(--spacing-md);
    padding: 2px;
    border-radius: 50%;
    border: var(--border-width) solid var(--primary);
    box-shadow: var(--shadow-subtle);
    transition: var(--btn-transition);
  }

  .agent-avatar-container:hover {
    transform: scale(var(--hover-scale));
    box-shadow: var(--shadow-medium);
  }

  .status-processing {
    color: var(--warning);
  }

  .status-completed {
    color: var(--success);
  }

  .status-returned {
    color: var(--text-secondary);
  }

  .delivery-details {
    padding: var(--spacing-md);
    background-color: var(--surface);
    border-bottom: var(--border-width-thin) solid var(--border);
  }

  .delivery-address,
  .delivery-time {
    display: flex;
    margin-bottom: var(--spacing-sm);
  }

  .delivery-icon {
    margin-right: var(--spacing-sm);
    color: var(--primary);
  }

  :global(.delivery-icon svg) {
    color: var(--primary);
    stroke: var(--primary);
  }

  .delivery-content {
    flex: 1;
  }

  .delivery-label {
    font-weight: var(--font-weight-semibold);
    margin-bottom: 4px;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  .address-line {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .delivery-instructions {
    margin-top: var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background-color: var(--surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--btn-border-radius);
    border-left: var(--border-width) solid var(--primary);
  }

  .cart-items {
    padding: var(--spacing-md);
    overflow-y: auto;
    max-height: 300px;
    flex: 1;
  }

  .cart-product {
    display: flex;
    padding: var(--spacing-sm) 0;
    border-bottom: var(--border-width-thin) solid var(--border);
    align-items: center;
  }

  .product-image {
    width: 70px;
    height: 70px;
    margin-right: var(--spacing-md);
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--card-border-radius);
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: top;
  }

  .product-details {
    flex: 1;
    min-width: 0;
  }

  .product-name {
    font-weight: var(--font-weight-semibold);
    margin-bottom: 4px;
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  .product-size {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: 2px;
  }

  .product-quantity {
    font-size: var(--font-size-sm);
    color: var(--primary);
    font-weight: var(--font-weight-semibold);
  }

  .product-price {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-md);
    margin-left: var(--spacing-sm);
    color: var(--text-primary);
  }

  .return-button {
    margin: var(--spacing-md);
    height: var(--btn-height-md);
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    border: none;
    color: var(--button-text);
    border-radius: var(--btn-border-radius);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    transition: var(--btn-transition);
    box-shadow: var(--shadow-button);
  }

  .return-button:hover {
    background: linear-gradient(135deg, var(--primary-dark), var(--secondary));
    transform: translateY(var(--hover-lift));
    box-shadow: var(--shadow-medium);
  }

  :global(.return-button svg) {
    color: var(--button-text);
    stroke: var(--button-text);
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: var(--spacing-xl);
    font-size: var(--btn-font-size-md);
    color: var(--text-secondary);
  }

  .cart-pricing {
    display: flex;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    gap: var(--spacing-sm);
    margin-top: 4px;
  }
</style>
