use cart_integrity::*;
use hdk::prelude::*;

mod address;
mod cart;

// Input for adding product to cart
#[derive(Serialize, Deserialize, Debug)]
pub struct AddToCartInput {
    pub product_hash: ActionHash,
    pub quantity: u32,
}

// Return type for get_checked_out_carts
#[derive(Serialize, Deserialize, Debug)]
pub struct CheckedOutCartWithHash {
    pub cart_hash: ActionHash,
    pub cart: CheckedOutCart,
}

// Extended checkout input with delivery details
#[derive(Serialize, Deserialize, Debug)]
pub struct CheckoutCartInput {
    pub address_hash: Option<ActionHash>,
    pub delivery_instructions: Option<String>,
    pub delivery_time: Option<DeliveryTimeSlot>,
}

// Add product to cart
#[hdk_extern]
pub fn add_to_cart(input: AddToCartInput) -> ExternResult<()> {
    cart::add_to_cart_impl(input)
}

// Get all products in cart
#[hdk_extern]
pub fn get_cart(_: ()) -> ExternResult<Vec<CartProduct>> {
    cart::get_cart_impl()
}

// Check out all items in the cart with delivery details
#[hdk_extern]
pub fn checkout_cart(input: CheckoutCartInput) -> ExternResult<ActionHash> {
    cart::checkout_cart_impl(input)
}

// Get all checked out carts
#[hdk_extern]
pub fn get_checked_out_carts(_: ()) -> ExternResult<Vec<CheckedOutCartWithHash>> {
    cart::get_checked_out_carts_impl()
}

// Helper to get a single checked out cart
#[hdk_extern]
pub fn get_checked_out_cart(action_hash: ActionHash) -> ExternResult<Option<CheckedOutCart>> {
    cart::get_checked_out_cart_impl(action_hash)
}

// Return a checked out cart to shopping
#[hdk_extern]
pub fn return_to_shopping(cart_hash: ActionHash) -> ExternResult<()> {
    cart::return_to_shopping_impl(cart_hash)
}

#[hdk_extern]
pub fn get_product(action_hash: ActionHash) -> ExternResult<Option<Record>> {
    get(action_hash, GetOptions::default())
}

// Address-related functions
#[hdk_extern]
pub fn create_address(address: Address) -> ExternResult<ActionHash> {
    address::create_address_impl(address)
}

#[hdk_extern]
pub fn get_addresses(_: ()) -> ExternResult<Vec<(ActionHash, Address)>> {
    address::get_addresses_impl()
}

#[hdk_extern]
pub fn get_address(action_hash: ActionHash) -> ExternResult<Option<Address>> {
    address::get_address_impl(action_hash)
}

#[hdk_extern]
pub fn update_address(input: (ActionHash, Address)) -> ExternResult<ActionHash> {
    address::update_address_impl(input.0, input.1)
}

#[hdk_extern]
pub fn delete_address(action_hash: ActionHash) -> ExternResult<ActionHash> {
    address::delete_address_impl(action_hash)
}
