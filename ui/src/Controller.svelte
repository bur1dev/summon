<script lang="ts">
  import ShopView from "./navigation/components/ShopView.svelte";
  import HeaderContainer from "./navigation/components/HeaderContainer.svelte";
  import { ShopStore } from "./store";
  import { ProductDataService } from "./products/services/ProductDataService";
  import { ProductRowCacheService } from "./products/services/ProductRowCacheService";
  import { SimpleCloneCache } from "./products/utils/SimpleCloneCache";
  import { BackgroundCloneManager } from "./products/utils/BackgroundCloneManager";
  import { DataManager } from "./services/DataManager";
  import AppLoadingScreen from "./components/AppLoadingScreen.svelte";
  import { cloneSetupStore } from "./stores/LoadingStore";
  import { setContext, onMount } from "svelte";
  import type { AppClient } from "@holochain/client";
  import { encodeHashToBase64 } from "@holochain/client";

  import CategorySidebar from "./navigation/components/CategorySidebar.svelte";
  import SlideOutCart from "./cart/components/SlideOutCart.svelte";
  import OrdersView from "./cart/orders/components/OrdersView.svelte";

  // Import from UI-only store
  import { currentViewStore, isCartOpenStore } from "./stores/UiOnlyStore";

  import SidebarMenu from "./navigation/components/SidebarMenu.svelte";
  import { setDataManager, cartTotal } from "./cart/services/CartBusinessService";
  import { setNavigationDataManager } from "./stores/NavigationStore";

  export let roleName = "";
  export let client: AppClient;

  let store: ShopStore = new ShopStore(client, roleName);
  let shopViewComponent: ShopView; // Reference to the ShopView component
  let cloneSystemReady = false;
  let setupMessage = "Setting up catalog access...";
  let setupProgress = 0;
  
  // Global loading state for any clone setup operations
  $: globalLoading = $cloneSetupStore.isLoading;
  $: showLoading = !cloneSystemReady || globalLoading;

  // Create ProductDataService during initialization
  // Create global cache service instance if it doesn't exist
  if (typeof window !== "undefined" && !window.productRowCache) {
    window.productRowCache = new ProductRowCacheService();
  }

  const cacheService: ProductRowCacheService =
    typeof window !== "undefined" && window.productRowCache
      ? window.productRowCache
      : new ProductRowCacheService();

  // Create clone cache and background manager
  const cloneCache = new SimpleCloneCache(client);
  const backgroundCloneManager = new BackgroundCloneManager(client, cloneCache);
  
  // Connect cache to background manager for daily checks
  cloneCache.setBackgroundManager(backgroundCloneManager);
  
  const productDataService = new ProductDataService(store, cacheService, cloneCache);

  // STEP 2: Create centralized DataManager
  const dataManager = new DataManager(productDataService);

  // Cart service is now store-based, no context needed


  setContext("store", {
    getStore: () => store,
  });

  // STEP 2: Set DataManager context instead of ProductDataService
  // This becomes the single gateway for all data operations
  setContext("dataManager", dataManager);

  // LEGACY: Keep ProductDataService context for cart services temporarily
  // TODO: Eventually update cart services to use DataManager
  setContext("productDataService", productDataService);

  const DEFAULT_BG_IMG = "";
  $: uiProps = store.uiProps;
  $: bgUrl = $uiProps.bgUrl ? $uiProps.bgUrl : DEFAULT_BG_IMG;

  // Handle category selection from sidebar
  function handleCategorySelect(event: CustomEvent) {
    if (shopViewComponent) {
      shopViewComponent.selectCategory(
        event.detail.category,
        event.detail.subcategory,
      );
    }
  }

  onMount(async () => {
    store.setUIprops({ showMenu: false });

    // ===== CONSOLE TESTING - KEEP FOR DEBUGGING =====
    // Expose reset method to global window for console testing
    if (typeof window !== "undefined") {
      (window as any).resetCloneManager = () => backgroundCloneManager.resetForTesting();
      console.log('🧪 TESTING: Use window.resetCloneManager() in console to reset');
    }
    // ===== END CONSOLE TESTING =====

    // Check if we need daily setup
    if (backgroundCloneManager.shouldRunDailySetup()) {
      setupMessage = "Checking for new catalog...";
      cloneSystemReady = false;
      
      setupProgress = 25;
      setupMessage = "Finding active catalog...";
      
      setupProgress = 50;
      setupMessage = "Preparing clone access...";
      
      const success = await backgroundCloneManager.setup();
      
      setupProgress = 100;
      setupMessage = success ? "Ready!" : "Setup failed";
      
      // Brief delay to show completion
      setTimeout(() => {
        cloneSystemReady = true;
      }, 500);
    } else {
      // Already setup today, skip loading screen
      cloneSystemReady = true;
    }

    // Background polling disabled - we handle setup manually now
    // backgroundCloneManager.start();

    // Inject DataManager into cart service
    setDataManager(dataManager);
    
    // Inject DataManager into navigation store
    setNavigationDataManager(dataManager);
  });
</script>

<!-- Loading Screen - Shows for both startup and browsing setup -->
<AppLoadingScreen 
  show={showLoading} 
  message={globalLoading ? $cloneSetupStore.message : setupMessage} 
  progress={globalLoading ? $cloneSetupStore.progress : setupProgress} 
/>

<div class="flex-scrollable-parent">
  <div class="flex-scrollable-container">
    <!-- SlideOutCart moved outside all other elements to appear at the root level -->
    <SlideOutCart
      isOpen={$isCartOpenStore}
      onClose={() => ($isCartOpenStore = false)}
    />

    <!-- SidebarMenu at root level -->
    <SidebarMenu
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
            <HeaderContainer cartTotalValue={$cartTotal || 0} />
            <div class="workspace">
              <ShopView bind:this={shopViewComponent} />
            </div>
          </div>
        {:else}
          <!-- Checked Out Carts View gets its own full container without header -->
          <div class="global-scroll-container scroll-container full-height">
            <OrdersView />
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
    position: relative;
    z-index: 0;
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
