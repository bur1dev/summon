use hdk::prelude::*;
use products_integrity::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct CategorySetup {
    pub main_category: String,
    pub subcategories: Vec<SubcategorySetup>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubcategorySetup {
    pub name: String,
    pub product_types: Vec<String>,
}

#[hdk_extern]
pub fn create_category_structure(categories: Vec<CategorySetup>) -> ExternResult<()> {
    debug!("Creating hierarchical category structure with {} categories", categories.len());

    for category in categories {
        // Create category entry
        let category_path = Path::try_from(format!("categories/{}", category.main_category))?;
        let category_path_hash = category_path.path_entry_hash()?; // Get hash before consuming the path
        category_path.clone().typed(LinkTypes::ProductsByCategory)?.ensure()?;

        for subcategory in category.subcategories {
            // Create subcategory entry and link from category
            let subcategory_path = Path::try_from(format!(
                "categories/{}/subcategories/{}",
                category.main_category, subcategory.name
            ))?;
            
            let subcategory_path_hash = subcategory_path.path_entry_hash()?; // Get hash before consuming
            subcategory_path.clone().typed(LinkTypes::CategoryToSubcategory)?.ensure()?;
            
            // Create link from category to subcategory
            create_link(
                category_path_hash.clone(),
                subcategory_path_hash.clone(),
                LinkTypes::CategoryToSubcategory,
                LinkTag::new(subcategory.name.clone()),
            )?;

            // For each product type in the subcategory
            for product_type in subcategory.product_types {
                // Create product type entry and link from subcategory
                let product_type_path = Path::try_from(format!(
                    "categories/{}/subcategories/{}/types/{}",
                    category.main_category, subcategory.name, product_type
                ))?;
                
                let product_type_path_hash = product_type_path.path_entry_hash()?; // Get hash before consuming
                product_type_path.clone().typed(LinkTypes::ProductTypeToGroup)?.ensure()?;
                
                // Create link from subcategory to product type
                create_link(
                    subcategory_path_hash.clone(),
                    product_type_path_hash.clone(),
                    LinkTypes::SubcategoryToProductType,
                    LinkTag::new(product_type.clone()),
                )?;
            }
        }
    }

    debug!("Finished creating hierarchical category structure");
    Ok(())
}