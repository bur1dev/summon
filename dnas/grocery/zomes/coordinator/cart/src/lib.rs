use hdk::prelude::*;
use cart_integrity::*;

// Input for adding product to cart
#[derive(Serialize, Deserialize, Debug)]
pub struct AddToCartInput {
    pub product_hash: ActionHash,
    pub quantity: u32,
}

// Data structure for cart items
#[derive(Serialize, Deserialize, Debug)]
pub struct CartProduct {
    pub product_hash: ActionHash,
    pub quantity: u32,
    pub timestamp: u64,
}

// Add product to cart
#[hdk_extern]
pub fn add_to_cart(input: AddToCartInput) -> ExternResult<()> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;
    
    // Create quantity tag
    let tag = QuantityTag {
        quantity: input.quantity,
        timestamp: sys_time()?.as_micros() as u64,
    };
    
    // Convert tag to bytes manually
    let tag_bytes = encode(&tag)
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("Failed to serialize tag: {}", e))))?;
    
    // Find existing links for this product
    let links = get_links(
        GetLinksInputBuilder::try_new(
            agent_pub_key.clone(),
            LinkTypes::AgentToProduct
        )?.build()
    )?;
    
    // Delete existing link for this product if it exists
    for link in links {
        if let Some(action_hash) = link.target.into_action_hash() {
            if action_hash == input.product_hash {
                delete_link(link.create_link_hash)?;
            }
        }
    }
    
    // Create new link with quantity
    create_link(
        agent_pub_key,
        input.product_hash,
        LinkTypes::AgentToProduct,
        LinkTag(tag_bytes)
    )?;
    
    Ok(())
}

// Get all products in cart
#[hdk_extern]
pub fn get_cart(_: ()) -> ExternResult<Vec<CartProduct>> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;
    
    // Get all product links
    let links = get_links(
        GetLinksInputBuilder::try_new(
            agent_pub_key,
            LinkTypes::AgentToProduct
        )?.build()
    )?;
    
    // Convert links to cart products
    let mut cart_products = Vec::new();
    
    for link in links {
        if let Some(target_hash) = link.target.into_action_hash() {
            // Default to quantity 1 if tag can't be deserialized
            let mut quantity = 1;
            let mut timestamp = 0;
            
            // Try to deserialize tag
            if !link.tag.0.is_empty() {
                let tag_bytes = link.tag.0;
                match decode::<QuantityTag>(&tag_bytes) {
                    Ok(tag) => {
                        quantity = tag.quantity;
                        timestamp = tag.timestamp;
                    },
                    Err(_) => (), // Use defaults if tag can't be deserialized
                }
            }
            
            cart_products.push(CartProduct {
                product_hash: target_hash,
                quantity,
                timestamp,
            });
        }
    }
    
    Ok(cart_products)
}

#[hdk_extern]
pub fn get_product(action_hash: ActionHash) -> ExternResult<Option<Record>> {
    get(action_hash, GetOptions::default())
}

// Helper functions for tag serialization/deserialization
fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, SerializedBytesError> {
    Ok(serde_json::to_vec(value)
        .map_err(|e| SerializedBytesError::Deserialize(e.to_string()))?)
}

fn decode<T: for<'a> Deserialize<'a>>(bytes: &[u8]) -> Result<T, SerializedBytesError> {
    Ok(serde_json::from_slice(bytes)
        .map_err(|e| SerializedBytesError::Deserialize(e.to_string()))?)
}