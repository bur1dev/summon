import json
import sys
from ai_categorizer import ProductCategorizer

# Create categorizer instance
categorizer = ProductCategorizer("categories.json")

# Convert failures to reports
count = categorizer.convert_failures_to_reports()

# Return JSON result
print(json.dumps({"success": True, "converted": count}))

if __name__ == "__main__":
    # Redirect all output to stderr except our final JSON
    with contextlib.redirect_stdout(sys.stderr):
        try:
            converter = ProductCategorizer("categories.json")
            converted = converter.convert_failures_to_reports()
            # Only this JSON goes to stdout
        except Exception as e:
            converted = 0
            logger.error(f"Error: {e}")

    # Clean JSON output to stdout - this is what Node.js will parse
    print(json.dumps({"success": True, "converted": converted}))
