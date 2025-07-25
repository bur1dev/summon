// ProductStore.ts

import { writable, get } from "svelte/store";
import type { Writable } from "svelte/store";
import type { AgentPubKeyB64 } from "@holochain/client";
import { decode } from "@msgpack/msgpack";
import type { ShopStore } from "../store";
import { StockService } from "./StockService";
import { createAndActivateClone, disableClone } from "../products/utils/cloneHelpers";
// No complex clone manager needed

interface DecodedSingleProductFields {
  name: string;
  price?: number;
  promo_price?: number;
  size?: string;
  stocks_status?: string;
  category?: string;
  subcategory?: string;
  product_type?: string;
  image_url?: string;
  sold_by?: string;
  productId?: string;
  embedding?: number[] | Float32Array;
  [key: string]: any;
}

interface StoreState {
  loading: boolean;
  error: string | null;
  categoryProducts: Record<string, any[]>;
  allCategoryProducts: any[];
  currentRanges: Record<string, { start: number; end: number }>;
  totalProducts: Record<string, number>;
  syncStatus: {
    inProgress: boolean;
    message: string;
    progress: number;
    totalToUpdate: number;
    completedUpdates: number;
  };
}


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

export class ProductStore {
  private state: Writable<StoreState>;
  private store: ShopStore;
  private selectedLocationId: string = "70300168";
  // These properties are kept as they were present in the original file provided
  public products: any[] = [];
  private selectedCategory: string | null = null;
  private selectedSubcategory: string | null = null;
  private visibleItems: number = 1000;

  constructor(
    public client: any, // Made public
    private myAgentKey: AgentPubKeyB64,
    store: ShopStore
  ) {
    this.store = store;
    this.selectedLocationId = "70300168";

    // No complex initialization needed

    this.state = writable({
      categoryProducts: {},
      allCategoryProducts: [],
      currentRanges: {},
      totalProducts: {},
      loading: false,
      error: null,
      lastUploadedIndex: 0, // Kept from original file
      syncStatus: {
        inProgress: false,
        message: "",
        progress: 0,
        totalToUpdate: 0,
        completedUpdates: 0
      }
    });
  }

  // Get the current state
  getState() {
    return get(this.state);
  }

  // Allow components to subscribe to the store
  subscribe(callback: (value: any) => void) {
    return this.state.subscribe(callback);
  }



  loadFromSavedData = async () => {
    console.log("[LOG] ⚡ Load Saved Data: Process started.");
    this.state.update(state => ({
      ...state,
      error: "Creating new product catalog clone...",
      loading: true
    }));

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

      this.state.update(state => ({
        ...state,
        error: "📡 Loading saved products from file...",
      }));
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

      this.state.update(state => ({
        ...state,
        error: `📡 Starting upload to NEW clone: 0/${totalProductsFromFile} products (0%)`
      }));

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
            const records = await this.store.service.client.callZome({
              cell_id: clonedCell.cell_id,
              zome_name: "product_catalog",
              fn_name: "create_product_batch",
              payload: processedBatch,
            });

            const recordsLength = Array.isArray(records) ? records.length : 0; // Safe access to length
            successfullyUploadedProducts += productList.length; // Use productList.length
            totalGroupsCreated += recordsLength;
            success = true;


            this.state.update(state => ({
              ...state,
              error: `Uploaded ${successfullyUploadedProducts}/${totalProductsFromFile} products (${Math.round((successfullyUploadedProducts / totalProductsFromFile) * 100)}%) - ${totalGroupsCreated} groups created`
            }));

          } catch (batchError: unknown) {
            const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
            if (attempts >= 3) {
              console.warn(`Skipping product type after 3 failed attempts`);
              break;
            }

            const delayMs = 3000 * Math.pow(2, attempts - 1);

            this.state.update(state => ({
              ...state,
              error: `Retry ${attempts}/3: "${productTypeFromFile || 'None'}" failed - Retrying in ${delayMs / 1000}s (${successfullyUploadedProducts}/${totalProductsFromFile} uploaded)`
            }));

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

      this.state.update(state => ({
        ...state,
        error: `✅ Complete: ${successfullyUploadedProducts}/${totalProductsFromFile} products in ${totalGroupsCreated} groups`,
        loading: false
      }));


      // Delete the DHT upload flag after a successful full load
      await this.deleteDhtUploadFlag();

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[LOG] Load Saved Data: ❌ Critical error:", error);

      console.error(`Upload failed: ${successfullyUploadedProducts}/${totalProductsFromFile} products uploaded`);

      this.state.update(state => ({
        ...state,
        error: `Error: ${successfullyUploadedProducts}/${totalProductsFromFile} products uploaded, ${totalGroupsCreated} groups created`,
        loading: false
      }));
    }
  }

  // New method to check if DHT upload flag exists
  async checkDhtUploadFlag() {
    try {
      const response = await fetch('http://localhost:3000/api/check-dht-upload-flag');
      if (!response.ok) {
        throw new Error(`Failed to check DHT upload flag: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.flagExists;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error checking DHT upload flag:", error);
      return false;
    }
  }

  // New method to delete DHT upload flag
  async deleteDhtUploadFlag() {
    try {
      const response = await fetch('http://localhost:3000/api/delete-dht-upload-flag', {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to delete DHT upload flag: ${response.status} ${response.statusText}`);
      }
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error deleting DHT upload flag:", error);
      return false;
    }
  }


  async getProductByHash(hash: any): Promise<any | null> { // Consider changing 'any' to your 'Product' type if appropriate
    // Kept original function content
    console.log("Looking up product by hash:", hash);

    try {
      // Call the DHT to get the record by hash
      const record = await this.store.service.client.callZome({
        role_name: "products_role",
        zome_name: "product_catalog",
        fn_name: "get_product",
        payload: hash
      });

      // Ensure record and its nested properties exist before trying to decode
      if (record && record.entry && record.entry.Present && record.entry.Present.entry) {
        console.log("Found product record");
        // Decode the entry data from the record and assert its type
        const productDetails = decode(record.entry.Present.entry) as DecodedSingleProductFields | null;

        if (productDetails) {
          // Construct the object to return
          // The 'hash' property here is the ActionHash of the Holochain record itself.
          // This might be different from the composite hash structure used elsewhere in your UI.
          // You might need to adapt this part if your Svelte components expect 'hash' to be
          // an object like { groupHash: ..., index: ... }.
          // For now, it correctly assigns the record's direct hash.
          return {
            ...productDetails, // Spread all fields from the decoded product
            hash: record.signed_action.hashed.hash
          };
        } else {
          console.log("Product details were null after decoding.");
          return null;
        }
      } else {
        console.log("Product not found by hash or record structure was unexpected.");
        return null;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting product by hash:", error);
      return null;
    }
  }

  // Main synchronization method - checks flag and either does selective or full update
  async syncDht() {
    console.log("[LOG] 🔄 Starting DHT synchronization");
    this.state.update(state => ({
      ...state,
      error: "Checking for changes to sync...",
      loading: true,
      syncStatus: { // Initialize syncStatus
        inProgress: true,
        message: "Preparing for sync...",
        progress: 0,
        totalToUpdate: 0,
        completedUpdates: 0
      }
    }));

    try {
      const flagExists = await this.checkDhtUploadFlag();
      if (!flagExists) {
        console.log("[LOG] Sync: No DHT upload flag found, no sync initiated by backend.");
        this.state.update(state => ({
          ...state,
          error: "No sync cycle initiated by backend.",
          loading: false,
          syncStatus: { // Reset syncStatus
            ...this.getState().syncStatus,
            inProgress: false,
            message: "No sync cycle initiated by backend."
          }
        }));
        return;
      }

      console.log("[LOG] Sync: DHT upload flag exists. Checking changed_product_types.json");
      // syncStatus message is already "Preparing for sync..."

      const changedTypesResponse = await fetch('http://localhost:3000/api/load-changed-product-types');
      if (!changedTypesResponse.ok) {
        const errorText = await changedTypesResponse.text();
        console.error(`[LOG] Sync: Failed to load changed_product_types.json. Status: ${changedTypesResponse.status}. Response: ${errorText}`);
        throw new Error(`Failed to load changed_product_types.json: ${changedTypesResponse.status} ${errorText}`);
      }
      const changedTypes = await changedTypesResponse.json();

      if (!Array.isArray(changedTypes)) {
        console.error("[LOG] Sync: `changed_product_types.json` did not return an array. Content:", changedTypes);
        throw new Error("Invalid format for changed_product_types.json: Expected an array.");
      }


      if (changedTypes.length === 0) {
        console.log("[LOG] Sync: `changed_product_types.json` is empty. Backend indicates no types require DHT update for this cycle.");
        this.state.update(state => ({
          ...state,
          error: "No product types require DHT update this cycle.",
          loading: false,
          syncStatus: {
            ...this.getState().syncStatus,
            inProgress: false,
            message: "No types to update.",
            progress: 100, // Indicate completion of this check
            totalToUpdate: 0,
            completedUpdates: 0
          }
        }));
        await this.deleteDhtUploadFlag();
        console.log("[LOG] Sync: Deleted DHT upload flag as no types required update.");
        // No need to call reset-change-flags if no types were processed for DHT update
        return;
      }

      // If changedTypes is NOT empty, proceed with the selective sync
      console.log(`[LOG] Sync: Found ${changedTypes.length} changed product types. Proceeding with selective sync.`);
      this.state.update(state => ({ // Update totalToUpdate here
        ...state,
        syncStatus: {
          ...this.getState().syncStatus,
          message: `Found ${changedTypes.length} product types to update.`,
          totalToUpdate: changedTypes.length,
        }
      }));
      await this.performSelectiveSync(changedTypes);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[LOG] Sync: ❌ Error during DHT synchronization:", error);
      this.state.update(state => ({
        ...state,
        error: `Sync error: ${errorMessage}`,
        loading: false,
        syncStatus: {
          ...this.getState().syncStatus,
          inProgress: false,
          message: `Error: ${errorMessage}`
        }
      }));
    }
  }

  // NEW private method to contain the selective sync logic
  private async performSelectiveSync(changedTypes: any[]) {
    console.log(`[LOG] Sync (Selective): Starting selective sync for ${changedTypes.length} types.`);
    this.state.update(state => ({
      ...state,
      syncStatus: {
        ...this.getState().syncStatus,
        message: `Starting selective sync for ${changedTypes.length} types...`,
        totalToUpdate: changedTypes.length,
        completedUpdates: 0,
        progress: 0,
      }
    }));

    const productsResponse = await fetch('http://localhost:3000/api/load-categorized-products');
    if (!productsResponse.ok) {
      const errorText = await productsResponse.text();
      console.error(`[LOG] Sync (Selective): Failed to load categorized products. Status: ${productsResponse.status}. Response: ${errorText}`);
      throw new Error(`Failed to load categorized products for selective sync: ${productsResponse.status} ${errorText}`);
    }
    const allProducts: any[] = await productsResponse.json(); // Ensure type for allProducts
    if (!Array.isArray(allProducts)) {
      console.error("[LOG] Sync (Selective): `load-categorized-products` did not return an array. Content:", allProducts);
      throw new Error("Invalid format from load-categorized-products: Expected an array.");
    }
    console.log(`[LOG] Sync (Selective): Loaded ${allProducts.length} total products for diffing.`);

    let updatedGroupOperations = 0;
    let processedTypeCount = 0;
    const processedProductIds = new Set<string>(); // For resetting _categoryChanged flags

    for (const productType of changedTypes) { // productType here represents a path {category, subcategory, product_type}
      processedTypeCount++;
      const targetPathCategory = productType.category;
      const targetPathSubcategory = productType.subcategory || null;
      const targetPathProductType = productType.product_type || null;

      const typeKey = `${targetPathCategory}/${targetPathSubcategory || "null"}/${targetPathProductType || "null"}`;

      this.state.update(state => ({
        ...state,
        syncStatus: {
          ...this.getState().syncStatus,
          message: `Updating ${typeKey} (${processedTypeCount}/${changedTypes.length})`,
          progress: Math.round((processedTypeCount / changedTypes.length) * 100),
          completedUpdates: processedTypeCount - 1,
        }
      }));
      console.log(`[LOG] Sync (Selective): Processing product type (targetPath) ${processedTypeCount}/${changedTypes.length}: ${typeKey}`);

      // --- MODIFICATION START: Gather all products relevant to this targetPath ---
      const primaryMatches = allProducts.filter(product => {
        const matches = product.category === targetPathCategory &&
          ((product.subcategory || null) === targetPathSubcategory) &&
          ((product.product_type || null) === targetPathProductType);

        // Logic for processedProductIds: Add if this targetPath IS the product's (new) primary path
        // AND its _categoryChanged flag is true.
        if (matches && product._categoryChanged === true && product.productId) {
          processedProductIds.add(product.productId);
          console.log(`[LOG] Sync (Selective): Product ${product.productId} (${product.description}) matches primary path ${typeKey} AND has _categoryChanged=true. Added to processedProductIds.`);
        }
        return matches;
      });

      const additionalMatches = allProducts.filter(product => {
        if (!product.additional_categorizations || product.additional_categorizations.length === 0) {
          return false;
        }
        return product.additional_categorizations.some((addCat: any) =>
          addCat.main_category === targetPathCategory &&
          ((addCat.subcategory || null) === targetPathSubcategory) &&
          ((addCat.product_type || null) === targetPathProductType)
        );
      });

      // Combine and ensure uniqueness (productId is the most reliable unique key here)
      const combinedProductsMap = new Map<string, any>();
      primaryMatches.forEach(p => p.productId && combinedProductsMap.set(p.productId, p));
      additionalMatches.forEach(p => p.productId && combinedProductsMap.set(p.productId, p)); // Will overwrite if already present, which is fine.

      // If some products don't have productId (should be rare for categorized_products.json), use description as fallback key
      // This part is less critical if productIds are always present and unique.
      primaryMatches.forEach(p => !p.productId && p.description && combinedProductsMap.set(p.description, p));
      additionalMatches.forEach(p => !p.productId && p.description && combinedProductsMap.set(p.description, p));

      const combinedProductsForPath = Array.from(combinedProductsMap.values());

      console.log(`[LOG] Sync (Selective): For targetPath ${typeKey}: Found ${primaryMatches.length} primary matches, ${additionalMatches.length} additional matches. Total unique relevant products: ${combinedProductsForPath.length}.`);
      if (combinedProductsForPath.length > 0 && combinedProductsForPath.length < 10) {
        console.log(`[LOG] Sync (Selective): Relevant products for ${typeKey}:`, combinedProductsForPath.map(p => ({ id: p.productId, name: p.description, cat: p.category, addCats: p.additional_categorizations?.length || 0 })));
      }
      // --- MODIFICATION END ---

      try {
        const existingGroupsResponse = await this.store.service.client.callZome({
          role_name: "products_role",
          zome_name: "product_catalog",
          fn_name: "get_products_by_category", // This gets groups linked to the path
          payload: {
            category: targetPathCategory,
            subcategory: targetPathSubcategory,
            product_type: targetPathProductType,
            offset: 0,
            limit: 200 // Fetch a larger number to ensure all old groups for the path are found
          }
        });
        console.log(`[LOG] Sync (Selective): Found ${existingGroupsResponse.product_groups.length} existing DHT groups linked to path ${typeKey}`);

        let deletedLinksCount = 0;
        let createdGroupsInLoop = 0;

        // --- REVISED DELETION/PRESERVATION LOGIC ---
        if (combinedProductsForPath.length > 0) {
          // SCENARIO A: The targetPath is active (products are primary or additionally categorized here).
          // Refresh this path: Delete all old groups/links at this targetPath before creating new ones.
          if (existingGroupsResponse.product_groups.length > 0) {
            console.log(`[LOG] Sync (Selective): Path ${typeKey} is active with ${combinedProductsForPath.length} relevant products. Refreshing path: Deleting links to ${existingGroupsResponse.product_groups.length} existing DHT groups.`);
            for (const group of existingGroupsResponse.product_groups) {
              try {
                // delete_links_to_product_group takes the group's hash and removes all links pointing TO it
                // from various category paths. This is what we want.
                await this.store.service.client.callZome({
                  role_name: "products_role",
                  zome_name: "product_catalog",
                  fn_name: "delete_links_to_product_group",
                  payload: group.signed_action.hashed.hash // Send the ProductGroup's ActionHash
                });
                deletedLinksCount++; // This counts deleted groups/link-sets, not individual links.
              } catch (deleteError: unknown) {
                const errorMessage = deleteError instanceof Error ? deleteError.message : String(deleteError);
                const groupActionHashForLog = group.signed_action?.hashed?.hash || "COULD_NOT_GET_HASH_FOR_LOG";
                console.error(`[LOG] Sync (Selective): Error deleting links to group ${groupActionHashForLog} for active path ${typeKey} during refresh:`, deleteError);
              }
            }
            if (deletedLinksCount > 0) {
              console.log(`[LOG] Sync (Selective): Deleted links to ${deletedLinksCount} old group(s) for active path ${typeKey} during refresh.`);
            }
          }
        } else {
          // SCENARIO B: No current products are associated with this targetPath (combinedProductsForPath.length === 0).
          // This targetPath might be an old primary path of a moved product.
          const isOldPrimaryPathOfMovedProduct = allProducts.some(p =>
            p._categoryChanged === true &&
            p._originalCategory === targetPathCategory &&
            ((p._originalSubcategory || null) === targetPathSubcategory) &&
            ((p._originalProductType || null) === targetPathProductType)
          );

          if (isOldPrimaryPathOfMovedProduct) {
            // This path is an old primary path for a product that has moved. Clean it up.
            if (existingGroupsResponse.product_groups.length > 0) {
              console.log(`[LOG] Sync (Selective): Path ${typeKey} is an old primary path for a moved product. Cleaning up links to ${existingGroupsResponse.product_groups.length} DHT groups.`);
              for (const group of existingGroupsResponse.product_groups) {
                try {
                  await this.store.service.client.callZome({
                    role_name: "products_role",
                    zome_name: "product_catalog",
                    fn_name: "delete_links_to_product_group",
                    payload: group.signed_action.hashed.hash
                  });
                  deletedLinksCount++;
                } catch (deleteError: unknown) {
                  const errorMessage = deleteError instanceof Error ? deleteError.message : String(deleteError);
                  const groupActionHashForLog = group.signed_action?.hashed?.hash || "COULD_NOT_GET_HASH_FOR_LOG";
                  console.error(`[LOG] Sync (Selective): Error deleting links to group ${groupActionHashForLog} from old primary path ${typeKey}:`, deleteError);
                }
              }
              if (deletedLinksCount > 0) {
                console.log(`[LOG] Sync (Selective): Deleted links to ${deletedLinksCount} old group(s) from old primary path ${typeKey}.`);
              }
            } else {
              console.log(`[LOG] Sync (Selective): Path ${typeKey} is an old primary path for a moved product, but no DHT groups found linked to it. No cleanup needed for this path.`);
            }
          } else {
            // This path has no current products and is not an old primary path of a moved product.
            // It might be an orphaned additional category path or genuinely empty.
            // The current logic preserves links here. This is safer than aggressive deletion.
            // If these are links to groups that *still exist* and are validly linked from other primary paths,
            // then delete_links_to_product_group (when called for those other primary paths if they change)
            // would be responsible for cleaning them. If the groups themselves become orphaned, that's a different cleanup.
            if (existingGroupsResponse.product_groups.length > 0) {
              console.log(`[LOG] Sync (Selective): Path ${typeKey} has no local products and is not an old primary path. Preserving ${existingGroupsResponse.product_groups.length} existing DHT group links (could be orphaned additional links or path is truly empty now).`);
            } else {
              console.log(`[LOG] Sync (Selective): Path ${typeKey} has no local products, is not an old primary path, and no DHT groups found linked. No action needed for this path.`);
            }
          }
        }
        // --- END OF REVISED DELETION/PRESERVATION LOGIC ---

        // Send combinedProductsForPath to Zome if there are any
        if (combinedProductsForPath.length > 0) {
          console.log(`[LOG] Sync (Selective): Path ${typeKey} is active. Sending ${combinedProductsForPath.length} relevant products to create_product_batch.`);
          const productBatchForZomeCall = combinedProductsForPath.map(product => ({
            // Ensure the product payload for the Zome uses the product's actual primary categorization
            // for main_category, subcategory, product_type fields, and includes its additional_categorizations.
            product: {
              name: product.description || product.name || "",
              price: (typeof product.price === 'number') ? product.price : (product.items?.[0]?.price?.regular ?? 0),
              promo_price: normalizePromoPrice(product.promo_price, product.price),

              size: product.size || "",
              stocks_status: StockService.normalizeStatus(product.stocks_status),
              category: product.category, // Product's own primary category
              subcategory: product.subcategory || null,
              product_type: product.product_type === "All" || !product.product_type ? null : product.product_type,
              image_url: product.image_url || null, // Prioritize the direct image_url field
              sold_by: product.sold_by || null,
              productId: product.productId || null,
              brand: product.brand || null, // Add brand
              is_organic: product.is_organic || false, // Add is_organic
            },
            // These top-level category fields in the Zome payload for create_product_batch
            // should represent the path for which this batch is being sent.
            // However, the Zome's create_product_batch should ideally group by the product's *own* primary category
            // if it's creating multiple groups, or if it's creating one group, the group's category should be
            // derived from the products, or explicitly set to the targetPath.
            // Given create_product_batch creates ONE group per call and links it,
            // these should represent the targetPath.
            main_category: targetPathCategory,
            subcategory: targetPathSubcategory,
            product_type: targetPathProductType,
            additional_categorizations: product.additional_categorizations || [] // Product's own additional cats
          }));

          try {
            console.log(`[LOG] Sync (Selective): Sending batch with ${productBatchForZomeCall.length} products for Zome processing related to path ${typeKey}`);
            const createResult = await this.store.service.client.callZome({
              role_name: "products_role",
              zome_name: "product_catalog",
              fn_name: "create_product_batch",
              payload: productBatchForZomeCall,
            });
            createdGroupsInLoop += createResult.length; // Assuming result is an array of created group records/hashes
            console.log(`[LOG] Sync (Selective): Zome call for path ${typeKey} created/updated ${createResult.length} group(s) with ${productBatchForZomeCall.length} products.`);
          } catch (createError: unknown) {
            const errorMessage = createError instanceof Error ? createError.message : String(createError);
            console.error(`[LOG] Sync (Selective): Error in Zome call create_product_batch for path ${typeKey}:`, createError);
          }
        } else {
          console.log(`[LOG] Sync (Selective): Path ${typeKey} has no relevant products after filtering (combinedProductsForPath is empty). No Zome call to create_product_batch.`);
        }

        if (deletedLinksCount > 0 || createdGroupsInLoop > 0) {
          updatedGroupOperations++;
        }
        console.log(`[LOG] Sync (Selective): Path ${typeKey} processing complete. Deleted old links/groups: ${deletedLinksCount}. Created new groups: ${createdGroupsInLoop}.`);

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[LOG] Sync (Selective): Error processing product type ${typeKey}:`, error);
        this.state.update(state => ({
          ...state,
          error: `Error updating ${typeKey}: ${errorMessage}. Continuing with other types...`
        }));
      }

      if (processedTypeCount < changedTypes.length) {
        console.log(`[LOG] Sync (Selective): Waiting 125ms before next product type...`);
        await new Promise(resolve => setTimeout(resolve, 125));
      }
    } // End loop over changedTypes

    this.state.update(state => ({
      ...state,
      syncStatus: {
        ...this.getState().syncStatus,
        completedUpdates: changedTypes.length, // All types from changedTypes have been attempted
      }
    }));

    if (processedProductIds.size > 0) {
      try {
        console.log(`[LOG] Sync (Selective): Resetting _categoryChanged flags for ${processedProductIds.size} products whose primary paths were updated.`);
        const resetResponse = await fetch('http://localhost:3000/api/reset-change-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: Array.from(processedProductIds) })
        });

        if (resetResponse.ok) {
          const result = await resetResponse.json();
          console.log(`[LOG] Sync (Selective): Successfully reset _categoryChanged flags for ${result.resetCount} products.`);
        } else {
          const errorText = await resetResponse.text();
          console.warn(`[LOG] Sync (Selective): Failed to reset _categoryChanged flags: ${resetResponse.status} ${errorText}`);
        }
      } catch (resetError: unknown) {
        const errorMessage = resetError instanceof Error ? resetError.message : String(resetError);
        console.error(`[LOG] Sync (Selective): Error calling API to reset _categoryChanged flags:`, resetError);
      }
    } else {
      console.log(`[LOG] Sync (Selective): No products required _categoryChanged flag reset in this cycle.`);
    }

    await this.deleteDhtUploadFlag();
    console.log("[LOG] Sync (Selective): --------------------------------------------------");
    console.log("[LOG] Sync (Selective): ✅ Selective Update Complete");
    console.log(`[LOG] Sync (Selective):   Total product types from changed_product_types.json processed: ${changedTypes.length}`);
    console.log(`[LOG] Sync (Selective):   Total DHT path refresh operations (deletions or creations): ${updatedGroupOperations}`);
    console.log(`[LOG] Sync (Selective):   Total products with _categoryChanged flags reset: ${processedProductIds.size}`);
    console.log("[LOG] Sync (Selective): --------------------------------------------------");
    this.state.update(state => ({
      ...state,
      error: `Sync complete: Processed ${changedTypes.length} product types. ${updatedGroupOperations} paths refreshed.`,
      loading: false,
      syncStatus: {
        inProgress: false,
        message: "Selective sync completed successfully.",
        progress: 100,
        totalToUpdate: changedTypes.length,
        completedUpdates: changedTypes.length
      }
    }));
  }
}