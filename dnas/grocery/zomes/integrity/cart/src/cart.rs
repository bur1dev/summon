use hdi::prelude::*;
use crate::DeliveryTimeSlot;

// For storing checked out carts
#[hdk_entry_helper]
#[derive(Clone)]
pub struct CheckedOutCart {
    pub id: String,
    pub products: Vec<CartProduct>,
    pub total: f64,
    pub created_at: u64,
    pub status: String, // "processing", "completed", "returned"
    // New fields for delivery
    pub address_hash: Option<ActionHash>,
    pub delivery_instructions: Option<String>,
    pub delivery_time: Option<DeliveryTimeSlot>,
}

#[hdk_entry_helper]
#[derive(Clone)]
pub struct CartProduct {
    pub group_hash: ActionHash,    // Reference to ProductGroup
    pub product_index: u32,        // Index of product within the group
    pub quantity: f64,             // Changed to f64 to support weight-based products
    pub timestamp: u64,
    pub note: Option<String>,      // Customer note for shopper
}

// Tag structure for product links
#[derive(Serialize, Deserialize, Debug)]
pub struct QuantityTag {
    pub quantity: u32,
    pub timestamp: u64,
    pub status: Option<String>, // "active" or "checked_out"
}

// New structure for the private cart (stored as private entry)
#[hdk_entry_helper]
#[derive(Clone)]
pub struct PrivateCart {
    pub items: Vec<CartProduct>,
    pub last_updated: u64,
}

// New structure for product preferences
#[hdk_entry_helper]
#[derive(Clone)]
pub struct ProductPreference {
    pub group_hash: ActionHash,    // Reference to ProductGroup
    pub product_index: u32,        // Index of product within the group
    pub note: String,              // Customer note/preference
    pub timestamp: u64,            // When this preference was last updated
    pub is_default: bool           // If true, apply automatically
}