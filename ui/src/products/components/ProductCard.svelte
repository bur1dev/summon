<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import ReportCategoryDialog from "../../reports/components/ReportCategoryDialog.svelte";
  import ProductDetailModal from "./modal/ProductDetailModal.svelte";
  import ProductCardDisplay from "./ProductCardDisplay.svelte";
  import ProductCardActions from "./ProductCardActions.svelte";
  import { createEventDispatcher } from "svelte";
  import { clickable } from "../../shared/actions/clickable";

  import { PriceService } from "../../services/PriceService";
  import { StockService } from "../../services/StockService";
  import { cartItems, isCheckoutSession } from "../../cart/services/CartBusinessService";
  import { addProductToCart, incrementItem, decrementItem } from "../../cart/services/CartInteractionService";
  import { isSoldByWeight, parseProductHash } from "../../cart/utils/cartHelpers";

  export let selectedCategory: string = "";
  export let selectedSubcategory: string = "";

  let showReportDialog: boolean = false;
  let showProductModal: boolean = false;

  const dispatch = createEventDispatcher();

  // Cart service is now store-based, no context needed

  export let product: any;
  export const actionHash: any = undefined; // External reference only

  // For tracking cart updates
  let itemCount: number = 0;
  let itemWeight: number = 1; // Default to 1 lb for weight items
  let unsubscribeCartState: (() => void) | null = null;

  // Use cart helpers for product properties
  $: productIsSoldByWeight = isSoldByWeight(product);
  // Show zero quantities when in checkout session
  $: displayAmount = $isCheckoutSession ? 0 : (productIsSoldByWeight ? itemWeight : itemCount);

  // Use PriceService for display prices
  $: displayPrices = PriceService.getDisplayPrices(product);

  // Use StockService for stock information
  $: stockInfo = StockService.getStockInfo(product);

  // Parse product hash using centralized helper
  $: ({ productId } = parseProductHash(product));

  // SIMPLIFIED: Update item count whenever it changes
  function updateItemCount(items: any[]) {
    if (!productId) return; // Skip if no valid productId
    const item = items.find(cartItem => cartItem.productId === productId);
    const quantity = item ? item.quantity : 0;

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
    // Subscribe directly to cart items store
    unsubscribeCartState = cartItems.subscribe((items: any[]) => {
      updateItemCount(items);
    });
  });

  onDestroy(() => {
    if (typeof unsubscribeCartState === "function") {
      unsubscribeCartState();
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
    // Cart service is always available with store pattern

    // Product successfully identified for cart operations

    handleAddToCart();
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

  // SIMPLIFIED: Cart operations using original product object
  async function handleIncrementClick() {
    if (!productId || $isCheckoutSession) return;
    const currentAmount = productIsSoldByWeight ? itemWeight : itemCount;
    await incrementItem(product, currentAmount);
  }

  async function handleDecrementClick() {
    if (!productId || $isCheckoutSession) return;
    const currentAmount = productIsSoldByWeight ? itemWeight : itemCount;
    await decrementItem(product, currentAmount);
  }

  // SIMPLIFIED: Add product to cart
  async function handleAddToCart() {
    if (!productId || $isCheckoutSession) {
      if ($isCheckoutSession) {
        console.log("Cannot add to cart: currently in checkout session");
        return;
      }
      console.error("Cannot add to cart: invalid product hash", product);
      return;
    }
    await addProductToCart(product);
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
