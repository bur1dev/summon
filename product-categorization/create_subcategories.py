import json


def create_subcategories_json():
    with open("categories.json", "r") as f:
        categories = json.load(f)

    subcategories = []

    for category in categories:
        cat_entry = {
            "name": category["name"],
            "subcategories": [sub["name"] for sub in category["subcategories"]],
        }
        subcategories.append(cat_entry)

    with open("subcategories.json", "w") as f:
        json.dump(subcategories, f, indent=2)


if __name__ == "__main__":
    create_subcategories_json()
