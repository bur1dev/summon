use cart_integrity::*;
use hdk::prelude::*;

use crate::AddToCartInput;
use crate::CheckedOutCartWithHash;
use crate::CheckoutCartInput;

// Implementation of add_to_cart - changing from pub(crate) to pub
pub fn add_to_cart_impl(input: AddToCartInput) -> ExternResult<()> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;

    // If quantity is 0, just delete the link and return
    if input.quantity == 0 {
        // Find and delete existing links for this product
        let links = get_links(
            GetLinksInputBuilder::try_new(agent_pub_key.clone(), LinkTypes::AgentToProduct)?
                .build(),
        )?;

        for link in links {
            if let Some(action_hash) = link.target.into_action_hash() {
                if action_hash == input.product_hash {
                    delete_link(link.create_link_hash)?;
                }
            }
        }

        return Ok(());
    }

    // Create quantity tag
    let tag = QuantityTag {
        quantity: input.quantity,
        timestamp: sys_time()?.as_micros() as u64,
        status: Some("active".to_string()),
    };

    // Convert tag to bytes manually
    let tag_bytes = encode(&tag).map_err(|e| {
        wasm_error!(WasmErrorInner::Guest(format!(
            "Failed to serialize tag: {}",
            e
        )))
    })?;

    // Find existing links for this product
    let links = get_links(
        GetLinksInputBuilder::try_new(agent_pub_key.clone(), LinkTypes::AgentToProduct)?.build(),
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
        LinkTag(tag_bytes),
    )?;

    Ok(())
}

// Implementation of get_cart
pub(crate) fn get_cart_impl() -> ExternResult<Vec<CartProduct>> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;

    // Get all product links
    let links = get_links(
        GetLinksInputBuilder::try_new(agent_pub_key, LinkTypes::AgentToProduct)?.build(),
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
                        // Only include active items with quantity > 0
                        if (tag.status.is_none() || tag.status.as_ref().unwrap() == "active")
                            && tag.quantity > 0
                        {
                            quantity = tag.quantity;
                            timestamp = tag.timestamp;
                        } else {
                            continue; // Skip checked out items or items with quantity 0
                        }
                    }
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

// Implementation of checkout_cart - now with delivery details
pub(crate) fn checkout_cart_impl(input: CheckoutCartInput) -> ExternResult<ActionHash> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;
    let current_time = sys_time()?.as_micros() as u64;

    // Get all active cart products
    let cart_products = get_cart_impl()?;

    // If cart is empty, return error
    if cart_products.is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Cart is empty".to_string()
        )));
    }

    // Calculate total (placeholder - will need to get product prices)
    // In a real implementation, you'd need to fetch product details to calculate this
    let total = 0.0;

    // Create a checked out cart entry with delivery details
    let checked_out_cart = CheckedOutCart {
        id: current_time.to_string(), // Use timestamp as ID
        products: cart_products.clone(),
        total,
        created_at: current_time,
        status: "processing".to_string(),
        // New delivery fields
        address_hash: input.address_hash,
        delivery_instructions: input.delivery_instructions,
        delivery_time: input.delivery_time,
    };

    // Create the entry
    let cart_hash = create_entry(EntryTypes::CheckedOutCart(checked_out_cart.clone()))?;

    // Link the agent to this cart
    create_link(
        agent_pub_key.clone(),
        cart_hash.clone(),
        LinkTypes::AgentToCheckedOutCart,
        LinkTag::new(current_time.to_string()),
    )?;

    // Update all cart items to checked_out status
    let links = get_links(
        GetLinksInputBuilder::try_new(agent_pub_key.clone(), LinkTypes::AgentToProduct)?.build(),
    )?;

    for link in links {
        if let Some(target_hash) = link.target.into_action_hash() {
            // Find the product in our cart
            if cart_products.iter().any(|p| p.product_hash == target_hash) {
                // Delete the existing link
                delete_link(link.create_link_hash)?;

                // Find the product details
                let product = cart_products
                    .iter()
                    .find(|p| p.product_hash == target_hash)
                    .unwrap();

                // Create a new link with checked_out status
                let tag = QuantityTag {
                    quantity: product.quantity,
                    timestamp: current_time,
                    status: Some("checked_out".to_string()),
                };

                let tag_bytes = encode(&tag).map_err(|e| {
                    wasm_error!(WasmErrorInner::Guest(format!(
                        "Failed to serialize tag: {}",
                        e
                    )))
                })?;

                create_link(
                    agent_pub_key.clone(),
                    target_hash,
                    LinkTypes::AgentToProduct,
                    LinkTag(tag_bytes),
                )?;
            }
        }
    }

    Ok(cart_hash)
}

// Implementation of get_checked_out_carts
pub(crate) fn get_checked_out_carts_impl() -> ExternResult<Vec<CheckedOutCartWithHash>> {
    let agent_pub_key = agent_info()?.agent_initial_pubkey;

    // Get all links to checked out carts
    let links = get_links(
        GetLinksInputBuilder::try_new(agent_pub_key, LinkTypes::AgentToCheckedOutCart)?.build(),
    )?;

    let mut checked_out_carts = Vec::new();

    for link in links {
        if let Some(cart_hash) = link.target.into_action_hash() {
            // Get the cart entry
            match get_checked_out_cart_impl(cart_hash.clone())? {
                Some(cart) => {
                    checked_out_carts.push(CheckedOutCartWithHash {
                        cart_hash: cart_hash.clone(),
                        cart,
                    });
                }
                None => (), // Skip if cart not found
            }
        }
    }

    // Filter out carts with "returned" status
    warn!(
        "Before filter - Checked out carts count: {}, statuses: {:?}",
        checked_out_carts.len(),
        checked_out_carts
            .iter()
            .map(|c| &c.cart.status)
            .collect::<Vec<_>>()
    );

    // Filter out carts with "returned" status
    checked_out_carts = checked_out_carts
        .into_iter()
        .filter(|cart| cart.cart.status != "returned")
        .collect();

    // After filtering
    warn!(
        "After filter - Checked out carts count: {}, statuses: {:?}",
        checked_out_carts.len(),
        checked_out_carts
            .iter()
            .map(|c| &c.cart.status)
            .collect::<Vec<_>>()
    );

    // Sort by creation time (newest first)
    checked_out_carts.sort_by(|a, b| b.cart.created_at.cmp(&a.cart.created_at));

    Ok(checked_out_carts)
}

// Implementation of get_checked_out_cart
pub(crate) fn get_checked_out_cart_impl(
    action_hash: ActionHash,
) -> ExternResult<Option<CheckedOutCart>> {
    match get(action_hash.clone(), GetOptions::default())? {
        Some(record) => {
            let entry = record
                .entry()
                .as_option()
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "Expected entry".to_string()
                )))?;

            match entry {
                Entry::App(_) => {
                    // Convert SerializedBytesError to WasmError manually
                    let checked_out_cart: CheckedOutCart = record
                        .entry()
                        .to_app_option()
                        .map_err(|e| {
                            wasm_error!(WasmErrorInner::Guest(format!(
                                "Failed to deserialize: {}",
                                e
                            )))
                        })?
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Expected app entry".to_string()
                        )))?;

                    Ok(Some(checked_out_cart))
                }
                _ => Err(wasm_error!(WasmErrorInner::Guest(
                    "Expected app entry".to_string()
                ))),
            }
        }
        None => Ok(None),
    }
}

// Implementation of return_to_shopping
pub(crate) fn return_to_shopping_impl(cart_hash: ActionHash) -> ExternResult<()> {
    // Log the cart hash we're working with
    warn!("Attempting to return cart to shopping: {:?}", cart_hash);

    // Get the cart
    let cart = match get_checked_out_cart_impl(cart_hash.clone())? {
        Some(cart) => {
            warn!("Found cart with status: {}", cart.status);
            cart
        }
        None => {
            warn!("Cart not found with hash: {:?}", cart_hash);
            return Err(wasm_error!(WasmErrorInner::Guest(
                "Cart not found".to_string()
            )));
        }
    };

    // Update cart status
    let mut updated_cart = cart.clone();
    updated_cart.status = "returned".to_string();

    // Delete the original entry instead of updating it
    match delete_entry(cart_hash.clone()) {
        Ok(_) => {
            warn!("Successfully deleted cart with hash: {:?}", cart_hash);

            // Optionally create a history entry with returned status
            match create_entry(EntryTypes::CheckedOutCart(updated_cart.clone())) {
                Ok(new_hash) => {
                    warn!(
                        "Created new history entry with status 'returned': {:?}",
                        new_hash
                    );

                    // Link to the new history entry if needed
                    // create_link(agent_pub_key, new_hash, LinkTypes::AgentToCartHistory, LinkTag::new(""))?;
                }
                Err(e) => {
                    warn!("Failed to create history entry: {:?}", e);
                    // Continue anyway, deleting the original is more important
                }
            }
        }
        Err(e) => {
            warn!("Failed to delete cart entry: {:?}", e);
            return Err(e);
        }
    };

    // For each product in the cart, add it back to the active cart
    warn!(
        "Adding {} products back to active cart",
        cart.products.len()
    );
    for product in cart.products {
        // Add to cart (this will handle creating/updating links)
        add_to_cart_impl(AddToCartInput {
            product_hash: product.product_hash,
            quantity: product.quantity,
        })?;
    }

    warn!("Successfully returned cart to shopping");
    Ok(())
}

// Helper functions for tag serialization/deserialization
pub(crate) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, SerializedBytesError> {
    Ok(serde_json::to_vec(value).map_err(|e| SerializedBytesError::Deserialize(e.to_string()))?)
}

pub(crate) fn decode<T: for<'a> Deserialize<'a>>(bytes: &[u8]) -> Result<T, SerializedBytesError> {
    Ok(serde_json::from_slice(bytes)
        .map_err(|e| SerializedBytesError::Deserialize(e.to_string()))?)
}
