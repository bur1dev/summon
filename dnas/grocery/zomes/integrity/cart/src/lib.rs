use hdi::prelude::*;

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(visibility = "private")]
    CartNote(CartNote),
    #[entry_type(visibility = "private")]
    CheckedOutCart(CheckedOutCart),
}

#[hdk_link_types]
pub enum LinkTypes {
    AgentToProduct,
    AgentToNote,
    AgentToCheckedOutCart,
}

// For storing notes in the cart
#[hdk_entry_helper]
#[derive(Clone)]
pub struct CartNote {
    pub text: String,
    pub color: Option<String>,
    pub created_at: u64,
}

// For storing checked out carts
#[hdk_entry_helper]
#[derive(Clone)]
pub struct CheckedOutCart {
    pub id: String,
    pub products: Vec<CartProduct>,
    pub total: f64,
    pub created_at: u64,
    pub status: String, // "processing", "completed", "returned"
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