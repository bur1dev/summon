use hdk::prelude::*;
use products_integrity::*;
use crate::utils::concurrent_get_records;

// Define the constant here or import if defined elsewhere
const PRODUCTS_PER_GROUP: usize = 1000;

// Updated to return product groups instead of individual products
#[derive(Serialize, Deserialize, Debug)]
pub struct CategorizedProducts {
    pub category: String,
    pub subcategory: Option<String>,
    pub product_type: Option<String>,
    pub product_groups: Vec<Record>,          // Now contains ProductGroup records
    pub total_groups: usize,                  // Total number of groups for this category path
    pub total_products: usize,                // Estimated total number of products across *all* groups for this category path
    pub has_more: bool,                       // Indicates if there are more groups beyond the current page
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GetProductsParams {
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub subcategory: Option<String>,
    #[serde(default)]
    pub product_type: Option<String>,
    #[serde(default)] // Represents the group offset
    pub offset: usize,
    #[serde(default = "default_limit")] // Represents the group limit
    pub limit: usize,
}

fn default_limit() -> usize {
    // Default limit for number of *groups* to fetch per request
    // Corresponds to PRODUCTS_PER_GROUP * default_limit() products roughly
    // Let's set a reasonable default, e.g., 5 groups (100 products)
    5
}

// Modified to work with product groups and return correct total_products
#[hdk_extern]
pub fn get_products_by_category(params: GetProductsParams) -> ExternResult<CategorizedProducts> {
    warn!(
        "START get_products_by_category: Cat={}, Subcat={}, Type={}, Offset(groups)={}, Limit(groups)={}",
        params.category,
        params.subcategory.as_deref().unwrap_or("None"),
        params.product_type.as_deref().unwrap_or("None"),
        params.offset,
        params.limit
    );

    // Determine the path based on category/subcategory/product_type
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
            warn!("ERROR get_products_by_category: Cannot have product type without subcategory");
            return Err(wasm_error!(WasmErrorInner::Guest(
                "Cannot have product type without subcategory".into()
            )))
        }
    };

    warn!("get_products_by_category: Using path: {}", base_path);
     let chunk_path = Path::try_from(base_path.clone())?;
    let path_hash = chunk_path.path_entry_hash()?;

warn!("get_products_by_category: Querying path '{}' (hash: {})", base_path, path_hash);
let all_links = match get_links(
    GetLinksInputBuilder::try_new(path_hash.clone(), LinkTypes::ProductTypeToGroup)?.build(),
) {
    Ok(links) => links,
    Err(e) => {
         warn!("ERROR get_products_by_category: Failed to get links for path '{}' (hash: {}): {:?}", 
               base_path, path_hash, e);
         return Err(e);
    }
};

let total_groups = all_links.len(); // This is the actual total number of groups
warn!("get_products_by_category: Found {} total product group links for path '{}' (hash: {})", 
      total_groups, base_path, path_hash);

// Log each link with its chunk_id from tag
for (i, link) in all_links.iter().enumerate() {
    let chunk_id = if link.tag.0.len() >= 4 {
        u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
    } else {
        0
    };
    warn!("  Link #{}: Target={}, ChunkID={}", i, link.target, chunk_id);
}

    // Sort links by chunk_id from tag before pagination
    let mut all_links = all_links;
    all_links.sort_by_key(|link| {
        if link.tag.0.len() >= 4 {
            u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
        } else {
            0
        }
    });

    // Apply pagination on the sorted links
    let paginated_links = all_links
        .into_iter()
        .skip(params.offset)
        .take(params.limit)
        .collect::<Vec<_>>();

    warn!("get_products_by_category: After pagination (offset={}, limit={}), {} links remain", params.offset, params.limit, paginated_links.len());

    // Extract action hashes from the paginated links
    let target_hashes: Vec<_> = paginated_links
        .into_iter()
        .filter_map(|link| link.target.into_action_hash())
        .collect();

    warn!("get_products_by_category: Retrieving {} product group records", target_hashes.len());

    // Get the records for the paginated product groups
let product_groups_records = concurrent_get_records(target_hashes)?;
warn!("get_products_by_category: Successfully retrieved {} product group records", product_groups_records.len());

// Add detailed product count verification
warn!("🧮 PRODUCT COUNT VERIFICATION: Analyzing contents of {} groups", product_groups_records.len());
let mut total_products_count = 0;
let mut group_product_counts = Vec::new();

for (i, record) in product_groups_records.iter().enumerate() {
    match record.entry().to_app_option::<ProductGroup>() {
        Ok(Some(group)) => {
            let product_count = group.products.len();
            total_products_count += product_count;
            group_product_counts.push(product_count);
            
            warn!("  🧮 Group #{} (ChunkID={}): Contains {} products, Hash={}", 
                  i, group.chunk_id, product_count, record.action_address());
            
            // Log first few product names for verification
            if product_count > 0 {
                for j in 0..std::cmp::min(3, product_count) {
                    warn!("     - Sample product {}: '{}'", j, group.products[j].name);
                }
            } else {
                warn!("     ⚠️ Group is EMPTY!");
            }
        },
        Ok(None) => {
            warn!("  ❌ Group #{}: Failed to deserialize as ProductGroup (empty result)", i);
        },
        Err(e) => {
            warn!("  ❌ Group #{}: Error deserializing: {:?}", i, e);
        }
    }
}

warn!("🧮 PRODUCT COUNT VERIFICATION: Total products across all groups: {}", total_products_count);
warn!("🧮 PRODUCT COUNT VERIFICATION: Product counts by group: {:?}", group_product_counts);

// Determine if there are more groups beyond the current page
let has_more = (params.offset + params.limit) < total_groups;

warn!(
    "END get_products_by_category: Returning {} groups with {} total products. Total Groups: {}. Has More: {}",
    product_groups_records.len(),
    total_products_count,
    total_groups,
    has_more
);

Ok(CategorizedProducts {
    category: params.category,
    subcategory: params.subcategory,
    product_type: params.product_type,
    product_groups: product_groups_records,
    total_groups,
    total_products: total_products_count, // Now setting the actual count
    has_more,
})
}

#[hdk_extern]
pub fn get_all_category_products(category: String) -> ExternResult<CategorizedProducts> {
    warn!("🔍 START get_all_category_products: Category='{}'", category);

    let path_str = format!("categories/{}", category);
    warn!("  🛣️ Path string: '{}'", path_str);
    
    let chunk_path = match Path::try_from(path_str.clone()) {
        Ok(path) => path,
        Err(e) => {
            warn!("  ❌ Failed to create Path from '{}': {:?}", path_str, e);
            return Err(e.into());
        }
    };
    
    let path_hash = match chunk_path.path_entry_hash() {
        Ok(hash) => hash,
        Err(e) => {
            warn!("  ❌ Failed to get hash for path '{}': {:?}", path_str, e);
            return Err(e);
        }
    };
    
    warn!("  🧩 Path hash for '{}': {}", path_str, path_hash);

    // Get links to product groups at the category level
    let links = match get_links(
        GetLinksInputBuilder::try_new(path_hash, LinkTypes::ProductTypeToGroup)?.build()
    ) {
        Ok(links) => links,
        Err(e) => {
            warn!("  ❌ ERROR get_all_category_products: Failed to get links for path '{}': {:?}", path_str, e);
            return Err(e);
        }
    };

    let total_groups = links.len();
    warn!("  🔗 Found {} product group links at category level for '{}'", total_groups, path_str);

    // Log all links found with their chunk IDs
    for (i, link) in links.iter().enumerate() {
        let chunk_id = if link.tag.0.len() >= 4 {
            u32::from_le_bytes(link.tag.0[..4].try_into().unwrap_or([0, 0, 0, 0]))
        } else {
            0
        };
        warn!("    🔗 Link #{}: Target={}, ChunkID={}", i, link.target, chunk_id);
    }

    // Extract action hashes from links
    let all_hashes: Vec<_> = links
        .into_iter()
        .filter_map(|link| {
            let hash_opt = link.target.clone().into_action_hash();
            if hash_opt.is_none() {
                warn!("    ⚠️ Link target is not an ActionHash: {}", link.target);
            }
            hash_opt
        })
        .collect();
    
    warn!("  🎯 Extracted {} valid action hashes from {} links", all_hashes.len(), total_groups);

    // Get all product group records
    // Get all product group records
warn!("  📥 Fetching {} group records using concurrent_get_records...", all_hashes.len());
let product_groups_records = match concurrent_get_records(all_hashes.clone()) {
    Ok(records) => {
        warn!("  ✅ concurrent_get_records returned {} records", records.len());
        if records.len() < all_hashes.len() {
            warn!("  ⚠️ Some records not returned: requested {} but got {}", all_hashes.len(), records.len());
            // Log the missing hashes
            let returned_hashes: Vec<ActionHash> = records.iter()
                .map(|r| r.action_address().clone())
                .collect();
            for (i, hash) in all_hashes.iter().enumerate() {
                if !returned_hashes.contains(hash) {
                    warn!("  ❌ Missing record #{}: Hash={}", i, hash);
                }
            }
        }
        records
    },
    Err(e) => {
        warn!("  ❌ Failed to fetch product group records: {:?}", e);
        return Err(e);
    }
};
    
    warn!("  ✅ Retrieved {} product group records", product_groups_records.len());

    warn!("  🔍 Inspecting fetched group records (count: {})...", product_groups_records.len());
    let mut deserialize_success = 0;
    let mut deserialize_empty = 0;
    let mut deserialize_error = 0;
    let mut total_products_count = 0;
    
    for (i, record) in product_groups_records.iter().enumerate() {
        match record.entry().to_app_option::<ProductGroup>() {
            Ok(Some(group)) => {
                let product_count = group.products.len();
                total_products_count += product_count;
                deserialize_success += 1;
                
                warn!("    ✅ Group #{}: Hash={}, ChunkID={}, Products={}, Cat='{}', Subcat='{:?}', Type='{:?}'", 
                      i, record.action_address(), group.chunk_id, product_count,
                      group.category, group.subcategory, group.product_type);
            },
            Ok(None) => {
                deserialize_empty += 1;
                warn!("    ⚠️ Group #{}: Hash={} - Could not deserialize to ProductGroup (empty result)", 
                      i, record.action_address());
            },
            Err(e) => {
                deserialize_error += 1;
                warn!("    ❌ Group #{}: Hash={} - Deserialization Error: {:?}", 
                      i, record.action_address(), e);
            }
        }
    }

    // Calculate total number of products across ALL fetched groups
    let actual_total_products = product_groups_records.iter()
        .filter_map(|record| {
            record.entry().to_app_option::<ProductGroup>().ok()? // Get ProductGroup entry
        })
        .map(|group| group.products.len()) // Get count of products in each group
        .sum(); // Sum counts

    warn!("  📊 Result summary:");
    warn!("    - Total groups found: {}", total_groups);
    warn!("    - Groups successfully fetched: {}", product_groups_records.len());
    warn!("    - Groups successfully deserialized: {}", deserialize_success);
    warn!("    - Groups with empty deserialization: {}", deserialize_empty);
    warn!("    - Groups with deserialization errors: {}", deserialize_error);
    warn!("    - Manual product count: {}", total_products_count);
    warn!("    - Calculated actual total products: {}", actual_total_products);
    warn!("    - Cross-check: {} (should match)", total_products_count);

    warn!("🏁 END get_all_category_products: Returning {} groups with {} total products",
          product_groups_records.len(), actual_total_products);

    Ok(CategorizedProducts {
        category,
        subcategory: None,
        product_type: None,
        product_groups: product_groups_records.clone(),
        total_groups,
        total_products: actual_total_products,
        has_more: false,
    })
}

// New function to extract individual products from a group
#[hdk_extern]
pub fn extract_products_from_group(group_hash: ActionHash) -> ExternResult<Vec<Product>> {
    warn!("START extract_products_from_group: GroupHash={}", group_hash);

    // Get the product group record
    let group_record = match get(group_hash.clone(), GetOptions::default())? {
         Some(record) => record,
         None => {
             warn!("ERROR extract_products_from_group: Group not found for hash {}", group_hash);
             return Err(wasm_error!(WasmErrorInner::Guest("Group not found".into())));
         }
    };

    // Extract the ProductGroup from the record
    let product_group = match ProductGroup::try_from(group_record) {
         Ok(group) => group,
         Err(e) => {
             warn!("ERROR extract_products_from_group: Failed to deserialize ProductGroup: {:?}", e);
             return Err(wasm_error!(WasmErrorInner::Guest(format!("Failed to deserialize ProductGroup: {:?}", e))));
         }
    };

    let count = product_group.products.len();
    warn!("END extract_products_from_group: Extracted {} products", count);

    Ok(product_group.products)
}

// New function to get paginated products from a group
#[derive(Serialize, Deserialize, Debug)]
pub struct GroupProductsParams {
    pub group_hash: ActionHash,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PaginatedProducts {
    pub products: Vec<Product>,
    pub total: usize,
    pub has_more: bool,
}

#[hdk_extern]
pub fn get_paginated_products_from_group(params: GroupProductsParams) -> ExternResult<PaginatedProducts> {
    warn!(
        "START get_paginated_products_from_group: GroupHash={}, Offset={}, Limit={}",
        params.group_hash, params.offset, params.limit
    );

    // Get the product group record
     let group_record = match get(params.group_hash.clone(), GetOptions::default())? {
         Some(record) => record,
         None => {
             warn!("ERROR get_paginated_products_from_group: Group not found for hash {}", params.group_hash);
             return Err(wasm_error!(WasmErrorInner::Guest("Group not found".into())));
         }
    };

    // Extract the ProductGroup from the record
    let product_group = match ProductGroup::try_from(group_record) {
         Ok(group) => group,
         Err(e) => {
             warn!("ERROR get_paginated_products_from_group: Failed to deserialize ProductGroup: {:?}", e);
             return Err(wasm_error!(WasmErrorInner::Guest(format!("Failed to deserialize ProductGroup: {:?}", e))));
         }
    };

    let total = product_group.products.len();

    // Apply pagination
    let products: Vec<Product> = product_group.products
        .into_iter()
        .skip(params.offset)
        .take(params.limit)
        .collect();

    let has_more = (params.offset + params.limit) < total;

    warn!(
        "END get_paginated_products_from_group: Returning {} products (Total in group: {}). Has More: {}",
        products.len(), total, has_more
    );

    Ok(PaginatedProducts {
        products,
        total,
        has_more,
    })
}