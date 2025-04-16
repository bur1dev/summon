<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { encodeHashToBase64 } from "@holochain/client";
  import { ShoppingCart } from "lucide-svelte";
  import CategoryReportsAdmin from "./CategoryReportsAdmin.svelte";
  import SearchBar from "./SEARCH/SearchBar.svelte";
  import ProfileEditor from "./ProfileEditor.svelte";
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
  } from "./UiStateStore";

  // Import components
  import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

  // Get the store for UI props
  const { getStore } = getContext("store");
  const store = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  // Get profiles store from context
  const profilesStore = getContext("profiles-store");

  // These now come from the UiStateStore
  export let standAlone = false;
  export let cartTotal = 0; // This prop is passed from Controller

  // Get current agent pubkey and encode it
  let myAgentPubKey;
  let myAgentPubKeyB64;
  let avatarLoaded = false;

  // Reference to profile editor component
  let profileEditorComponent;

  // State for showing profile editor
  let showProfileEditor = false;

  onMount(() => {
    // Wait for client to be initialized
    if (store && store.myAgentPubKey) {
      myAgentPubKey = store.myAgentPubKey;
      myAgentPubKeyB64 = encodeHashToBase64(myAgentPubKey);
      avatarLoaded = true;
      console.log("Agent pubkey loaded:", myAgentPubKeyB64);
    }
  });

  $: uiProps = store.uiProps;

  function toggleCart() {
    $isCartOpenStore = !$isCartOpenStore;
  }

  let showCategoryAdmin = false;

  // Handle profile update
  function handleProfileUpdated(event) {
    console.log("Profile updated event:", event);
  }
</script>

<div class="header-container">
  <div class="left-section">
    <!-- Left section now empty -->
  </div>

  <div class="center-section">
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
      href="https://github.com/bur1dev/summon/issues"
      class="tool-button"
      title="Report a problem in our GitHub repo"
      target="_blank"
    >
      <span>🐞</span>
    </a>

    <!-- Profile Avatar - now clickable -->
    {#if avatarLoaded && myAgentPubKeyB64}
      <div
        class="avatar-container"
        on:click={() => {
          showProfileEditor = true;
          // Wait for component to render before calling open
          setTimeout(() => {
            if (profileEditorComponent) profileEditorComponent.open();
          }, 0);
        }}
        title="Edit Your Profile"
      >
        <agent-avatar
          size="36"
          agent-pub-key={myAgentPubKeyB64}
          disable-tooltip={true}
          disable-copy={true}
        ></agent-avatar>
      </div>
    {/if}
  </div>
</div>

{#if showCategoryAdmin}
  <div class="admin-overlay">
    <CategoryReportsAdmin {store} onClose={() => (showCategoryAdmin = false)} />
  </div>
{/if}

<!-- Profile Editor Component -->
{#if showProfileEditor}
  <ProfileEditor
    bind:this={profileEditorComponent}
    on:profile-updated={handleProfileUpdated}
  />
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
    min-width: 50px;
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

  /* Avatar styles */
  .avatar-container {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid #e0e0e0;
    cursor: pointer;
    width: 40px;
    height: 40px;
    margin-left: 8px;
    transition:
      transform 0.2s,
      border-color 0.2s;
  }

  .avatar-container:hover {
    border-color: #1a8b51;
    transform: scale(1.05);
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
