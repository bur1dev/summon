<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { BarChart } from "lucide-svelte";
  import { encodeHashToBase64 } from "@holochain/client";
  import ReportCategoryDialog from "./ReportCategoryDialog.svelte";
  import { createEventDispatcher } from "svelte";

  let showReportDialog = false;
  const dispatch = createEventDispatcher();

  // Get cart service directly from the context
  const cartService = getContext("cartService");
  console.log(
    "ProductSticky - cartService:",
    $cartService ? "AVAILABLE" : "MISSING",
  );

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
  export let board = undefined; // Keep for interface compatibility

  // Get the actual hash from the product if actionHash wasn't provided
  // Look for common patterns: hash, action_hash, entry_hash, etc.
  const effectiveHash =
    actionHash ||
    product?.hash ||
    product?.action_hash ||
    product?.entry_hash ||
    product?.actionHash;

  // For debugging product props
  console.log("ProductSticky initialized with:", {
    product,
    providedActionHash: actionHash,
    effectiveHash,
    productKeys: product ? Object.keys(product) : null,
  });

  // Get item count directly from cartService
  let itemCount = 0;
  let unsubscribeCartState;

  onMount(() => {
    // Initialize with zero count to avoid null/undefined issues
    itemCount = 0;

    if ($cartService) {
      console.log("Setting up cart subscription");

      // Subscribe to cart changes
      unsubscribeCartState = $cartService.subscribe((items) => {
        if (!items || !Array.isArray(items)) return;

        // Get product ID from effectiveHash if possible
        if (effectiveHash) {
          const productId = encodeHashToBase64(effectiveHash);
          const item = items.find((item) => item.productHash === productId);
          itemCount = item ? item.quantity : 0;
        }
      });
    } else {
      console.warn("Cart service not available for subscription");
    }

    return () => {
      if (typeof unsubscribeCartState === "function") {
        try {
          unsubscribeCartState();
        } catch (e) {
          console.error("Error unsubscribing from cart state:", e);
        }
      }
    };
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
  function handleButtonClick() {
    console.log("Button clicked", {
      actionHash,
      product,
      cartService: !!$cartService,
    });

    if (!$cartService) {
      console.warn("Cart service not available");
      return;
    }

    // Use real actionHash if available, otherwise generate a pseudo-hash
    const productId = effectiveHash
      ? encodeHashToBase64(effectiveHash)
      : `temp_${product.name.replace(/\s+/g, "_").toLowerCase()}`;

    if (!productId) {
      console.warn(
        "No actionHash or valid product data to generate ID",
        product,
      );
      return;
    }

    console.log("Adding product to cart with ID:", productId);
    addProductToCart(productId);
  }

  // Add product to cart
  async function addProductToCart(productId) {
    try {
      console.log("Adding product to cart", {
        productId,
        productName: product.name,
        quantity: 1,
      });

      const result = await $cartService.addToCart(productId, 1);
      console.log("Product added to cart result:", result);
    } catch (error) {
      console.error("Error adding product to cart:", error);
      console.error("Error details:", {
        error,
        errorMessage: error.message,
        product,
      });
    }
  }

  // Increment item quantity
  async function incrementCount(e) {
    e.stopPropagation();
    if (!$cartService) return;

    let productId;
    if (effectiveHash) {
      productId = encodeHashToBase64(effectiveHash);
    } else if (product?.name) {
      productId = `temp_${product.name.replace(/\s+/g, "_").toLowerCase()}`;
    } else {
      return; // No way to identify the product
    }

    try {
      await $cartService.addToCart(productId, itemCount + 1);
    } catch (error) {
      console.error("Error incrementing item:", error);
    }
  }

  // Decrement item quantity
  async function decrementCount(e) {
    e.stopPropagation();
    if (!$cartService) return;

    let productId;
    if (effectiveHash) {
      productId = encodeHashToBase64(effectiveHash);
    } else if (product?.name) {
      productId = `temp_${product.name.replace(/\s+/g, "_").toLowerCase()}`;
    } else {
      return; // No way to identify the product
    }

    try {
      if (itemCount > 1) {
        await $cartService.addToCart(productId, itemCount - 1);
      } else {
        await $cartService.addToCart(productId, 0);
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

<div class="sticky" use:preload data-src={product.image_url}>
  <button
    class="add-btn {itemCount > 0 ? 'expanded' : ''}"
    on:click={() => {
      console.log("Add button clicked");
      handleButtonClick();
    }}
  >
    {#if itemCount > 0}
      <span class="minus" on:click|stopPropagation={decrementCount}>-</span>
      <span class="count">{itemCount} ct</span>
      <span class="plus" on:click|stopPropagation={incrementCount}>+</span>
    {:else}
      <span class="plus-icon">+</span>
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
  <div class="sticky-content">
    {#if product.image_url}
      <img
        src={product.image_url}
        alt={product.name}
        class="product-image"
        loading="eager"
      />
    {/if}
    <div class="price">${Number(product.price).toFixed(2)}</div>
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

<style>
  .sticky {
    position: relative;
    width: 245px;
    min-width: 245px;
    height: 420px;
    margin: 0;
    padding: 0px;
    background: linear-gradient(180deg, rgb(253, 252, 252) 0%, #ffffff 100%);
    box-shadow: none;
    transition: all 0.25s ease;
    transform: scale(1) translate3d(0, 0, 0);
    overflow-y: visible;
    will-change: transform;
  }

  .sticky-content {
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

  .price {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 2px;
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
    color: #494949;
  }

  /* Button styles - cleaned up and fixed */
  .add-btn {
    position: absolute;
    top: 0px;
    right: 0px;
    background-color: #1a8b51;
    color: white;
    border: 2px solid rgb(32, 200, 51);
    border-radius: 20px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    min-width: 70px;
    width: 70px;
    transition:
      width 0.5s ease,
      background-color 0.3s;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .add-btn:hover {
    background-color: #1a8b51;
    border: 2px solid rgb(32, 200, 51);
    width: 125px;
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
    width: 125px;
    display: flex;
    justify-content: space-between;
    padding: 0;
    overflow: hidden;
    border: 2px solid rgb(32, 200, 51); /* Ensure expanded state keeps the border */
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
