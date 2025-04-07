<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { ShoppingCart } from "lucide-svelte";
  import CategoryReportsAdmin from "./CategoryReportsAdmin.svelte";
  import SearchBar from "./SEARCH/SearchBar.svelte";

  // Get the store for UI props
  const { getStore } = getContext("store");
  const store = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  export let currentView: "active" | "checked-out" = "active";
  export let isCartOpen = false;
  export let standAlone = false;
  export let activeBoard = undefined; // Keep for interface compatibility
  export let cartTotal = 0; // This prop is passed from TalkingStickiesPane

  $: uiProps = store.uiProps;

  function toggleCart() {
    isCartOpen = !isCartOpen;
  }

  let showCategoryAdmin = false;
</script>

<div class="header-container">
  <div class="left-section">
    {#if $uiProps && $uiProps.showMenu}
      <button
        class="menu-btn menu-close"
        on:click={() => store.setUIprops({ showMenu: false })}
        title="Hide Board Menu"
      >
        <span>✕</span>
      </button>
    {:else}
      <button
        class="menu-btn menu-open"
        on:click={() => store.setUIprops({ showMenu: true })}
        title="Show Board Menu"
      >
        <span>≡</span>
      </button>
    {/if}

    {#if standAlone && activeBoard}
      <h2 class="board-title">{activeBoard.name}</h2>
    {/if}
  </div>

  <div class="center-section">
    <button
      class="view-toggle"
      on:click={() => {
        currentView = currentView === "active" ? "checked-out" : "active";
      }}
    >
      {currentView === "active" ? "View Checked Out Carts" : "Go Back To Store"}
    </button>

    <div class="search-container">
      <SearchBar
        {store}
        productCache={store.productCache}
        on:select={({ detail }) =>
          store.setUIprops({
            searchMode: true,
            searchQuery: detail.originalQuery,
            productName: detail.productName,
            selectedProductHash: detail.hash,
            fuseResults: null,
            isViewAll: false,
          })}
        on:viewAll={({ detail }) =>
          store.setUIprops({
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
    <div class="data-controls">
      <button
        class="action-button"
        on:click={() => store.productStore?.fetchAllProducts()}
      >
        Fetch Products
      </button>
      <button
        class="action-button"
        on:click={() => store.productStore?.loadFromSavedData()}
      >
        Load Saved Data
      </button>
    </div>

    <button class="cart-button" on:click={toggleCart} title="Shopping Cart">
      <ShoppingCart size={20} color="#ffffff" />
      <span class="cart-total">${cartTotal.toFixed(2)}</span>
    </button>

    <button
      class="tool-button admin-btn"
      on:click={() => (showCategoryAdmin = true)}
      title="Category Admin"
    >
      <span>🏷️</span>
    </button>

    <a
      href="https://github.com/holochain-apps/talking-stickies/issues"
      class="tool-button"
      title="Report a problem in our GitHub repo"
      target="_blank"
    >
      <span>🐞</span>
    </a>
  </div>
</div>

{#if showCategoryAdmin}
  <div class="admin-overlay">
    <CategoryReportsAdmin {store} onClose={() => (showCategoryAdmin = false)} />
  </div>
{/if}

<style>
  .header-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 1000;
  }

  .left-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .center-section {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    justify-content: center;
    max-width: 800px;
  }

  .right-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .menu-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    background: transparent;
  }

  .menu-close {
    background: rgb(77, 123, 214);
    border: 1px solid rgb(76, 106, 167);
  }

  .menu-open {
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
  }

  .view-toggle {
    padding: 8px 14px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.2s;
  }

  .view-toggle:hover {
    background: #f5f5f5;
  }

  .search-container {
    flex: 1;
    max-width: 600px;
  }

  .data-controls {
    display: flex;
    gap: 8px;
  }

  .action-button {
    padding: 6px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
  }

  .action-button:hover {
    background: #f5f5f5;
  }

  .cart-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1a8b51;
    border: 2px solid rgb(32, 200, 51);
    color: white;
    border-radius: 20px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 600;
    transition: background-color 0.2s;
  }

  .cart-button:hover {
    background: #1a8b51;
    border: 2px solid rgb(32, 200, 51);
  }

  .cart-total {
    font-size: 14px;
    color: white;
  }

  .tool-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: white;
    border: 1px solid #e0e0e0;
    cursor: pointer;
    color: inherit;
    text-decoration: none;
  }

  .tool-button:hover {
    background: #f5f5f5;
  }

  .admin-btn {
    background-color: #f8f8f8;
  }

  .board-title {
    margin: 0;
    font-size: 16px;
    color: #333;
    white-space: nowrap;
  }

  .admin-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2000;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    overflow-y: auto;
  }
</style>
