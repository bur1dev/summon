<script lang="ts">
  import { getContext } from "svelte";
  import type { ShopStore } from "./store";
  import ProductCard from "./ProductCard.svelte";
  import { onMount, onDestroy } from "svelte";
  import CategorySidebar from "./CategorySidebar.svelte";
  import { mainCategories } from "./categoryData";
  import SlideOutCart from "./cart/SlideOutCart.svelte";
  import SearchResults from "./search/SearchResults.svelte";
  import ReportCategoryDialog from "./ReportCategoryDialog.svelte";
  import { ProductDataService } from "./ProductDataService";
  import ProductBrowser from "./ProductBrowser.svelte";
  import CheckedOutCarts from "./cart/CheckedOutCartsView.svelte";

  // Import UI state stores
  import {
    currentViewStore,
    isCartOpenStore,
    searchModeStore,
    searchQueryStore,
    selectedCategoryStore,
    selectedSubcategoryStore,
    selectedProductTypeStore,
    showReportDialogStore,
    reportedProductStore,
    productNameStore,
    selectedProductHashStore,
    fuseResultsStore,
    isViewAllStore,
    resetSearchState,
    isHomeViewStore,
    featuredSubcategories,
  } from "./UiStateStore";

  // Store setup
  const { getStore } = getContext("store");
  let store: ShopStore = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  $: uiProps = store.uiProps;

  // Create product data service
  const productDataService = new ProductDataService(store);

  // Only keep standAlone param
  export let standAlone = false;

  let scrollContainer;

  // Sync with UI store when uiProps changes
  $: {
    if ($uiProps.searchMode !== undefined)
      $searchModeStore = $uiProps.searchMode;
    if ($uiProps.searchQuery !== undefined)
      $searchQueryStore = $uiProps.searchQuery;
    if ($uiProps.selectedProductHash !== undefined)
      $selectedProductHashStore = $uiProps.selectedProductHash;
    if ($uiProps.productName !== undefined)
      $productNameStore = $uiProps.productName;
    if ($uiProps.fuseResults !== undefined)
      $fuseResultsStore = $uiProps.fuseResults || [];
    if ($uiProps.isViewAll !== undefined)
      $isViewAllStore = $uiProps.isViewAll || false;
  }

  function handleCategorySelect({ detail: { category, subcategory } }) {
    if (category === null && subcategory === null) {
      // This is a navigation to the home view
      $isHomeViewStore = true;
      $searchModeStore = false;
      $selectedCategoryStore = null;
      $selectedSubcategoryStore = null;
    } else {
      // This is navigation to a category or subcategory
      $isHomeViewStore = false;
      $searchModeStore = false;
      store.setUIprops({ ...($uiProps || {}), searchMode: false });
      $selectedCategoryStore = category;
      $selectedSubcategoryStore = subcategory;
      $selectedProductTypeStore = "All";
    }

    // Ensure scrollContainer exists before trying to set scrollTop
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    } else {
      // Fallback or wait if container not ready
      window.scrollTo(0, 0);
    }
  }

  function handleProductTypeSelect({ detail: { productType } }) {
    $selectedProductTypeStore = productType;
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
        $showReportDialogStore = false;
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

<div class="root-container" class:no-sidebar={$currentViewStore !== "active"}>
  {#if $currentViewStore === "active"}
    <CategorySidebar on:categorySelect={handleCategorySelect} />
  {/if}
  <div class="main-content">
    {#if $currentViewStore === "active"}
      <SlideOutCart
        isOpen={$isCartOpenStore}
        onClose={() => ($isCartOpenStore = false)}
      />
      <div class="scroll-container" bind:this={scrollContainer}>
        {#if !$searchModeStore}
          {#if !$isHomeViewStore && $selectedCategoryStore && $selectedSubcategoryStore}
            {@const subcategory = mainCategories
              .find((c) => c.name === $selectedCategoryStore)
              ?.subcategories.find((s) => s.name === $selectedSubcategoryStore)}
            {#if subcategory?.productTypes && subcategory.productTypes.length > 1 && !subcategory.gridOnly}
              <div class="product-type-nav">
                <div class="product-type-container">
                  <button
                    class="product-type-btn {$selectedProductTypeStore === 'All'
                      ? 'active'
                      : ''}"
                    on:click={() =>
                      handleProductTypeSelect({
                        detail: { productType: "All" },
                      })}
                  >
                    All
                  </button>
                  {#each mainCategories
                    .find((c) => c.name === $selectedCategoryStore)
                    ?.subcategories.find((s) => s.name === $selectedSubcategoryStore)
                    ?.productTypes?.filter((pt) => pt !== "All") ?? [] as productType}
                    <button
                      class="product-type-btn {$selectedProductTypeStore ===
                      productType
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
          {/if}

          {#if $isHomeViewStore}{/if}
        {/if}

        <div class="product-sections">
          {#if $searchModeStore}
            <SearchResults
              {store}
              query={$searchQueryStore}
              selectedProductHash={$selectedProductHashStore}
              productName={$productNameStore}
              fuseResults={$fuseResultsStore}
              on:reportCategory={(event) => {
                $reportedProductStore = event.detail;
                $showReportDialogStore = true;
              }}
            />
          {:else if $isHomeViewStore}
            <!-- Home view with multiple featured subcategories -->
            <ProductBrowser
              selectedCategory={null}
              selectedSubcategory={null}
              selectedProductType={"All"}
              isHomeView={true}
              {featuredSubcategories}
              searchMode={$searchModeStore}
              {store}
              {productDataService}
              on:viewMore={handleViewMore}
              on:productTypeSelect={handleProductTypeSelect}
              on:reportCategory={(event) => {
                $reportedProductStore = event.detail;
                $showReportDialogStore = true;
              }}
            />
          {:else}
            <!-- Normal category browsing -->
            <ProductBrowser
              selectedCategory={$selectedCategoryStore}
              selectedSubcategory={$selectedSubcategoryStore}
              selectedProductType={$selectedProductTypeStore}
              isHomeView={false}
              featuredSubcategories={[]}
              searchMode={$searchModeStore}
              {store}
              {productDataService}
              on:viewMore={handleViewMore}
              on:productTypeSelect={handleProductTypeSelect}
              on:reportCategory={(event) => {
                $reportedProductStore = event.detail;
                $showReportDialogStore = true;
              }}
            />
          {/if}
        </div>
      </div>
    {:else}
      <CheckedOutCarts />
    {/if}
  </div>
</div>
{#if $reportedProductStore && $showReportDialogStore}
  <ReportCategoryDialog
    bind:isOpen={$showReportDialogStore}
    product={$reportedProductStore}
    on:submit={handleReportSubmit}
  />
{/if}

<style>
  .product-sections {
    display: flex;
    flex-direction: column;
    gap: 30px;
    overflow: visible;
    padding: 0;
    width: 100%;
    background-color: white;
  }

  .home-view-header {
    padding: 20px 20px 0 20px;
  }

  .home-view-header h1 {
    font-size: 32px;
    font-weight: 700;
    color: #343538;
    margin-bottom: 20px;
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
    width: calc(100% - 250px); /* Match sidebar width exactly */
    margin: 0 0 0 250px; /* Match sidebar width exactly */
    position: relative;
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
    margin: 0 15px;
  }

  .scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: visible;
    padding-right: 0;
    padding-left: 10px;
    margin-top: 0px;
    padding-top: 0px;
    height: 100%;
    transform: translateZ(0);
    will-change: transform;
  }
</style>
