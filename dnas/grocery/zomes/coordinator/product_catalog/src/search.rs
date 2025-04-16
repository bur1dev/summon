use hdk::prelude::*;
use products_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub products: Vec<Record>,
    pub total: usize,
}

#[hdk_extern]
pub fn get_products_by_hashes(hashes: Vec<ActionHash>) -> ExternResult<SearchResult> {
    debug!("get_products_by_hashes called with {} hashes", hashes.len());

    // Debug log the first hash if available
    if !hashes.is_empty() {
        debug!("First hash type information: {:?}", hashes[0]);
        debug!(
            "First hash as string representation: {}",
            format!("{:?}", hashes[0])
        );
    } else {
        debug!("No hashes provided in request");
    }

    // Use the same concurrent fetch approach as your category browsing
    match get_records_from_hashes(hashes.clone()) {
        Ok(products) => {
            debug!("Successfully retrieved {} products", products.len());
            Ok(SearchResult {
                products: products.clone(),
                total: products.len(),
            })
        }
        Err(e) => {
            debug!("Error getting records from hashes: {:?}", e);
            Err(e)
        }
    }
}

fn get_records_from_hashes(hashes: Vec<ActionHash>) -> ExternResult<Vec<Record>> {
    // Process in batches of 100 to prevent timeouts
    const BATCH_SIZE: usize = 100;
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
