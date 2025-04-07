import sys

print("sys.path:", sys.path)
import json
import os
import argparse
from ai_categorizer import ProductCategorizer


def test_categorization():
    categorizer = ProductCategorizer("categories.json")
    # Always refresh correction map on startup
    categorizer.refresh_correction_map()

    test_product = {
        "description": "Horizon Organic Shelf-Stable 1% Low Fat Milk Box - Strawberry",
        "categories": ["Natural & Organic", "Dairy"],
    }
    result = categorizer.categorize_product(test_product)
    print(f"Test result: {json.dumps(result, indent=2)}")


def test_batch(products):
    categorizer = ProductCategorizer("categories.json")
    # Always refresh correction map on startup
    categorizer.refresh_correction_map()
    return categorizer.batch_categorize(products)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--batch", help="JSON string of products to categorize")
    group.add_argument(
        "--file", help="Path to JSON file containing products to categorize"
    )
    args = parser.parse_args()

    if args.batch:
        products = json.loads(args.batch)
        results = test_batch(products)
        print(json.dumps(results))
    elif args.file:
        try:
            with open(args.file, "r") as f:
                products = json.load(f)
            results = test_batch(products)
            print(json.dumps(results))
        except Exception as e:
            print(json.dumps({"error": f"Failed to process file: {str(e)}"}))
    else:
        test_categorization()
