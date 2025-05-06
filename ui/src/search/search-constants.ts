export const PRODUCT_TYPE_MAP = {
    // Fruits
    "apple": "Apples",
    "apples": "Apples",
    "banana": "Bananas",
    "bananas": "Bananas",
    "berry": "Berries",
    "berries": "Berries",
    "strawberry": "Berries",
    "strawberries": "Berries",
    "blueberry": "Berries",
    "blueberries": "Berries",
    "raspberry": "Berries",
    "raspberries": "Berries",
    "orange": "Grapefruits & Oranges",
    "oranges": "Grapefruits & Oranges",
    "grapefruit": "Grapefruits & Oranges",
    "grapefruits": "Grapefruits & Oranges",
    "lemon": "Lemons & Limes",
    "lemons": "Lemons & Limes",
    "lime": "Lemons & Limes",
    "limes": "Lemons & Limes",
    "melon": "Melons",
    "melons": "Melons",
    "peach": "Peaches, Plums & Apricots",
    "peaches": "Peaches, Plums & Apricots",
    "plum": "Peaches, Plums & Apricots",
    "plums": "Peaches, Plums & Apricots",
    "pear": "Pears",
    "pears": "Pears",
    "avocado": "Avocados",
    "avocados": "Avocados",

    // Vegetables
    "potato": "Potatoes & Yams",
    "potatoes": "Potatoes & Yams",
    "yam": "Potatoes & Yams",
    "yams": "Potatoes & Yams",
    "tomato": "Tomatoes",
    "tomatoes": "Tomatoes",
    "lettuce": "Leafy Greens",
    "spinach": "Leafy Greens",
    "kale": "Leafy Greens",
    "broccoli": "Broccoli & Cauliflower",
    "cauliflower": "Broccoli & Cauliflower",
    "carrot": "Carrots & Celery",
    "carrots": "Carrots & Celery",
    "celery": "Carrots & Celery",
    "onion": "Onions & Garlic",
    "onions": "Onions & Garlic",
    "garlic": "Onions & Garlic",
    "pepper": "Peppers",
    "peppers": "Peppers",
    "cucumber": "Cucumbers",
    "cucumbers": "Cucumbers",
    "mushroom": "Mushrooms",
    "mushrooms": "Mushrooms",
    "corn": "Corn",

    // Produce
    "bell pepper": "Peppers",
    "sweet pepper": "Peppers",
    "romaine": "Leafy Greens",
    "arugula": "Leafy Greens",
    "spring mix": "Leafy Greens",
    "mixed greens": "Leafy Greens",
    "cherry tomato": "Tomatoes",
    "grape tomato": "Tomatoes",
    "roma tomato": "Tomatoes",
    "green onion": "Onions & Garlic",
    "scallion": "Onions & Garlic",

    // Meat & Seafood
    "ground turkey": "Ground Turkey",
    "hamburger": "Burgers & Ground Beef",
    "hamburger meat": "Burgers & Ground Beef",
    "ribeye": "Steaks",
    "sirloin": "Steaks",
    "filet": "Steaks",
    "tilapia": "Tilapia",
    "cod": "Cod",

    // Dairy
    "half and half": "Half & Half",
    "shredded cheese": "Cheese Blends",
    "sour cream": "Sour Cream",

    // Baking
    "baking soda": "Baking Soda",
    "brown sugar": "Brown Sugars",
    "powdered sugar": "Powdered Sugared",
    "cake flour": "All Purpose Flour",
    "bread flour": "Bread Flour",

    // Breakfast
    "maple syrup": "Maple Syrup",
    "pancake syrup": "Maple Syrup",
    "breakfast syrup": "Maple Syrup",
    "instant oatmeal": "Quick Oats",
    "quick oats": "Quick Oats",

    // Dairy & Eggs
    "milk": "Plain Milk",
    "cheese": "Cheddar",
    "cheddar": "Cheddar",
    "yogurt": "Greek Yogurt",
    "greek yogurt": "Greek Yogurt",
    "butter": "Butter",
    "eggs": "Eggs",
    "egg": "Eggs",

    // Drinks
    "water": "Bottled Water",
    "soda": "Soft Drinks",
    "soft drink": "Soft Drinks",
    "coffee": "Ground Coffee",
    "juice": "Fruit Juice",
    "tea": "Leaf Tea",
    "beer": "Light Beer",
    "wine": "Red Wine",

    // Beverages
    "sparkling water": "Sparkling Water",
    "seltzer": "Sparkling Water",
    "bubbly water": "Sparkling Water",
    "carbonated water": "Sparkling Water",
    "pop": "Soft Drinks",
    "soda pop": "Soft Drinks",
    "iced tea": "Bottled Tea",

    // Frozen
    "ice cream": "Ice Cream",
    "frozen pizza": "Pizzas",
    "frozen fruit": "Mixed Berries",
    "frozen berries": "Mixed Berries",

    // Meat & Seafood
    "beef": "Burgers & Ground Beef",
    "ground beef": "Burgers & Ground Beef",
    "steak": "Steaks",
    "chicken": "Chicken Breasts",
    "chicken breast": "Chicken Breasts",
    "chicken thigh": "Chicken Thighs",
    "pork": "Pork Chops",
    "bacon": "Bacon",
    "hot dog": "Hot Dogs",
    "salmon": "Salmon",
    "fish": "Salmon",
    "shrimp": "Shrimp & Prawns",

    // Snacks
    "chip": "Potato Chips",
    "chips": "Potato Chips",
    "cookie": "Cookies",
    "cookies": "Cookies",
    "chocolate": "Chocolate Candies",
    "candy": "Chocolate Candies",
    "popcorn": "Popcorn",
    "pretzel": "Pretzels",
    "pretzels": "Pretzels",
    "granola": "Granola Bars",
    "cracker": "Crackers",
    "crackers": "Crackers",

    // Baking
    "flour": "All Purpose Flour",
    "sugar": "Granulated Sugars",
    "baking powder": "Baking Powder",
    "vanilla": "Vanilla Extract",
    "chocolate chip": "Chocolate Chips",

    // Energy Drinks
    "red bull": "Energy Drinks",
    "energy drink": "Energy Drinks",
    "energy drinks": "Energy Drinks",
    "monster": "Energy Drinks",
    "rockstar": "Energy Drinks",
    "bang": "Energy Drinks",
    "celsius": "Energy Drinks",
};

// Common qualifiers for parsing search queries
export const COMMON_QUALIFIERS = [
    "organic", "fresh", "large", "small", "red", "green",
    "frozen", "canned", "seedless", "ripe", "raw",
    "low-fat", "whole", "sliced", "diced", "natural"
];

// Category priority rules for dual categorization
export const CATEGORY_PRIORITY_RULES = [
    { term: "milk", preferredCategory: "Dairy & Eggs" },
    {
        term: "sauce",
        preferredCategory: "Dry Goods & Pasta",
        condition: (query) => query.includes("pasta") || query.includes("tomato")
    },
    { term: "salsa", preferredCategory: "Condiments & Sauces" },
    {
        term: "beer",
        preferredCategory: "Beer",
        condition: (query) => query.includes("non-alcoholic") || query.includes("non")
    },
    {
        term: "wine",
        preferredCategory: "Wine",
        condition: (query) => query.includes("non-alcoholic") || query.includes("non")
    },
    {
        term: "tomato",
        preferredCategory: "Dry Goods & Pasta",
        condition: (query) => query.includes("can")
    },
    { term: "tofu", preferredCategory: "Meat & Seafood" },
    {
        term: "dip",
        preferredCategory: "Deli",
        condition: (query) => query.includes("hummus") ||
            query.includes("guacamole") ||
            query.includes("cheese")
    },
    {
        term: "cocktail",
        preferredCategory: "Liquor",
        condition: (query) => query.includes("can")
    },
];

export const BRAND_MAPPINGS = {
    // Colas and major sodas
    "coca": {
        fullName: "Coca-Cola",
        variations: ["coca-cola", "coca cola",]
    },
    "pepsi": {
        fullName: "Pepsi",
        variations: ["pepsi cola", "pepsi-cola"]
    },
    "dr": {
        fullName: "Dr Pepper",
        variations: ["dr pepper", "dr. pepper"]
    },
    "mountain": {
        fullName: "Mountain Dew",
        variations: ["mtn dew", "mt dew"]
    },
    "diet": {
        fullName: "Diet Coke",
        variations: ["diet coke"]
    },

    // Clear sodas
    "7": {
        fullName: "7UP",
        variations: ["7up", "7-up", "seven up"]
    },

    // Fruit flavored sodas
    "fanta": {
        fullName: "Fanta",
        variations: ["fanta"]
    },
    "sunkist": {
        fullName: "Sunkist",
        variations: ["sunkist"]
    },

    // Ginger ales and root beers
    "canada": {
        fullName: "Canada Dry",
        variations: ["canada dry"]
    },
    "a&w": {
        fullName: "A&W",
        variations: ["a&w", "a & w", "a and w"]
    },

    // Health-focused sodas
    "poppi": {
        fullName: "Poppi",
        variations: ["poppi"]
    },
    "olipop": {
        fullName: "Olipop",
        variations: ["olipop", "olipop™"]
    },

    // Sports drinks
    "gatorade": {
        fullName: "Gatorade",
        variations: ["gatorade"]
    },
    "powerade": {
        fullName: "Powerade",
        variations: ["powerade"]
    },
    "bodyarmor": {
        fullName: "BODYARMOR",
        variations: ["body armor"]
    },

    // Energy drinks
    "red": {
        fullName: "Red Bull",
        variations: ["red bull"]
    },
    "monster": {
        fullName: "Monster",
        variations: ["monster energy"]
    },
    "celsius": {
        fullName: "CELSIUS",
        variations: ["celsius"]
    },
    "polar": {
        fullName: "Polar",
        variations: ["polar", "polar seltzer", "polar beverages"]
    },
    // Popular soft drinks
    "sprite": {
        fullName: "Sprite",
        variations: ["sprite", "sprite zero"]
    },
    "snapple": {
        fullName: "Snapple",
        variations: ["snapple"]
    },
    "arizona": {
        fullName: "Arizona",
        variations: ["arizona", "arizona iced tea"]
    },
    "minute": {
        fullName: "Minute Maid",
        variations: ["minute maid", "minutemaid"]
    },

    // Water brands
    "dasani": {
        fullName: "Dasani",
        variations: ["dasani water", "dasani"]
    },
    "aquafina": {
        fullName: "Aquafina",
        variations: ["aquafina water", "aquafina"]
    },
    "fiji": {
        fullName: "FIJI",
        variations: ["fiji water", "fiji"]
    },
    "smartwater": {
        fullName: "smartwater",
        variations: ["smart water", "smartwater"]
    },
    "lacroix": {
        fullName: "LaCroix",
        variations: ["la croix", "lacroix"]
    },

    // Beer brands
    "budweiser": {
        fullName: "Budweiser",
        variations: ["budweiser", "bud", "bud light"]
    },
    "coors": {
        fullName: "Coors",
        variations: ["coors", "coors light", "coors banquet"]
    },
    "miller": {
        fullName: "Miller",
        variations: ["miller lite", "miller genuine draft", "miller high life"]
    },
    "heineken": {
        fullName: "Heineken",
        variations: ["heineken"]
    },
    "corona": {
        fullName: "Corona",
        variations: ["corona", "corona extra", "corona light"]
    },
    "stella": {
        fullName: "Stella Artois",
        variations: ["stella artois", "stella"]
    },
    "blue": {
        fullName: "Blue Moon",
        variations: ["blue moon"]
    },
    "guinness": {
        fullName: "Guinness",
        variations: ["guinness"]
    },

    // Abbreviations map
    "abbreviations": {
        "coke": "Coke",
        "cola": "Coca-Cola",
        "dp": "Dr Pepper",
        "mt dew": "Mountain Dew",
        "oj": "Orange Juice",
        "diet": "Diet Coke",
        "pepsi max": "Pepsi Zero Sugar"
    }
};

export const CATEGORY_MAPPINGS = {
    // Product type mappings
    productTypes: {
        "Berries": {
            categories: ["Frozen"],
            subcategories: ["Frozen Fruits"],
            mappedTypes: ["Mixed Berries", "Blueberries", "Strawberries", "Raspberries"]
        },
        // Reverse mappings
        "Mixed Berries": {
            categories: ["Produce"],
            subcategories: ["Fresh Fruits"],
            mappedTypes: ["Berries"]
        },
        "Blueberries": {
            categories: ["Produce"],
            subcategories: ["Fresh Fruits"],
            mappedTypes: ["Berries"]
        },
        "Strawberries": {
            categories: ["Produce"],
            subcategories: ["Fresh Fruits"],
            mappedTypes: ["Berries"]
        },
        "Raspberries": {
            categories: ["Produce"],
            subcategories: ["Fresh Fruits"],
            mappedTypes: ["Berries"]
        },
        "Spinach": {
            categories: ["Frozen", "Produce"],
            subcategories: ["Frozen Vegetables", "Fresh Vegetables"],
            mappedTypes: ["Spinach", "Leafy Greens"]
        },
        "Broccoli": {
            categories: ["Frozen", "Produce"],
            subcategories: ["Frozen Vegetables", "Fresh Vegetables"],
            mappedTypes: ["Broccoli", "Broccoli & Cauliflower"]
        },
        "Corn": {
            categories: ["Frozen", "Produce", "Canned Goods & Soups"],
            subcategories: ["Frozen Vegetables", "Fresh Vegetables", "Canned Vegetables"],
            mappedTypes: ["Corn"]
        },
        "Chicken Breasts": {
            categories: ["Frozen", "Meat & Seafood"],
            subcategories: ["Frozen Meat & Seafood", "Chicken"],
            mappedTypes: ["Chicken", "Chicken Breasts"]
        },
        "Pizzas": {
            categories: ["Prepared Foods", "Frozen"],
            subcategories: ["Pizza & Meals", "Frozen Pizzas & Meals"],
            mappedTypes: ["Pizza", "Pizzas"]
        },
        "Cookies": {
            categories: ["Bakery", "Snacks & Candy"],
            subcategories: ["Cookies & Brownies", "Cookies & Sweet Treats"],
            mappedTypes: ["Cookies"]
        },
        "Tomato Sauce": {
            categories: ["Condiments & Sauces", "Dry Goods & Pasta"],
            subcategories: ["Pasta Sauces", "Pasta & Pizza Sauces"],
            mappedTypes: ["Red Sauce", "Tomato Based Sauces"]
        }
    },
};

export const SPECIAL_BRAND_CASES = {
    "red bull": "Red Bull",
    "redbull": "Red Bull",
    "mountain dew": "Mountain Dew",
    "mountaindew": "Mountain Dew",
    "dr pepper": "Dr Pepper"
    // Add more as needed
};