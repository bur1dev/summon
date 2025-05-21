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