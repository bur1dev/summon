<script lang="ts">
  import { getContext } from "svelte";
  import type { ShopStore } from "./store";
  import { createEventDispatcher } from "svelte";
  import { mainCategories } from "./categoryData";

  const dispatch = createEventDispatcher();

  const { getStore }: any = getContext("store");
  let store: ShopStore = getStore();

  let currentPage = 0;
  let hasMore = false;
  let totalProducts = 0;

  let selectedCategory = null;
  let selectedSubcategory = null;

  function selectCategory(category, event) {
    currentPage = 0;
    selectedCategory = category;
    selectedSubcategory = null;

    setTimeout(() => {
      const categoryElement = event?.target.closest(".category-item");
      if (categoryElement) {
        const sidebarContainer = categoryElement.closest(".sidebar");
        if (sidebarContainer) {
          const headerHeight = 115;
          const topOffset =
            categoryElement.getBoundingClientRect().top -
            sidebarContainer.getBoundingClientRect().top;

          sidebarContainer.scrollTo({
            top: Math.max(
              0,
              sidebarContainer.scrollTop + topOffset - headerHeight + 115,
            ), // Adjusted offset
            behavior: "smooth",
          });
        }
      }
    }, 50);

    dispatch("categorySelect", { category, subcategory: null });
  }

  function selectSubcategory(subcategory) {
    // Removed category parameter

    currentPage = 0;
    selectedSubcategory = subcategory;
    dispatch("categorySelect", {
      category: selectedCategory,
      subcategory, // Just pass subcategory directly
    });
  }
</script>

<div class="sidebar">
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

<style>
  .sidebar {
    width: 250px;
    height: calc(100vh - 60px);
    border-right: 1px solid #e0e0e0;
    background: white;
    padding: 0;
    overflow-y: auto;
    position: fixed;
    left: 0; /* Change from 5px to 0 */
    box-sizing: border-box;
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
