use hdk::prelude::*;

// Concurrent record retrieval function (kept from original implementation)

pub fn concurrent_get_records(hashes: Vec<ActionHash>) -> ExternResult<Vec<Record>> {
    warn!("🔄 START concurrent_get_records: Fetching {} records in batches", hashes.len());
    
    const BATCH_SIZE: usize = 100;
    let mut all_records = Vec::new();
    let mut successful_fetches = 0;
    let mut failed_fetches = 0;

    for (i, batch) in hashes.chunks(BATCH_SIZE).enumerate() {
        warn!("  📦 Processing batch #{} with {} hashes", i, batch.len());
        
        let input: Vec<_> = batch
            .iter()
            .map(|hash| {
                warn!("    🎯 Adding hash to batch #{}: {}", i, hash);
                GetInput::new(hash.clone().into(), GetOptions::network())
            })
            .collect();

        match HDK.with(|hdk| hdk.borrow().get(input)) {
            Ok(records) => {
                let successful_count = records.iter().filter(|r| r.is_some()).count();
                let failed_count = records.len() - successful_count;
                
                successful_fetches += successful_count;
                failed_fetches += failed_count;
                
                warn!("    ✅ Batch #{} results: {} successful, {} failed", i, successful_count, failed_count);
                
                // Log details about failed fetches
                if failed_count > 0 {
                    for (j, record_opt) in records.iter().enumerate() {
                        if record_opt.is_none() {
                            warn!("    ❌ Failed to fetch record #{} in batch #{}", j, i);
                        }
                    }
                }
                
                all_records.extend(records.into_iter().flatten());
            },
            Err(e) => {
                warn!("    ❌ ERROR in batch #{}: Failed to fetch records: {:?}", i, e);
                failed_fetches += batch.len();
                return Err(e);
            }
        }
    }
    
    warn!("🏁 END concurrent_get_records: Successfully fetched {}/{} records ({}% success rate)", 
          successful_fetches, successful_fetches + failed_fetches, 
          if successful_fetches + failed_fetches > 0 {
              (successful_fetches as f32 / (successful_fetches + failed_fetches) as f32 * 100.0).round()
          } else {
              0.0
          });
    
    Ok(all_records)
}