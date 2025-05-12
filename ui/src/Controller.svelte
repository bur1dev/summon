<script lang="ts">
  import ShopView from "./ShopView.svelte";
  import HeaderContainer from "./HeaderContainer.svelte";
  import { ShopStore } from "./store";
  import {
    setContext,
    onMount,
    getContext,
    createEventDispatcher,
  } from "svelte";
  import type { AppClient } from "@holochain/client";
  import { encodeHashToBase64 } from "@holochain/client";

  import { ProfilesStore } from "@holochain-open-dev/profiles";
  import CategorySidebar from "./CategorySidebar.svelte";
  import SlideOutCart from "./cart/SlideOutCart.svelte";
  import CheckedOutCarts from "./cart/CheckedOutCartsView.svelte"; // Added import
  import {
    currentViewStore,
    isCartOpenStore,
    searchModeStore,
    searchQueryStore,
    productNameStore,
    selectedProductHashStore,
    fuseResultsStore,
    isViewAllStore,
    isHomeViewStore,
  } from "./UiStateStore";
  import SidebarMenu from "./SidebarMenu.svelte";

  export let roleName = "";
  export let client: AppClient;

  let store: ShopStore = new ShopStore(client, roleName);
  let shopViewComponent; // Reference to the ShopView component

  // Get cart service from context
  const cartService = getContext("cartService");

  // Get profiles store from context (passed down from profiles-context)
  const profilesStore = getContext("profiles-store");

  // Cart total for header display
  let cartTotalValue = 0;

  setContext("store", {
    getStore: () => store,
  });

  const DEFAULT_BG_IMG = "";
  $: uiProps = store.uiProps;
  $: bgUrl = $uiProps.bgUrl ? $uiProps.bgUrl : DEFAULT_BG_IMG;

  // Handle category selection from sidebar
  function handleCategorySelect(event) {
    if (shopViewComponent) {
      shopViewComponent.selectCategory(
        event.detail.category,
        event.detail.subcategory,
      );
    }
  }

  onMount(() => {
    // Set default state to home view
    $isHomeViewStore = true;

    store.setUIprops({ showMenu: false });

    // Connect the product store to cart service for price calculations
    if ($cartService && store.productStore) {
      console.log("Setting product store in cart service");
      $cartService.setProductStore(store.productStore);
    }

    // Subscribe to the cartTotal from the cart service
    const unsubscribe = $cartService?.cartTotal?.subscribe((value) => {
      cartTotalValue = value || 0;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  });
</script>

<div class="flex-scrollable-parent">
  <div class="flex-scrollable-container">
    <!-- SlideOutCart moved outside all other elements to appear at the root level -->
    <SlideOutCart
      isOpen={$isCartOpenStore}
      onClose={() => ($isCartOpenStore = false)}
    />

    <!-- SidebarMenu at root level -->
    <SidebarMenu
      {store}
      myAgentPubKeyB64={store.myAgentPubKey
        ? encodeHashToBase64(store.myAgentPubKey)
        : undefined}
      avatarLoaded={!!store.myAgentPubKey}
    />

    <div class="app">
      <div class="wrapper">
        <!-- Add CategorySidebar here, outside the global scroll container -->
        {#if $currentViewStore === "active"}
          <div class="sidebar-container">
            <CategorySidebar on:categorySelect={handleCategorySelect} />
          </div>
        {/if}

        <!-- Conditional rendering for the main content -->
        {#if $currentViewStore === "active"}
          <!-- The global scroll container with header and shop view -->
          <div class="global-scroll-container scroll-container">
            <HeaderContainer cartTotal={cartTotalValue} standAlone={false} />
            <div class="workspace">
              <ShopView bind:this={shopViewComponent} />
            </div>
          </div>
        {:else}
          <!-- Checked Out Carts View gets its own full container without header -->
          <div class="global-scroll-container scroll-container full-height">
            <CheckedOutCarts />
          </div>
        {/if}
      </div>

      <div class="background">
        <div class="background-overlay"></div>
        <div
          class="background-image"
          style={`background-image: url(${bgUrl}`}
        ></div>
      </div>
    </div>
  </div>
</div>

<style>
  .app {
    margin: 0;
    padding-bottom: 10px;
    background-size: cover;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background-color: #fff;
    position: relative;
  }

  .background {
    position: absolute;
    z-index: 0;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .background-overlay {
    background: linear-gradient(144deg, #fcfcfc 0%, rgb(255, 255, 255) 100%);
    position: absolute;
    z-index: 2;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    opacity: 0.4;
  }

  .background-image {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    background-size: cover;
  }

  :global(:root) {
    --resizeable-height: 200px;
    --tab-width: 60px;
  }

  @media (min-width: 640px) {
    .app {
      max-width: none;
    }
  }

  .flex-scrollable-parent {
    position: relative;
    display: flex;
    flex: 1;
  }
  .flex-scrollable-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .wrapper {
    position: relative;
    z-index: 10;
    height: 100%;
  }

  .global-scroll-container {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .global-scroll-container::-webkit-scrollbar {
    width: 10px;
    background-color: transparent;
  }

  .global-scroll-container::-webkit-scrollbar-thumb {
    height: 5px;
    border-radius: 5px;
    background: rgb(255, 255, 255);
    opacity: 1;
    width: 8px;
  }

  /* Workspace no longer needs padding-top since header scrolls with content */
  .workspace {
    padding-top: 0;
  }

  .sidebar-container {
    position: fixed;
    top: var(--component-header-height);
    left: 0;
    height: calc(100vh - var(--component-header-height));
    z-index: var(--z-index-sticky);
  }

  .full-height {
    height: 100vh;
  }
</style>
