import json
import os
import logging

logger = logging.getLogger("dual_categories")

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
        "Cheese": {
            "product_type_to_subcategory": {"ALL": "Cheese"},
            "dual_category": "Deli",
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
    },
    # Snacks & Candy mappings
    "Snacks & Candy": {
        "Dips": {
            "product_type_to_subcategory": {
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
        },
        "Snack Bars": {
            "product_type_to_subcategory": {"Breakfast Bars": "Breakfast Bars"},
            "dual_category": "Breakfast",
        },
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
        "Cheese": {
            "product_type_to_subcategory": {"ALL": "Cheese"},
            "dual_category": "Dairy & Eggs",
            # The special handling for "Cheese" subcategory in get_dual_categorization
            # will ensure LLM is used for product_type if this mapping is hit.
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
    # Breakfast mappings
    "Breakfast": {
        "Breakfast Bars": {
            "product_type_to_subcategory": {"ALL": "Snack Bars"},
            "dual_category": "Snacks & Candy",
        },
        "Maple Syrup": {
            "product_type_to_subcategory": {"ALL": "Honey, Syrup, & Sweeteners"},
            "dual_category": "Baking Essentials",
        },
    },
    # Baking Essentials mappings
    "Baking Essentials": {
        "Honey, Syrup, & Sweeteners": {
            "product_type_to_subcategory": {"Maple Syrup": "Maple Syrup"},
            "dual_category": "Breakfast",
        }
    },
}

MULTI_CATEGORY_MAPPINGS = {
    "Condiments & Sauces": {
        "Salsa": {
            "product_type_to_subcategory": {"ALL": "Dips"},
            "additional_categories": [
                {"main_category": "Snacks & Candy", "subcategory": "Dips"},
                {"main_category": "Deli", "subcategory": "Olives, Dips, & Spreads"},
            ],
        }
    },
    "Snacks & Candy": {
        "Dips": {
            "product_type_to_subcategory": {"Salsa": "Salsa"},
            "additional_categories": [
                {"main_category": "Condiments & Sauces", "subcategory": "Salsa"},
                {"main_category": "Deli", "subcategory": "Olives, Dips, & Spreads"},
            ],
        }
    },
    "Deli": {
        "Olives, Dips, & Spreads": {
            "product_type_to_subcategory": {"Salsa": "Salsa"},
            "additional_categories": [
                {"main_category": "Condiments & Sauces", "subcategory": "Salsa"},
                {"main_category": "Snacks & Candy", "subcategory": "Dips"},
            ],
        }
    },
}


def load_categories():
    """Load categories.json file to check available product types"""
    try:
        categories_path = os.path.join(os.path.dirname(__file__), "categories.json")
        with open(categories_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading categories.json: {e}")
        return []


def product_type_exists(category, subcategory, product_type, categories=None):
    """Check if a product_type exists in the target category/subcategory"""
    if categories is None:
        categories = load_categories()

    for cat in categories:
        if cat["name"] == category:
            for sub in cat["subcategories"]:
                if sub["name"] == subcategory:
                    # Check if it's a gridOnly subcategory
                    if sub.get("gridOnly", False):
                        return product_type == subcategory
                    # Check if product_type exists in productTypes
                    return product_type in sub.get("productTypes", [])
    return False


def get_dual_categorization(category, subcategory, product_type):
    """
    Determine if a product should have dual categorization based on mapping rules.
    Returns category, subcategory, and product_type when possible.
    """
    logger.info(
        f"🔍 Checking dual categorization for: {category}/{subcategory}/{product_type}"
    )

    # Force LLM for all cheese products

    if subcategory == "Cheese":
        if (
            category in DUAL_CATEGORY_MAPPINGS
            and subcategory in DUAL_CATEGORY_MAPPINGS[category]
        ):
            mapping = DUAL_CATEGORY_MAPPINGS[category][subcategory]
            dual_cat = {
                "main_category": mapping["dual_category"],
                "subcategory": "Cheese",
                # No product_type - force LLM
            }
            logger.info(f"🤖 Cheese product - forcing LLM mapping: {dual_cat}")
            return dual_cat

    # Check if this category is in our dual category mappings
    if category in DUAL_CATEGORY_MAPPINGS:
        logger.info(f"✅ Found category '{category}' in mappings")

        current_category_mappings = DUAL_CATEGORY_MAPPINGS[category]
        logger.info(
            f"ℹ️ Subcategories available in DUAL_CATEGORY_MAPPINGS['{category}']: {list(current_category_mappings.keys())}"
        )
        logger.info(
            f"ℹ️ Comparing input subcategory '[{subcategory}]' (type: {type(subcategory)}) with available keys."
        )
        for key in current_category_mappings.keys():
            logger.info(
                f"  - Key: '[{key}]' (type: {type(key)}), Match: {subcategory == key}"
            )

        # Check if the subcategory has dual mapping rules
        if subcategory in DUAL_CATEGORY_MAPPINGS[category]:
            logger.info(
                f"✅ Found subcategory '{subcategory}' in mappings for category '{category}'"
            )
            mapping = DUAL_CATEGORY_MAPPINGS[category][subcategory]

            # Check for product_type_to_subcategory mapping (new structure)
            if "product_type_to_subcategory" in mapping:
                logger.info(f"📊 Using product_type_to_subcategory mapping")

                # First check for exact product type match
                if product_type in mapping["product_type_to_subcategory"]:
                    logger.info(
                        f"🎯 Found exact match for product_type '{product_type}'"
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
                            f"🔄 Using category override: '{main_category}' for product_type '{product_type}'"
                        )

                    # Try to directly assign product_type if it exists in target
                    if product_type_exists(
                        main_category, dual_subcategory, product_type
                    ):
                        logger.info(
                            f"✨ Direct 1:1 mapping possible! Product type '{product_type}' exists in target"
                        )
                        dual_cat = {
                            "main_category": main_category,
                            "subcategory": dual_subcategory,
                            "product_type": product_type,  # DIRECT ASSIGNMENT!
                        }
                        logger.info(f"🎉 Direct mapping result: {dual_cat}")
                        return dual_cat
                    else:
                        # Product type doesn't exist in target, let LLM decide
                        logger.info(
                            f"⚡ Product type '{product_type}' doesn't exist in target, LLM will determine"
                        )
                        dual_cat = {
                            "main_category": main_category,
                            "subcategory": dual_subcategory,
                        }
                        logger.info(f"🤖 LLM needed mapping: {dual_cat}")
                        return dual_cat

                # Then check for ALL wildcard
                elif "ALL" in mapping["product_type_to_subcategory"]:
                    logger.info(f"🌟 Found 'ALL' wildcard in mapping")
                    dual_subcategory = mapping["product_type_to_subcategory"]["ALL"]

                    # For ALL mappings, check if the product_type exists in target
                    main_category = mapping["dual_category"]
                    if product_type_exists(
                        main_category, dual_subcategory, product_type
                    ):
                        logger.info(
                            f"✨ Direct mapping for ALL: Product type '{product_type}' exists in target"
                        )
                        dual_cat = {
                            "main_category": main_category,
                            "subcategory": dual_subcategory,
                            "product_type": product_type,  # DIRECT ASSIGNMENT!
                        }
                        logger.info(f"🎉 Direct ALL mapping result: {dual_cat}")
                        return dual_cat
                    else:
                        # Let LLM determine appropriate product type
                        logger.info(
                            f"⚡ ALL mapping: Product type '{product_type}' doesn't exist in target, LLM will determine"
                        )
                        dual_cat = {
                            "main_category": main_category,
                            "subcategory": dual_subcategory,
                        }
                        logger.info(f"🤖 LLM needed for ALL mapping: {dual_cat}")
                        return dual_cat
                else:
                    logger.info(f"❌ No matching product_type or 'ALL' wildcard found")

            # Legacy support for original structure
            elif "product_types" in mapping:
                logger.info(f"📦 Using legacy product_types mapping")
                product_types = mapping["product_types"]
                if "ALL" in product_types or product_type in product_types:
                    dual_cat = {
                        "main_category": mapping["dual_category"],
                        "subcategory": mapping["dual_subcategory"],
                    }
                    logger.info(f"🔧 Found dual category mapping (legacy): {dual_cat}")
                    return dual_cat
        else:
            logger.info(
                f"❌ Subcategory '{subcategory}' not found in mappings for category '{category}'"
            )
    else:
        logger.info(f"❌ Category '{category}' not found in dual category mappings")

    # No dual categorization needed
    logger.info("🚫 No dual categorization mapping found")
    return None


def get_categorizations(category, subcategory, product_type):
    """
    Get all additional categorizations for a product.
    Returns an array of categorizations (can be empty, single, or multiple).
    """
    logger.info(
        f"🔍 Checking categorizations for: {category}/{subcategory}/{product_type}"
    )

    categorizations = []

    # First check MULTI_CATEGORY_MAPPINGS
    if category in MULTI_CATEGORY_MAPPINGS:
        logger.info(f"✅ Found category '{category}' in MULTI mappings")

        if subcategory in MULTI_CATEGORY_MAPPINGS[category]:
            logger.info(
                f"✅ Found subcategory '{subcategory}' in MULTI mappings for category '{category}'"
            )
            mapping = MULTI_CATEGORY_MAPPINGS[category][subcategory]

            if "additional_categories" in mapping:
                logger.info(f"📊 Processing additional_categories")

                for i, additional in enumerate(mapping["additional_categories"]):
                    target_category = additional["main_category"]
                    target_subcategory = additional["subcategory"]

                    logger.info(
                        f"🎯 Additional mapping #{i}: {target_category} → {target_subcategory}"
                    )

                    # Check if product type exists in target
                    if product_type_exists(
                        target_category, target_subcategory, product_type
                    ):
                        logger.info(
                            f"✨ Direct 1:1 mapping possible! Product type '{product_type}' exists in target"
                        )
                        categorizations.append(
                            {
                                "main_category": target_category,
                                "subcategory": target_subcategory,
                                "product_type": product_type,
                            }
                        )
                    else:
                        logger.info(
                            f"⚡ Product type '{product_type}' doesn't exist in target, LLM will determine"
                        )
                        categorizations.append(
                            {
                                "main_category": target_category,
                                "subcategory": target_subcategory,
                            }
                        )

                logger.info(
                    f"🌟 Found multi-categorization: {len(categorizations)} mappings"
                )
                return categorizations

    # Fall back to dual categorization check
    dual_result = get_dual_categorization(category, subcategory, product_type)
    if dual_result:
        logger.info(f"🔄 Using legacy dual categorization")
        categorizations.append(dual_result)

    logger.info(f"📋 Returning {len(categorizations)} categorizations")
    return categorizations
