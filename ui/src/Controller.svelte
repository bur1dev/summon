<script lang="ts">
  import TalkingStickiesPane from "./TalkingStickiesPane.svelte";
  import { TalkingStickiesStore } from "./store";
  import { setContext, onMount, getContext } from "svelte";
  import type { AppClient } from "@holochain/client";

  export let roleName = "";
  export let client: AppClient;

  let store: TalkingStickiesStore = new TalkingStickiesStore(client, roleName);

  // Get cart service from context
  const cartService = getContext("cartService");

  setContext("store", {
    getStore: () => store,
  });

  const DEFAULT_BG_IMG = "";
  $: uiProps = store.uiProps;
  $: bgUrl = $uiProps.bgUrl ? $uiProps.bgUrl : DEFAULT_BG_IMG;

  onMount(() => {
    store.setUIprops({ showMenu: false });

    // Connect the product store to cart service for price calculations
    if ($cartService && store.productStore) {
      console.log("Setting product store in cart service");
      $cartService.setProductStore(store.productStore);
    }
  });
</script>

<div class="flex-scrollable-parent">
  <div class="flex-scrollable-container">
    <div class="app">
      <div class="wrapper">
        <div class="header"></div>
        <div class="workspace" style="display:flex">
          <!-- Always hide the board menu -->
          <div class="board-menu slideOut"></div>
          <div class="board-menu-pad slideOut"></div>

          <!-- Render TalkingStickiesPane -->
          <TalkingStickiesPane />
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
  .error-msg {
    margin: auto;
    display: flex;
    width: 50%;
    border-radius: 10px;
    border: 2px solid red;
    padding: 20px;
  }
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

  .board-menu,
  .board-menu-pad {
    animation-duration: 0.3s;
    animation-name: slideIn;
    animation-iteration-count: 1;
    animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1.1);
    z-index: 199;
    --margin-end-position: 0px;
    --margin-start-position: -330px;
    margin-left: 0;
  }

  .board-menu {
    position: fixed;
    top: 80px;
  }

  .board-menu:hover {
    z-index: 200;
  }

  .board-menu.slideOut,
  .board-menu-pad.slideOut {
    animation-duration: 0.3s;
    animation-name: slideOut;
    --margin-end-position: -343px;
    animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1.1);
    --margin-start-position: 0px;
    margin-left: -343px;
  }

  .board-menu-pad {
    visibility: hidden;
  }

  @keyframes slideIn {
    from {
      margin-left: var(--margin-start-position);
    }

    to {
      margin-left: var(--margin-end-position);
    }
  }
  @keyframes slideOut {
    from {
      margin-left: var(--margin-start-position);
    }

    to {
      margin-left: var(--margin-end-position);
    }
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
    padding-top: 135px;
  }
</style>
