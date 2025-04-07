DUAL_CATEGORY_MAPPINGS = {
    # Beverages mappings
    "Beverages": {
        "Milk": {
            "product_type_to_subcategory": {
                "Plant-Based Milk": "Plant-Based Milk",
                "Plain Milk": "Milk",
                "Lactose-Free Milk": "Milk",
                "Flavored Milk": "Milk",
            },
            "dual_category": "Dairy & Eggs",
        },
        "Mixers & Non-Alcoholic Drinks": {
            "product_type_to_subcategory": {
                "Non-Alcoholic Wine": "Non-Alcoholic Wines",
                "Non-Alcoholic Beer": "Non-Alcoholic Beers",
            },
            "dual_category": "Wine",  # This will be overridden for beer products by product_type
            "dual_category_overrides": {"Non-Alcoholic Beer": "Beer"},
        },
    },
    # Dairy & Eggs mappings
    "Dairy & Eggs": {
        "Plant-Based Milk": {
            "product_type_to_subcategory": {"ALL": "Milk"},
            "dual_category": "Beverages",
        },
        "Milk": {
            "product_type_to_subcategory": {"ALL": "Milk"},
            "dual_category": "Beverages",
        },
    },
    # Canned Goods & Soups mappings
    "Canned Goods & Soups": {
        "Canned Tomatoes": {
            "product_type_to_subcategory": {"ALL": "Canned Tomatoes"},
            "dual_category": "Dry Goods & Pasta",
        }
    },
    # Dry Goods & Pasta mappings
    "Dry Goods & Pasta": {
        "Canned Tomatoes": {
            "product_type_to_subcategory": {"ALL": "Canned Tomatoes"},
            "dual_category": "Canned Goods & Soups",
        },
        "Pasta & Pizza Sauces": {
            "product_type_to_subcategory": {
                "Tomato Based Sauces": "Pasta Sauces",
                "Alfredo Sauce": "Pasta Sauces",
                "Pesto": "Pasta Sauces",
                # Pizza Sauce excluded intentionally
            },
            "dual_category": "Condiments & Sauces",
        },
    },
    # Condiments & Sauces mappings
    "Condiments & Sauces": {
        "Pasta Sauces": {
            "product_type_to_subcategory": {"ALL": "Pasta & Pizza Sauces"},
            "dual_category": "Dry Goods & Pasta",
        },
        "Salsa": {
            "product_type_to_subcategory": {"ALL": "Dips"},
            "dual_category": "Snacks & Candy",
        },
    },
    # Snacks & Candy mappings
    "Snacks & Candy": {
        "Dips": {
            "product_type_to_subcategory": {
                "Salsa": "Salsa",
                "Hummus": "Olives, Dips, & Spreads",
                "Guacamole": "Olives, Dips, & Spreads",
                "Cheese Dips": "Olives, Dips, & Spreads",
            },
            "dual_category": "Condiments & Sauces",
            "dual_category_overrides": {
                "Hummus": "Deli",
                "Guacamole": "Deli",
                "Cheese Dips": "Deli",
            },
        }
    },
    # Liquor mappings
    "Liquor": {
        "Canned Cocktails": {
            "product_type_to_subcategory": {"ALL": "Ready-to-Drink"},
            "dual_category": "Hard Beverages",
        }
    },
    # Hard Beverages mappings
    "Hard Beverages": {
        "Ready-to-Drink": {
            "product_type_to_subcategory": {
                "Canned Cocktails": "Canned Cocktails",
                "Pre-Mixed Cocktails": "Canned Cocktails",
            },
            "dual_category": "Liquor",
        }
    },
    # Meat & Seafood mappings
    "Meat & Seafood": {
        "Plant-Based Meat": {
            "product_type_to_subcategory": {"Tofu": "Tofu & Meat Alternatives"},
            "dual_category": "Deli",
        }
    },
    # Deli mappings
    "Deli": {
        "Tofu & Meat Alternatives": {
            "product_type_to_subcategory": {"Tofu": "Plant-Based Meat"},
            "dual_category": "Meat & Seafood",
        },
        "Olives, Dips, & Spreads": {
            "product_type_to_subcategory": {
                "Hummus": "Dips",
                "Guacamole": "Dips",
                "Cheese Dips": "Dips",
            },
            "dual_category": "Snacks & Candy",
        },
    },
    # Wine mappings
    "Wine": {
        "Non-Alcoholic Wines": {
            "product_type_to_subcategory": {"ALL": "Mixers & Non-Alcoholic Drinks"},
            "dual_category": "Beverages",
        }
    },
    # Beer mappings
    "Beer": {
        "Non-Alcoholic Beers": {
            "product_type_to_subcategory": {"ALL": "Mixers & Non-Alcoholic Drinks"},
            "dual_category": "Beverages",
        }
    },
}


def get_dual_categorization(category, subcategory, product_type):
    """
    Determine if a product should have dual categorization based on mapping rules.
    Returns only category and subcategory - product_type will be determined by AI.
    """
    import logging

    logger = logging.getLogger("dual_categories")
    logger.info(
        f"Checking dual categorization for: {category}/{subcategory}/{product_type}"
    )

    # Check if this category is in our dual category mappings
    if category in DUAL_CATEGORY_MAPPINGS:
        logger.info(f"✅ Found category '{category}' in mappings")

        # Check if the subcategory has dual mapping rules
        if subcategory in DUAL_CATEGORY_MAPPINGS[category]:
            logger.info(
                f"✅ Found subcategory '{subcategory}' in mappings for category '{category}'"
            )
            mapping = DUAL_CATEGORY_MAPPINGS[category][subcategory]

            # Check for product_type_to_subcategory mapping (new structure)
            if "product_type_to_subcategory" in mapping:
                logger.info(f"Using product_type_to_subcategory mapping")

                # First check for exact product type match
                if product_type in mapping["product_type_to_subcategory"]:
                    logger.info(
                        f"✅ Found exact match for product_type '{product_type}'"
                    )
                    dual_subcategory = mapping["product_type_to_subcategory"][
                        product_type
                    ]

                    # Check for category override based on product type
                    main_category = mapping["dual_category"]
                    if (
                        "dual_category_overrides" in mapping
                        and product_type in mapping["dual_category_overrides"]
                    ):
                        main_category = mapping["dual_category_overrides"][product_type]
                        logger.info(
                            f"Using category override: '{main_category}' for product_type '{product_type}'"
                        )

                    dual_cat = {
                        "main_category": main_category,
                        "subcategory": dual_subcategory,
                    }
                    logger.info(f"Found product-type specific mapping: {dual_cat}")
                    return dual_cat

                # Then check for ALL wildcard
                elif "ALL" in mapping["product_type_to_subcategory"]:
                    logger.info(f"✅ Found 'ALL' wildcard in mapping")
                    dual_subcategory = mapping["product_type_to_subcategory"]["ALL"]
                    dual_cat = {
                        "main_category": mapping["dual_category"],
                        "subcategory": dual_subcategory,
                    }
                    logger.info(
                        f"Found wildcard mapping for all product types: {dual_cat}"
                    )
                    return dual_cat
                else:
                    logger.info(f"❌ No matching product_type or 'ALL' wildcard found")

            # Legacy support for original structure
            elif "product_types" in mapping:
                logger.info(f"Using legacy product_types mapping")
                product_types = mapping["product_types"]
                if "ALL" in product_types or product_type in product_types:
                    dual_cat = {
                        "main_category": mapping["dual_category"],
                        "subcategory": mapping["dual_subcategory"],
                    }
                    logger.info(f"Found dual category mapping (legacy): {dual_cat}")
                    return dual_cat
        else:
            logger.info(
                f"❌ Subcategory '{subcategory}' not found in mappings for category '{category}'"
            )
    else:
        logger.info(f"❌ Category '{category}' not found in dual category mappings")

    # No dual categorization needed
    logger.info("❌ No dual categorization mapping found")
    return None
