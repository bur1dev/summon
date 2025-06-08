<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte";
  import type { Writable } from "svelte/store";
  import { BarChart, Plus, Minus, Flag } from "lucide-svelte";
  import ReportCategoryDialog from "../../reports/components/ReportCategoryDialog.svelte";
  import ProductDetailModal from "./modal/ProductDetailModal.svelte";
  import { createEventDispatcher } from "svelte";
  import { clickable } from "../../shared/actions/clickable";

  import { PriceService } from "../../services/PriceService";
  import { StockService } from "../../services/StockService";
  import type { CartBusinessService } from "../../cart/services/CartBusinessService";
  import { CartInteractionService } from "../../cart/services/CartInteractionService";
  import {
    isSoldByWeight,
    parseProductHash,
    getEffectiveHash,
    formatQuantityDisplay,
  } from "../../cart/utils/cartHelpers";

  export let selectedCategory: string = "";
  export let selectedSubcategory: string = "";

  let showReportDialog: boolean = false;
  let showProductModal: boolean = false;

  const dispatch = createEventDispatcher();

  // Get cart service directly from the context and type it as a Svelte store
  const cartService =
    getContext<Writable<CartBusinessService | null>>("cartService");

  export let product: any;
  export let actionHash: any = undefined;

  // For tracking cart updates
  let itemCount: number = 0;
  let itemWeight: number = 1; // Default to 1 lb for weight items
  let unsubscribeCartState: (() => void) | null = null;
  let isServiceReady: boolean = false;
  let unsubscribeReadyState: (() => void) | null = null;

  // Use cart helpers for product properties
  $: productIsSoldByWeight = isSoldByWeight(product);
  $: displayAmount = productIsSoldByWeight ? itemWeight : itemCount;

  // Use PriceService for display prices
  $: displayPrices = PriceService.getDisplayPrices(product);

  // Use StockService for stock information
  $: stockInfo = StockService.getStockInfo(product);

  // Use cart helpers for hash parsing
  let groupHashBase64: string = "";
  let productIndex: number = 0;

  $: {
    const effectiveHash = getEffectiveHash(product, actionHash);
    const parsed = parseProductHash(effectiveHash);
    groupHashBase64 = parsed.groupHash;
    productIndex = parsed.productIndex;
  }

  // Update item count whenever it changes
  function updateItemCount(items: any[]) {
    const quantity = CartInteractionService.getCurrentQuantity(
      items,
      groupHashBase64,
      productIndex,
    );

    if (quantity > 0) {
      if (productIsSoldByWeight) {
        itemWeight = quantity;
      } else {
        itemCount = quantity;
      }
    } else {
      itemCount = 0;
      itemWeight = 0; // Keep at 0 to show +ADD button
    }
  }

  onMount(() => {
    if ($cartService) {
      // Subscribe to ready state
      unsubscribeReadyState = $cartService.ready.subscribe((ready: boolean) => {
        isServiceReady = ready;

        // If ready, check cart items immediately
        if (ready) {
          const items = $cartService.getCartItems();
          updateItemCount(items);
        }
      });

      // Subscribe to cart items
      unsubscribeCartState = $cartService.subscribe((items: any[]) => {
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
  function handleReportClick(e: MouseEvent) {
    e.stopPropagation();
    dispatch("reportCategory", product);
  }

  // Handle report submission
  async function handleReportSubmit(event: CustomEvent) {
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
  function handleButtonClick(e: MouseEvent | CustomEvent) {
    e.stopPropagation();
    if (!$cartService) {
      console.warn("Cart service not available");
      return;
    }

    console.log("ProductCard hash info:", {
      effectiveHash: actionHash || product?.hash,
      groupHashBase64,
      productIndex,
    });

    addProductToCart();
  }

  function handleCardClick(e?: Event) {
    // With clickable action, counter buttons use stopPropagation
    // So we only need to check for add-btn and report-btn
    if (e && e.target) {
      const target = e.target as Element;
      if (
        target.closest(".add-btn") ||
        target.closest(".report-btn")
      ) {
        return;
      }
    }

    showProductModal = true;
  }

  async function handleIncrementClick() {
    const currentAmount = productIsSoldByWeight ? itemWeight : itemCount;
    await CartInteractionService.incrementItem(
      cartService,
      groupHashBase64,
      productIndex,
      currentAmount,
      product,
    );
  }

  async function handleDecrementClick() {
    const currentAmount = productIsSoldByWeight ? itemWeight : itemCount;
    await CartInteractionService.decrementItem(
      cartService,
      groupHashBase64,
      productIndex,
      currentAmount,
      product,
    );
  }

  // Add product to cart using centralized service
  async function addProductToCart() {
    await CartInteractionService.addToCart(
      cartService,
      groupHashBase64,
      productIndex,
    );
  }


</script>

<div
  class="product-card fade-in"
  use:clickable={handleCardClick}
>
  <button
    class="add-btn btn {displayAmount > 0
      ? 'counter-btn-group expanded'
      : 'btn-icon btn-icon-primary'}"
    on:click={(e) => {
      console.log("Add button clicked");
      handleButtonClick(e);
    }}
  >
    {#if displayAmount > 0}
      <span
        class="minus counter-btn"
        aria-label="Decrease quantity"
        use:clickable={{ handler: handleDecrementClick, stopPropagation: true }}
      >
        <Minus size={20} color="white" />
      </span>
      <span
        class="count counter-value"
        aria-label="Current quantity"
      >
        {formatQuantityDisplay(displayAmount, product)}
      </span>
      <span
        class="plus counter-btn"
        aria-label="Increase quantity"
        use:clickable={{ handler: handleIncrementClick, stopPropagation: true }}
      >
        <Plus size={20} color="white" />
      </span>
    {:else}
      <span class="plus-icon">
        <Plus size={20} color="white" />
      </span>
    {/if}
  </button>
  <button
    class="report-btn btn btn-icon-sm"
    on:click|stopPropagation={handleReportClick}
    title="Report incorrect category"
  >
    <Flag size={16} />
  </button>
  <div class="product-card-content">
    <!-- Rest of the content remains unchanged -->
    {#if product.image_url}
      <img src={product.image_url} alt={product.name} class="product-image" />
    {:else}
      <!-- Optional: Placeholder for products without images -->
      <div class="product-image placeholder-image">No Image</div>
    {/if}
    <div class="prices">
      {#if displayPrices.hasPromo}
        <div class="price-row">
          <div class="promo-price">
            {displayPrices.promoPrice}
          </div>
          <div class="regular-price">
            {displayPrices.regularPrice}
          </div>
        </div>
        <div class="promo-label">{displayPrices.loyaltyLabel}</div>
      {:else}
        <div class="regular-price-solo">
          {displayPrices.soloPrice}
        </div>
      {/if}
    </div>
    <div class="name">{product.name}</div>
    <div class="size">{product.size}</div>
    <div class="stock" style="display: flex; align-items: center;">
      <BarChart
        size={30}
        style="margin-right: 5px; color: {stockInfo.color};"
      />
      {stockInfo.text}
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
  {selectedCategory}
  {selectedSubcategory}
  on:addToCart={handleButtonClick}
  on:productTypeSelect={(event) => dispatch("productTypeSelect", event.detail)}
/>

<style>
  .product-card {
    position: relative;
    width: 245px;
    min-width: 245px;
    height: 450px;
    margin: 0;
    padding: 0;
    box-shadow: none;
    transition: var(--card-transition);
    overflow: visible;
    cursor: pointer;
    border: none;
    border-radius: var(--card-border-radius);
    box-sizing: border-box;
  }

  /* Disable transitions during scroll */
  :global(.products-grid .product-card) {
    transition: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    opacity: 1 !important;
    animation: none !important;
  }

  .product-card-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0;
  }

  .product-image {
    width: 100%;
    height: 245px;
    object-fit: contain;
    padding: 5px;
    box-sizing: border-box;
    display: block;
  }

  .placeholder-image {
    width: 100%;
    height: 245px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f0f0f0;
    color: #ccc;
    font-size: 16px;
    box-sizing: border-box;
  }

  /* Price styling remains unchanged */
  .prices {
    margin-bottom: 2px;
  }

  .price-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: 4px;
  }

  .promo-price {
    font-size: 24px;
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    background-color: var(--warning);
    padding: 4px var(--spacing-xs);
    border-radius: 4px;
    display: inline-block;
  }

  .regular-price {
    font-size: var(--spacing-lg);
    color: var(--text-secondary);
  }

  .regular-price-solo {
    font-size: 24px;
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
  }

  .promo-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    background-color: var(--warning);
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }

  .name {
    font-size: 18px;
    margin-bottom: 2px;
    line-height: 1.2;
    color: var(--text-primary);
  }

  .size {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin-bottom: 2px;
  }

  .stock {
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  /* Button positioning only */
  .add-btn {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 10;
    /* Styling comes from button system */
  }

  .add-btn.expanded {
    width: 170px;
    border-radius: 30px;
  }

  .plus-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  /* Counter button styles - futuristic look */
  .add-btn.expanded {
    width: 180px;
    border-radius: 30px; /* Pill shape when expanded */
    display: flex;
    justify-content: space-between;
    padding: 0;
    overflow: hidden;
    border: none;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
  }

  .minus,
  .plus {
    cursor: pointer;
    width: var(--btn-height-md);
    height: var(--btn-height-md);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: var(--btn-transition);
    background-color: rgba(0, 0, 0, 0.15);
  }

  .minus:hover,
  .plus:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }

  /* Add global styles for SVG icons in buttons */
  :global(.minus svg),
  :global(.plus svg),
  :global(.plus-icon svg) {
    color: var(--button-text);
    stroke: var(--button-text);
  }

  .count {
    margin: 0;
    white-space: nowrap;
    color: var(--button-text);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 0 5px;
    min-width: 60px;
    font-size: var(--font-size-md);
  }
  .report-btn {
    position: absolute;
    top: var(--spacing-sm);
    left: var(--spacing-sm);
    font-size: var(--font-size-md);
    opacity: 0.6;
    z-index: 10;
    transition: opacity var(--transition-fast);
    background-color: transparent;
  }

  .report-btn:hover {
    opacity: 1;
  }
</style>
