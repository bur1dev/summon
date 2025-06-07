<script lang="ts">
  import { mainCategories } from "../utils/categoryData";

  // Import from data trigger store - all these control data loading
  import {
    selectedCategoryStore,
    selectedSubcategoryStore,
  } from "../stores/DataTriggerStore";
  
  // Import the BrowserNavigationService
  import { browserNavigationService } from "../services/BrowserNavigationService";
  
  // Import clickable action
  import { clickable } from "../actions/clickable";



  let currentPage = 0;
  // let hasMore = false; // Not used, consider removing
  // let totalProducts = 0; // Not used, consider removing

  let selectedCategory = null; // This is shadowed by the store, consider removing local if not needed
  let selectedSubcategory = null; // This is shadowed by the store, consider removing local if not needed
  let sidebarElement: HTMLElement;
  let headerElement: HTMLElement;

  // Subscribe to the stores to keep local variables in sync
  // These lines are fine if you need local copies for some reason,
  // but often you can use $selectedCategoryStore directly in the template or logic.
  $: selectedCategory = $selectedCategoryStore;
  $: selectedSubcategory = $selectedSubcategoryStore;

  async function selectCategory(category: string) {
    currentPage = 0;
    
    // Use BrowserNavigationService for navigation
    await browserNavigationService.navigateToCategory(category);

    setTimeout(() => {
      if (sidebarElement && headerElement) {
        const selectedElement = sidebarElement.querySelector(
          ".category-item.active",
        ) as HTMLElement;

        if (selectedElement) {
          const actualHeaderHeight = headerElement.offsetHeight;
          const visualGapWanted = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--spacing-xs",
            ),
          );
          const selectedElementMarginTop = parseFloat(
            getComputedStyle(selectedElement).marginTop,
          );

          // Calculate the scrollTop value for the sidebar
          // This formula aims to position the top border of 'selectedElement'
          // exactly 'visualGapWanted' pixels below the bottom border of 'actualHeaderHeight'.
          const targetPosition = Math.max(
            0,
            selectedElement.offsetTop + // Distance from sidebar top to selectedElement's margin top
              selectedElementMarginTop - // Add element's own margin to get to its border top
              actualHeaderHeight - // Subtract header height to align with header bottom
              visualGapWanted, // Subtract desired gap to position below header
          );

          sidebarElement.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });
        }
      }
    }, 100);
  }

  async function selectSubcategory(subcategory: string) {
    currentPage = 0;
    
    // Use BrowserNavigationService for navigation
    const currentCategory = $selectedCategoryStore;
    if (currentCategory) {
      await browserNavigationService.navigateToSubcategory(currentCategory, subcategory);
    }
  }

  async function goToHome() {
    // Use BrowserNavigationService for navigation
    await browserNavigationService.navigateToHome();

    // Scroll to top when going home
    if (sidebarElement) {
      sidebarElement.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
</script>

<div class="sidebar" bind:this={sidebarElement}>
  <div class="sidebar-header" bind:this={headerElement}>
    <div
      class="store-logo-container btn btn-toggle active"
      use:clickable={goToHome}
    >
      <div class="store-name">Ralphs Store</div>
    </div>
  </div>

  <div class="categories-container">
    {#each mainCategories as category}
      <div
        class="category-item btn btn-toggle {selectedCategory === category.name
          ? 'active'
          : ''}"
        use:clickable={() => selectCategory(category.name)}
      >
        {category.name}
      </div>

      {#if selectedCategory === category.name}
        {#each category.subcategories as subcategory (subcategory.name)}
          <div
            class="subcategory-item btn btn-toggle {selectedSubcategory ===
            subcategory.name
              ? 'active'
              : ''}"
            use:clickable={{ handler: () => selectSubcategory(subcategory.name), stopPropagation: true }}
          >
            {subcategory.name}
          </div>
        {/each}
      {/if}
    {/each}
  </div>
</div>

<style>
  .sidebar {
    width: var(--sidebar-width-category);
    height: calc(100vh - var(--component-header-height));
    border-right: var(--border-width-thin) solid var(--border);
    background: var(--background);
    padding: 0;
    overflow-y: auto;
    position: fixed;
    left: 0;
    top: var(--component-header-height);
    box-sizing: border-box;
    -webkit-overflow-scrolling: touch;
    z-index: 5; /* Lower than header's z-index */
  }

  .sidebar-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--background);
    min-height: var(--component-header-height);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding-left: var(--spacing-xs);
    padding-right: var(--spacing-xs);
  }

  .store-logo-container,
  .category-item,
  .subcategory-item {
    min-height: var(--btn-height-md);
    height: auto;
    font-size: var(--font-size-md);
    display: flex;
    align-items: center;
    text-align: left;
    justify-content: flex-start;
    box-sizing: border-box;
    border-radius: var(--btn-border-radius);
  }

  .store-logo-container {
    padding: var(--btn-padding-md);
    margin: var(--spacing-xs);
    width: calc(100% - (2 * var(--spacing-xs)));
    font-weight: var(--font-weight-bold);
    border: none;
    box-shadow: var(--shadow-button);
  }

  .store-logo-container:hover {
    background: linear-gradient(135deg, var(--primary-dark), var(--secondary));
    transform: translateY(var(--hover-lift));
    box-shadow: var(--shadow-medium);
    border: none;
  }

  .store-name {
    color: var(--button-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .categories-container {
    padding-top: var(--spacing-xs);
    padding-bottom: var(--spacing-md);
    padding-left: var(--spacing-xs);
    padding-right: var(--spacing-xs);
  }

  .category-item {
    padding: var(--btn-padding-md);
    margin-top: var(--spacing-xs);
    margin-bottom: var(--spacing-xs);
    margin-left: var(--spacing-xs);
    margin-right: var(--spacing-xs);
    width: calc(100% - (2 * var(--spacing-xs)));
    box-sizing: border-box;
  }

  .categories-container > .category-item:first-child {
    margin-top: 0;
  }

  .subcategory-item {
    padding: var(--btn-padding-md);
    margin-top: 2px;
    margin-bottom: 2px;
    margin-left: var(--spacing-lg);
    margin-right: var(--spacing-xs);
    width: calc(100% - var(--spacing-lg) - var(--spacing-xs));
    font-weight: normal;
    color: var(--text-secondary);
    white-space: normal;
    line-height: 1.4;
    word-break: break-word;
    box-sizing: border-box;
    position: relative;
  }

  /* Circle aligned with category items */
  .subcategory-item::before {
    content: "";
    position: absolute;
    left: calc(-1 * var(--spacing-lg) + var(--spacing-xs));
    top: 50%;
    width: 8px;
    height: 8px;
    background-color: var(--primary);
    border-radius: 50%;
    transform: translateY(-50%);
  }

  .category-item.active,
  .subcategory-item.active {
    border: none;
    font-weight: var(--font-weight-bold);
    color: var(--button-text);
    box-shadow: var(--shadow-button);
  }

  .subcategory-item.active {
    font-weight: var(--font-weight-semibold);
  }

  .subcategory-item.active::before {
    background-color: var(--primary);
  }

  .category-item.active:hover,
  .subcategory-item.active:hover {
    background: linear-gradient(135deg, var(--primary-dark), var(--secondary));
    transform: translateY(var(--hover-lift));
    box-shadow: var(--shadow-medium);
    border: none;
  }

  /* Ensure active subcategory keeps primary color on hover */
  .subcategory-item.active:hover::before {
    background-color: var(--primary);
  }
</style>
