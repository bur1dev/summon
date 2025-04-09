use hdi::prelude::*;
use crate::DeliveryTimeSlot; // Add this import

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

// Data structure for cart items
#[hdk_entry_helper]
#[derive(Clone)]
pub struct CartProduct {
    pub product_hash: ActionHash,
    pub quantity: u32,
    pub timestamp: u64,
}

// Tag structure for product links
#[derive(Serialize, Deserialize, Debug)]
pub struct QuantityTag {
    pub quantity: u32,
    pub timestamp: u64,
    pub status: Option<String>, // "active" or "checked_out"
}