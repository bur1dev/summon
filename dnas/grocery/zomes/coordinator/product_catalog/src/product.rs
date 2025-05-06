use hdk::prelude::*;
use products_integrity::*;
use std::collections::HashMap;
use crate::utils::concurrent_get_records;
use crate::products_by_category::GetProductsParams;
// Constants remain the same
pub const BATCH_SIZE: usize = 25; // This seems unused here, maybe intended for frontend?
pub const PRODUCTS_PER_GROUP: usize = 100; // Maximum products per group

// Get appropriate paths for a product or product group
pub fn get_paths(input: &CreateProductInput) -> ExternResult<Vec<Path>> {
    warn!(
        "START get_paths: For product='{}', Cat='{}', Subcat='{}', Type='{}', Dual={:?}",
        input.product.name,
        input.main_category,
        input.subcategory.as_deref().unwrap_or("None"),
        input.product_type.as_deref().unwrap_or("None"),
        !input.additional_categorizations.is_empty()
    );

    let mut paths = Vec::new();
    let mut path_strings = Vec::new(); // For logging

    // Main category path
    let main_path_str = format!("categories/{}", input.main_category);
    paths.push(Path::try_from(main_path_str.clone())?);
    path_strings.push(main_path_str);


    if let Some(subcategory) = &input.subcategory {
        // Subcategory path
        let sub_path_str = format!(
            "categories/{}/subcategories/{}", 
            input.main_category, subcategory
        );
        paths.push(Path::try_from(sub_path_str.clone())?);
        path_strings.push(sub_path_str);


        if let Some(product_type) = &input.product_type {
            // Product type path
            let type_path_str = format!(
                "categories/{}/subcategories/{}/types/{}", 
                input.main_category, subcategory, product_type
            );
            paths.push(Path::try_from(type_path_str.clone())?);
            path_strings.push(type_path_str);
        }
    }

    // Handle additional categorization paths
for (i, additional) in input.additional_categorizations.iter().enumerate() {
    warn!("get_paths: Handling additional categorization #{}: Cat='{}', Subcat='{}', Type='{}'",
        i,
        additional.main_category,
        additional.subcategory.as_deref().unwrap_or("None"),
        additional.product_type.as_deref().unwrap_or("None")
    );
    // Main category for additional categorization
    let additional_main_path_str = format!("categories/{}", additional.main_category);
    paths.push(Path::try_from(additional_main_path_str.clone())?);
    path_strings.push(additional_main_path_str);

    if let Some(subcategory) = &additional.subcategory {
        let additional_sub_path_str = format!(
            "categories/{}/subcategories/{}", 
            additional.main_category, subcategory
        );
        paths.push(Path::try_from(additional_sub_path_str.clone())?);
        path_strings.push(additional_sub_path_str);

        if let Some(product_type) = &additional.product_type {
            let additional_type_path_str = format!(
                "categories/{}/subcategories/{}/types/{}", 
                additional.main_category, subcategory, product_type
            );
            paths.push(Path::try_from(additional_type_path_str.clone())?);
            path_strings.push(additional_type_path_str);
        }
    }
}

    warn!("🛣️🔍 END get_paths: Created {} paths: {:?}", paths.len(), path_strings);
    Ok(paths)
}

fn create_links_for_group(group_hash: &ActionHash, paths: Vec<Path>, chunk_id: u32) -> ExternResult<()> {
    warn!("🔗 START create_links_for_group: Linking GroupHash={} to {} paths with chunk_id={}", group_hash, paths.len(), chunk_id);
    
    // Track success/failure statistics
    let mut successful_links = 0;
    let mut failed_links = 0;
    
    // Log all paths for reference
    warn!("🛣️ Paths to link:");
    for (i, path) in paths.iter().enumerate() {
        warn!("  Path #{}: {:?}", i, path);
    }

    for (i, path) in paths.iter().enumerate() {
        let path_str = format!("{:?}", path); 
        match path.path_entry_hash() {
            Ok(path_hash) => {
                warn!("🔗 Creating link #{}: Path='{}', PathHash={}, TargetGroupHash={}, ChunkID={}", 
                      i, path_str, path_hash, group_hash, chunk_id);

                // Create link with tag containing the chunk_id for proper ordering
                match create_link(
                     path_hash.clone(),
                    group_hash.clone(),
                    LinkTypes::ProductTypeToGroup,
                    LinkTag::new(chunk_id.to_le_bytes()),
                ) {
                    Ok(link_hash) => {
                        warn!("✅ Link #{} SUCCESS: Created link with hash={} for path '{}'", i, link_hash, path_str);
                        successful_links += 1;
                        
                        // Verify the link was created successfully by getting links
                        match get_links(GetLinksInputBuilder::try_new(path_hash, LinkTypes::ProductTypeToGroup)?.build()) {
                            Ok(links) => {
                                let found_link = links.iter().any(|link| {
                                    if let Some(hash) = link.target.clone().into_action_hash() {
                                        hash == *group_hash
                                    } else {
                                        false
                                    }
                                });
                                if found_link {
                                    warn!("✅ Link #{} VERIFIED: Link from path '{}' to group {} exists", i, path_str, group_hash);
                                } else {
                                    warn!("⚠️ Link #{} VERIFICATION FAILED: Link from path '{}' to group {} not found immediately after creation", 
                                          i, path_str, group_hash);
                                }
                            },
                            Err(e) => warn!("⚠️ Link #{} VERIFICATION ERROR: Failed to get links for path '{}': {:?}", i, path_str, e)
                        }
                    },
                    Err(e) => {
                        warn!("❌ Link #{} FAILED: Path='{}', TargetGroupHash={}, ChunkID={}, Error: {:?}", 
                              i, path_str, group_hash, chunk_id, e);
                        failed_links += 1;
                    }
                }
            },
            Err(e) => {
                warn!("❌ Link #{} FAILED: Error getting hash for path '{}': {:?}", i, path_str, e);
                failed_links += 1;
            }
        }
    }

    warn!("🔗 END create_links_for_group: Results for GroupHash={} with ChunkID={}: Successful={}, Failed={}, Total={}",
          group_hash, chunk_id, successful_links, failed_links, paths.len());
    Ok(())
}


// New function to create product groups
#[hdk_extern]
pub fn create_product_group(input: CreateProductGroupInput) -> ExternResult<ActionHash> {
    warn!(
        "START create_product_group: Creating group with {} products. Cat='{}', Subcat='{}', Type='{}', ChunkID={}",
        input.products.len(),
        input.category,
        input.subcategory.as_deref().unwrap_or("None"),
        input.product_type.as_deref().unwrap_or("None"),
        input.chunk_id
    );

    // Create product group entry
    let product_group = ProductGroup {
        category: input.category.clone(),
        subcategory: input.subcategory.clone(),
        product_type: input.product_type.clone(),
        products: input.products, // Consumes input.products
        chunk_id: input.chunk_id,
    };

    // Create the entry and get its hash
    let group_hash = match create_entry(&EntryTypes::ProductGroup(product_group.clone())) {
         Ok(hash) => {
             warn!("create_product_group: Successfully created ProductGroup entry with hash: {}", hash);
             hash
         },
         Err(e) => {
             warn!("ERROR create_product_group: Failed to create ProductGroup entry: {:?}", e);
             return Err(e);
         }
    };

    // Create mock product input for path generation (using first product's data)
    let first_product = match product_group.products.first() {
         Some(p) => p,
         None => {
             warn!("ERROR create_product_group: Product group is empty after creation (should not happen). Hash={}", group_hash);
             return Err(wasm_error!(WasmErrorInner::Guest("Product group is empty".into())));
         }
    };

    let mock_input = CreateProductInput {
        product: first_product.clone(),
        main_category: input.category, // Use category from input
        subcategory: input.subcategory, // Use subcategory from input
        product_type: input.product_type, // Use product_type from input
        additional_categorizations: input.additional_categorizations.clone(), // Use dual_categorization from input
    };

    // Get paths and create links
    let paths = match get_paths(&mock_input) {
         Ok(p) => p,
         Err(e) => {
             warn!("ERROR create_product_group: Failed to get paths for group {}: {:?}", group_hash, e);
             // Proceed without links? Or return error? Returning error for now.
             return Err(e);
         }
    };
    if let Err(e) = create_links_for_group(&group_hash, paths, product_group.chunk_id) {
         warn!("ERROR create_product_group: Failed to create links for group {}: {:?}", group_hash, e);
         // Proceed? Or return error? Returning error for now.
         return Err(e);
    }

    warn!("END create_product_group: Successfully created group and links. GroupHash={}", group_hash);
    Ok(group_hash)
}

// Helper function to get the latest group for a specific path
fn get_latest_group_for_path(path: &Path) -> ExternResult<Option<(ActionHash, ProductGroup, u32)>> {
    // Enhanced path lookup logging
    let path_string = format!("{:?}", path);
    warn!("🔍 START get_latest_group_for_path: Looking up latest group for path: '{}' ({:?})", 
          path_string, path);
    
    match path.path_entry_hash() {
        Ok(path_hash) => {
            warn!("📝 Path '{}' resolved to hash: {}", path_string, path_hash);
            let links = get_links(
                GetLinksInputBuilder::try_new(path_hash, LinkTypes::ProductTypeToGroup)?.build(),
            )?;
            
            let link_count = links.len();
            warn!("🔗 Found {} links for path '{}'", link_count, path_string);
            
            if links.is_empty() {
                warn!("⚠️ No links found for path '{}', returning None", path_string);
                return Ok(None);
            }
            
            // Detailed logging of all links
            warn!("📊 LINKS SUMMARY for path '{}':", path_string);
            for (i, link) in links.iter().enumerate() {
                let chunk_id = if link.tag.0.len() >= 4 {
                    u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
                } else {
                    0
                };
                warn!("  Link #{}: target={}, chunk_id={}", i, link.target, chunk_id);
            }
            
            // Find the latest link by inspecting chunk_id from tag
            let mut latest_link: Option<Link> = None;
            let mut latest_chunk_id: Option<u32> = None;
            let mut all_chunk_ids = Vec::new();
            
            for link in links {
                // Parse chunk_id from tag
                if link.tag.0.len() >= 4 {
                    let chunk_id = u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]));
                    all_chunk_ids.push(chunk_id);
                    
                    if latest_chunk_id.is_none() || chunk_id > latest_chunk_id.unwrap() {
                        latest_chunk_id = Some(chunk_id);
                        latest_link = Some(link);
                        warn!("🔼 Found new highest chunk_id={} for path '{}'", chunk_id, path_string);
                    }
                } else {
                    warn!("⚠️ Link has invalid tag format (too short): {:?}", link.tag);
                }
            }
            
            // Log all discovered chunk IDs
            all_chunk_ids.sort();
            warn!("🧩 All chunk IDs for path '{}': {:?}", path_string, all_chunk_ids);
            warn!("🔍 Gaps in sequence: {}", find_gaps_in_sequence(&all_chunk_ids));
            
            if let Some(link) = latest_link {
                if let Some(target_hash) = link.target.into_action_hash() {
                    warn!("🎯 Selected latest group: hash={}, chunk_id={} for path '{}'", 
                          target_hash, latest_chunk_id.unwrap_or(0), path_string);
                    
                    // Get the record
                    if let Some(record) = get(target_hash.clone(), GetOptions::default())? {
                        warn!("✅ Successfully retrieved record for hash: {}", target_hash);
                        
                        if let Ok(Some(mut group)) = record.entry().to_app_option::<ProductGroup>() {
                            // Log original group state before normalization
                            warn!("📄 Original group data: Cat='{}', Subcat={:?}, Type={:?}, Products={}, ChunkID={}", 
                                 group.category, group.subcategory, group.product_type, 
                                 group.products.len(), group.chunk_id);
                            
                            // Normalize the retrieved group
                            if group.subcategory == Some("".to_string()) {
                                warn!("🔄 Normalizing empty string subcategory to None");
                                group.subcategory = None;
                            }
                            if group.product_type == Some("".to_string()) {
                                warn!("🔄 Normalizing empty string product_type to None");
                                group.product_type = None;
                            }
                            
                            // Log normalization of products
                            let mut normalized_products = 0;
                            for product in &mut group.products {
                                let needs_subcat_norm = product.subcategory == Some("".to_string());
                                let needs_type_norm = product.product_type == Some("".to_string());
                                
                                if needs_subcat_norm {
                                    product.subcategory = None;
                                    normalized_products += 1;
                                }
                                if needs_type_norm {
                                    product.product_type = None;
                                    normalized_products += 1;
                                }
                            }
                            if normalized_products > 0 {
                                warn!("🔄 Normalized {} field values in {} products", normalized_products, group.products.len());
                            }
                            
                            warn!("✅ END get_latest_group_for_path: Returning group with hash={}, chunk_id={}, containing {} products",
                                  target_hash, latest_chunk_id.unwrap_or(0), group.products.len());
                            
                            return Ok(Some((target_hash, group, latest_chunk_id.unwrap_or(0))));
                        } else {
                            warn!("❌ Failed to deserialize record as ProductGroup. Hash={}", target_hash);
                            // Add more detailed error info
                            if let Some(entry) = record.entry().as_option() {
                                warn!("  Entry type: {:?}", entry.entry_type(None));
                                warn!("  Entry size: approx {} bytes", format!("{:?}", entry).len());
                            } else {
                                warn!("  Record has no entry data");
                            }
                        }
                    } else {
                        warn!("❌ Record not found for hash: {}", target_hash);
                    }
                }
            }
            
            warn!("⚠️ END get_latest_group_for_path: No valid group found after examining all links for path '{}'", path_string);
            Ok(None)
        },
        Err(e) => {
            warn!("❌ Failed to get hash for path '{}': {:?}", path_string, e);
            Ok(None)
        },
    }
}

// Helper function to identify gaps in chunk ID sequence
fn find_gaps_in_sequence(ids: &[u32]) -> String {
    if ids.is_empty() {
        return "No chunks found".to_string();
    }
    
    let mut gaps = Vec::new();
    for i in 1..ids.len() {
        if ids[i] > ids[i-1] + 1 {
            for missing in (ids[i-1] + 1)..ids[i] {
                gaps.push(missing);
            }
        }
    }
    
    if gaps.is_empty() {
        format!("No gaps, continuous sequence 0-{}", ids.last().unwrap_or(&0))
    } else {
        format!("Missing chunk IDs: {:?}", gaps)
    }
}

// Optimized batch creation of products using groups
#[hdk_extern]
pub fn create_product_batch(products: Vec<CreateProductInput>) -> ExternResult<Vec<Record>> {
    warn!("📝 START create_product_batch: Received batch of {} products", products.len());

    if products.is_empty() {
        warn!("create_product_batch: Input batch is empty. Returning empty Vec.");
        return Ok(Vec::new());
    }

    // Additional logging for any "Canned Beans" or "Black Beans" products
    for product in &products {
        let product_name = &product.product.name;
        let main_cat = &product.main_category; 
        let subcat = product.subcategory.as_deref().unwrap_or("None");
        let prod_type = product.product_type.as_deref().unwrap_or("None");
        
        // Debug log for products of interest - modify these filters as needed for your test case
        if main_cat.contains("Canned") || 
           subcat.contains("Beans") || 
           prod_type.contains("Black Beans") ||
           product_name.contains("Bean") {
            warn!("🔍 TRACKING PRODUCT: '{}': Cat='{}', Subcat='{}', Type='{}'", 
                  product_name, main_cat, subcat, prod_type);
        }
    }

    // --- Group products by PRIMARY category ---
    let mut grouped_products: HashMap<String, Vec<CreateProductInput>> = HashMap::new();
    for mut product_input in products {
        // Normalize input fields first
        if product_input.subcategory == Some("".to_string()) { product_input.subcategory = None; }
        if product_input.product_type == Some("".to_string()) { product_input.product_type = None; }
        if product_input.product.subcategory == Some("".to_string()) { product_input.product.subcategory = None; }
        if product_input.product.product_type == Some("".to_string()) { product_input.product.product_type = None; }

        // **Important**: Ensure the product's internal category matches the main_category from the input
        // This assumes the input data structure `CreateProductInput` should be the source of truth for the primary category
        // for this grouping phase.
        if product_input.product.category != product_input.main_category {
             warn!("⚠️ Normalizing product '{}' internal category from '{}' to main category '{}'",
                   product_input.product.name, product_input.product.category, product_input.main_category);
            product_input.product.category = product_input.main_category.clone();
        }
        if product_input.product.subcategory != product_input.subcategory {
            warn!("⚠️ Normalizing product '{}' internal subcategory from '{:?}' to main subcategory '{:?}'",
                   product_input.product.name, product_input.product.subcategory, product_input.subcategory);
            product_input.product.subcategory = product_input.subcategory.clone();
        }
        if product_input.product.product_type != product_input.product_type {
             warn!("⚠️ Normalizing product '{}' internal product_type from '{:?}' to main product_type '{:?}'",
                   product_input.product.name, product_input.product.product_type, product_input.product_type);
            product_input.product.product_type = product_input.product_type.clone();
        }

        let primary_category = product_input.main_category.clone();
        let primary_subcategory_key = product_input.subcategory.clone().unwrap_or_default();
        let primary_product_type_key = product_input.product_type.clone().unwrap_or_default();

        // Key based ONLY on primary categorization
        let key = format!("{}||{}||{}", primary_category, primary_subcategory_key, primary_product_type_key);

        // Debug log specific categories we're tracking
        if primary_category.contains("Canned") || 
           primary_subcategory_key.contains("Beans") || 
           primary_product_type_key.contains("Black Beans") ||
           product_input.product.name.contains("Bean") {
            warn!("🔑 TRACKING KEY GENERATION: Product='{}': key='{}'", 
                  product_input.product.name, key);
        }

        grouped_products.entry(key).or_insert_with(Vec::new).push(product_input);
    }

    warn!("create_product_batch: Grouped products into {} distinct primary category groups", grouped_products.len());

    let mut all_group_hashes = Vec::new();
    let mut total_groups_created = 0;
    let mut total_groups_failed = 0;

    // --- Process each PRIMARY category group ---
    for (key, group_products_inputs) in grouped_products {
        let parts: Vec<&str> = key.split("||").collect();
        // These define the category for the ProductGroup entry we are creating/updating
        let group_primary_category = parts[0].to_string();
        let group_primary_subcategory = if parts[1].is_empty() { None } else { Some(parts[1].to_string()) };
        let group_primary_product_type = if parts[2].is_empty() { None } else { Some(parts[2].to_string()) };

        // Extra logging for tracked categories
        let is_tracked_category = 
            group_primary_category.contains("Canned") || 
            group_primary_subcategory.as_deref().unwrap_or("").contains("Beans") ||
            group_primary_product_type.as_deref().unwrap_or("").contains("Black Beans");
        
        if is_tracked_category {
            warn!(
                "🔍 TRACKING GROUP: Processing PRIMARY group Cat='{}', Subcat='{}', Type='{}' with {} products",
                group_primary_category,
                group_primary_subcategory.as_deref().unwrap_or("None"),
                group_primary_product_type.as_deref().unwrap_or("None"),
                group_products_inputs.len()
            );
            
            // Log first few products in this category group
            let max_to_show = 3.min(group_products_inputs.len());
            for i in 0..max_to_show {
                warn!("  🔹 Sample product {}: '{}'", i, group_products_inputs[i].product.name);
            }
        } else {
            warn!(
    "------------------------------------------------------------------\n \
     📦🔄 create_product_batch: Processing PRIMARY group Cat='{}', Subcat='{}', Type='{}' with {} products",
    group_primary_category,
    group_primary_subcategory.as_deref().unwrap_or("None"),
    group_primary_product_type.as_deref().unwrap_or("None"),
    group_products_inputs.len()
);
        }

        // --- Get appropriate path for this category group ---
        let specific_path_str = match (&group_primary_subcategory, &group_primary_product_type) {
             (Some(sub), Some(pt)) => format!("categories/{}/subcategories/{}/types/{}", group_primary_category, sub, pt),
             (Some(sub), None) => format!("categories/{}/subcategories/{}", group_primary_category, sub),
             (None, None) => format!("categories/{}", group_primary_category),
             (None, Some(_)) => {
                 // This case should ideally not happen if paths are structured correctly, but handle defensively.
                 warn!("⚠️ Invalid path combination for primary group lookup: Cat='{}', Subcat=None, Type='{}'", group_primary_category, group_primary_product_type.as_deref().unwrap_or("None"));
                 continue; // Skip this group if path is invalid
             }
        };

        if is_tracked_category {
            warn!("🔍 TRACKING PATH: Looking up path: '{}'", specific_path_str);
        }

        let specific_path = match Path::try_from(specific_path_str.clone()) {
            Ok(path) => path,
            Err(e) => {
                warn!("❌ ERROR create_product_batch: Failed to create Path from string '{}': {:?}. Skipping group.", specific_path_str, e);
                total_groups_failed += group_products_inputs.len(); // Count products in failed group
                continue;
            }
        };

        // --- Create NEW groups for all products (append-only approach) ---
        warn!("📦 Processing {} products by creating new group chunks.", group_products_inputs.len());

        if is_tracked_category {
            warn!("🔍 TRACKING NEW GROUP CREATION: Creating new groups for {} products", 
                  group_products_inputs.len());
        }

        for product_chunk_inputs in group_products_inputs.chunks(PRODUCTS_PER_GROUP) {
            // --- Determine next chunk_id calculation ---
            warn!("🔢 Calculating next_chunk_id for path: {:?}", specific_path);

            let latest_group_info_res = get_latest_group_for_path(&specific_path);

            // Log the raw result of the lookup
            match &latest_group_info_res {
                Ok(Some((hash, _, chunk_id))) => {
                    warn!("🔢 Lookup Result: Ok(Some(latest_chunk_id={}, hash={}))", chunk_id, hash);
                    if is_tracked_category {
                         warn!("🔍 TRACKING LATEST CHUNK: Found latest chunk_id={} for path before creating new chunk", chunk_id);
                    }
                },
                Ok(None) => {
                    warn!("🔢 Lookup Result: Ok(None) - No existing group found for path.");
                     if is_tracked_category {
                        warn!("🔍 TRACKING LATEST CHUNK: No existing chunks found for path, will start with ID=0");
                    }
                },
                Err(e) => {
                     warn!("🔢 Lookup Result: Err({:?}) - Error looking up latest group.", e);
                     if is_tracked_category {
                        warn!("🔍 TRACKING LATEST CHUNK ERROR: {:?}", e);
                    }
                }
            }

            // Simple next_chunk_id calculation: always last_chunk_id + 1 or 0 if none exists
            let next_chunk_id = match latest_group_info_res {
                // Next chunk ID is always last_chunk_id + 1 when a previous chunk exists
                Ok(Some((_, _, last_chunk_id))) => {
                    warn!("🔢 Calculation: Found existing chunk (ID={}). Next ID = {} + 1", last_chunk_id, last_chunk_id);
                    last_chunk_id + 1 
                },
                // If no group exists OR if lookup failed, the next chunk is always 0
                _ => {
                    warn!("🔢 Calculation: No existing chunk found or lookup error. Using ID = 0");
                    0
                }
            };

            // Log the FINAL calculated chunk ID
            warn!("🔢 Calculated next_chunk_id = {}", next_chunk_id);

            if is_tracked_category {
                warn!("🔍 TRACKING NEW CHUNK: Will create new chunk with ID={} for path", next_chunk_id);
            }

            // Ensure data consistency for the group
            let products_for_group: Vec<_> = product_chunk_inputs.iter().map(|input| {
                let mut product = input.product.clone();
                // Explicitly set product's category fields to match the target group's fields
                product.category = group_primary_category.clone();
                product.subcategory = group_primary_subcategory.clone();
                product.product_type = group_primary_product_type.clone();
                product
            }).collect();

            // Prepare input for create_product_group
            // Use the first input of the chunk to get dual_categorization info
            let additional_categorizations = product_chunk_inputs.first().map(|input| input.additional_categorizations.clone()).unwrap_or_default();

            let group_input = CreateProductGroupInput {
                category: group_primary_category.clone(),
                subcategory: group_primary_subcategory.clone(),
                product_type: group_primary_product_type.clone(),
                products: products_for_group.clone(),
                chunk_id: next_chunk_id,
                additional_categorizations: additional_categorizations.clone(),
            };

             // Pre-create check logging
            if is_tracked_category {
                warn!("🔍 TRACKING CREATE GROUP: Creating new group with chunk_id={}", next_chunk_id);
                warn!("  - Category: '{}', Subcategory: {:?}, Type: {:?}", 
                      group_input.category, group_input.subcategory, group_input.product_type);
                warn!("  - Additional categorizations: {:?}", additional_categorizations);
                warn!("  - Products count: {}", group_input.products.len());
                
                // Log first few products 
                let max_to_show = 3.min(group_input.products.len());
                for i in 0..max_to_show {
                    warn!("    - Product {}: '{}'", i, group_input.products[i].name);
                }
            }

            match create_product_group(group_input) { // create_product_group handles entry creation AND linking
                Ok(hash) => {
                    warn!("✅ Successfully created new group chunk_id {} with hash: {}", next_chunk_id, hash);
                    
                    if is_tracked_category {
                        warn!("🔍 TRACKING CREATE SUCCESS: New group created with hash={}", hash);
                    }
                    
                    all_group_hashes.push(hash);
                    total_groups_created += 1;
                },
                Err(e) => {
                    warn!("❌ ERROR create_product_batch: Error creating group chunk_id {}: {:?}", next_chunk_id, e);
                    
                    if is_tracked_category {
                        warn!("🔍 TRACKING CREATE FAILURE: Failed to create group: {:?}", e);
                    }
                    
                    total_groups_failed += product_chunk_inputs.len(); // Count products in failed chunk
                }
            }
        }
    } // End loop through primary category groups

    warn!(
        "------------------------------------------------------------------\n \
         🏁 create_product_batch: Finished processing all groups. \
         Created: {}, Updated: 0, Failed Items: {}. Attempting to retrieve {} records.",
        total_groups_created, total_groups_failed, all_group_hashes.len()
    );

    // Retrieve records for all successfully created/updated groups
    match concurrent_get_records(all_group_hashes) {
        Ok(records) => {
            warn!("✅ END create_product_batch: Successfully retrieved {} product group records.", records.len());
            Ok(records)
        },
        Err(e) => {
            warn!("❌ ERROR create_product_batch: Error retrieving created/updated product group records: {:?}", e);
            // Still return Err, but log indicates partial success potentially
            Err(e)
        }
    }
}


#[derive(Serialize, Deserialize, Debug)]
pub struct RecategorizeGroupInput {
    pub group_hash: ActionHash,
    pub new_category: String,
    pub new_subcategory: Option<String>,
    pub new_product_type: Option<String>,
}

// Function to recategorize a product group
#[hdk_extern]
pub fn recategorize_product_group(input: RecategorizeGroupInput) -> ExternResult<()> {
    warn!(
        "START recategorize_product_group: GroupHash={}, NewCat='{}', NewSubcat='{}', NewType='{}'",
        input.group_hash,
        input.new_category,
        input.new_subcategory.as_deref().unwrap_or("None"),
        input.new_product_type.as_deref().unwrap_or("None")
    );

    // Get the current product group
    let group_record = match get(input.group_hash.clone(), GetOptions::default())? {
         Some(record) => record,
         None => {
             warn!("ERROR recategorize_product_group: Group not found for hash {}", input.group_hash);
             return Err(wasm_error!(WasmErrorInner::Guest("Group not found".into())));
         }
    };

    // Extract ProductGroup from the record
    let mut product_group = match ProductGroup::try_from(group_record.clone()) { // Clone record for potential error reporting
         Ok(group) => group,
         Err(e) => {
             warn!("ERROR recategorize_product_group: Failed to deserialize existing ProductGroup {}: {:?}", input.group_hash, e);
             return Err(wasm_error!(WasmErrorInner::Guest(format!("Failed to deserialize ProductGroup: {:?}", e))));
         }
    };

    warn!("recategorize_product_group: Found existing group. Old Cat='{}', Subcat='{}', Type='{}'",
        product_group.category,
        product_group.subcategory.as_deref().unwrap_or("None"),
        product_group.product_type.as_deref().unwrap_or("None")
    );


    // Find all links pointing to this group to delete them
    let mut old_paths = Vec::new();
    let mut old_path_strings = Vec::new();

    // Add current category path
    let current_category_path_str = format!("categories/{}/chunk_1", product_group.category);
    if let Ok(path) = Path::try_from(current_category_path_str.clone()) {
        old_paths.push(path);
        old_path_strings.push(current_category_path_str);
    } else {
         warn!("recategorize_product_group: Could not form path from old category string: {}", current_category_path_str);
    }


    // Add current subcategory path if exists
    if let Some(subcategory) = &product_group.subcategory {
        let subcategory_path_str = format!(
            "categories/{}/subcategories/{}/chunk_1",
            product_group.category, subcategory
        );
         if let Ok(path) = Path::try_from(subcategory_path_str.clone()) {
            old_paths.push(path);
            old_path_strings.push(subcategory_path_str);
        } else {
             warn!("recategorize_product_group: Could not form path from old subcategory string: {}", subcategory_path_str);
        }

        // Add current product type path if exists
        if let Some(product_type) = &product_group.product_type {
            let product_type_path_str = format!(
                "categories/{}/subcategories/{}/types/{}/chunk_1",
                product_group.category, subcategory, product_type
            );
             if let Ok(path) = Path::try_from(product_type_path_str.clone()) {
                old_paths.push(path);
                old_path_strings.push(product_type_path_str);
            } else {
                 warn!("recategorize_product_group: Could not form path from old product type string: {}", product_type_path_str);
            }
        }
    }
    warn!("recategorize_product_group: Identified {} old paths to check for links: {:?}", old_paths.len(), old_path_strings);


    // Find and delete all existing links
    let mut old_links_to_delete = Vec::new();
    for path in old_paths { // Consumes old_paths
        match path.path_entry_hash() {
            Ok(path_hash) => {
                 match get_links(
                    GetLinksInputBuilder::try_new(path_hash.clone(), LinkTypes::ProductTypeToGroup)?.build(),
                ) {
                    Ok(links) => {
                        warn!("recategorize_product_group: Found {} links from path hash {}", links.len(), path_hash);
                        for link in links {
                            if let Some(target_hash) = link.target.into_action_hash() {
                                if target_hash == input.group_hash {
                                    warn!("recategorize_product_group:   Found matching link to delete: {}", link.create_link_hash);
                                    old_links_to_delete.push(link.create_link_hash);
                                }
                            }
                        }
                    },
                    Err(e) => {
                         warn!("recategorize_product_group: Error getting links from path hash {}: {:?}", path_hash, e);
                    }
                }
            },
            Err(e) => {
                 warn!("recategorize_product_group: Error getting hash for path: {:?}", e);
            }
        }
    }

    // Delete all old links found
    warn!("recategorize_product_group: Attempting to delete {} old links.", old_links_to_delete.len());
    let mut delete_success_count = 0;
    let mut delete_fail_count = 0;
    for link_hash in old_links_to_delete { // Consumes old_links_to_delete
        match delete_link(link_hash.clone()) { // Clone hash for logging on error
            Ok(_) => {
                delete_success_count += 1;
            },
            Err(e) => {
                 warn!("ERROR recategorize_product_group: Failed to delete link {}: {:?}", link_hash, e);
                 delete_fail_count += 1;
            }
        }
    }
     warn!("recategorize_product_group: Finished deleting old links. Success: {}, Failed: {}", delete_success_count, delete_fail_count);


    // Create a new product group with updated category info
    let products = std::mem::take(&mut product_group.products); // Take ownership without moving original group
    let chunk_id = product_group.chunk_id; // Copy chunk_id

    // Get first product for path generation before moving products
    let first_product = match products.first().cloned() { // Clone the first product
         Some(p) => p,
         None => {
             warn!("ERROR recategorize_product_group: Product group {} became empty during processing.", input.group_hash);
             return Err(wasm_error!(WasmErrorInner::Guest("Product group is empty".into())));
         }
    };


    // **Important**: Update the category info within each product inside the group
    let updated_products: Vec<Product> = products.into_iter().map(|mut p| {
        p.category = input.new_category.clone();
        p.subcategory = input.new_subcategory.clone();
        p.product_type = input.new_product_type.clone();
        p
    }).collect();
    warn!("recategorize_product_group: Updated category info within {} products.", updated_products.len());


    let updated_group_entry = ProductGroup {
        category: input.new_category.clone(),
        subcategory: input.new_subcategory.clone(),
        product_type: input.new_product_type.clone(),
        products: updated_products, // Use the products with updated categories
        chunk_id, // Use copied chunk_id
    };

    // Create the new entry
    let new_group_hash = match create_entry(&EntryTypes::ProductGroup(updated_group_entry)) {
         Ok(hash) => {
             warn!("recategorize_product_group: Successfully created new ProductGroup entry with hash: {}", hash);
             hash
         },
         Err(e) => {
             warn!("ERROR recategorize_product_group: Failed to create new ProductGroup entry: {:?}", e);
             return Err(e);
         }
    };

    // Create mock input for path generation using the *new* category info
    let mock_input = CreateProductInput {
        product: first_product, // Use the cloned first product
        main_category: input.new_category, // Use new category
        subcategory: input.new_subcategory, // Use new subcategory
        product_type: input.new_product_type, // Use new product type
        additional_categorizations: Vec::new(), // Assume no dual categorization when recategorizing
    };

    // Get new paths and create links for the new group entry
    let new_paths = match get_paths(&mock_input) {
         Ok(p) => p,
         Err(e) => {
             warn!("ERROR recategorize_product_group: Failed to get paths for new group {}: {:?}", new_group_hash, e);
             return Err(e);
         }
    };
    if let Err(e) = create_links_for_group(&new_group_hash, new_paths, chunk_id) {
         warn!("ERROR recategorize_product_group: Failed to create links for new group {}: {:?}", new_group_hash, e);
         return Err(e);
    }

    // Optionally: Delete the old product group entry?
    // Be careful with this - ensures cleanup but makes rollback harder.
    // match delete_entry(group_record.action_address().clone()) {
    //     Ok(_) => warn!("recategorize_product_group: Successfully deleted old group entry {}", input.group_hash),
    //     Err(e) => warn!("ERROR recategorize_product_group: Failed to delete old group entry {}: {:?}", input.group_hash, e),
    // }


    warn!("END recategorize_product_group: Finished recategorizing. New GroupHash={}", new_group_hash);
    Ok(())
}


// Function to get an individual product group by hash
#[hdk_extern]
pub fn get_product_group(hash: ActionHash) -> ExternResult<Option<Record>> {
    warn!("START get_product_group: Hash={}", hash);
    let result = get(hash, GetOptions::default());
    warn!("END get_product_group: Result is Some: {}", result.as_ref().map(|o| o.is_some()).unwrap_or(false));
    result
}

// Function to get an individual product by its hash (Note: Products are inside groups now)
// This function might be misleading as individual products don't have their own top-level entries anymore.
// Consider removing or clarifying its purpose.
#[hdk_extern]
pub fn get_product(action_hash: ActionHash) -> ExternResult<Option<Record>> {
    warn!("START get_product: Hash={}. (Note: This likely refers to a ProductGroup action hash)", action_hash);
    let result = get(action_hash, GetOptions::default());
     warn!("END get_product: Result is Some: {}", result.as_ref().map(|o| o.is_some()).unwrap_or(false));
    result
}

// Lightweight function to get just the product count for a group at a specific offset
#[hdk_extern]
pub fn get_product_count_for_group(params: GetProductsParams) -> ExternResult<usize> {
    warn!("get_product_count_for_group: offset={}, category={}, subcategory={:?}, product_type={:?}", 
        params.offset, params.category, params.subcategory, params.product_type);
    
    let base_path = match (&params.subcategory, &params.product_type) {
        (Some(subcategory), Some(product_type)) => format!(
            "categories/{}/subcategories/{}/types/{}", 
            params.category, subcategory, product_type
        ),
        (Some(subcategory), None) => format!(
            "categories/{}/subcategories/{}", 
            params.category, subcategory
        ),
        (None, None) => format!("categories/{}", params.category),
        (None, Some(_)) => {
            warn!("ERROR get_product_count_for_group: Cannot have product type without subcategory");
            return Ok(0)
        }
    };

    let chunk_path = Path::try_from(base_path)?;
    let path_hash = chunk_path.path_entry_hash()?;

    let all_links = match get_links(
        GetLinksInputBuilder::try_new(path_hash, LinkTypes::ProductTypeToGroup)?.build(),
    ) {
        Ok(links) => links,
        Err(e) => {
            warn!("ERROR get_product_count_for_group: Failed to get links: {:?}", e);
            return Ok(0);
        }
    };

    // Sort by chunk_id
    let mut all_links = all_links;
    all_links.sort_by_key(|link| {
        if link.tag.0.len() >= 4 {
            u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
        } else {
            0
        }
    });

    // Get the specific group at offset and fetch its count
    if let Some(link) = all_links.get(params.offset) {
        if let Some(target_hash) = link.target.clone().into_action_hash() {
            match get(target_hash, GetOptions::default())? {
                Some(record) => {
                    match record.entry().to_app_option::<ProductGroup>().map_err(|e| wasm_error!(WasmErrorInner::Guest(e.to_string())))? {
                        Some(group) => {
                            debug!("get_product_count_for_group: Found group with {} products", group.products.len());
                            Ok(group.products.len())
                        },
                        None => {
                            warn!("get_product_count_for_group: Record is not a ProductGroup");
                            Ok(0)
                        }
                    }
                },
                None => {
                    warn!("get_product_count_for_group: Group not found");
                    Ok(0)
                }
            }
        } else {
            Ok(0)
        }
    } else {
        Ok(0)
    }
}

#[hdk_extern]
pub fn get_all_group_counts_for_path(params: GetProductsParams) -> ExternResult<Vec<usize>> {
    warn!("🔍 START get_all_group_counts_for_path: category='{}', subcategory='{:?}', product_type='{:?}'", 
        params.category, params.subcategory, params.product_type);
    
    let base_path = match (&params.subcategory, &params.product_type) {
        (Some(subcategory), Some(product_type)) => format!(
            "categories/{}/subcategories/{}/types/{}", 
            params.category, subcategory, product_type
        ),
        (Some(subcategory), None) => format!(
            "categories/{}/subcategories/{}", 
            params.category, subcategory
        ),
        (None, None) => format!("categories/{}", params.category),
        (None, Some(_)) => {
            warn!("❌ get_all_group_counts_for_path: Invalid path params - Cannot have product_type without subcategory");
            return Err(wasm_error!(WasmErrorInner::Guest(
                "Cannot have product type without subcategory".into()
            )))
        }
    };
    
    warn!("🛣️ get_all_group_counts_for_path: Using path string: '{}'", base_path);

    let chunk_path = match Path::try_from(base_path.clone()) {
        Ok(path) => path,
        Err(e) => {
            warn!("❌ get_all_group_counts_for_path: Failed to create Path from '{}': {:?}", base_path, e);
            return Err(e.into());
        }
    };
    
    let path_hash = match chunk_path.path_entry_hash() {
        Ok(hash) => hash,
        Err(e) => {
            warn!("❌ get_all_group_counts_for_path: Failed to get hash for path '{}': {:?}", base_path, e);
            return Err(e);
        }
    };
    
    warn!("🧩 get_all_group_counts_for_path: Path hash for '{}': {}", base_path, path_hash);

        let all_links = match get_links(
        GetLinksInputBuilder::try_new(path_hash, LinkTypes::ProductTypeToGroup)?
            .build(),
    ) {
        Ok(links) => links,
        Err(e) => {
            warn!("❌ get_all_group_counts_for_path: Failed to get links for path '{}': {:?}", base_path, e);
            return Err(e);
        }
    };

    warn!("🔗 get_all_group_counts_for_path: Found {} links for path '{}'", all_links.len(), base_path);
    
    // Log all links found with their chunk IDs
    for (i, link) in all_links.iter().enumerate() {
        let chunk_id = if link.tag.0.len() >= 4 {
            u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
        } else {
            0
        };
        
        warn!("  🔗 Link #{}: Target={}, ChunkID={}", i, link.target, chunk_id);
    }

    // Sort by chunk_id
    let mut all_links = all_links;
    all_links.sort_by_key(|link| {
        if link.tag.0.len() >= 4 {
            u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
        } else {
            0
        }
    });

    // Get count for each group
    let mut counts = Vec::new();
    let mut total_products = 0;
    let mut failed_fetches = 0;
    let mut failed_deserializations = 0;
    
    warn!("📊 get_all_group_counts_for_path: Processing {} links to extract product counts...", all_links.len());
    
    for (i, link) in all_links.iter().enumerate() {
        let target_hash_opt = link.target.clone().into_action_hash();
        
        if let Some(target_hash) = target_hash_opt {
            warn!("  🎯 Processing link #{}: Target hash={}", i, target_hash);
            
            match get(target_hash.clone(), GetOptions::network()) {
                Ok(Some(record)) => {
                    warn!("    ✅ Successfully fetched record for hash: {}", target_hash);
                    
                    match record.entry().to_app_option::<ProductGroup>() {
                        Ok(Some(group)) => {
                            let product_count = group.products.len();
                            warn!("    ✅ Successfully deserialized ProductGroup: ChunkID={}, Products={}", 
                                  group.chunk_id, product_count);
                            counts.push(product_count);
                            total_products += product_count;
                        },
                        Ok(None) => {
                            warn!("    ❌ Record is not a ProductGroup: {}", target_hash);
                            failed_deserializations += 1;
                        },
                        Err(e) => {
                            warn!("    ❌ Failed to deserialize record as ProductGroup: {} - Error: {:?}", target_hash, e);
                            failed_deserializations += 1;
                        }
                    }
                },
                Ok(None) => {
                    warn!("    ❌ Record not found for hash: {}", target_hash);
                    failed_fetches += 1;
                },
                Err(e) => {
                    warn!("    ❌ Error fetching record for hash {}: {:?}", target_hash, e);
                    failed_fetches += 1;
                }
            }
        } else {
            warn!("  ❌ Link #{} target is not an ActionHash: {}", i, link.target);
        }
    }
    
    let count_sum: usize = counts.iter().sum();
    
    warn!("📈 get_all_group_counts_for_path: Result Summary for path '{}':", base_path);
    warn!("  - Links found: {}", all_links.len());
    warn!("  - Successful group fetches: {}", counts.len());
    warn!("  - Failed fetches: {}", failed_fetches);
    warn!("  - Failed deserializations: {}", failed_deserializations);
    warn!("  - Total products sum: {}", total_products);
    warn!("  - Counts array: {:?}", counts);
    warn!("  - Counts array sum check: {}", count_sum);
    
    warn!("🏁 END get_all_group_counts_for_path: Returning {} count items for path '{}'", counts.len(), base_path);
    
    Ok(counts)
}