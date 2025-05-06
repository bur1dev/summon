// ProductStore.ts

import { writable, type Writable } from "svelte/store";
import { type AgentPubKeyB64 } from "@holochain/client";
import { decode } from "@msgpack/msgpack";
import { ShopStore } from "./store";
import { get } from 'svelte/store';

interface StoreState {
  loading: boolean;
  error: string | null;
  categoryProducts: Record<string, any[]>;
  allCategoryProducts: any[];
  currentRanges: Record<string, { start: number; end: number }>;
  totalProducts: Record<string, number>;
}

export class ProductStore {
  private state: Writable<StoreState>;
  private store: ShopStore;
  private selectedLocationId: string = "70300168";
  // These properties are kept as they were present in the original file provided
  public products: any[] = [];
  private selectedCategory: string | null = null;
  private selectedSubcategory: string | null = null;
  private visibleItems: number = 100;

  constructor(
    private client: any,
    private myAgentKey: AgentPubKeyB64,
    store: ShopStore
  ) {
    this.store = store;
    this.selectedLocationId = "70300168";

    this.state = writable({
      categoryProducts: {},
      allCategoryProducts: [],
      currentRanges: {},
      totalProducts: {},
      loading: false,
      error: null,
      lastUploadedIndex: 0 // Kept from original file
    });
  }

  async fetchAllProducts(forceRefresh = false) {
    console.log("⚡ Starting product fetch");
    this.state.update(state => ({
      ...state,
      error: "Fetching all products...",
      loading: true
    }));
    const BATCH_SIZE = 50;

    try {
      if (forceRefresh || !window.allProductsData) {
        const response = await fetch(`http://localhost:3000/api/all-products?locationId=${this.selectedLocationId}`);

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();

        if (!Array.isArray(responseData)) {
          console.error("API did not return an array:", responseData);
          throw new Error("Invalid data format: Expected an array of products");
        }

        window.allProductsData = responseData;
      }

      const data = window.allProductsData;

      if (!Array.isArray(data)) {
        throw new Error("Product data is not an array");
      }

      const krogerCategories = new Set();
      const drinkBrands = {};

      data.forEach(product => {
        if (product.categories && product.categories.length) {
          product.categories.forEach(cat => krogerCategories.add(cat));
        }

        if (product.categories &&
          (product.categories.includes("Beverages") ||
            product.categories.includes("Soft Drinks"))) {
          const potentialBrand = product.description.split(/®|\s/)[0];

          if (!drinkBrands[potentialBrand]) {
            drinkBrands[potentialBrand] = [];
          }

          if (drinkBrands[potentialBrand].length < 5) {
            drinkBrands[potentialBrand].push(product.description);
          }
        }
      });

      console.log("All Kroger categories:", [...krogerCategories]);
      console.log("=== DRINK BRANDS ===");
      console.log(JSON.stringify(drinkBrands, null, 2));
      console.log("===================");

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));

        console.log("Sending batch:", batch);
        const categorizationResponse = await fetch('http://localhost:3000/api/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        });

        const categorizations = await categorizationResponse.json();
        console.log("Received categorizations:", categorizations);

        const processedBatch = categorizations;
        console.log('Sample product being sent to DHT:', JSON.stringify(processedBatch[0], null, 2));

        try {
          console.log("Creating entries for batch", processedBatch.length);
          const records = await this.store.service.client.callZome({
            role_name: "grocery",
            zome_name: "products",
            fn_name: "create_product_batch",
            payload: processedBatch,
          });

          records.forEach(record => {
            const product = decode(record.entry.Present.entry);
            console.log(`Categorized: ${product.name}`, {
              main: product.category,
              sub: product.subcategory,
              type: product.product_type || 'All'
            });
          });

          this.state.update(state => ({
            ...state,
            error: `Processing products: ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length} (${Math.round((Math.min(i + BATCH_SIZE, data.length) / data.length) * 100)}%)`
          }));

          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (batchError) {
          console.error(`Batch error at ${i}-${i + BATCH_SIZE}:`, batchError);
          continue;
        }
      }

      this.state.update(state => ({
        ...state,
        error: "All products uploaded successfully",
        loading: false
      }));
      window.allProductsData = null;
      this.products = await this.getStoredProducts();

    } catch (error) {
      this.state.update(state => ({
        ...state,
        error: "Error fetching/storing products",
        loading: false
      }));
      console.error(error);
    }
  }

  loadFromSavedData = async () => {
    console.log("[LOG] ⚡ Load Saved Data: Process started.");
    this.state.update(state => ({
      ...state,
      error: "Loading saved products from file...",
      loading: true
    }));

    let totalProductsFromFile = 0;
    let successfullyUploadedProducts = 0;

    try {
      const response = await fetch('http://localhost:3000/api/load-categorized-products');

      if (!response.ok) {
        throw new Error(`Failed to load saved products: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      totalProductsFromFile = data.length;

      console.log(`[LOG] Load Saved Data: Found ${totalProductsFromFile} products in the saved data file.`);

      this.state.update(state => ({
        ...state,
        error: `Starting upload: 0/${totalProductsFromFile} products (0%)`
      }));

      const BATCH_SIZE = 400;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));
        const batchEnd = Math.min(i + BATCH_SIZE, data.length);
        const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalProductsFromFile / BATCH_SIZE);

        console.log(`[LOG] Load Saved Data: Processing Batch ${currentBatchNumber}/${totalBatches} (Products ${i + 1}-${batchEnd} of ${totalProductsFromFile})`);

        const processedBatch = batch.map(product => ({
          product: {
            name: product.description || "",
            price: product.items?.[0]?.price?.regular || 0,
            promo_price: (product.items?.[0]?.price?.promo && product.items?.[0]?.price?.promo !== 0) ? product.items?.[0]?.price?.promo : null,
            size: product.items?.[0]?.size || "",
            stocks_status: product.items?.[0]?.inventory?.stockLevel || "",
            category: product.category,
            subcategory: product.subcategory || null,
            product_type: product.product_type === "All" || !product.product_type ? null : product.product_type,
            image_url: product.images?.find((img) => img.perspective === "front")?.sizes?.find((size) => size.size === "large")?.url || null,
            sold_by: product.items?.[0]?.soldBy || null,  // Add sold_by field
          },
          main_category: product.category,
          subcategory: product.subcategory || null,
          product_type: product.product_type === "All" || !product.product_type ? null : product.product_type,
          additional_categorizations: product.additional_categorizations || []
        }));

        this.state.update(state => ({
          ...state,
          error: `Processing batch ${i + 1}-${batchEnd} of ${totalProductsFromFile} (${successfullyUploadedProducts} uploaded so far)`
        }));

        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
          try {
            attempts++;
            console.log(`[LOG] Load Saved Data: Attempt ${attempts}/3 for Batch ${currentBatchNumber}...`);

            const records = await this.store.service.client.callZome({
              role_name: "grocery",
              zome_name: "products",
              fn_name: "create_product_batch",
              payload: processedBatch,
            });

            const uploadedInThisBatch = records.length;
            successfullyUploadedProducts += uploadedInThisBatch;
            success = true;

            console.log(`[LOG] Load Saved Data: ✅ Batch ${currentBatchNumber} Successful (Attempt ${attempts}). Uploaded ${uploadedInThisBatch} products.`);
            console.log(`[LOG] Load Saved Data: 📊 Progress: ${successfullyUploadedProducts} / ${totalProductsFromFile} products uploaded.`);

            this.state.update(state => ({
              ...state,
              error: `Uploaded ${successfullyUploadedProducts}/${totalProductsFromFile} products (${Math.round((successfullyUploadedProducts / totalProductsFromFile) * 100)}%)`
            }));

          } catch (batchError) {
            console.error(`[LOG] Load Saved Data: ❌ Batch ${currentBatchNumber} Error (Attempt ${attempts}) for products ${i + 1}-${batchEnd}:`, batchError);

            if (attempts >= 3) {
              console.warn(`[LOG] Load Saved Data: ⚠️ Failed to upload Batch ${currentBatchNumber} after ${attempts} attempts. Skipping to next batch.`);
              break;
            }

            const delayMs = 3000 * Math.pow(2, attempts - 1);
            console.log(`[LOG] Load Saved Data: Retrying Batch ${currentBatchNumber} in ${delayMs / 1000}s...`);

            this.state.update(state => ({
              ...state,
              error: `Retry ${attempts}/3: Products ${i + 1}-${batchEnd} failed - Next attempt in ${delayMs / 1000}s (${successfullyUploadedProducts}/${totalProductsFromFile} uploaded)`
            }));

            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        if (i + BATCH_SIZE < data.length) {
          console.log(`[LOG] Load Saved Data: Waiting 3 seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      console.log("[LOG] Load Saved Data: --------------------------------------------------");
      console.log("[LOG] Load Saved Data: ✅ Upload Process Complete.");
      console.log(`[LOG] Load Saved Data:   Total products found in file: ${totalProductsFromFile}`);
      console.log(`[LOG] Load Saved Data:   Successfully uploaded:        ${successfullyUploadedProducts}`);
      const failedCount = totalProductsFromFile - successfullyUploadedProducts;
      console.log(`[LOG] Load Saved Data:   Failed or Skipped:          ${failedCount}`);
      console.log("[LOG] Load Saved Data: --------------------------------------------------");

      this.state.update(state => ({
        ...state,
        error: `Complete: Successfully uploaded ${successfullyUploadedProducts}/${totalProductsFromFile} products`,
        loading: false
      }));

      console.log("[LOG] Load Saved Data: Refreshing local product list after upload...");
      this.products = await this.getStoredProducts();

    } catch (error) {
      console.error("[LOG] Load Saved Data: ❌ Critical error during the overall process:", error);

      console.log("[LOG] Load Saved Data: --------------------------------------------------");
      console.log("[LOG] Load Saved Data: ⚠️ Upload Process Failed.");
      console.log(`[LOG] Load Saved Data:   Total products found in file: ${totalProductsFromFile}`);
      console.log(`[LOG] Load Saved Data:   Successfully uploaded before error: ${successfullyUploadedProducts}`);
      const failedCountOnError = totalProductsFromFile - successfullyUploadedProducts;
      console.log(`[LOG] Load Saved Data:   Failed or Skipped: ${failedCountOnError}`);
      console.log("[LOG] Load Saved Data: --------------------------------------------------");

      this.state.update(state => ({
        ...state,
        error: `Error loading saved products: ${error.message}`,
        loading: false
      }));
    }
  }

  async searchProducts() {
    // Kept original function content
    if (!searchTerm) return;

    try {
      const response = await fetch(
        `http://localhost:3000/api/products?searchTerm=${searchTerm}&locationId=${selectedLocationId}`
      );

      const data = await response.json();

      if (data?.length > 0) {
        for (const product of data) {
          const { main_category, subcategory } = categorizeProduct({
            name: product.description || "",
            category: product.categories?.[0] || ""
          });

          await store.service.client.callZome({
            role_name: "grocery",
            zome_name: "products",
            fn_name: "create_product",
            payload: {
              name: product.description || "",
              price: product.items?.[0]?.price?.regular || 0,
              promo_price: (product.items?.[0]?.price?.promo && product.items?.[0]?.price?.promo !== 0) ? product.items?.[0]?.price?.promo : null,
              size: product.items?.[0]?.size || "",
              stocks_status: product.items?.[0]?.inventory?.stockLevel || "",
              category: main_category,
              subcategory: subcategory,
              image_url: product.images?.find((img) => img.perspective === "front")?.sizes?.find((size) => size.size === "large")?.url || null,
            },
          });

          console.log(`Categorized: ${product.description}`, {
            main: main_category,
            sub: subcategory
          });
        }

        products = await getStoredProducts();
        errorMessage = `Found ${products.length} products`;
      }
    } catch (error) {
      errorMessage = "Error fetching products";
      console.error(error);
    }
  }

  async getStoredProducts() {
    // Kept original function content
    try {
      // Note: Original code references this.selectedCategory etc. which might need adjustment
      // depending on whether you want all products or category-specific ones after upload.
      if (!this.selectedCategory) {
        console.warn("[LOG] getStoredProducts: No category selected, returning empty. Adjust logic if all products are needed.");
        // Returning empty based on original conditional logic.
        // Modify if you need to fetch *all* products regardless of category selection here.
        return { products: [], total: 0, has_more: false };
      }


      console.log(`[LOG] getStoredProducts: Fetching products for category: ${this.selectedCategory}, subcategory: ${this.selectedSubcategory}`);
      const response = await this.store.service.client.callZome({
        role_name: "grocery",
        zome_name: "products",
        fn_name: "get_products_by_category",
        payload: {
          category: this.selectedCategory,
          subcategory: this.selectedSubcategory,
          page: 0, // Consider pagination if fetching all products
          per_page: this.visibleItems // Adjust per_page if needed
        }
      });
      console.log(`[LOG] getStoredProducts: Received ${response?.products?.length || 0} records from DHT.`);

      return {
        ...response,
        products: response.products.map(record => ({
          ...decode(record.entry.Present.entry),
          hash: record.signed_action.hashed.hash
        }))
      };
    } catch (error) {
      console.error("[LOG] getStoredProducts: Error calling product catalog:", error);
      return { products: [], total: 0, has_more: false };
    }
  }

  async getProductByHash(hash) {
    // Kept original function content
    console.log("Looking up product by hash:", hash);

    try {
      // Call the DHT to get the record by hash
      const record = await this.store.service.client.callZome({
        role_name: "grocery",
        zome_name: "products",
        fn_name: "get_product",
        payload: hash
      });

      if (record) {
        console.log("Found product record");
        // Decode the entry data from the record
        const product = decode(record.entry.Present.entry);
        return {
          ...product,
          hash: record.signed_action.hashed.hash
        };
      } else {
        console.log("Product not found by hash");
        return null;
      }
    } catch (error) {
      console.error("Error getting product by hash:", error);
      return null;
    }
  }
}