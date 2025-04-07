# category_constraints.py
# Maps Kroger categories to custom taxonomy categories
# Used to constrain FAISS search to relevant indices

# Key (left) is Kroger category name (lowercase)
# Value (right) is list of our custom taxonomy categories that could match
KROGER_TO_CUSTOM_CATEGORIES = {
    "produce": ["Produce"],
    "snacks": ["Snacks & Candy", "Prepared Foods", "Breakfast"],
    "canned & packaged": [
        "Canned Goods & Soups",
        "Dry Goods & Pasta",
        "Condiments & Sauces",
        "Prepared Foods",
    ],
    "meat & seafood": [
        "Meat & Seafood",
        "Canned Goods & Soups",
        "Prepared Foods",
        "Frozen",
    ],
    "frozen": ["Frozen"],
    "baking goods": [
        "Baking Essentials",
        "Oils, Vinegars, & Spices",
        "Snacks & Candy",
        "Beverages",
    ],
    "beverages": ["Beverages", "Hard Beverages"],
    "dairy": ["Dairy & Eggs", "Beverages", "Baking Essentials", "Snacks & Candy"],
    "candy": ["Snacks & Candy"],
    "bakery": ["Bakery", "Breakfast", "Snacks & Candy"],
    "baby": ["Baby", "Snacks & Candy", "Personal Care", "Beverages"],
    "deli": [
        "Deli",
        "Prepared Foods",
        "Bakery",
        "Snacks & Candy",
        "Condiments & Sauces",
    ],
    "cleaning products": ["Household"],
    "breakfast": ["Breakfast", "Bakery", "Frozen", "Prepared Foods", "Beverages"],
    "adult beverage": ["Wine", "Beer", "Liquor", "Hard Beverages", "Beverages"],
    "pet care": ["Pets"],
    "personal care": ["Personal Care"],
    "home decor": ["Household", "Miscellaneous"],
    "health": ["Health Care", "Snacks & Candy"],
    "kitchen": ["Kitchen Supplies"],
    "beauty": ["Personal Care"],
    "garden & patio": ["Miscellaneous", "Household"],
    "electronics": ["Miscellaneous"],
    "condiment & sauces": [
        "Condiments & Sauces",
        "Oils, Vinegars, & Spices",
        "Snacks & Candy",
    ],
    "floral": ["Floral"],
    "pasta, sauces, grain": [
        "Dry Goods & Pasta",
        "Condiments & Sauces",
        "Canned Goods & Soups",
    ],
    "party": ["Party & Gift Supplies"],
    "office, school, & crafts": ["Office & Craft"],
    "apparel": ["Miscellaneous"],
    "entertainment": ["Miscellaneous"],
    "automotive": ["Miscellaneous"],
    "sporting goods": ["Miscellaneous"],
    "hardware": ["Miscellaneous"],
    "bed & bath": ["Miscellaneous"],
    "international": [
        "Oils, Vinegars, & Spices",
        "Condiments & Sauces",
        "Produce",
        "Dry Goods & Pasta",
    ],
    "beauty": ["Personal Care"],
}

BROAD_KROGER_CATEGORIES = []


def get_constrained_categories(kroger_categories):
    """
    Convert Kroger categories to custom taxonomy categories for search constraints.

    Args:
        kroger_categories (list): Kroger category names

    Returns:
        list: Custom taxonomy categories for constraint
    """
    constrained_categories = []

    for category in kroger_categories:
        category_lower = category.lower()

        # Skip overly broad categories
        if category_lower in BROAD_KROGER_CATEGORIES:
            continue

        # Add mapped categories if available
        if category_lower in KROGER_TO_CUSTOM_CATEGORIES:
            constrained_categories.extend(KROGER_TO_CUSTOM_CATEGORIES[category_lower])

    return list(set(constrained_categories))  # Remove duplicates
