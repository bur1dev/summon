<script lang="ts">
  import { getContext, onMount } from "svelte";
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
    fuseResultsStore,
    isViewAllStore,
    setSearchState,
    showMenuStore,
  } from "./UiStateStore";

  // Get the store for UI props
  const { getStore } = getContext("store");
  const store = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

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
  let unsubscribeCartTotal;

  onMount(() => {
    // Wait for client to be initialized
    if (store && store.myAgentPubKey) {
      myAgentPubKey = store.myAgentPubKey;
      myAgentPubKeyB64 = encodeHashToBase64(myAgentPubKey);
      avatarLoaded = true;
      console.log("Agent pubkey loaded:", myAgentPubKeyB64);
    }

    // Subscribe to cart total
    if ($cartService) {
      unsubscribeCartTotal = $cartService.cartTotal.subscribe((total) => {
        cartTotal = total;
      });
    }

    return () => {
      if (unsubscribeCartTotal) unsubscribeCartTotal();
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
    <button class="menu-button" on:click={toggleMenu} title="Menu">
      <Menu size={24} color="#343538" />
    </button>

    <!-- Logo image -->
    <img src="./logo.png" alt="SUMN." class="app-logo" />
  </div>

  <div class="center-section">
    <div class="search-container">
      <SearchBar
        {store}
        productCache={store.productCache}
        on:select={({ detail }) =>
          setSearchState({
            searchMode: true,
            searchQuery: detail.originalQuery,
            productName: detail.productName,
            selectedProductHash: detail.hash,
            fuseResults: null,
            isViewAll: false,
          })}
        on:viewAll={({ detail }) =>
          setSearchState({
            searchMode: true,
            searchQuery: detail.query,
            fuseResults: detail.fuseResults || [],
            isViewAll: detail.isViewAll || false,
            selectedProductHash: null,
            productName: "",
          })}
      />
    </div>
  </div>

  <div class="right-section">
    <!-- View toggle button -->
    <button
      class="view-toggle"
      on:click={() => {
        $currentViewStore =
          $currentViewStore === "active" ? "checked-out" : "active";
      }}
    >
      {$currentViewStore === "active"
        ? "View Checked Out Carts"
        : "Go Back To Store"}
    </button>

    <button class="cart-button" on:click={toggleCart} title="Shopping Cart">
      <ShoppingCart size={30} color="#ffffff" />
      <span class="cart-total">${cartTotal.toFixed(2)}</span>
    </button>
  </div>
</div>

<!-- Sidebar Menu Component -->
<SidebarMenu {store} {myAgentPubKeyB64} {avatarLoaded} />

<style>
  .header-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 72px;
    background: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 1000;
  }

  .left-section {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 250px; /* Match sidebar width */
    padding-left: 16px;
  }

  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 8px;
    transition: background-color 0.2s;
  }

  .menu-button:hover {
    background-color: #f5f5f5;
  }

  .app-logo {
    height: 60px;
    width: auto;
  }

  .view-toggle,
  .cart-button {
    padding: 0 14px;
    height: 48px;
  }

  .center-section {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    justify-content: flex-start;
  }

  .right-section {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 16px;
  }

  .view-toggle {
    padding: 8px 14px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    cursor: pointer;
    font-size: 16px;
    white-space: nowrap;
    transition: background-color 0.2s;
  }

  .view-toggle:hover {
    background: #f5f5f5;
  }

  .search-container {
    flex: 1;
    max-width: 700px;
  }

  /* Style the search input within the container */
  .search-container :global(input) {
    border-radius: 8px !important;
    height: 48px !important;
    font-size: 16px !important;
  }

  .cart-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgb(61, 61, 61);
    border: none;
    color: white;
    border-radius: 20px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 600;
    transition: background-color 0.2s;
  }

  .cart-button:hover {
    background: rgb(98, 98, 98);
    border: none;
  }

  .cart-total {
    font-size: 16px;
    color: white;
  }
</style>
