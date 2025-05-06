<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte";
  import { BarChart, Plus, Minus } from "lucide-svelte";
  import { encodeHashToBase64 } from "@holochain/client";
  import ReportCategoryDialog from "./ReportCategoryDialog.svelte";
  import ProductDetailModal from "./ProductDetailModal.svelte";
  import { createEventDispatcher } from "svelte";

  let showReportDialog = false;
  let showProductModal = false;
  const dispatch = createEventDispatcher();

  // Get cart service directly from the context
  const cartService = getContext("cartService");

  const preload = (node) => {
    // Start loading the image immediately if data-src is available
    if (node.dataset.src) {
      const img = new Image();
      img.src = node.dataset.src;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            // When approaching viewport
            const img = new Image();
            img.src = entry.target.dataset.src;
          }
        });
      },
      {
        rootMargin: "500% 0px", // Much larger buffer
        threshold: 0,
      },
    );

    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      },
    };
  };

  export let product;
  export let actionHash = undefined;

  // For tracking cart updates
  let itemCount = 0;
  let itemWeight = 1; // Default to 1 lb for weight items
  let unsubscribeCartState;
  let isServiceReady = false;
  let unsubscribeReadyState;

  // Determine if product is sold by weight
  $: isSoldByWeight = product.sold_by === "WEIGHT";
  $: displayAmount = isSoldByWeight ? itemWeight : itemCount;
  $: displayUnit = isSoldByWeight ? "lbs" : "ct";
  $: incrementValue = isSoldByWeight ? 0.25 : 1;

  // Store both original and base64 formats of the group hash
  let groupHashOriginal = ""; // Original format (comma-separated numbers)
  let groupHashBase64 = ""; // Base64 format
  let productIndex = 0;

  $: {
    const effectiveHash =
      actionHash ||
      product?.hash ||
      product?.action_hash ||
      product?.entry_hash ||
      product?.actionHash;

    if (
      effectiveHash &&
      typeof effectiveHash === "string" &&
      effectiveHash.includes("_")
    ) {
      const parts = effectiveHash.split("_");
      groupHashOriginal = parts[0];
      productIndex = parseInt(parts[1]) || 0;

      // Convert comma-separated to base64 if needed
      if (groupHashOriginal.includes(",")) {
        try {
          const byteArray = new Uint8Array(
            groupHashOriginal.split(",").map(Number),
          );
          groupHashBase64 = encodeHashToBase64(byteArray);
        } catch (e) {
          console.error("Error converting hash format:", e);
          groupHashBase64 = groupHashOriginal;
        }
      } else {
        // Already in base64 format
        groupHashBase64 = groupHashOriginal;
      }
    } else if (effectiveHash && typeof effectiveHash === "object") {
      // Check if it's a composite hash from search with groupHash and index
      if (effectiveHash.groupHash && typeof effectiveHash.index === "number") {
        // It's a composite hash - extract components
        if (typeof effectiveHash.groupHash === "string") {
          // GroupHash is already a string (likely base64)
          groupHashOriginal = effectiveHash.groupHash;
          groupHashBase64 = effectiveHash.groupHash;
        } else {
          // GroupHash is a Uint8Array
          groupHashOriginal = String(effectiveHash.groupHash);
          groupHashBase64 = encodeHashToBase64(effectiveHash.groupHash);
        }
        // Use the index from composite hash
        productIndex = effectiveHash.index;
      } else {
        // Fallback for backward compatibility - treat as Uint8Array
        groupHashOriginal = String(effectiveHash);
        groupHashBase64 = encodeHashToBase64(effectiveHash);
        productIndex = 0; // Assume index 0 if not specified
      }
    } else if (
      effectiveHash &&
      typeof effectiveHash === "string" &&
      !effectiveHash.includes("_")
    ) {
      // It's already a base64 string
      groupHashOriginal = effectiveHash;
      groupHashBase64 = effectiveHash;
      productIndex = 0;
    }
  }

  // Update item count whenever it changes
  function updateItemCount(items) {
    if (!items || !Array.isArray(items)) return;

    // Try to find the item by either the original hash format or the base64 format
    const item = items.find(
      (item) =>
        (item &&
          item.groupHash === groupHashBase64 &&
          item.productIndex === productIndex) ||
        (item &&
          item.groupHash === groupHashOriginal &&
          item.productIndex === productIndex),
    );

    if (item) {
      if (isSoldByWeight) {
        itemWeight = item.quantity;
      } else {
        itemCount = item.quantity;
      }
    } else {
      itemCount = 0;
      itemWeight = 0; // Keep at 0 to show +ADD button
    }
  }

  onMount(() => {
    if ($cartService) {
      // Subscribe to ready state
      unsubscribeReadyState = $cartService.ready.subscribe((ready) => {
        isServiceReady = ready;

        // If ready, check cart items immediately
        if (ready) {
          const items = $cartService.getCartItems();
          updateItemCount(items);
        }
      });

      // Subscribe to cart items
      unsubscribeCartState = $cartService.subscribe((items) => {
        updateItemCount(items);
      });

      // Initial check if service is already ready
      if (isServiceReady) {
        const items = $cartService.getCartItems();
        updateItemCount(items);
      }
    }
  });

  onDestroy(() => {
    if (typeof unsubscribeCartState === "function") {
      unsubscribeCartState();
    }

    if (typeof unsubscribeReadyState === "function") {
      unsubscribeReadyState();
    }
  });

  // Function to handle report button click
  function handleReportClick(e) {
    e.stopPropagation();
    dispatch("reportCategory", product);
  }

  // Handle report submission
  async function handleReportSubmit(event) {
    const reportData = event.detail;

    try {
      const response = await fetch(
        "http://localhost:3000/api/report-category",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reportData),
        },
      );

      if (response.ok) {
        alert(
          "Thank you for your feedback! This will help improve our categorization system.",
        );
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error) {
      console.error("Error submitting category report:", error);
      alert(
        "There was an error submitting your report. Please try again later.",
      );
    }
  }

  // Handle the main "Add" button click
  function handleButtonClick(e) {
    e.stopPropagation();
    if (!$cartService) {
      console.warn("Cart service not available");
      return;
    }

    addProductToCart();
  }

  function handleCardClick(e) {
    // Prevent modal from opening when clicking on specific interactive elements
    if (
      e.target.closest(".add-btn") ||
      e.target.closest(".report-btn") ||
      e.target.closest(".minus") ||
      e.target.closest(".plus")
    ) {
      return;
    }

    showProductModal = true;
  }

  // Add product to cart
  async function addProductToCart() {
    try {
      const quantity = isSoldByWeight ? 1 : 1; // Default to 1 lb or 1 ct
      const result = await $cartService.addToCart(
        groupHashBase64,
        productIndex,
        quantity,
      );
    } catch (error) {
      console.error("Error adding to cart:", error);
    }
  }

  // Increment item quantity
  async function incrementCount(e) {
    e.stopPropagation();
    if (!$cartService) return;

    try {
      const currentAmount = isSoldByWeight ? itemWeight : itemCount;
      const newAmount = currentAmount + incrementValue;
      await $cartService.addToCart(groupHashBase64, productIndex, newAmount);
    } catch (error) {
      console.error("Error incrementing item:", error);
    }
  }

  // Decrement item quantity
  async function decrementCount(e) {
    e.stopPropagation();
    if (!$cartService) return;

    try {
      const currentAmount = isSoldByWeight ? itemWeight : itemCount;
      const newAmount = currentAmount - incrementValue;

      if (newAmount > 0) {
        await $cartService.addToCart(groupHashBase64, productIndex, newAmount);
      } else {
        await $cartService.addToCart(groupHashBase64, productIndex, 0);
      }
    } catch (error) {
      console.error("Error decrementing item:", error);
    }
  }

  function getStockText(status) {
    if (status === "HIGH") return "Many in stock";
    if (status === "LOW") return "Low stock";
    return "Maybe out";
  }

  function getStockColor(status) {
    if (status === "HIGH") return "#2e7d32"; // Green
    if (status === "LOW") return "#fbc02d"; // Yellow
    return "#d32f2f"; // Red
  }
</script>

<div
  class="product-card"
  use:preload
  data-src={product.image_url}
  on:click={handleCardClick}
>
  <button
    class="add-btn {displayAmount > 0 ? 'expanded' : ''}"
    on:click={(e) => {
      console.log("Add button clicked");
      handleButtonClick(e);
    }}
  >
    {#if displayAmount > 0}
      <span class="minus" on:click|stopPropagation={decrementCount}>
        <Minus size={16} color="white" />
      </span>
      <span class="count" on:click|stopPropagation={() => {}}>
        {displayAmount}
        {displayUnit}
      </span>
      <span class="plus" on:click|stopPropagation={incrementCount}>
        <Plus size={20} color="white" />
      </span>
    {:else}
      <span class="plus-icon">
        <Plus size={20} color="white" />
      </span>
      <span class="add-text">Add</span>
      <span class="expand-text">to cart</span>
    {/if}
  </button>
  <button
    class="report-btn"
    on:click|stopPropagation={handleReportClick}
    title="Report incorrect category"
  >
    🚩
  </button>
  <div class="product-card-content">
    {#if product.image_url}
      <img
        src={product.image_url}
        alt={product.name}
        class="product-image"
        loading="eager"
      />
    {/if}
    <div class="prices">
      {#if product.promo_price && product.promo_price < product.price}
        <div class="price-row">
          <div class="promo-price">
            ${Number(product.promo_price).toFixed(2)}{isSoldByWeight
              ? " /lb"
              : ""}
          </div>
          <div class="regular-price">
            reg. ${Number(product.price).toFixed(2)}{isSoldByWeight
              ? " /lb"
              : ""}
          </div>
        </div>
        <div class="promo-label">With loyalty card</div>
      {:else}
        <div class="regular-price-solo">
          ${Number(product.price).toFixed(2)}{isSoldByWeight ? " /lb" : ""}
        </div>
      {/if}
    </div>
    <div class="name">{product.name}</div>
    <div class="size">{product.size}</div>
    <div class="stock" style="display: flex; align-items: center;">
      <BarChart
        size={30}
        style="margin-right: 5px; color: {getStockColor(
          product.stocks_status,
        )};"
      />
      {getStockText(product.stocks_status)}
    </div>
  </div>
</div>

<!-- Add the ReportCategoryDialog component -->
<ReportCategoryDialog
  bind:isOpen={showReportDialog}
  {product}
  on:submit={handleReportSubmit}
/>

<!-- Add the ProductDetailModal component -->
<ProductDetailModal
  bind:isOpen={showProductModal}
  {product}
  {groupHashBase64}
  {productIndex}
  on:addToCart={handleButtonClick}
/>

<style>
  .product-card {
    position: relative;
    width: 245px;
    min-width: 245px;
    height: 450px;
    margin: 0;
    padding: 0px;
    background-color: #ffffff;
    box-shadow: none;
    transition: all 0.25s ease;
    transform: scale(1) translate3d(0, 0, 0);
    overflow: hidden;
    will-change: transform;
    cursor: pointer;
  }

  .product-card-content {
    display: flex;
    flex-direction: column;
    padding-right: 0px;
  }

  .product-image {
    width: 245px;
    height: 245px;
    object-fit: contain;
    margin: 0 auto 0px auto;
    padding: 0;
  }

  .prices {
    margin-bottom: 2px;
  }

  .price-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .promo-price {
    font-size: 24px;
    font-weight: bold;
    color: #000;
    background-color: #fdd400;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .regular-price {
    font-size: 20px;
    color: #666;
  }

  .regular-price-solo {
    font-size: 24px;
    font-weight: bold;
    color: #000;
  }

  .promo-label {
    font-size: 14px;
    font-weight: bold;
    color: #333;
    background-color: #fdd400;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }

  .name {
    font-size: 18px;
    margin-bottom: 2px;
    line-height: 1.2;
  }

  .size {
    font-size: 16px;
    color: #666;
    margin-bottom: 2px;
  }

  .stock {
    font-size: 16px;
    color: #000;
  }

  /* Button styles - cleaned up and fixed */
  .add-btn {
    position: absolute;
    top: 0px;
    right: 0px;
    background-color: rgb(61, 61, 61);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    min-width: 80px;
    width: 80px;
    height: 45px;
    transition:
      width 0.5s ease,
      background-color 0.3s;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .plus-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    margin-right: 4px;
  }

  .add-btn:hover {
    background-color: rgb(61, 61, 61);
    border: none;
    width: 135px;
  }

  .plus-icon {
    color: white;
    margin-right: 4px;
  }

  .add-text {
    color: white;
    white-space: nowrap;
  }

  .expand-text {
    color: white;
    white-space: nowrap;
    margin-left: 4px;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transition:
      max-width 0.5s ease,
      opacity 0.3s ease;
  }

  .add-btn:hover .expand-text {
    max-width: 100px;
    opacity: 1;
  }

  /* Counter button styles */
  .add-btn.expanded {
    width: 150px;
    display: flex;
    justify-content: space-between;
    padding: 0;
    overflow: hidden;
    border: none;
  }

  .minus,
  .plus {
    cursor: pointer;
    padding: 8px 10px;
    color: white;
    transition: background-color 0.2s;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .minus:hover,
  .plus:hover {
    background-color: rgba(0, 0, 0, 0.2);
  }

  .count {
    margin: 0 8px;
    white-space: nowrap;
    color: white;
  }

  /* Report button */
  .report-btn {
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: transparent;
    border: none;
    cursor: pointer;
    font-size: 16px;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .report-btn:hover {
    opacity: 1;
  }
</style>
