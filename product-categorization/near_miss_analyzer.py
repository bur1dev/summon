import json
import os
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

NEAR_MISS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "near_misses.jsonl"
)
MIN_SCORE = 70  # Minimum score to consider as a near miss
MAX_SCORE = 85  # Maximum score (below this is a match)


def log_near_miss(product_text: str, best_match: str, score: float) -> None:
    """
    Logs a near miss from fuzzy matching to the near_misses.jsonl file.
    """
    if not (MIN_SCORE <= score < MAX_SCORE):
        return  # Only log within the specified score range

    try:
        near_miss = {
            "product_text": product_text,
            "best_match": best_match,
            "score": score,
            "timestamp": datetime.now().isoformat(),
        }

        with open(NEAR_MISS_FILE, "a") as f:
            json.dump(near_miss, f)
            f.write("\n")

        logger.debug(
            f"Logged near miss: '{product_text}' -> '{best_match}' ({score:.2f}%)"
        )
    except Exception as e:
        logger.error(f"Error logging near miss: {e}")


def analyze_near_misses(
    min_occurrences: int = 3, days_limit: int = 30
) -> List[Dict[str, Any]]:
    """
    Analyzes near miss patterns to suggest potential correction map additions.

    Args:
        min_occurrences: Minimum number of occurrences to consider a pattern
        days_limit: Only consider near misses from the last N days

    Returns:
        List of suggestions for correction map additions
    """
    if not os.path.exists(NEAR_MISS_FILE):
        logger.warning(f"Near miss file not found: {NEAR_MISS_FILE}")
        return []

    try:
        # Read near misses
        near_misses = []
        with open(NEAR_MISS_FILE, "r") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    near_miss = json.loads(line)
                    near_misses.append(near_miss)
                except json.JSONDecodeError:
                    continue

        # Filter by date if specified
        if days_limit > 0:
            cutoff_date = datetime.now()
            import datetime as dt

            cutoff_date = cutoff_date - dt.timedelta(days=days_limit)
            cutoff_str = cutoff_date.isoformat()
            near_misses = [
                nm for nm in near_misses if nm.get("timestamp", "") >= cutoff_str
            ]

        # Group by correction key (best_match)
        match_groups = defaultdict(list)
        for miss in near_misses:
            match_groups[miss["best_match"]].append(miss)

        # Find patterns meeting minimum occurrence threshold
        suggestions = []
        for match_key, items in match_groups.items():
            if len(items) >= min_occurrences:
                # Look for common word patterns in the product texts
                product_texts = [item["product_text"] for item in items]

                # Create a suggestion
                suggestion = {
                    "correction_key": match_key,
                    "category_info": get_correction_info(match_key),
                    "variants": product_texts,
                    "average_score": sum(item["score"] for item in items) / len(items),
                    "count": len(items),
                    "suggested_keys": suggest_pattern_keys(product_texts),
                }
                suggestions.append(suggestion)

        return sorted(suggestions, key=lambda x: x["count"], reverse=True)

    except Exception as e:
        logger.error(f"Error analyzing near misses: {e}")
        return []


def get_correction_info(match_key: str) -> Dict[str, str]:
    """
    Gets category information for a correction key from the existing correction map.
    """
    correction_map_file = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "correction_map.json"
    )

    try:
        if os.path.exists(correction_map_file):
            with open(correction_map_file, "r") as f:
                correction_map = json.load(f)
                if match_key in correction_map:
                    return correction_map[match_key]
    except Exception as e:
        logger.error(f"Error getting correction info: {e}")

    return {"category": "Unknown", "subcategory": "Unknown", "product_type": "Unknown"}


def suggest_pattern_keys(product_texts: List[str]) -> List[str]:
    """
    Suggests potential new keys based on patterns in product texts.
    """
    # Simple implementation - find common words
    # Get common words
    all_words = set()
    for text in product_texts:
        words = text.lower().split()
        all_words.update(words)

    # Filter out very short words and stopwords
    stopwords = {
        "a",
        "an",
        "the",
        "and",
        "or",
        "with",
        "in",
        "on",
        "at",
        "of",
        "to",
        "for",
    }
    filtered_words = [w for w in all_words if len(w) > 2 and w not in stopwords]

    # Count word occurrences
    word_counts = defaultdict(int)
    for text in product_texts:
        text_words = set(text.lower().split())  # Use set to count only once per text
        for word in filtered_words:
            if word in text_words:
                word_counts[word] += 1

    # Find words that appear in more than half the texts
    common_words = [
        word for word, count in word_counts.items() if count >= len(product_texts) * 0.5
    ]

    # Generate potential key patterns
    suggestions = []
    if common_words:
        # Sort by frequency
        common_words.sort(key=lambda w: word_counts[w], reverse=True)

        # Take top 3 most common words
        top_words = common_words[:3]

        # Create pattern combining brand names and product types
        if len(top_words) >= 2:
            suggestions.append(" ".join(top_words))

        # Add single most common word as a fallback
        if top_words:
            suggestions.append(top_words[0])

    return suggestions


def generate_report():
    """
    Generates a report of near miss patterns and prints suggestions.
    """
    suggestions = analyze_near_misses()

    if not suggestions:
        print("No significant near miss patterns found.")
        return

    print(f"\n===== NEAR MISS ANALYSIS REPORT =====")
    print(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Found {len(suggestions)} significant patterns\n")

    for i, suggestion in enumerate(suggestions, 1):
        print(f"Pattern {i}: {suggestion['correction_key']}")
        print(f"  Count: {suggestion['count']} occurrences")
        print(f"  Average score: {suggestion['average_score']:.2f}%")
        print(f"  Category: {suggestion['category_info']['category']}")
        print(f"  Subcategory: {suggestion['category_info']['subcategory']}")

        print("\n  Variants:")
        for variant in suggestion["variants"][:5]:  # Show max 5 variants
            print(f"    - {variant}")
        if len(suggestion["variants"]) > 5:
            print(f"    - ... and {len(suggestion['variants']) - 5} more")

        print("\n  Suggested new keys:")
        for key in suggestion["suggested_keys"]:
            print(f'    - "{key}"')

        print("\n  Suggested correction map entry:")
        entry = {
            "category": suggestion["category_info"]["category"],
            "subcategory": suggestion["category_info"]["subcategory"],
            "product_type": suggestion["category_info"]["product_type"],
        }
        print(f"    {json.dumps(entry)}")
        print("-" * 50)


if __name__ == "__main__":
    # When run directly, generate a report
    generate_report()
