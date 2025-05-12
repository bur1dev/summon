use hdk::prelude::*;
use products_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub products: Vec<Record>,
    pub total: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProductReference {
    pub group_hash: ActionHash,
    pub index: usize,
}

// New function to handle product references (group_hash + index)
#[hdk_extern]
pub fn get_products_by_references(references: Vec<ProductReference>) -> ExternResult<SearchResult> {
    debug!("get_products_by_references called with {} references", references.len());
    
    if references.is_empty() {
        debug!("No references provided in request");
        return Ok(SearchResult {
            products: vec![],
            total: 0,
        });
    }
    
    // Group references by group_hash to minimize fetches
    let mut group_map: std::collections::HashMap<ActionHash, Vec<usize>> = std::collections::HashMap::new();
    for reference in references {
        group_map
            .entry(reference.group_hash)
            .or_insert_with(Vec::new)
            .push(reference.index);
    }
    
    debug!("Organized references into {} unique group hashes", group_map.len());
    
    // Fetch all required ProductGroups
    let mut all_group_records = Vec::new();
    let group_hashes: Vec<ActionHash> = group_map.keys().cloned().collect();
    
    match get_records_from_hashes(group_hashes) {
        Ok(groups) => {
            debug!("Successfully retrieved {} product groups", groups.len());
            all_group_records = groups;
        }
        Err(e) => {
            debug!("Error retrieving product groups: {:?}", e);
            return Err(e);
        }
    }
    
    // Extract requested products from groups
    let mut product_records = Vec::new();
    
    for record in all_group_records {
        let group_hash = record.action_address().clone().into_hash();
if let Some(indices) = group_map.get(&group_hash) {
            if let Some(indices) = group_map.get(&group_hash) {
                // Extract ProductGroup from record
                if let Ok(Some(group)) = record.entry().to_app_option::<ProductGroup>() {
                    for &index in indices {
                        if index < group.products.len() {
                            // Create a virtual record for the product (containing the group record with group hash)
                            // This maintains compatibility with frontend expecting records
                            product_records.push(record.clone());
                        }
                    }
                } else {
                    debug!("Failed to deserialize record as ProductGroup");
                }
            }
        }
    }
    
    debug!("Returning {} product records", product_records.len());
    Ok(SearchResult {
        products: product_records.clone(),
        total: product_records.len(),
    })
}

// Maintained for backward compatibility - will be deprecated
#[hdk_extern]
pub fn get_products_by_hashes(hashes: Vec<ActionHash>) -> ExternResult<SearchResult> {
    debug!("get_products_by_hashes called with {} hashes - now using groups", hashes.len());
    
    // Convert to the new format assuming these are group hashes
    let references: Vec<ProductReference> = hashes
        .into_iter()
        .map(|hash| ProductReference {
            group_hash: hash,
            index: 0, // Default to first product in group
        })
        .collect();
    
    get_products_by_references(references)
}

fn get_records_from_hashes(hashes: Vec<ActionHash>) -> ExternResult<Vec<Record>> {
    // Process in batches of 100 to prevent timeouts
    const BATCH_SIZE: usize = 1000;
    let mut all_records = Vec::new();

    debug!(
        "get_records_from_hashes processing {} hashes in batches of {}",
        hashes.len(),
        BATCH_SIZE
    );

    for (batch_index, batch) in hashes.chunks(BATCH_SIZE).enumerate() {
        debug!(
            "Processing batch {} with {} hashes",
            batch_index + 1,
            batch.len()
        );

        let input: Vec<_> = batch
            .iter()
            .map(|hash| GetInput::new(hash.clone().into(), GetOptions::default()))
            .collect();

        match HDK.with(|hdk| hdk.borrow().get(input)) {
            Ok(records) => {
                debug!("Got {} record responses", records.len());
                let valid_records: Vec<_> = records.into_iter().flatten().collect();
                debug!("Found {} valid records", valid_records.len());
                all_records.extend(valid_records);
            }
            Err(e) => {
                debug!("HDK.get failed with error: {:?}", e);
                return Err(e);
            }
        }
    }

    debug!("Returning {} total records", all_records.len());
    Ok(all_records)
}