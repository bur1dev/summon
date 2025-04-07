# kroger_mappings.py
# Maps Kroger's grocery categories to custom taxonomy

kroger_mapping = {
    "produce": {"mapping_type": "DIRECT", "categories": ["Produce"]},
    "beverages": {
        "mapping_type": "MULTI",
        "categories": ["Beverages", "Hard Beverages"],
    },
    "snacks": {
        "mapping_type": "PARTIAL",
        "mappings": [{"category": "Snacks & Candy", "subcategory": None}],
    },
    "candy": {
        "mapping_type": "PARTIAL",
        "mappings": [
            {"category": "Snacks & Candy", "subcategory": "Chocolate & Candy"}
        ],
    },
    "meat & seafood": {
        "mapping_type": "MULTI",
        "categories": [
            "Meat & Seafood",
            "Canned Goods & Soups",
            "Prepared Foods",
            "Frozen",
        ],
    },
    "frozen": {"mapping_type": "DIRECT", "categories": ["Frozen"]},
    "dairy": {
        "mapping_type": "MULTI",
        "categories": [
            "Dairy & Eggs",
            "Beverages",
            "Baking Essentials",
            "Snacks & Candy",
        ],
    },
    "deli": {
        "mapping_type": "MULTI",
        "categories": ["Prepared Foods", "Snacks & Candy", "Condiments & Sauces"],
    },
    "floral": {"mapping_type": "DIRECT", "categories": ["Floral"]},
    "cleaning products": {"mapping_type": "DIRECT", "categories": ["Household"]},
    "bakery": {
        "mapping_type": "MULTI",
        "categories": ["Bakery", "Breakfast", "Snacks & Candy"],
    },
    "canned & packaged": {
        "mapping_type": "MULTI",
        "categories": [
            "Canned Goods & Soups",
            "Dry Goods & Pasta",
            "Condiments & Sauces",
            "Prepared Foods",
        ],
    },
    "pet care": {
        "mapping_type": "PARTIAL",
        "mappings": [{"category": "Pets", "subcategory": None}],
    },
    "breakfast": {
        "mapping_type": "MULTI",
        "categories": ["Breakfast", "Frozen", "Prepared Foods", "Bakery", "Beverages"],
    },
    "condiment & sauces": {
        "mapping_type": "MULTI",
        "categories": [
            "Condiments & Sauces",
            "Oils, Vinegars, & Spices",
            "Snacks & Candy",
        ],
    },
    "pasta, sauces, grain": {
        "mapping_type": "DIRECT",
        "categories": ["Dry Goods & Pasta"],
    },
    "personal care": {"mapping_type": "DIRECT", "categories": ["Personal Care"]},
    "health": {
        "mapping_type": "PARTIAL",
        "mappings": [
            {"category": "Health Care", "subcategory": "Cold, Flu & Allergy"},
            {"category": "Health Care", "subcategory": None},
            {"category": "Snacks & Candy", "subcategory": None},
        ],
    },
    "baking goods": {
        "mapping_type": "MULTI",
        "categories": [
            "Baking Essentials",
            "Oils, Vinegars, & Spices",
            "Snacks & Candy",
            "Beverages",
        ],
    },
    "kitchen": {"mapping_type": "DIRECT", "categories": ["Kitchen Supplies"]},
    "party": {
        "mapping_type": "PARTIAL",
        "mappings": [{"category": "Party & Gift Supplies", "subcategory": None}],
    },
    "office, school, & crafts": {
        "mapping_type": "DIRECT",
        "categories": ["Office & Craft"],
    },
    "baby": {
        "mapping_type": "PARTIAL",
        "mappings": [
            {"category": "Baby", "subcategory": None},
            {"category": "Snacks & Candy", "subcategory": "Dried Fruit & Fruit Snacks"},
            {"category": "Personal Care", "subcategory": "Body Care"},
            {"category": "Beverages", "subcategory": None},
        ],
    },
    "international": {
        "mapping_type": "PARTIAL",
        "mappings": [
            {"category": "Oils, Vinegars, & Spices", "subcategory": None},
            {"category": "Condiments & Sauces", "subcategory": None},
            {"category": "Produce", "subcategory": None},
        ],
    },
    "adult beverage": {
        "mapping_type": "DIRECT",
        "categories": ["Wine", "Beer", "Liquor", "Hard Beverages", "Beverages"],
    },
    "home decor": {
        "mapping_type": "PARTIAL",
        "mappings": [
            {"category": "Household", "subcategory": "Candles & Air Fresheners"},
            {"category": "Miscellaneous", "subcategory": "Home & Garden"},
        ],
    },
    "automotive": {
        "mapping_type": "PARTIAL",
        "mappings": [{"category": "Miscellaneous", "subcategory": "Auto"}],
    },
    "beauty": {"mapping_type": "DIRECT", "categories": ["Personal Care"]},
}


def get_mapped_categories(kroger_categories):
    """
    Convert a list of Kroger category names to mapped custom categories

    Args:
        kroger_categories (list): List of Kroger category names

    Returns:
        dict: Dictionary with 'categories' and 'category_subcategory_pairs' keys
              containing the mapped values
    """
    result = {"categories": set(), "category_subcategory_pairs": set()}

    for kroger_category in kroger_categories:
        kroger_category = kroger_category.lower()

        if kroger_category in kroger_mapping:
            mapping = kroger_mapping[kroger_category]

            if mapping["mapping_type"] == "DIRECT":
                for category in mapping["categories"]:
                    result["categories"].add(category)

            elif mapping["mapping_type"] == "PARTIAL":
                for item in mapping["mappings"]:
                    if item["subcategory"] is None:
                        result["categories"].add(item["category"])
                    else:
                        result["category_subcategory_pairs"].add(
                            (item["category"], item["subcategory"])
                        )

    # Convert sets to lists for easier use
    result["categories"] = list(result["categories"])
    result["category_subcategory_pairs"] = list(result["category_subcategory_pairs"])

    return result
