<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { ShoppingCart, X } from "lucide-svelte";
  import { loadOrders, returnToShopping as returnOrderToShopping, getOrderAddress } from "../../services/OrdersService";
  import { currentViewStore } from "../../../stores/UiOnlyStore";
  import OrderCard from "./OrderCard.svelte";


  // Get the store for the client
  const storeContext = getContext<import("../../../store").StoreContext>("store");
  const store = storeContext.getStore();

  // State
  let isLoading = true;
  let checkedOutCarts: any[] = [];
  let errorMessage = "";
  let isClosing = false;
  let addressCache: Record<string, any> = {}; // Cache for securely fetched addresses

  onMount(() => {

    // Load checked out carts
    loadCheckedOutCarts().catch((error) => {
      console.error("Error loading checked out carts:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorMessage = "Failed to load checked out carts: " + errorMsg;
      isLoading = false;
    });

  });

  async function loadCheckedOutCarts() {
    try {
      isLoading = true;
      errorMessage = "";

      // Use functional OrdersService
      const result = await loadOrders();

      if (result.success) {
        checkedOutCarts = result.data || [];
        console.log("Loaded checked out carts:", checkedOutCarts);
        
        // Fetch addresses securely for each order
        await loadOrderAddresses();
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

  // Securely fetch addresses for all orders
  async function loadOrderAddresses() {
    const newAddressCache: Record<string, any> = {};
    
    for (const cart of checkedOutCarts) {
      try {
        const addressResult = await getOrderAddress(cart.cartHash);
        if (addressResult.success) {
          newAddressCache[cart.cartHash] = addressResult.data;
          console.log(`Loaded address for order ${cart.cartHash}`);
        } else {
          console.warn(`Failed to load address for order ${cart.cartHash}:`, addressResult.message);
        }
      } catch (error) {
        console.warn(`Error loading address for order ${cart.cartHash}:`, error);
      }
    }
    
    addressCache = newAddressCache;
  }

  // Function to return a cart to shopping
  async function returnToShopping(item: any) {
    try {
      console.log("Returning cart to shopping:", item.id);

      // Use functional OrdersService
      const result = await returnOrderToShopping(item.cartHash);

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
          <OrderCard 
            {item} 
            addressCache={addressCache} 
            agentPubKey={store?.myAgentPubKeyB64}
            on:returnToShopping={() => returnToShopping(item)}
          />
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
    right: var(--spacing-md);
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

  .loading {
    display: flex;
    justify-content: center;
    padding: var(--spacing-xl);
    font-size: var(--btn-font-size-md);
    color: var(--text-secondary);
  }
</style>