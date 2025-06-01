<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import type { ShopStore, StoreContext, UIProps } from "./store";
  import type { CartBusinessService } from "./cart/CartBusinessService";
  import type { ProductDataService } from "./ProductDataService";
  import ProductCard from "./ProductCard.svelte";
  import { onMount, onDestroy } from "svelte";
  import SearchResults from "./search/SearchResults.svelte";
  import ReportCategoryDialog from "./ReportCategoryDialog.svelte";
  import ProductBrowser from "./ProductBrowser.svelte";
  import CheckedOutCarts from "./cart/CheckedOutCartsView.svelte";
  import {
    sortByStore,
    selectedBrandsStore,
    selectedOrganicStore,
  } from "./UiStateStore";

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
    searchResultsStore,
    isViewAllStore,
    resetSearchState,
    isHomeViewStore,
    searchMethodStore,
    featuredSubcategories,
  } from "./UiStateStore";

  // UPDATED: Import category utilities
  import {
    shouldShowProductTypeNav,
    getFilteredProductTypes,
  } from "./categoryUtils";

  const storeContext = getContext<StoreContext>("store");
  let store: ShopStore | null = storeContext ? storeContext.getStore() : null;

  const cartService = getContext<Writable<CartBusinessService>>("cartService");

  // UPDATED: Get ProductDataService from context (created in Controller)
  const productDataService =
    getContext<ProductDataService>("productDataService");

  export function selectCategory(category: any, subcategory: any) {
    handleCategorySelect({ detail: { category, subcategory } });
  }

  let uiProps: Writable<UIProps> | null = null;
  $: if (store) {
    uiProps = store.uiProps;
  }

  $: {
    if (uiProps && $uiProps) {
      const props = $uiProps as any;
      if (props.searchMode !== undefined) $searchModeStore = props.searchMode;
      if (props.searchQuery !== undefined)
        $searchQueryStore = props.searchQuery;
      if (props.selectedProductHash !== undefined)
        $selectedProductHashStore = props.selectedProductHash;
      if (props.productName !== undefined)
        $productNameStore = props.productName;
      if (props.searchResults !== undefined)
        $searchResultsStore = props.searchResults || [];
      if (props.isViewAll !== undefined)
        $isViewAllStore = props.isViewAll || false;
    }
  }

  function handleCategorySelect({
    detail: { category, subcategory },
  }: {
    detail: { category: any; subcategory: any };
  }) {
    sortByStore.set("best");
    selectedBrandsStore.set(new Set());
    selectedOrganicStore.set("all");

    if (category === null && subcategory === null) {
      $isHomeViewStore = true;
      $searchModeStore = false;
      $selectedCategoryStore = null;
      $selectedSubcategoryStore = null;
    } else {
      $isHomeViewStore = false;
      $searchModeStore = false;
      if (store && uiProps && $uiProps) {
        const currentProps = $uiProps as any;
        store.setUIprops({ ...(currentProps || {}), searchMode: false });
      }
      $selectedCategoryStore = category;
      $selectedSubcategoryStore = subcategory;
      $selectedProductTypeStore = "All";
    }

    const scrollContainer = document.querySelector(".global-scroll-container");
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
  }

  function handleProductTypeSelect({ detail }: { detail: any }) {
    if (detail.category && detail.subcategory) {
      $selectedCategoryStore = detail.category;
      $selectedSubcategoryStore = detail.subcategory;
      $selectedProductTypeStore = detail.productType;
      $isHomeViewStore = false;
      $searchModeStore = false;
    } else {
      $selectedProductTypeStore = detail.productType;
    }
  }

  function handleViewMore({
    detail: { category, subcategory },
  }: {
    detail: { category: any; subcategory: any };
  }) {
    handleCategorySelect({ detail: { category, subcategory } });
  }

  async function handleReportSubmit(event: CustomEvent) {
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

  // UPDATED: Use centralized function for product type navigation visibility
  $: showProductTypeNavigation = shouldShowProductTypeNav(
    $selectedCategoryStore || "",
    $selectedSubcategoryStore || "",
  );

  // UPDATED: Use centralized function for filtered product types
  $: filteredProductTypes = getFilteredProductTypes(
    $selectedCategoryStore || "",
    $selectedSubcategoryStore || "",
  );
</script>

<div class="root-container" class:no-sidebar={$currentViewStore !== "active"}>
  <div class="main-content">
    {#if store && productDataService}
      <div class="content-wrapper">
        {#if !$searchModeStore}
          {#if !$isHomeViewStore && $selectedCategoryStore && $selectedSubcategoryStore}
            {#if showProductTypeNavigation}
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
                  {#each filteredProductTypes as productType}
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
              on:productTypeSelect={handleProductTypeSelect}
            />
          {:else if $isHomeViewStore}
            <ProductBrowser
              selectedCategory={null}
              selectedSubcategory={null}
              selectedProductType={"All"}
              isHomeView={true}
              {featuredSubcategories}
              searchMode={$searchModeStore}
              {productDataService}
              on:viewMore={handleViewMore}
              on:productTypeSelect={handleProductTypeSelect}
              on:reportCategory={(event) => {
                $reportedProductStore = event.detail;
                $showReportDialogStore = true;
              }}
            />
          {:else}
            <ProductBrowser
              selectedCategory={$selectedCategoryStore}
              selectedSubcategory={$selectedSubcategoryStore}
              selectedProductType={$selectedProductTypeStore}
              isHomeView={false}
              featuredSubcategories={[]}
              searchMode={$searchModeStore}
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
      <div>Loading store...</div>
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
    height: 100%;
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
    padding-left: var(--spacing-md);
    padding-right: var(--spacing-md);
    box-sizing: border-box;
  }

  .product-type-nav {
    position: sticky;
    top: var(--component-header-height);
    z-index: 200;
    background: var(--background);
    min-height: var(--component-header-height);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding-top: var(--spacing-md);
    padding-bottom: var(--spacing-md);
    padding-left: 0;
    padding-right: 0;
    margin-left: calc(-1 * var(--spacing-md));
    margin-right: calc(-1 * var(--spacing-md));
    border-bottom: var(--border-width-thin) solid var(--border-lighter);
  }

  .product-type-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    width: 100%;
    box-sizing: border-box;
    max-width: 100%;
    padding-left: var(--spacing-md);
    padding-right: var(--spacing-md);
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
