<script lang="ts">
  import { getContext } from "svelte";
  import type { ShopStore } from "./store";
  import ProductCard from "./ProductCard.svelte";
  import { onMount, onDestroy } from "svelte";
  import { mainCategories } from "./categoryData";
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
    searchResultsStore, // Changed from fuseResultsStore
    isViewAllStore,
    resetSearchState,
    isHomeViewStore,
    searchMethodStore,
    featuredSubcategories,
  } from "./UiStateStore";

  // Store setup
  const { getStore } = getContext("store");
  let store: ShopStore = getStore();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  // Create product data service
  const productDataService = new ProductDataService(store);

  // Only keep standAlone param
  export let standAlone = false;

  // Export this function to be called from Controller
  export function selectCategory(category, subcategory) {
    handleCategorySelect({ detail: { category, subcategory } });
  }

  // Sync with UI store when uiProps changes
  $: uiProps = store.uiProps;
  $: {
    if ($uiProps.searchMode !== undefined)
      $searchModeStore = $uiProps.searchMode;
    if ($uiProps.searchQuery !== undefined)
      $searchQueryStore = $uiProps.searchQuery;
    if ($uiProps.selectedProductHash !== undefined)
      $selectedProductHashStore = $uiProps.selectedProductHash;
    if ($uiProps.productName !== undefined)
      $productNameStore = $uiProps.productName;
    if ($uiProps.searchResults !== undefined)
      // Changed from fuseResults
      $searchResultsStore = $uiProps.searchResults || []; // Changed from fuseResultsStore
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

    // Scroll to top using global scroll container
    const scrollContainer = document.querySelector(".global-scroll-container");
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    } else {
      // Fallback
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
  <div class="main-content">
    <div class="content-wrapper">
      {#if !$searchModeStore}
        {#if !$isHomeViewStore && $selectedCategoryStore && $selectedSubcategoryStore}
          {@const subcategory = mainCategories
            .find((c) => c.name === $selectedCategoryStore)
            ?.subcategories.find((s) => s.name === $selectedSubcategoryStore)}
          {#if subcategory?.productTypes && subcategory.productTypes.length > 1 && !subcategory.gridOnly}
            <div class="product-type-nav">
              <div class="product-type-container">
                <button
                  class="product-type-btn btn btn-toggle {$selectedProductTypeStore ===
                  'All'
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
                    class="product-type-btn btn btn-toggle {$selectedProductTypeStore ===
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
            searchResults={$searchResultsStore}
            searchMethod={$searchMethodStore}
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
    gap: var(--spacing-xxxl);
    overflow: visible;
    padding: 0;
    width: 100%;
  }

  :global(hr) {
    opacity: 0.4;
  }

  :global(.attachment-button) {
    width: var(--btn-icon-size-sm);
    height: var(--btn-icon-size-sm);
    padding: 4px;
    border-radius: 50%;
    border: var(--border-width-thin) solid var(--border);
    background-color: var(--overlay-button);
    box-shadow: var(--shadow-button);
  }
  :global(.attachment-button:hover) {
    transform: scale(var(--hover-scale-button));
  }

  :global(.attachment-group:active) {
    border-color: var(--primary-dark);
    background-color: var(--primary);
    box-shadow: var(--shadow-button);
    border-bottom: var(--border-width) solid var(--primary-dark);
  }

  .root-container {
    display: flex;
    height: 100%; /* Changed from calc height */
    width: calc(100% - var(--sidebar-width-category));
    margin: 0 0 0 var(--sidebar-width-category);
    position: relative;
    box-sizing: border-box;
    padding-right: 0;
    right: 0;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: visible;
    max-width: 100%;
  }

  .content-wrapper {
    padding-left: var(--spacing-md); /* <<< THIS IS THE KEY CHANGE */
    padding-right: var(--spacing-md); /* <<< THIS IS THE KEY CHANGE */
    box-sizing: border-box;
  }

  .product-type-nav {
    position: sticky;
    top: var(--component-header-height);
    z-index: 11;
    background: var(--background);
    min-height: var(--component-header-height);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding-top: var(--spacing-md);
    padding-bottom: var(--spacing-md);
    /* The nav bar itself doesn't need side padding if its content container has it */
    padding-left: 0;
    padding-right: 0;
    /* Adjust negative margins to match the NEW parent padding (var(--spacing-md)) */
    margin-left: calc(-1 * var(--spacing-md)); /* <<< CHANGED */
    margin-right: calc(-1 * var(--spacing-md)); /* <<< CHANGED */
    border-bottom: var(--border-width-thin) solid var(--border-lighter);
  }

  .product-type-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    width: 100%; /* Make sure it takes the full width of the .product-type-nav */
    box-sizing: border-box; /* Important for width calculation with padding */
    max-width: 100%;
    /* This padding aligns the actual buttons inside the nav with the content below */
    padding-left: var(--spacing-md); /* <<< CHANGED */
    padding-right: var(--spacing-md); /* <<< CHANGED */
  }

  .product-type-btn {
    white-space: nowrap;
    height: var(--btn-height-sm);
  }

  .root-container.no-sidebar {
    width: calc(100% - var(--content-margin) * 2);
    margin: 0 var(--content-margin);
  }
</style>
