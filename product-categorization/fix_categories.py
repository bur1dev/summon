# fix_categories.py
import json

def fix_json(filename):
    with open(filename, 'r') as f:
        data = json.load(f)
    
    # Remove trailing commas from productTypes
    for category in data:
        for subcategory in category['subcategories']:
            if 'productTypes' in subcategory:
                subcategory['productTypes'] = [pt.rstrip(',\"') for pt in subcategory['productTypes']]
    
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    fix_json('categories.json')