import json
import os
import sys
import io
import logging
import contextlib
from ai_categorizer import ProductCategorizer
from category_converter import (
    create_faiss_training_data,
    enrich_training_data_with_corrections,
)

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)


def rebuild_index():
    """
    Rebuilds the FAISS index and training data with corrections from reported categorizations.
    This ensures both the correction map and vector embeddings benefit from user feedback.
    """
    try:
        # Get the script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))

        # First load existing training data if available
        training_data_file = os.path.join(script_dir, "training_data.json")
        existing_training_data = []
        if os.path.exists(training_data_file):
            try:
                with open(training_data_file, "r") as f:
                    existing_training_data = json.load(f)
                logger.info(
                    f"Loaded {len(existing_training_data)} existing training examples"
                )
            except Exception as e:
                logger.error(f"Error loading existing training data: {e}")

        # Load categories file
        categories_file = os.path.join(script_dir, "categories.json")
        if not os.path.exists(categories_file):
            logger.error(f"Categories file not found: {categories_file}")
            return False

        # Generate base training data from categories
        logger.info("Generating base training data from categories...")
        with open(categories_file, "r") as f:
            categories = json.load(f)
        base_training_data = create_faiss_training_data(categories)
        logger.info(f"Generated {len(base_training_data)} base training examples")

        # Enrich training data with approved corrections
        logger.info("Enriching training data with approved corrections...")
        enriched_data = enrich_training_data_with_corrections(base_training_data)
        added_examples = len(enriched_data) - len(base_training_data)
        logger.info(f"Added {added_examples} examples from corrections")

        # Merge with existing training data, avoiding duplicates
        # Create a set of text fields for efficient lookup
        seen_texts = set(item["text"] for item in existing_training_data)

        # Start with existing data
        merged_data = list(existing_training_data)

        # Add only new examples from this run
        new_examples_added = 0
        for item in enriched_data:
            if item["text"] not in seen_texts:
                merged_data.append(item)
                seen_texts.add(item["text"])
                new_examples_added += 1

        logger.info(
            f"Merged {len(existing_training_data)} existing and {new_examples_added} new examples"
        )

        # Save merged training data
        with open(training_data_file, "w") as f:
            json.dump(merged_data, f, indent=2)
        logger.info(f"Saved training_data.json with {len(merged_data)} total entries")

        # Create fresh categorizer (which loads the correction map)
        logger.info("Creating new ProductCategorizer instance with updated data...")
        categorizer = ProductCategorizer(categories_file)

        # Log the correction map size
        correction_map_file = os.path.join(script_dir, "correction_map.json")
        if os.path.exists(correction_map_file):
            with open(correction_map_file, "r") as f:
                correction_map = json.load(f)
            logger.info(f"Loaded correction map with {len(correction_map)} entries")
        else:
            logger.warning("No correction map file found")

        # Test categorization with a sample product
        test_product = {
            "description": "Horizon Organic Shelf-Stable 1% Low Fat Milk Box - Strawberry",
            "categories": ["Natural & Organic", "Dairy"],
        }
        result = categorizer.categorize_product(test_product)
        logger.info(f"Test categorization result: {json.dumps(result, indent=2)}")

        return True
    except Exception as e:
        logger.error(f"Error rebuilding index: {e}")
        return False


if __name__ == "__main__":
    # Redirect all output to stderr except our final JSON
    with contextlib.redirect_stdout(sys.stderr):
        try:
            success = rebuild_index()
            # Write only clean JSON to stdout
        except Exception as e:
            success = False
            logger.error(f"Error: {e}")

    # Only this will go to stdout - clean JSON
    print(json.dumps({"success": success}))
