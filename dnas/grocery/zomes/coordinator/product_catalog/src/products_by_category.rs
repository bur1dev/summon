use hdk::prelude::*;
use products_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct CategorizedProducts {
    pub category: String,
    pub subcategory: Option<String>,
    pub product_type: Option<String>,
    pub products: Vec<Record>,
    pub total: usize,
    pub has_more: bool
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GetProductsParams {
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub subcategory: Option<String>,
    #[serde(default)]
    pub product_type: Option<String>,
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_limit")]
    pub limit: usize
}

fn default_limit() -> usize {
    20
}

fn concurrent_get_records(hashes: Vec<ActionHash>) -> ExternResult<Vec<Record>> {
   // Process in batches of 50 to prevent timeouts
   const BATCH_SIZE: usize = 100;
   let mut all_records = Vec::new();
   
   for batch in hashes.chunks(BATCH_SIZE) {
       let input: Vec<_> = batch.iter()
           .map(|hash| GetInput::new(hash.clone().into(), GetOptions::default()))
           .collect();
           
       let records: Vec<Option<Record>> = HDK.with(|hdk| hdk.borrow().get(input))?;
       all_records.extend(records.into_iter().flatten());
   }
   
   Ok(all_records)
}

#[hdk_extern]
pub fn get_products_by_category(params: GetProductsParams) -> ExternResult<CategorizedProducts> {
   let base_path = match (&params.subcategory, &params.product_type) {
       (Some(subcategory), Some(product_type)) => format!(
           "categories/{}/subcategories/{}/types/{}/chunk_1",
           params.category, subcategory, product_type
       ),
       (Some(subcategory), None) => format!(
           "categories/{}/subcategories/{}/chunk_1",
           params.category, subcategory
       ),
       (None, None) => format!("categories/{}/chunk_1", params.category),
       (None, Some(_)) => return Err(wasm_error!(WasmErrorInner::Guest(
           "Cannot have product type without subcategory".into()
       )))
   };

   let chunk_path = Path::try_from(base_path)?;
   
   // Fetch all links once and use for both counting and pagination
   let all_links = get_links(
       GetLinksInputBuilder::try_new(
           chunk_path.path_entry_hash()?,
           LinkTypes::ChunkToProduct
       )?.build()
   )?;
   
   let total_links = all_links.len();
   
   // Apply pagination on the links in memory
   let links = all_links.into_iter()
       .skip(params.offset)
       .take(params.limit)
       .collect::<Vec<_>>();
   
   let target_hashes: Vec<_> = links.into_iter()
       .map(|link| link.target.into_action_hash().unwrap())
       .collect();

   let products = concurrent_get_records(target_hashes)?;

   Ok(CategorizedProducts {
       category: params.category,
       subcategory: params.subcategory,
       product_type: params.product_type,
       products,
       total: total_links,
       has_more: (params.offset + params.limit) < total_links
   })
}

#[hdk_extern]
pub fn get_all_category_products(category: String) -> ExternResult<CategorizedProducts> {
   let chunk_path = Path::try_from(format!("categories/{}/chunk_1", category))?;
   let path_hash = chunk_path.path_entry_hash()?;

   let links = get_links(GetLinksInputBuilder::try_new(
       path_hash,
       LinkTypes::ChunkToProduct
   )?.build())?;

   let all_hashes: Vec<_> = links.into_iter()
       .map(|link| link.target.into_action_hash().unwrap())
       .collect();

   let products = concurrent_get_records(all_hashes)?;
   let total = products.len();

   Ok(CategorizedProducts {
       category,
       subcategory: None,
       product_type: None,
       products,
       total,
       has_more: false
   })
}