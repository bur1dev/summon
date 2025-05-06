<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { ShopStore } from "./store";
  import { createEventDispatcher } from "svelte";
  import { mainCategories } from "./categoryData";
  import Icon from "@iconify/svelte";

  import {
    isHomeViewStore,
    selectedCategoryStore,
    selectedSubcategoryStore,
  } from "./UiStateStore";

  const dispatch = createEventDispatcher();

  const { getStore }: any = getContext("store");
  let store: ShopStore = getStore();

  let currentPage = 0;
  let hasMore = false;
  let totalProducts = 0;

  let selectedCategory = null;
  let selectedSubcategory = null;
  let sidebarElement;
  let headerElement;
  let logoShrunk = false;
  let isScrolling = false;
  let lastScrollTop = 0;
  let scrollLock = false;

  // Spacing offset to fine-tune category positioning
  const CATEGORY_POSITION_OFFSET = 5;

  // Subscribe to the stores to keep local variables in sync
  $: selectedCategory = $selectedCategoryStore;
  $: selectedSubcategory = $selectedSubcategoryStore;

  // Completely disable scroll-based animation for now
  // We'll only use manual navigation-triggered state changes
  function handleScroll() {
    if (scrollLock || !sidebarElement) return;

    const scrollTop = sidebarElement.scrollTop;

    // Only apply shrinking when scrolling down significantly
    // Use different thresholds for shrinking and expanding (hysteresis)
    if (scrollTop > 80 && !logoShrunk) {
      logoShrunk = true;
    } else if (scrollTop < 20 && logoShrunk) {
      logoShrunk = false;
    }

    lastScrollTop = scrollTop;
  }

  onMount(() => {
    if (sidebarElement) {
      // Use passive true for better performance
      sidebarElement.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    return () => {
      if (sidebarElement) {
        sidebarElement.removeEventListener("scroll", handleScroll);
      }
    };
  });

  function selectCategory(category, event) {
    // Lock scrolling state changes during navigation
    scrollLock = true;

    currentPage = 0;
    $selectedCategoryStore = category;
    $selectedSubcategoryStore = null;
    $isHomeViewStore = false;

    // First determine if we need to shrink the header based on the clicked category
    const allCategoryItems = Array.from(
      sidebarElement.querySelectorAll(".category-item"),
    );
    const clickedIndex = allCategoryItems.findIndex(
      (item) => item.textContent.trim() === category,
    );

    // If it's one of the lower categories, pre-emptively shrink the header
    if (clickedIndex > 1) {
      logoShrunk = true;
    }

    // Wait for UI to update with new selection before scrolling
    setTimeout(() => {
      if (sidebarElement) {
        // Find the newly selected category element
        const selectedElement = sidebarElement.querySelector(
          ".category-item.selected",
        );

        if (selectedElement && headerElement) {
          // Give the DOM time to update with header size changes
          setTimeout(() => {
            // Get the actual current header height AFTER any size changes have applied
            const actualHeaderHeight = headerElement.offsetHeight;

            // Calculate exact position to place selected category at the top edge of the content area
            const targetPosition = Math.max(
              0,
              selectedElement.offsetTop -
                actualHeaderHeight -
                CATEGORY_POSITION_OFFSET,
            );

            // Use smooth scroll for better UX
            sidebarElement.scrollTo({
              top: targetPosition,
              behavior: "smooth",
            });

            // Release scroll lock after all animations complete
            setTimeout(() => {
              scrollLock = false;
            }, 500);
          }, 20);
        } else {
          scrollLock = false;
        }
      } else {
        scrollLock = false;
      }
    }, 50); // Increased delay to ensure DOM is fully updated

    dispatch("categorySelect", { category, subcategory: null });
  }

  function selectSubcategory(subcategory) {
    currentPage = 0;
    $selectedSubcategoryStore = subcategory;
    $isHomeViewStore = false;

    dispatch("categorySelect", {
      category: selectedCategory,
      subcategory,
    });
  }

  function goToHome() {
    scrollLock = true;

    $selectedCategoryStore = null;
    $selectedSubcategoryStore = null;
    $isHomeViewStore = true;

    // Scroll to top when going home
    if (sidebarElement) {
      sidebarElement.scrollTo({ top: 0, behavior: "smooth" });

      // Reset logo state and unlock scrolling after animation completes
      setTimeout(() => {
        logoShrunk = false;
        scrollLock = false;
      }, 500);
    }

    dispatch("categorySelect", { category: null, subcategory: null });
  }
</script>

<div class="sidebar" bind:this={sidebarElement}>
  <div
    class="sidebar-header"
    class:shrunk={logoShrunk}
    bind:this={headerElement}
  >
    <div class="store-logo-container" on:click={goToHome}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={logoShrunk ? 40 : 60}
        height={logoShrunk ? 40 : 60}
        viewBox="0 0 256 256"
        class="store-logo"
        fill="none"
        stroke="#343538"
        stroke-width="12"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M48 96V224h160V96M224 48H32l16 48h160l16-48z M112 96a16 16 0 0 1-32 0M176 96a16 16 0 0 1-32 0"
        />
      </svg>
      <div class="store-name">Ralphs Store</div>
    </div>
  </div>

  <div class="categories-container">
    {#each mainCategories as category}
      <div
        class="category-item"
        class:selected={selectedCategory === category.name &&
          !selectedSubcategory}
        on:click={(event) => selectCategory(category.name, event)}
      >
        {category.name}
      </div>

      {#if selectedCategory === category.name}
        {#each category.subcategories as subcategory (subcategory.name)}
          <div
            class="subcategory-item"
            class:selected={selectedSubcategory === subcategory.name}
            on:click|stopPropagation={() => selectSubcategory(subcategory.name)}
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
    width: 250px;
    height: calc(100vh - 72px);
    border-right: 1px solid #e0e0e0;
    background: white;
    padding: 0;
    overflow-y: auto;
    position: fixed;
    left: 0;
    box-sizing: border-box;
    -webkit-overflow-scrolling: touch;
  }

  .sidebar-header {
    position: sticky;
    top: 0;
    background: white;
    z-index: 10;
    padding-top: 15px;
    padding-bottom: 10px;
    transition: all 0.3s;
    border-bottom: 1px solid #f0f0f0;
    will-change: transform;
  }

  .sidebar-header.shrunk {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .store-logo-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0 20px;
    transition: transform 0.3s;
  }

  :global(.store-logo) {
    transition: all 0.3s ease !important;
    will-change: transform;
  }

  .store-logo-container:hover :global(.store-logo) {
    transform: scale(1.2) !important;
  }

  .store-name {
    font-size: 20px;
    font-weight: 600;
    margin-top: 5px;
    color: #333;
    /* Remove transition for font-size to keep it constant */
  }

  /* Remove font-size changes for shrunk state */
  .shrunk .store-name {
    margin-top: 2px;
  }

  .categories-container {
    padding-top: 5px;
  }

  .category-item {
    padding: 8px 16px;
    margin: 0;
    cursor: pointer;
    font-size: 16px;
    color: #343538;
    border-radius: 25px;
    transition: all 0.1s ease;
    font-weight: 700;
  }

  .subcategory-item {
    padding: 8px 16px 8px 32px; /* Left padding for indentation */
    margin: 0;
    cursor: pointer;
    font-size: 16px;
    color: #494949;
    border-radius: 25px;
    transition: all 0.1s ease;
    font-weight: normal;
  }

  .category-item:hover:not(.selected),
  .subcategory-item:hover:not(.selected) {
    background: #f5f5f5;
  }

  .category-item.selected {
    background: #343538;
    color: white;
    font-weight: 700; /* Keep categories bold when selected */
  }

  .subcategory-item.selected {
    background: #343538;
    color: white;
    font-weight: normal; /* Keep subcategories non-bold when selected */
  }
</style>
