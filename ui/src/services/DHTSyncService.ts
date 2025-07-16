// ProductsUploadService.ts

import { StockService } from "./StockService";
import { createAndActivateClone, disableClone } from "../products/utils/cloneHelpers";


// Add this function to normalize promo prices during DHT sync
function normalizePromoPrice(promoPrice: number | null | undefined, regularPrice: number | null | undefined): number | null {
  if (promoPrice === null || promoPrice === undefined || promoPrice === 0 ||
    typeof promoPrice !== 'number' || isNaN(promoPrice) ||
    typeof regularPrice !== 'number' || isNaN(regularPrice) ||
    promoPrice >= regularPrice) {
    return null;
  }
  return promoPrice;
}

export class ProductsUploadService {
  constructor(
    public client: any,
    private store: any
  ) {}

  // Simple upload progress callback
  private onProgress?: (message: string, progress: number) => void;

  setProgressCallback(callback: (message: string, progress: number) => void) {
    this.onProgress = callback;
  }

  private updateProgress(message: string, progress: number = 0) {
    if (this.onProgress) {
      this.onProgress(message, progress);
    }
    console.log(`[UPLOAD] ${message} (${progress}%)`);
  }



  async loadFromSavedData() {
    console.log("[LOG] ⚡ Load Saved Data: Process started.");
    this.updateProgress("Creating new product catalog clone...", 0);

    let totalProductsFromFile = 0;
    let successfullyUploadedProducts = 0;
    let totalGroupsCreated = 0;
    let clonedCell: any = null;

    try {
      // Step 1: Create new catalog clone for fresh data upload
      console.log("🚀 STARTING UPLOAD PROCESS");
      const cloneResult = await createAndActivateClone(this.store.client);
      const clonedCell = { cell_id: cloneResult.cellId, seed: cloneResult.seed };
      const previousCellId = cloneResult.previousCellId;
      console.log("📦 Will upload data to clone:", cloneResult.seed.slice(0, 8));

      this.updateProgress("📡 Loading saved products from file...", 10);
      const response = await fetch('http://localhost:3000/api/load-categorized-products');

      if (!response.ok) {
        throw new Error(`Failed to load saved products: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // Ensure data is an array before accessing length
      if (!Array.isArray(data)) {
        console.error("[LOG] Load Saved Data: Fetched data is not an array.", data);
        throw new Error("Invalid data format from API: Expected an array of products.");
      }
      totalProductsFromFile = data.length;

      // Group products by product type
      const productsByType = data.reduce((groups: Record<string, any[]>, product: any) => {
        const category = product.category;
        const subcategory = product.subcategory || null;
        const productType = product.product_type === "All" || !product.product_type ? null : product.product_type;
        const key = `${category}|||${subcategory}|||${productType}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(product);
        return groups;
      }, {} as Record<string, any[]>); // Initialize with the correct type

      const productTypesCount = Object.keys(productsByType).length;
      console.log(`Starting upload: ${totalProductsFromFile} products in ${productTypesCount} groups`);

      this.updateProgress(`📡 Starting upload to NEW clone: 0/${totalProductsFromFile} products`, 20);

      let processedTypes = 0;

      // Process each product type group
      for (const [key, productList] of Object.entries(productsByType)) { // Renamed 'products' to 'productList'
        // Ensure productList is an array before trying to use .length or .map
        if (!Array.isArray(productList)) {
          console.warn(`[LOG] Load Saved Data: Expected an array for key ${key} but got:`, productList);
          continue; // Skip this iteration if not an array
        }

        const [categoryFromFile, subcategoryFromFile, productTypeFromFile] = key.split('|||'); // Renamed variables
        processedTypes++;


        const processedBatch = productList.map((product: any) => ({ // product is now known to be from an array
          product: {
            name: product.description || "",
            price: (typeof product.price === 'number') ? product.price : (product.items?.[0]?.price?.regular ?? 0),
            promo_price: normalizePromoPrice(product.promo_price, product.price),
            size: product.size || "",
            stocks_status: StockService.normalizeStatus(product.stocks_status),
            category: product.category,
            subcategory: product.subcategory || null,
            product_type: product.product_type === "All" || !product.product_type ? null : product.product_type,
            image_url: product.image_url || null,
            sold_by: product.sold_by || null,
            productId: product.productId,
            upc: product.upc || null,
            embedding: product.embedding || null,
            brand: product.brand || null, // Add brand
            is_organic: product.is_organic || false, // Add is_organic
          },
          main_category: product.category,
          subcategory: product.subcategory || null,
          product_type: product.product_type === "All" || !product.product_type ? null : product.product_type,
          additional_categorizations: product.additional_categorizations || []
        }));

        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
          try {
            attempts++;
            const records = await this.client.callZome({
              cell_id: clonedCell.cell_id,
              zome_name: "product_catalog",
              fn_name: "create_product_batch",
              payload: processedBatch,
            });

            const recordsLength = Array.isArray(records) ? records.length : 0; // Safe access to length
            successfullyUploadedProducts += productList.length; // Use productList.length
            totalGroupsCreated += recordsLength;
            success = true;


            const uploadPercent = Math.round((successfullyUploadedProducts / totalProductsFromFile) * 100);
            this.updateProgress(`Uploaded ${successfullyUploadedProducts}/${totalProductsFromFile} products - ${totalGroupsCreated} groups created`, 20 + (uploadPercent * 0.6));

          } catch (batchError: unknown) {
            console.error(`❌ Upload batch failed (attempt ${attempts}/3):`, batchError);
            if (attempts >= 3) {
              console.warn(`Skipping product type after 3 failed attempts`);
              break;
            }

            const delayMs = 3000 * Math.pow(2, attempts - 1);

            this.updateProgress(`Retry ${attempts}/3: "${productTypeFromFile || 'None'}" failed - Retrying in ${delayMs / 1000}s`, 0);

            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        // Pause between product types
        if (processedTypes < productTypesCount) {
          await new Promise(resolve => setTimeout(resolve, 125));
        }
      }

      console.log(`✅ UPLOAD COMPLETE: ${successfullyUploadedProducts}/${totalProductsFromFile} products in ${totalGroupsCreated} groups uploaded to clone ${clonedCell.seed.slice(0, 8)}`);

      // Step 4: Disable previous clone after successful upload
      if (previousCellId && successfullyUploadedProducts > 0) {
        console.log("🗑️ Disabling previous clone after successful upload...");
        await disableClone(this.store.client, previousCellId);
      }

      console.log("🎉 Upload process complete - new clone active, old clone disabled");

      this.updateProgress(`✅ Complete: ${successfullyUploadedProducts}/${totalProductsFromFile} products in ${totalGroupsCreated} groups`, 100);

    } catch (error: unknown) {
      console.error("[LOG] Load Saved Data: ❌ Critical error:", error);
      this.updateProgress(`❌ Upload failed: ${successfullyUploadedProducts}/${totalProductsFromFile} products uploaded`, 0);
      throw error; // Re-throw for caller to handle
    }
  }
}
