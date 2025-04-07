<script lang="ts">
  import { getContext } from "svelte";
  import type { TalkingStickiesStore } from "./store";
  import ProductSticky from "./ProductSticky.svelte";
  import { onMount, onDestroy } from "svelte";
  import CategorySidebar from "./CategorySidebar.svelte";
  import { mainCategories } from "./categoryData";
  import SlideOutCart from "./CART/SlideOutCart.svelte";
  import HeaderContainer from "./HeaderContainer.svelte";
  import SearchResults from "./SEARCH/SearchResults.svelte";
  import ReportCategoryDialog from "./ReportCategoryDialog.svelte";
  import { writable } from "svelte/store";
  import { ProductCacheStore } from "./ProductCacheStore";
  import { ProductDataService } from "./ProductDataService";
  import ProductBrowser from "./ProductBrowser.svelte";

  // Store setup
  const { getStore } = getContext("store");
  let store: TalkingStickiesStore = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");
  let cartTotalValue = 0;

  // Subscribe to the cartTotal from the cart service
  onMount(() => {
    const unsubscribe = $cartService?.cartTotal?.subscribe((value) => {
      cartTotalValue = value || 0;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  $: uiProps = store.uiProps;

  const productCache = new ProductCacheStore();
  // Create product data service
  const productDataService = new ProductDataService(store, productCache);

  // Component state
  let currentView: "active" | "checked-out" = "active";
  let selectedLocationId = "70300168";
  let cartScrollState = { scrollPercent: 0 };
  let errorMessage = "";

  // Keep activeBoard param for interface compatibility
  export let activeBoard = undefined;
  export let standAlone = false;

  // Category state
  let selectedCategory: string | null = null;
  let selectedSubcategory: string | null = null;
  let selectedProductType = "All";
  let scrollContainer;

  let isCartOpen = false;

  let searchMode = false;
  let searchQuery = "";
  let showReportDialog = false;
  let reportedProduct = null;

  // State derivations
  $: {
    if ($uiProps) {
      searchMode = $uiProps.searchMode || false;
      searchQuery = $uiProps.searchQuery || "";
    }
  }

  function handleCategorySelect({ detail: { category, subcategory } }) {
    searchMode = false;
    store.setUIprops({ ...($uiProps || {}), searchMode: false });
    selectedCategory = category;
    selectedSubcategory = subcategory;
    selectedProductType = "All";

    scrollContainer.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function handleProductTypeSelect({ detail: { productType } }) {
    selectedProductType = productType;
  }

  function handleViewMore({ detail: { category, subcategory } }) {
    handleCategorySelect({ detail: { category, subcategory } });
  }

  async function handleReportSubmit(event) {
    try {
      const response = await fetch(
        "http://localhost:3000/api/report-category",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event.detail),
        },
      );

      if (response.ok) {
        alert("Thank you for your feedback!");
        showReportDialog = false;
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      alert(
        "There was an error submitting your report. Please try again later.",
      );
    }
  }
</script>

<div class="root-container" class:no-sidebar={currentView !== "active"}>
  {#if currentView === "active"}
    <CategorySidebar on:categorySelect={handleCategorySelect} />
  {/if}
  <div class="main-content">
    <HeaderContainer
      bind:currentView
      bind:isCartOpen
      cartTotal={cartTotalValue}
      {standAlone}
      {activeBoard}
    />
    {#if selectedCategory && selectedSubcategory && !searchMode}
      <div class="product-type-nav">
        <div class="product-type-container">
          <button
            class="product-type-btn {selectedProductType === 'All'
              ? 'active'
              : ''}"
            on:click={() =>
              handleProductTypeSelect({ detail: { productType: "All" } })}
          >
            All
          </button>
          {#each mainCategories
            .find((c) => c.name === selectedCategory)
            .subcategories.find((s) => s.name === selectedSubcategory).productTypes ?? [] as productType}
            <button
              class="product-type-btn {selectedProductType === productType
                ? 'active'
                : ''}"
              on:click={() =>
                handleProductTypeSelect({ detail: { productType } })}
            >
              {productType}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if currentView === "active"}
      <SlideOutCart isOpen={isCartOpen} onClose={() => (isCartOpen = false)} />
      <div class="scroll-container" bind:this={scrollContainer}>
        <div class="groups">
          {#if searchMode}
            <SearchResults
              {store}
              board={activeBoard}
              query={searchQuery}
              selectedProductHash={$uiProps.selectedProductHash}
              productName={$uiProps.productName}
              fuseResults={$uiProps.fuseResults || []}
              on:reportCategory={(event) => {
                reportedProduct = event.detail;
                showReportDialog = true;
              }}
            />
          {:else}
            <ProductBrowser
              {selectedCategory}
              {selectedSubcategory}
              {selectedProductType}
              {searchMode}
              board={activeBoard}
              {store}
              {productCache}
              {productDataService}
              on:viewMore={handleViewMore}
              on:productTypeSelect={handleProductTypeSelect}
              on:reportCategory={(event) => {
                reportedProduct = event.detail;
                showReportDialog = true;
              }}
            />
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <h2>Checked Out Carts</h2>
        <p>This functionality will be implemented in the next phase.</p>
      </div>
    {/if}
  </div>
</div>
{#if reportedProduct && showReportDialog}
  <ReportCategoryDialog
    bind:isOpen={showReportDialog}
    product={reportedProduct}
    on:submit={handleReportSubmit}
  />
{/if}

<style>
  .groups {
    display: flex;
    flex-direction: column;
    gap: 30px;
    overflow: visible;
    padding: 0;
    width: 100%;
    background-color: white;
  }

  :global(hr) {
    opacity: 0.4;
  }

  :global(.attachment-button) {
    width: 35px;
    height: 35px;
    padding: 4px;
    border-radius: 50%;
    border: 1px solid rgba(235, 235, 238, 1);
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 4px 5px rgba(0, 0, 0, 0.2);
  }
  :global(.attachment-button:hover) {
    transform: scale(1.25);
  }

  :global(.attachment-group:active) {
    border-color: rgb(76, 106, 167);
    background-color: rgb(77, 123, 214);
    box-shadow: 0 4px 5px rgba(0, 0, 0, 0.2);
    border-bottom: 2px solid rgb(60, 83, 127);
  }

  .root-container {
    display: flex;
    height: calc(100vh - 60px);
    width: calc(100% - 265px);
    margin: 15px 0 15px 265px;
    position: fixed;
    top: 45px;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    overflow: hidden;
    background-color: white;
  }

  .product-type-nav {
    position: sticky;
    top: 0;
    z-index: 10;
    background: white;
    padding: 16px 20px;
    border-bottom: 1px solid #f0f0f0;
  }

  .product-type-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-width: 100%;
  }

  .product-type-btn {
    padding: 8px 16px;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    background: white;
    white-space: nowrap;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: all 0.2s ease;
  }

  .product-type-btn.active {
    background: #343538;
    color: white;
    border-color: #343538;
  }

  .product-type-btn:not(.active):hover {
    background: #f5f5f5;
  }

  .root-container.no-sidebar {
    width: calc(100% - 30px);
    margin: 15px;
  }

  .scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: visible;
    padding-right: 0;
    margin-top: 0px;
    padding-top: 0px;
    height: 100%;
    transform: translateZ(0);
    will-change: transform;
  }
</style>
