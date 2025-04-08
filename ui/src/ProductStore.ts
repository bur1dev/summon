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
      lastUploadedIndex: 0
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
      // Add forceRefresh parameter to clear cache
      if (forceRefresh || !window.allProductsData) {
        const response = await fetch(`http://localhost:3000/api/all-products?locationId=${this.selectedLocationId}`);
        window.allProductsData = await response.json();
      }

      const data = window.allProductsData;

      const krogerCategories = new Set();
      const drinkBrands = {};

      data.forEach(product => {
        if (product.categories && product.categories.length) {
          product.categories.forEach(cat => krogerCategories.add(cat));
        }

        // Extract brand information for drinks
        if (product.categories &&
          (product.categories.includes("Beverages") ||
            product.categories.includes("Soft Drinks"))) {
          // Extract potential brand name (first part of product name)
          const potentialBrand = product.description.split(/®|\s/)[0];

          if (!drinkBrands[potentialBrand]) {
            drinkBrands[potentialBrand] = [];
          }

          if (drinkBrands[potentialBrand].length < 5) { // Limit examples
            drinkBrands[potentialBrand].push(product.description);
          }
        }
      });

      console.log("All Kroger categories:", [...krogerCategories]);
      console.log("=== DRINK BRANDS ===");
      console.log(JSON.stringify(drinkBrands, null, 2));
      console.log("===================");

      // Process all products in batches
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));

        // Get AI categorization for batch
        console.log("Sending batch:", batch);
        const categorizationResponse = await fetch('http://localhost:3000/api/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        });

        const categorizations = await categorizationResponse.json();
        console.log("Received categorizations:", categorizations);

        const processedBatch = batch.map((product, index) => ({
          product: {
            name: product.description || "",
            price: product.items?.[0]?.price?.regular || 0,
            size: product.items?.[0]?.size || "",
            stocks_status: product.items?.[0]?.inventory?.stockLevel || "",
            category: categorizations[index].category,
            subcategory: categorizations[index].subcategory,
            product_type: categorizations[index].product_type === "All" ? null : categorizations[index].product_type,
            image_url: product.images?.find((img) => img.perspective === "front")?.sizes?.find((size) => size.size === "large")?.url || null,
          },
          main_category: categorizations[index].category,
          subcategory: categorizations[index].subcategory,
          product_type: categorizations[index].product_type === "All" ? null : categorizations[index].product_type,
          dual_categorization: categorizations[index].dual_categorization
        }));

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

          // Update progress message with total progress
          this.state.update(state => ({
            ...state,
            error: `Processing products: ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length} (${Math.round((Math.min(i + BATCH_SIZE, data.length) / data.length) * 100)}%)`
          }));

          // Small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (batchError) {
          console.error(`Batch error at ${i}-${i + BATCH_SIZE}:`, batchError);
          continue; // Continue with next batch even if this one fails
        }
      }

      // All products have been processed
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
    console.log("⚡ Loading products from saved data");
    this.state.update(state => ({
      ...state,
      error: "Loading saved products from file...",
      loading: true
    }));

    try {
      const response = await fetch('http://localhost:3000/api/load-categorized-products');

      if (!response.ok) {
        throw new Error(`Failed to load saved products: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const totalProducts = data.length;
      console.log(`Loaded ${totalProducts} pre-categorized products`);

      // Display initial progress
      this.state.update(state => ({
        ...state,
        error: `Starting upload: 0/${totalProducts} products (0%)`
      }));

      // Use smaller batches to reduce DHT pressure
      const BATCH_SIZE = 200;
      let successCount = 0;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, Math.min(i + BATCH_SIZE, data.length));
        const batchEnd = Math.min(i + BATCH_SIZE, data.length);

        // Format products for DHT upload
        const processedBatch = batch.map(product => ({
          product: {
            name: product.description || "",
            price: product.items?.[0]?.price?.regular || 0,
            size: product.items?.[0]?.size || "",
            stocks_status: product.items?.[0]?.inventory?.stockLevel || "",
            category: product.category,
            subcategory: product.subcategory,
            product_type: product.product_type === "All" ? null : product.product_type,
            image_url: product.images?.find((img) => img.perspective === "front")?.sizes?.find((size) => size.size === "large")?.url || null,
          },
          main_category: product.category,
          subcategory: product.subcategory,
          product_type: product.product_type === "All" ? null : product.product_type,
          dual_categorization: product.dual_categorization
        }));

        // Show current batch being processed
        this.state.update(state => ({
          ...state,
          error: `Processing batch ${i + 1}-${batchEnd} of ${totalProducts} (${successCount} uploaded so far)`
        }));

        // Try up to 3 times with increasing delay
        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
          try {
            attempts++;

            // Upload to DHT
            const records = await this.store.service.client.callZome({
              role_name: "grocery",
              zome_name: "products",
              fn_name: "create_product_batch",
              payload: processedBatch,
            });

            successCount += records.length;
            success = true;

            // Update progress with exact numbers
            this.state.update(state => ({
              ...state,
              error: `Uploaded ${successCount}/${totalProducts} products (${Math.round((successCount / totalProducts) * 100)}%)`
            }));

          } catch (batchError) {
            console.error(`Batch error attempt ${attempts} at ${i}-${i + BATCH_SIZE}:`, batchError);

            if (attempts >= 3) {
              console.warn(`Failed to upload batch after ${attempts} attempts, skipping to next batch`);
              break;
            }

            // Exponential backoff: 3s, 6s, 12s
            const delayMs = 3000 * Math.pow(2, attempts - 1);

            // Show retry status in progress
            this.state.update(state => ({
              ...state,
              error: `Retry ${attempts}/3: Products ${i + 1}-${batchEnd} failed - Next attempt in ${delayMs / 1000}s (${successCount}/${totalProducts} uploaded)`
            }));

            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        // Add delay between batches
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      this.state.update(state => ({
        ...state,
        error: `Complete: Successfully uploaded ${successCount}/${totalProducts} products`,
        loading: false
      }));

      this.products = await this.getStoredProducts();
    } catch (error) {
      this.state.update(state => ({
        ...state,
        error: `Error loading saved products: ${error.message}`,
        loading: false
      }));
      console.error(error);
    }
  }

  async searchProducts() {
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
    try {
      if (!this.selectedCategory) return { products: [], total: 0, has_more: false };

      const response = await this.store.service.client.callZome({
        role_name: "grocery",
        zome_name: "products",
        fn_name: "get_products_by_category",
        payload: {
          category: this.selectedCategory,
          subcategory: this.selectedSubcategory,
          page: 0,
          per_page: this.visibleItems
        }
      });

      return {
        ...response,
        products: response.products.map(record => ({
          ...decode(record.entry.Present.entry),
          hash: record.signed_action.hashed.hash
        }))
      };
    } catch (error) {
      console.error("Error calling product catalog:", error);
      return { products: [], total: 0, has_more: false };
    }
  }

  // Add this method to your ProductStore class

  /**
   * Look up a product by its hash
   */
  async getProductByHash(hash) {
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
