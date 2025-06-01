<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { StoreContext } from "./store";
  import type { Writable } from "svelte/store";
  import type { CartBusinessService } from "./cart/CartBusinessService";
  import { encodeHashToBase64 } from "@holochain/client";
  import { ShoppingCart, Menu } from "lucide-svelte";
  import SearchBar from "./search/SearchBar.svelte";
  import SidebarMenu from "./SidebarMenu.svelte";
  import {
    currentViewStore,
    isCartOpenStore,
    searchModeStore,
    searchQueryStore,
    productNameStore,
    selectedProductHashStore,
    searchResultsStore,
    isViewAllStore,
    setSearchState,
    showMenuStore,
  } from "./UiStateStore";

  // Get the store for UI props
  const { getStore } = getContext<StoreContext>("store");
  const store = getStore();

  // Get cart service store from the context
  const cartServiceStore =
    getContext<Writable<CartBusinessService | null>>("cartService");

  // Get profiles store from context
  const profilesStore = getContext("profiles-store");

  // These now come from the UiStateStore
  export let standAlone = false;
  export let cartTotal = 0; // This prop is passed from Controller, but we'll use the cart service value

  // Get current agent pubkey and encode it
  let myAgentPubKey;
  let myAgentPubKeyB64;
  let avatarLoaded = false;

  // Subscribe to cart total from cart service
  let unsubscribeCartTotal: (() => void) | null = null;
  let uniqueItemCount = 0;
  let unsubscribeUniqueItemCount: (() => void) | null = null;

  // Subscription to the cartServiceStore itself
  let unsubscribeCartServiceStore: (() => void) | null = null;
  let currentCartServiceInstance: CartBusinessService | null = null;

  onMount(() => {
    // Agent pubkey logic
    if (store && store.myAgentPubKey) {
      myAgentPubKey = store.myAgentPubKey;
      myAgentPubKeyB64 = encodeHashToBase64(myAgentPubKey);
      avatarLoaded = true;
      console.log("Agent pubkey loaded:", myAgentPubKeyB64);
    }

    // Cart service subscription logic
    if (cartServiceStore) {
      unsubscribeCartServiceStore = cartServiceStore.subscribe(
        (serviceInstance) => {
          currentCartServiceInstance = serviceInstance;

          // Clean up previous subscriptions to cartTotal and uniqueItemCount
          if (unsubscribeCartTotal) {
            unsubscribeCartTotal();
            unsubscribeCartTotal = null;
          }
          if (unsubscribeUniqueItemCount) {
            unsubscribeUniqueItemCount();
            unsubscribeUniqueItemCount = null;
          }

          if (currentCartServiceInstance) {
            unsubscribeCartTotal =
              currentCartServiceInstance.cartTotal.subscribe((total) => {
                cartTotal = total;
              });
            unsubscribeUniqueItemCount =
              currentCartServiceInstance.uniqueItemCount.subscribe((count) => {
                uniqueItemCount = count;
              });
          } else {
            // Service is not available (e.g., null), reset dependent values
            cartTotal = 0;
            uniqueItemCount = 0;
          }
        },
      );
    }

    return () => {
      // Cleanup all subscriptions
      if (unsubscribeCartServiceStore) unsubscribeCartServiceStore();
      if (unsubscribeCartTotal) unsubscribeCartTotal();
      if (unsubscribeUniqueItemCount) unsubscribeUniqueItemCount();
    };
  });

  $: uiProps = store.uiProps;

  function toggleCart() {
    $isCartOpenStore = !$isCartOpenStore;
  }

  function toggleMenu() {
    $showMenuStore = !$showMenuStore;
  }
</script>

<div class="header-container">
  <div class="left-section">
    <!-- Hamburger menu button -->
    <button
      class="menu-button btn btn-icon btn-icon-primary"
      on:click={toggleMenu}
      title="Menu"
    >
      <Menu size={24} color="white" />
    </button>

    <!-- Logo text -->
    <span class="app-logo">SUMN.</span>
  </div>

  <div class="center-section">
    <div class="search-container">
      <SearchBar
        {store}
        productCache={store.productStore}
        on:select={({ detail }) =>
          setSearchState({
            searchMode: true,
            searchQuery: detail.originalQuery,
            productName: detail.productName,
            selectedProductHash: detail.hash,
            searchResults: detail.fuseResults || [],
            isViewAll: false,
            searchMethod: "product_selection",
          })}
        on:viewAll={({ detail }) =>
          setSearchState({
            searchMode: true,
            searchQuery: detail.query,
            searchResults: detail.fuseResults || [],
            isViewAll: detail.isViewAll || false,
            selectedProductHash: null,
            productName: "",
            searchMethod: detail.searchMethod || "",
          })}
      />
    </div>
  </div>

  <div class="right-section">
    <!-- View toggle button -->
    <button
      class="view-toggle btn btn-secondary btn-md"
      on:click={() => {
        $currentViewStore =
          $currentViewStore === "active" ? "checked-out" : "active";
      }}
    >
      {$currentViewStore === "active"
        ? "View Checked Out Carts"
        : "Go Back To Store"}
    </button>

    <button
      class="cart-button btn btn-primary btn-md"
      on:click={toggleCart}
      title="Shopping Cart"
    >
      <span class="item-count">{uniqueItemCount}</span>
      <ShoppingCart size={30} color="#ffffff" />
      <span class="cart-total">${cartTotal.toFixed(2)}</span>
    </button>
  </div>
</div>

<style>
  .header-container {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    height: var(--component-header-height);
    background: var(--background);
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: var(--shadow-subtle);
    z-index: var(--z-index-modal);
    padding-left: var(--sidebar-width-category);
  }

  .left-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    width: var(--sidebar-width-category);
    position: absolute;
    left: 0;
    padding-left: var(--spacing-md);
    box-sizing: border-box;
  }

  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--btn-height-md);
    height: var(--btn-height-md);
  }

  .app-logo {
    font-size: var(--font-size-xl, 35px);
    font-weight: var(--font-weight-bold, 700);
    color: var(--text-primary, #ffffff);
    padding-left: var(--spacing-xs);
  }

  .view-toggle,
  .cart-button {
    width: 235px;
    height: var(--btn-height-md);
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    white-space: nowrap;
    box-sizing: border-box;
    padding: 0;
  }

  .view-toggle {
    justify-content: center;
    padding: 0 var(--spacing-sm);
  }

  .cart-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .center-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex: 1;
    justify-content: flex-start;
    padding-left: var(--spacing-md);
    padding-right: var(--spacing-md);
  }

  .right-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding-right: var(--spacing-md);
  }

  .search-container {
    flex: 1;
    height: var(--btn-height-md);
    width: 100%;
    max-width: 100%;
  }

  .search-container :global(input) {
    border-radius: var(--btn-border-radius) !important;
    height: var(--btn-height-md) !important;
    font-size: var(--font-size-md) !important;
    border: var(--border-width-thin) solid var(--border) !important;
    transition: var(--btn-transition) !important;
    box-sizing: border-box !important;
  }

  .search-container :global(input:focus) {
    border-color: var(--primary) !important;
    box-shadow: var(--shadow-subtle) !important;
  }

  .item-count {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--btn-icon-size-sm);
    height: var(--btn-icon-size-sm);
    min-width: var(--btn-icon-size-sm);
    background-color: rgba(0, 0, 0, 0.15);
    color: var(--button-text);
    border-radius: 50%;
    font-size: var(--font-size-md);
    position: absolute;
    left: calc(50% - 100px);
  }

  .cart-total {
    font-size: var(--font-size-md);
    color: var(--button-text);
    white-space: nowrap;
    position: absolute;
    right: calc(50% - 100px);
  }
</style>
