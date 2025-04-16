use hdk::prelude::*;
use products_integrity::*;

pub const BATCH_SIZE: usize = 25;

pub fn get_paths(input: &CreateProductInput) -> ExternResult<Vec<Path>> {
    debug!(
        "Creating paths for product: '{}' in category: '{}'",
        input.product.name, input.main_category
    );
    debug!(
        "Product details: cat='{}', subcat='{:?}', type='{:?}'",
        input.main_category, input.subcategory, input.product_type
    );

    let mut paths = Vec::new();

    // Main category chunk
    let main_path = format!("categories/{}/chunk_1", input.main_category);
    debug!("Adding main category path: {}", main_path);
    paths.push(Path::try_from(main_path)?);

    if let Some(subcategory) = &input.subcategory {
        let sub_path = format!(
            "categories/{}/subcategories/{}/chunk_1",
            input.main_category, subcategory
        );
        debug!("Adding subcategory path: {}", sub_path);
        paths.push(Path::try_from(sub_path)?);

        if let Some(product_type) = &input.product_type {
            let type_path = format!(
                "categories/{}/subcategories/{}/types/{}/chunk_1",
                input.main_category, subcategory, product_type
            );
            debug!("Adding product type path: {}", type_path);
            paths.push(Path::try_from(type_path)?);
        }
    }

    // Log dual categorization status for ALL products (whether it exists or not)
    debug!(
        "Checking dual categorization for product: '{}', dual_cat={:?}",
        input.product.name, input.dual_categorization
    );

    // Add dual categorization paths if present
    if let Some(dual) = &input.dual_categorization {
        debug!("Found dual categorization for product '{}': '{} → {:?} → {:?}' mapped to '{} → {:?} → {:?}'", 
               input.product.name,
               input.main_category, 
               input.subcategory, 
               input.product_type,
               dual.main_category,
               dual.subcategory,
               dual.product_type);

        // Main category for dual categorization
        let dual_main_path = format!("categories/{}/chunk_1", dual.main_category);
        debug!("Adding dual main category path: {}", dual_main_path);
        paths.push(Path::try_from(dual_main_path)?);

        if let Some(subcategory) = &dual.subcategory {
            let dual_sub_path = format!(
                "categories/{}/subcategories/{}/chunk_1",
                dual.main_category, subcategory
            );
            debug!("Adding dual subcategory path: {}", dual_sub_path);
            paths.push(Path::try_from(dual_sub_path)?);

            if let Some(product_type) = &dual.product_type {
                let dual_type_path = format!(
                    "categories/{}/subcategories/{}/types/{}/chunk_1",
                    dual.main_category, subcategory, product_type
                );
                debug!("Adding dual product type path: {}", dual_type_path);
                paths.push(Path::try_from(dual_type_path)?);
            }
        }
    } else {
        debug!(
            "NO dual categorization found for product: '{}' ({} → {:?} → {:?})",
            input.product.name, input.main_category, input.subcategory, input.product_type
        );
    }

    debug!(
        "Created {} paths for product '{}'",
        paths.len(),
        input.product.name
    );
    Ok(paths)
}

pub fn create_links_batch(product_hash: &ActionHash, paths: Vec<Path>) -> ExternResult<()> {
    debug!(
        "Creating {} links for product hash {}",
        paths.len(),
        product_hash
    );

    let path_hashes: Vec<EntryHash> = paths
        .iter()
        .map(|p| p.path_entry_hash())
        .collect::<ExternResult<Vec<_>>>()?;

    for (i, path_hash) in path_hashes.iter().enumerate() {
        let existing_links = get_links(
            GetLinksInputBuilder::try_new(path_hash.clone(), LinkTypes::ChunkToProduct)?.build(),
        )?;
        let index = existing_links.len();

        debug!(
            "Creating link #{} from path {} to product {}",
            i + 1,
            path_hash,
            product_hash
        );
        create_link(
            path_hash.clone(),
            product_hash.clone(),
            LinkTypes::ChunkToProduct,
            LinkTag::new(index.to_le_bytes()),
        )?;
    }
    Ok(())
}

#[hdk_extern]
pub fn create_product_batch(products: Vec<CreateProductInput>) -> ExternResult<Vec<Record>> {
    debug!("Starting batch creation of {} products", products.len());

    // Log first product details
    if let Some(first) = products.first() {
        debug!(
            "First product: '{}', cat='{}', subcat='{:?}', type='{:?}', dual={:?}",
            first.product.name,
            first.main_category,
            first.subcategory,
            first.product_type,
            first.dual_categorization
        );
    }

    // Log counts of products with dual categorization
    let dual_count = products
        .iter()
        .filter(|p| p.dual_categorization.is_some())
        .count();
    debug!(
        "{} out of {} products have dual categorization",
        dual_count,
        products.len()
    );

    let mut records = Vec::new();

    // Process in batches to avoid timeouts
    for (batch_index, product_batch) in products.chunks(BATCH_SIZE).enumerate() {
        debug!(
            "Processing batch {} with {} products",
            batch_index + 1,
            product_batch.len()
        );

        // Log each product's key categorization details
        for (i, input) in product_batch.iter().enumerate() {
            debug!(
                "Batch product #{}: '{}', cat='{}', subcat='{:?}', type='{:?}', has_dual={}",
                i + 1,
                input.product.name,
                input.main_category,
                input.subcategory,
                input.product_type,
                input.dual_categorization.is_some()
            );
        }

        let entry_hashes: Vec<_> = product_batch
            .iter()
            .map(|input| create_entry(&EntryTypes::Product(input.product.clone())))
            .collect::<ExternResult<Vec<_>>>()?;

        // Create links in parallel for each product
        for (hash, input) in entry_hashes.iter().zip(product_batch.iter()) {
            debug!(
                "Creating paths for product '{}' ({})",
                input.product.name, hash
            );
            let paths = get_paths(input)?;
            create_links_batch(hash, paths)?;
        }

        let batch_records = entry_hashes
            .iter()
            .map(|hash| get(hash.clone(), GetOptions::default()))
            .collect::<ExternResult<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();

        debug!(
            "Retrieved {} records for batch {}",
            batch_records.len(),
            batch_index + 1
        );
        records.extend(batch_records);
    }

    debug!("Completed creation of {} products", records.len());
    Ok(records)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RecategorizeInput {
    pub product_hash: ActionHash,
    pub new_category: String,
    pub new_subcategory: Option<String>,
    pub new_product_type: Option<String>,
}

#[hdk_extern]
pub fn recategorize_product(input: RecategorizeInput) -> ExternResult<()> {
    debug!(
        "RECAT: Starting recategorization for product: {:?}",
        &input.product_hash
    );

    // Get current product
    let product_record = get(input.product_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!("Product not found"))?;

    // Extract product details to get current categories
    let product = Product::try_from(product_record)?;

    // Create paths for current categories to find links
    let current_paths = Path::try_from(format!("categories/{}/chunk_1", product.category))?;
    let mut all_paths = vec![current_paths];

    if let Some(subcategory) = &product.subcategory {
        let sub_path = Path::try_from(format!(
            "categories/{}/subcategories/{}/chunk_1",
            product.category, subcategory
        ))?;
        all_paths.push(sub_path);

        if let Some(product_type) = &product.product_type {
            let type_path = Path::try_from(format!(
                "categories/{}/subcategories/{}/types/{}/chunk_1",
                product.category, subcategory, product_type
            ))?;
            all_paths.push(type_path);
        }
    }

    // Find and delete old links
    let mut old_links = Vec::new();
    for path in all_paths {
        let links = get_links(
            GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::ChunkToProduct)?
                .build(),
        )?;

        for link in links {
            if let Some(target_hash) = link.target.into_action_hash() {
                if target_hash == input.product_hash {
                    old_links.push(link.create_link_hash);
                }
            }
        }
    }

    // Delete links and create new ones
    for link_hash in old_links {
        delete_link(link_hash)?;
    }

    // Create new category paths and links
    let new_category_input = CreateProductInput {
        product: Product {
            name: String::new(),
            price: 0.0,
            size: String::new(),
            stocks_status: String::new(),
            category: String::new(),
            subcategory: None,
            product_type: None,
            image_url: None,
        },
        main_category: input.new_category,
        subcategory: input.new_subcategory,
        product_type: input.new_product_type,
        dual_categorization: None,
    };

    let new_paths = get_paths(&new_category_input)?;
    create_links_batch(&input.product_hash, new_paths)?;

    Ok(())
}

#[hdk_extern]
pub fn get_product(action_hash: ActionHash) -> ExternResult<Option<Record>> {
    get(action_hash, GetOptions::default())
}
