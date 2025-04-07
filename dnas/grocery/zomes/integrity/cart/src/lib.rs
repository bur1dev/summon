use hdi::prelude::*;

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(visibility = "private")]
    CartNote(CartNote),
}

#[hdk_link_types]
pub enum LinkTypes {
    AgentToProduct,
    AgentToNote,
}

// For storing notes in the cart
#[hdk_entry_helper]
pub struct CartNote {
    pub text: String,
    pub color: Option<String>,
    pub created_at: u64,
}

// Tag structure for product links
#[derive(Serialize, Deserialize, Debug)]
pub struct QuantityTag {
    pub quantity: u32,
    pub timestamp: u64,
}

// Validation callback
#[hdk_extern]
pub fn validate(_op: Op) -> ExternResult<ValidateCallbackResult> {
    // Simple validation for now - could be expanded later
    Ok(ValidateCallbackResult::Valid)
}