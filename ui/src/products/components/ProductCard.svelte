<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte";
  import type { Writable } from "svelte/store";
  import ReportCategoryDialog from "../../reports/components/ReportCategoryDialog.svelte";
  import ProductDetailModal from "./modal/ProductDetailModal.svelte";
  import ProductCardDisplay from "./ProductCardDisplay.svelte";
  import ProductCardActions from "./ProductCardActions.svelte";
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
      if (target.closest(".add-btn") || target.closest(".report-btn")) {
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
      undefined, // note
      product
    );
  }
</script>

<div class="product-card fade-in" use:clickable={handleCardClick}>
  <ProductCardActions
    {product}
    {displayAmount}
    onAdd={(e) => {
      console.log("Add button clicked");
      handleButtonClick(e);
    }}
    onIncrement={handleIncrementClick}
    onDecrement={handleDecrementClick}
    onReport={handleReportClick}
  />

  <ProductCardDisplay {product} {displayPrices} {stockInfo} />
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
</style>
