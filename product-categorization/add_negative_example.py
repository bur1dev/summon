import argparse
import json
import os
from ai_categorizer import ProductCategorizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--product", help="Product text")
    parser.add_argument("--category", help="Incorrect category")
    parser.add_argument("--subcategory", help="Incorrect subcategory")
    parser.add_argument("--product_type", help="Incorrect product type")
    args = parser.parse_args()

    categorizer = ProductCategorizer("categories.json")
    result = categorizer.add_negative_example(
        args.product, args.category, args.subcategory, args.product_type
    )
    print(json.dumps({"success": result}))


if __name__ == "__main__":
    main()
