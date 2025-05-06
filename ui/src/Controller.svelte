<script lang="ts">
  import ShopView from "./ShopView.svelte";
  import HeaderContainer from "./HeaderContainer.svelte";
  import { ShopStore } from "./store";
  import { setContext, onMount, getContext } from "svelte";
  import type { AppClient } from "@holochain/client";
  import { ProfilesStore } from "@holochain-open-dev/profiles";
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

  export let roleName = "";
  export let client: AppClient;

  let store: ShopStore = new ShopStore(client, roleName);

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
    <div class="app">
      <div class="wrapper">
        <div class="header"></div>
        <div class="workspace">
          <!-- Header Container is now a sibling to ShopView -->
          <HeaderContainer cartTotal={cartTotalValue} standAlone={false} />

          <!-- Render ShopView -->
          <ShopView />
        </div>
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
  .flex-scrollable-x {
    max-width: 100%;
    overflow-x: auto;
  }
  .flex-scrollable-y {
    max-height: 100%;
    overflow-y: auto;
  }

  .wrapper {
    position: relative;
    z-index: 10;
  }

  .wrapper::-webkit-scrollbar {
    width: 10px;
    background-color: transparent;
  }

  .wrapper::-webkit-scrollbar-thumb {
    height: 5px;
    border-radius: 5px;
    background: rgb(255, 255, 255);
    opacity: 1;
    width: 8px;
  }

  .workspace {
    padding-top: 72px; /* Adjusted to account for HeaderContainer */
  }
</style>
