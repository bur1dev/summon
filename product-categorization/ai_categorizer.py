import sys

print("Using Python interpreter:", sys.executable)

import json
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import requests
import logging
import re
from typing import Dict, List, Optional
import os
from datetime import datetime
from rapidfuzz import process, fuzz
import near_miss_analyzer

import dual_categories
from dual_categories import get_dual_categorization
from kroger_mappings import get_mapped_categories
from category_constraints import get_constrained_categories


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ProductCategorizer:
    def __init__(self, categories_file: str, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)

        with open(categories_file) as f:
            self.categories = json.load(f)
            self.category_lookup = {}
            self._build_category_lookup()
            self.index = None
            self.category_texts = []

            # Load training data from file if it exists, otherwise build from scratch
            training_data_file = os.path.join(
                os.path.dirname(__file__), "training_data.json"
            )
            if os.path.exists(training_data_file):
                try:
                    with open(training_data_file, "r") as f:
                        self.category_texts = json.load(f)
                    logger.info(
                        f"Loaded {len(self.category_texts)} training examples from training_data.json"
                    )
                except Exception as e:
                    logger.error(f"Error loading training data: {e}")
                    # Fall back to building category texts from scratch
                    self._build_category_texts()
            else:
                logger.info(
                    "No training_data.json found, building category texts from scratch"
                )
                self._build_category_texts()

            # Load negative examples
            self.negative_examples = []
            self.load_negative_examples()

            # Build the FAISS index with available category texts
            self._build_faiss_index()

        # Load correction map from file if it exists
        self.correction_map = {}
        # Initialize Kroger category map from kroger_mappings
        from kroger_mappings import kroger_mapping

        self.kroger_category_map = {k.lower(): True for k in kroger_mapping.keys()}
        self.unmapped_kroger_categories = set()
        correction_map_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "correction_map.json"
        )
        if os.path.exists(correction_map_file):
            try:
                with open(correction_map_file, "r") as f:
                    content = f.read().strip()
                    if content:  # Check if file has content
                        self.correction_map = json.load(f)
                        logger.info(
                            f"Loaded correction map with {len(self.correction_map)} entries"
                        )
                    else:
                        logger.warning("Correction map file is empty, using empty map")
                        self.correction_map = {}
            except Exception as e:
                logger.error(f"Error loading correction map: {e}")
                self.correction_map = {}
        else:
            logger.info("No correction map file found, using empty correction map")
            self.correction_map = {}

    def refresh_correction_map(self):
        """Reload the correction map from file"""
        correction_map_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "correction_map.json"
        )
        if os.path.exists(correction_map_file):
            try:
                with open(correction_map_file, "r") as f:
                    self.correction_map = json.load(f)
                logger.info(
                    f"Refreshed correction map with {len(self.correction_map)} entries"
                )
                return True
            except Exception as e:
                logger.error(f"Error refreshing correction map: {e}")
                return False
        return False

    def load_negative_examples(self):
        """Load negative examples of known incorrect categorizations"""
        neg_examples_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "negative_examples.json"
        )
        if os.path.exists(neg_examples_file):
            try:
                with open(neg_examples_file, "r") as f:
                    self.negative_examples = json.load(f)
                logger.info(f"Loaded {len(self.negative_examples)} negative examples")
            except Exception as e:
                logger.error(f"Error loading negative examples: {e}")
                self.negative_examples = []
        else:
            logger.info("No negative examples file found, creating new file")
            self.negative_examples = []
            try:
                with open(neg_examples_file, "w") as f:
                    json.dump([], f)
            except Exception as e:
                logger.error(f"Error creating negative examples file: {e}")

    def add_negative_example(self, product_text, category, subcategory, product_type):
        """Add a negative example to avoid this categorization in the future"""
        neg_examples_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "negative_examples.json"
        )

        example = {
            "text": product_text,
            "negative_match": [category, subcategory, product_type],
            "timestamp": datetime.now().isoformat(),
        }

        self.negative_examples.append(example)

        # Save to file
        try:
            with open(neg_examples_file, "w") as f:
                json.dump(self.negative_examples, f, indent=2)
            logger.info(
                f"Added negative example: {product_text} is NOT {category}/{subcategory}/{product_type}"
            )
            return True
        except Exception as e:
            logger.error(f"Error saving negative example: {e}")
            return False

    def _build_category_lookup(self):
        for category in self.categories:
            cat_name = category["name"]
            self.category_lookup[cat_name] = {}
            for subcategory in category["subcategories"]:
                sub_name = subcategory["name"]
                self.category_lookup[cat_name][sub_name] = set(
                    subcategory["productTypes"]
                )

    def _build_category_texts(self):
        """
        Builds the category texts from the categories data.
        This is used when no training_data.json file exists.
        """
        self.category_texts = []
        for category in self.categories:
            for subcategory in category["subcategories"]:
                if subcategory.get("gridOnly"):
                    text = f"{category['name']} {subcategory['name']}"
                    self.category_texts.append(
                        {
                            "text": text,
                            "category": category["name"],
                            "subcategory": subcategory["name"],
                            "product_type": subcategory[
                                "name"
                            ],  # Using subcategory name instead of "All"
                        }
                    )
                else:
                    for product_type in subcategory["productTypes"]:
                        base_text = f"{category['name']} {subcategory['name']}"

                        if "&" in product_type:
                            # Split compound types like "Carrots & Celery"
                            parts = [p.strip() for p in product_type.split("&")]
                            for part in parts:
                                self.category_texts.append(
                                    {
                                        "text": f"{base_text} {part}",
                                        "category": category["name"],
                                        "subcategory": subcategory["name"],
                                        "product_type": product_type,
                                    }
                                )

                        # Also add the full product type
                        self.category_texts.append(
                            {
                                "text": f"{base_text} {product_type}",
                                "category": category["name"],
                                "subcategory": subcategory["name"],
                                "product_type": product_type,
                            }
                        )
        logger.info(f"Built {len(self.category_texts)} category texts from scratch")

    def _build_faiss_index(self):
        """
        Builds the FAISS index from the category texts.
        """
        if not self.category_texts:
            logger.warning("No category texts available to build FAISS index")
            return

        texts = [item["text"] for item in self.category_texts]
        embeddings = self.model.encode(texts)
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dimension)
        faiss.normalize_L2(embeddings)
        self.index.add(embeddings)
        logger.info(f"FAISS index built with {len(texts)} embeddings")

        def clean_description(self, text: str) -> str:
            cleaned = re.sub(r"[™®©\xa0]", "", text)
            cleaned = re.sub(r"\s+", " ", cleaned)
            return cleaned.strip()

    def query_ollama(self, prompt: str) -> str:
        # Debug print
        print("\n===== PROMPT TO LLM =====")
        print(prompt)
        print("=========================\n")

        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "gemma:7b",
                "prompt": prompt,
                "stream": False,
            },
        )

        # Add this logging
        response_json = response.json()
        logger.info(f"LLM Raw Response:\n{response_json['response'][:200]}...")

        return response_json["response"]

    def _process_llm_response(self, llm_response, required_fields=None):
        try:
            # Default required fields if none specified
            if required_fields is None:
                required_fields = ["category", "subcategory", "product_type"]

            # Improved logging
            logger.info(f"Required fields for validation: {required_fields}")
            logger.info(f"FULL LLM RESPONSE: {llm_response}")

            # Extract content from code blocks if present
            import re

            code_block_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
            code_blocks = re.findall(code_block_pattern, llm_response)
            logger.info(f"Extracted code blocks: {code_blocks}")

            # Try parsing each code block first
            for block in code_blocks:
                try:
                    result = json.loads(block)
                    logger.info(f"Parsed JSON from code block: {result}")
                    if all(k in result for k in required_fields):
                        logger.info(
                            f"Successfully validated JSON with required fields: {required_fields}"
                        )
                        return result
                    else:
                        logger.info(
                            f"JSON missing required fields. Found: {list(result.keys())}, Required: {required_fields}"
                        )
                except Exception as e:
                    logger.info(f"Failed to parse code block as JSON: {e}")

            # Clean response for direct parsing
            cleaned_response = llm_response.strip()
            if cleaned_response.startswith("="):
                cleaned_response = cleaned_response[1:].strip()

            # Remove markdown code blocks
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response.replace("```json", "", 1)
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response.replace("```", "", 1)
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3].strip()

            logger.info(f"Cleaned response: {cleaned_response}")

            # Try direct JSON parsing
            try:
                result = json.loads(cleaned_response)
                logger.info(f"Parsed JSON directly: {result}")
                if all(k in result for k in required_fields):
                    logger.info(
                        f"Successfully validated direct JSON with required fields"
                    )
                    return result
                else:
                    logger.info(
                        f"Direct JSON missing required fields. Found: {list(result.keys())}"
                    )
            except json.JSONDecodeError as e:
                logger.info(f"Failed to parse cleaned response as JSON: {e}")

            # Fall back to regex matching
            json_pattern = r"\{[\s\S]*?\}"
            json_matches = re.findall(json_pattern, cleaned_response)
            logger.info(f"Regex JSON matches: {json_matches}")

            if not json_matches:
                raise ValueError("No JSON found in response")

            for potential_json in json_matches:
                try:
                    result = json.loads(potential_json)
                    logger.info(f"Parsed potential JSON match: {result}")
                    if all(k in result for k in required_fields):
                        logger.info(
                            f"Successfully validated regex JSON with required fields"
                        )
                        return result
                    else:
                        logger.info(
                            f"Regex JSON missing required fields. Found: {list(result.keys())}"
                        )
                except json.JSONDecodeError:
                    continue

            raise ValueError("No valid JSON found in matches")
        except Exception as e:
            raise ValueError(f"Invalid JSON format: {str(e)}")

    def clean_description(self, text: str) -> str:
        """Clean product description text by removing special characters and extra whitespace."""
        cleaned = re.sub(r"[™®©\xa0]", "", text)
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned.strip()

    def categorize_product(self, product: Dict) -> Dict:
        try:
            # Get exact product description
            product_text = self.clean_description(product["description"])
            logger.info(f"Categorizing product: {product_text}")
            logger.info(f"Correction map has {len(self.correction_map)} entries")

            # 1. PRODUCT ID MATCH
            if "productId" in product:
                product_id_key = f"productId:{product['productId']}"
                logger.info(f"Checking product ID: {product_id_key}")
                if product_id_key in self.correction_map:
                    logger.info(f"✅ PRODUCT ID MATCH for '{product_text}'")
                    result = self.correction_map[product_id_key].copy()

                    # Check for dual categorization
                    dual_cat = get_dual_categorization(
                        result["category"],
                        result["subcategory"],
                        result["product_type"],
                    )
                    if dual_cat:
                        # Determine product_type for dual category
                        dual_product_type = self.determine_product_type(
                            product_text,
                            dual_cat["main_category"],
                            dual_cat["subcategory"],
                        )
                        dual_cat["product_type"] = dual_product_type
                        result["dual_categorization"] = dual_cat
                        logger.info(f"Added dual categorization: {dual_cat}")

                    return result

            # 2. EXACT DESCRIPTION MATCH - case insensitive
            product_text_lower = product_text.lower()
            if product_text_lower in self.correction_map:
                logger.info(f"✅ EXACT NAME MATCH for '{product_text}'")
                result = self.correction_map[product_text_lower].copy()

                # Check for dual categorization
                dual_cat = get_dual_categorization(
                    result["category"], result["subcategory"], result["product_type"]
                )
                if dual_cat:
                    # Determine product_type for dual category
                    dual_product_type = self.determine_product_type(
                        product_text, dual_cat["main_category"], dual_cat["subcategory"]
                    )
                    dual_cat["product_type"] = dual_product_type
                    result["dual_categorization"] = dual_cat
                    logger.info(f"Added dual categorization: {dual_cat}")

                return result

            # 3. CLEAN DESCRIPTION MATCH - remove special characters
            clean_product = re.sub(r"[®™©]", "", product_text).lower()
            logger.info(f"Clean product text: '{clean_product}'")

            for key in list(self.correction_map.keys()):
                # Skip ID-based keys
                if key.startswith("id:") or key.startswith("productId:"):
                    continue

                # Clean key
                clean_key = re.sub(r"[®™©]", "", key).lower()

                # Check if key is in product text or product text is in key
                if clean_key in clean_product or clean_product in clean_key:
                    logger.info(
                        f"✅ SUBSTRING MATCH: '{clean_product}' matches '{clean_key}'"
                    )
                    result = self.correction_map[key].copy()

                    # Check for dual categorization
                    dual_cat = get_dual_categorization(
                        result["category"],
                        result["subcategory"],
                        result["product_type"],
                    )
                    if dual_cat:
                        # Determine product_type for dual category
                        dual_product_type = self.determine_product_type(
                            product_text,
                            dual_cat["main_category"],
                            dual_cat["subcategory"],
                        )
                        dual_cat["product_type"] = dual_product_type
                        result["dual_categorization"] = dual_cat
                        logger.info(f"Added dual categorization: {dual_cat}")

                    return result

            # 4. FUZZY MATCHING - find similar product names
            text_keys = [
                k for k in self.correction_map.keys() if not k.startswith("productId:")
            ]

            logger.info(
                f"Attempting fuzzy matching for '{product_text_lower}' against {len(text_keys)} keys"
            )

            if text_keys:
                try:
                    # Find best fuzzy match with score
                    result = process.extractOne(
                        product_text_lower,
                        text_keys,
                        scorer=fuzz.ratio,
                        score_cutoff=None,  # Remove cutoff to see all matches
                    )

                    if result:  # Check if result is not None
                        try:
                            best_match = result[0]
                            score = result[1]

                            logger.info(
                                f"Best fuzzy match found: '{best_match}' with score {score}%"
                            )

                            if score >= 90:  # Only use matches with high confidence
                                logger.info(
                                    f"✅ FUZZY MATCH ({score}%): '{product_text}' -> '{best_match}'"
                                )
                                result = self.correction_map[best_match].copy()

                                # Check for dual categorization
                                dual_cat = get_dual_categorization(
                                    result["category"],
                                    result["subcategory"],
                                    result["product_type"],
                                )
                                if dual_cat:
                                    # Determine product_type for dual category
                                    dual_product_type = self.determine_product_type(
                                        product_text,
                                        dual_cat["main_category"],
                                        dual_cat["subcategory"],
                                    )
                                    dual_cat["product_type"] = dual_product_type
                                    result["dual_categorization"] = dual_cat
                                    logger.info(
                                        f"Added dual categorization: {dual_cat}"
                                    )

                                return result
                            else:
                                # Log as a near miss if score is promising (65-90%)
                                if score >= 65:
                                    try:
                                        near_miss_analyzer.log_near_miss(
                                            product_text, best_match, score
                                        )
                                    except Exception as near_miss_error:
                                        logger.error(
                                            f"Error logging near miss: {near_miss_error}"
                                        )

                                logger.info(
                                    f"⚠️ Fuzzy match score {score}% below threshold (90%), not using match"
                                )
                        except Exception as e:
                            logger.error(
                                f"Error processing fuzzy match result: {e}, result: {result}"
                            )
                except Exception as e:
                    logger.error(f"Error in fuzzy matching: {e}")

            logger.info(f"❌ No correction map match found for '{product_text}'")
            # Continue with regular categorization process
            # STAGE 1: Embedding-based search
            product_embedding = self.model.encode([product_text])
            faiss.normalize_L2(product_embedding)

            # Try constrained search if Kroger categories available
            constrained_search = False
            if "categories" in product and product["categories"]:
                # Get constrained categories
                constrained_cats = get_constrained_categories(product["categories"])
                logger.info(
                    f"🔎 CONSTRAINTS: Found {len(constrained_cats)} constraint categories: {constrained_cats}"
                )

                if constrained_cats:
                    # Get indices for these categories
                    constrained_indices = []
                    for i, item in enumerate(self.category_texts):
                        if item["category"] in constrained_cats:
                            constrained_indices.append(i)

                    if constrained_indices:
                        logger.info(
                            f"🎯 CONSTRAINTS: Using {len(constrained_indices)} indices from categories {constrained_cats}"
                        )
                        constrained_search = True

                        # Get embeddings for the constrained indices
                        search_limit = min(35, len(constrained_indices))

                        # Simple approach: filter results after searching
                        D, I = self.index.search(
                            product_embedding, 250
                        )  # Get more candidates than needed

                        # Filter by both constraint and similarity threshold
                        threshold = 0.45
                        constrained_set = set(constrained_indices)
                        filtered_indices = []
                        below_threshold_count = 0

                        for i, idx in enumerate(I[0]):
                            if idx in constrained_set:
                                similarity = D[0][i]
                                if similarity > threshold:
                                    filtered_indices.append(idx)
                                else:
                                    below_threshold_count += 1

                        if len(filtered_indices) == 0:
                            logger.warning(
                                f"🚨 No candidates met threshold {threshold}. Using unfiltered constrained results"
                            )
                            # Fall back to constrained results without threshold
                            filtered_indices = [
                                idx for idx in I[0] if idx in constrained_set
                            ][:search_limit]
                        else:
                            logger.info(
                                f"✅ {len(filtered_indices)} candidates met threshold {threshold} ({below_threshold_count} filtered out)"
                            )
                            filtered_indices = filtered_indices[:search_limit]

                        # Use the filtered indices
                        all_candidates = [
                            self.category_texts[i] for i in filtered_indices
                        ]
                        logger.info(
                            f"🟢 CONSTRAINED SEARCH: Retrieved {len(all_candidates)} candidates"
                        )

            if not constrained_search:
                # Regular search (no constraints)
                logger.info("🔶 NO CONSTRAINTS: Using regular FAISS search")
                D, I = self.index.search(product_embedding, 250)
                threshold = 0.6
                filtered_indices = []
                below_threshold_count = 0

                for i, idx in enumerate(I[0]):
                    similarity = D[0][i]
                    if similarity > threshold:
                        filtered_indices.append(idx)
                    else:
                        below_threshold_count += 1

                if len(filtered_indices) == 0:
                    logger.warning(
                        f"📢 No candidates met threshold {threshold}. Using unfiltered results"
                    )
                    # Log to file
                    try:
                        with open("threshold_issues.jsonl", "a") as f:
                            f.write(
                                json.dumps(
                                    {
                                        "product_text": product_text,
                                        "kroger_categories": product.get(
                                            "categories", []
                                        ),
                                        "issue_type": "below_threshold",
                                        "details": {"threshold": threshold},
                                        "timestamp": datetime.now().isoformat(),
                                    }
                                )
                                + "\n"
                            )
                    except Exception as e:
                        logger.error(f"Failed to log threshold issue: {e}")
                    # Fall back to unfiltered results
                    filtered_indices = I[0][:35]
                elif len(filtered_indices) < 3:
                    logger.warning(
                        f"⚠️ Too few candidates ({len(filtered_indices)}) after threshold filtering, adding more"
                    )
                    # Add more candidates from top results to ensure diversity
                    for idx in I[0]:
                        if idx not in filtered_indices:
                            filtered_indices.append(idx)
                            if len(filtered_indices) >= 10:  # Cap at 10 candidates
                                break
                    logger.info(
                        f"After safety expansion: {len(filtered_indices)} candidates"
                    )
                else:
                    logger.info(
                        f"✅ {len(filtered_indices)} candidates met threshold {threshold} ({below_threshold_count} filtered out)"
                    )

                # Limit candidates to top matches (whether expanded or not)
                filtered_indices = filtered_indices[:35]

                all_candidates = [self.category_texts[i] for i in filtered_indices]
            elif len(all_candidates) == 0:
                # Emergency fallback when constrained search finds nothing
                logger.info(
                    "🚨 EMERGENCY FALLBACK: Constrained search found 0 candidates, using regular search"
                )
                D, I = self.index.search(product_embedding, 35)
                all_candidates = [self.category_texts[i] for i in I[0]]
                # Log this issue for review
                self._log_mapping_issue(
                    product_text, product.get("categories", []), "zero_candidates"
                )

            logger.info(
                f"📊 SEARCH SUMMARY: {'Constrained' if constrained_search else 'Regular'} search found {len(all_candidates)} candidates"
            )
            for i, c in enumerate(all_candidates[:15]):
                logger.info(
                    f"🏷️ Candidate {i+1}: {c['category']} → {c['subcategory']} → {c['product_type']}"
                )

            # Count frequency of category-subcategory pairs
            pair_counts = {}
            for candidate in all_candidates:
                pair = (candidate["category"], candidate["subcategory"])
                pair_counts[pair] = pair_counts.get(pair, 0) + 1

            # Get most common category-subcategory pairs (top 5)
            top_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[
                :5
            ]
            logger.info(
                f"Top category-subcategory pairs for '{product_text}': {top_pairs}"
            )

            # STAGE 2: Filter candidates by top category-subcategory pairs
            # Filter candidates by top category-subcategory pairs
            filtered_candidates = []
            for c in all_candidates:
                if (c["category"], c["subcategory"]) in [pair[0] for pair in top_pairs]:
                    # Check for negative examples
                    is_negative = False
                    for neg in self.negative_examples:
                        if (
                            (
                                product_text_lower in neg["text"].lower()
                                or neg["text"].lower() in product_text_lower
                            )
                            and c["category"] == neg["negative_match"][0]
                            and c["subcategory"] == neg["negative_match"][1]
                            and c["product_type"] == neg["negative_match"][2]
                        ):
                            is_negative = True
                            logger.info(
                                f"Skipping negative example match: {c['category']}/{c['subcategory']}/{c['product_type']}"
                            )
                            break

                    if not is_negative:
                        filtered_candidates.append(c)

            pair_candidates = filtered_candidates[:15]

            # Also keep track of traditional categories for compatibility
            category_counts = {}
            for candidate in all_candidates:
                cat = candidate["category"]
                category_counts[cat] = category_counts.get(cat, 0) + 1

            top_categories = sorted(
                category_counts.items(), key=lambda x: x[1], reverse=True
            )[:2]
            logger.info(f"Top categories for '{product_text}': {top_categories}")

            # For backward compatibility
            candidates = pair_candidates

            # Enhanced Kroger category filtering - apply to pair candidates
            if "categories" in product and product["categories"]:
                # Get mapped categories using the new mapping system
                mapped_results = get_mapped_categories(product["categories"])
                logger.info(f"🔍 Kroger mapping results: {mapped_results}")

                # Track unknown categories
                for kcat in [cat.lower() for cat in product["categories"]]:
                    if (
                        kcat not in self.kroger_category_map
                        and kcat not in self.unmapped_kroger_categories
                    ):
                        self.unmapped_kroger_categories.add(kcat)
                        logger.info(f"New Kroger category discovered: {kcat}")

                # First, try filtering by exact category and subcategory matches
                if mapped_results["category_subcategory_pairs"]:
                    exact_matches = []
                    for candidate in pair_candidates:
                        for cat, subcat in mapped_results["category_subcategory_pairs"]:
                            if (
                                candidate["category"] == cat
                                and candidate["subcategory"] == subcat
                            ):
                                exact_matches.append(candidate)
                                break

                    if exact_matches:
                        pair_candidates = exact_matches
                        candidates = pair_candidates
                        logger.info(
                            f"🧩 KROGER MATCH: Applied exact category-subcategory mapping, kept {len(pair_candidates)} candidates"
                        )

                # If no exact subcategory matches or none found, try category-level matches
                if (
                    not mapped_results["category_subcategory_pairs"]
                    or not pair_candidates
                ):
                    if mapped_results["categories"]:
                        cat_matches = [
                            c
                            for c in pair_candidates
                            if c["category"] in mapped_results["categories"]
                        ]
                        if cat_matches:
                            pair_candidates = cat_matches
                            candidates = pair_candidates
                            logger.info(
                                f"🔀 KROGER MATCH: Applied category-level mapping, kept {len(pair_candidates)} candidates"
                            )

            # Extract additional product context
            brand = product.get("brand", "")
            country_origin = product.get("countryOrigin", "Unknown")
            temperature_type = "Unknown"

            if "temperature" in product and "indicator" in product["temperature"]:
                temperature_type = product["temperature"]["indicator"]

            # STAGE 3: First LLM decision - determine category-subcategory pair

            # Initialize variables to ensure they always have values
            selected_category = None
            selected_subcategory = None
            # Build prompt for category-subcategory selection
            pair_prompt = f"""SELECT ONE category-subcategory pair for this product: "{product_text}"

            PRODUCT DETAILS:
            - Product: "{product_text}"
            - Brand: "{brand}"
            - Storage: "{temperature_type}"
            - Country Origin: "{country_origin}" 

            ⚠️ REQUIREMENTS:
            - Select ONE category-subcategory pair that best matches this product
            - Copy EXACTLY from candidates - no inventing new subcategories
            - Return ONLY a JSON with category and subcategory (no product_type yet)

            Example response format:
            {{
            "category": "[EXACT category from candidates]",
            "subcategory": "[EXACT subcategory from candidates]"
            }}

            CANDIDATES (category-subcategory pairs only):
            {json.dumps([{"category": c["category"], "subcategory": c["subcategory"]} for c in pair_candidates], indent=2)}

            CRITICAL: CHOOSE ONLY FROM THE EXACT CANDIDATES ABOVE.
            DO NOT CREATE NEW CATEGORIES OR SUBCATEGORIES.
            COPY AND PASTE FROM THE LIST ONLY.
            """

            # Make first LLM decision - which category-subcategory pair
            for attempt in range(3):
                try:
                    llm_response = self.query_ollama(pair_prompt)
                    pair_result = self._process_llm_response(
                        llm_response, ["category", "subcategory"]
                    )

                    # Validate category and subcategory exist
                    if (
                        pair_result.get("category") in self.category_lookup
                        and pair_result.get("subcategory")
                        in self.category_lookup[pair_result["category"]]
                    ):
                        selected_category = pair_result["category"]
                        selected_subcategory = pair_result["subcategory"]
                        logger.info(
                            f"Selected category-subcategory pair: {selected_category} → {selected_subcategory}"
                        )
                        break
                    else:
                        logger.error(
                            f"Invalid category-subcategory pair: {pair_result}"
                        )
                        self._log_mapping_issue(
                            product_text,
                            product.get("categories", []),
                            "invalid_category_pair",
                            {"suggested_pair": pair_result},
                        )
                        continue
                except Exception as e:
                    logger.error(
                        f"Error in category-subcategory selection (attempt {attempt+1}): {e}"
                    )
                    if attempt == 2:  # Last attempt failed
                        # Fall back to the first candidate's category-subcategory
                        selected_category = pair_candidates[0]["category"]
                        selected_subcategory = pair_candidates[0]["subcategory"]
                        logger.warning(
                            f"Falling back to first candidate pair: {selected_category} → {selected_subcategory}"
                        )

            # Check if we have valid selections after all attempts
            if selected_category is None or selected_subcategory is None:
                # Fall back to the first candidate if we have one
                if pair_candidates:
                    selected_category = pair_candidates[0]["category"]
                    selected_subcategory = pair_candidates[0]["subcategory"]
                    logger.warning(
                        f"No valid category-subcategory selected after all attempts. Falling back to: {selected_category} → {selected_subcategory}"
                    )
                else:
                    # Critical failure - no candidates at all
                    logger.error(
                        f"Critical: No category candidates found for '{product_text}'"
                    )
                    return {
                        "category": "Uncategorized",
                        "subcategory": "Unknown",
                        "product_type": "Unknown",
                    }

            # STAGE 4: Second LLM decision - determine product type
            # Get ALL product types for the selected category-subcategory pair
            available_product_types = []
            for category in self.categories:
                if category["name"] == selected_category:
                    for subcategory in category["subcategories"]:
                        if subcategory["name"] == selected_subcategory:
                            if subcategory.get("gridOnly", False):
                                # For gridOnly subcategories, use subcategory name as product_type
                                available_product_types = [
                                    {"product_type": selected_subcategory}
                                ]
                            else:
                                # Create candidates for all product types in this subcategory
                                available_product_types = [
                                    {"product_type": pt}
                                    for pt in subcategory["productTypes"]
                                ]
                            break
                    break

            # Also keep FAISS candidates for reference (they contain the actual text examples)
            type_candidates = [
                c
                for c in all_candidates
                if c["category"] == selected_category
                and c["subcategory"] == selected_subcategory
            ]
            logger.info(
                f"Found {len(type_candidates)} FAISS candidates and {len(available_product_types)} total product types for {selected_category} → {selected_subcategory}"
            )

            # Check if this is a gridOnly subcategory (which uses subcategory name as product_type)
            is_grid_only = False
            for category in self.categories:
                if category["name"] == selected_category:
                    for subcategory in category["subcategories"]:
                        if subcategory[
                            "name"
                        ] == selected_subcategory and subcategory.get(
                            "gridOnly", False
                        ):
                            is_grid_only = True
                            break
                    break

            if is_grid_only:
                # For gridOnly subcategories, use subcategory name as product_type
                final_result = {
                    "category": selected_category,
                    "subcategory": selected_subcategory,
                    "product_type": selected_subcategory,
                }
                logger.info(
                    f"GridOnly subcategory - using subcategory as product_type: {final_result}"
                )

                # Add dual categorization check here
                dual_cat = get_dual_categorization(
                    final_result["category"],
                    final_result["subcategory"],
                    final_result["product_type"],
                )

                if dual_cat:
                    dual_product_type = self.determine_product_type(
                        product_text,
                        dual_cat["main_category"],
                        dual_cat["subcategory"],
                    )
                    dual_cat["product_type"] = dual_product_type
                    final_result["dual_categorization"] = dual_cat
                    logger.info(f"Added dual categorization: {dual_cat}")

                logger.info(f"FINAL CATEGORIZATION JSON: {json.dumps(final_result)}")
                return final_result

            # Build prompt for product type selection
            type_prompt = f"""SELECT ONE product type for "{product_text}" in {selected_category} → {selected_subcategory}

            PRODUCT DETAILS:
            - Product: "{product_text}"
            - Brand: "{brand}"
            - Already categorized as: {selected_category} → {selected_subcategory}

            ⚠️ REQUIREMENTS:
            - Select ONE product type that best fits this product within its category-subcategory
            - Copy exact product_type text (no modifications)
            - Return ONLY a JSON with category, subcategory, and product_type

            Example response format:
            {{
            "category": "{selected_category}",
            "subcategory": "{selected_subcategory}",
            "product_type": "[EXACT product_type from candidates]"
            }}

            PRODUCT TYPE CANDIDATES:
            {json.dumps(available_product_types, indent=2)}

            SELECT ONE PRODUCT TYPE ONLY. Copy exactly from candidates.
            """

            # Make second LLM decision - which product type
            for attempt in range(4):
                try:
                    llm_response = self.query_ollama(type_prompt)
                    final_result = self._process_llm_response(llm_response)

                    # Validate product type exists for this category-subcategory
                    if (
                        final_result.get("category") == selected_category
                        and final_result.get("subcategory") == selected_subcategory
                        and final_result.get("product_type")
                        in self.category_lookup[selected_category][selected_subcategory]
                    ):
                        logger.info(f"Selected final categorization: {final_result}")
                        print(f"DEBUG CATEGORIZATION RESULT: {final_result}")

                        # Check for dual categorization

                        dual_cat = get_dual_categorization(
                            final_result["category"],
                            final_result["subcategory"],
                            final_result["product_type"],
                        )

                        if dual_cat:
                            # Determine product_type for dual category
                            dual_product_type = self.determine_product_type(
                                product_text,
                                dual_cat["main_category"],
                                dual_cat["subcategory"],
                            )
                            dual_cat["product_type"] = dual_product_type
                            final_result["dual_categorization"] = dual_cat
                            logger.info(f"Added dual categorization: {dual_cat}")

                        logger.info(
                            f"FINAL CATEGORIZATION JSON: {json.dumps(final_result)}"
                        )

                        return final_result
                    else:
                        logger.error(f"Invalid product type selection: {final_result}")
                        continue
                except Exception as e:
                    logger.error(
                        f"Error in product type selection (attempt {attempt+1}): {e}"
                    )

            # After all attempts, fall back to the first valid product type
            if type_candidates:
                fallback_result = {
                    "category": selected_category,
                    "subcategory": selected_subcategory,
                    "product_type": type_candidates[0]["product_type"],
                }
                logger.warning(
                    f"Falling back to first FAISS product type: {fallback_result}"
                )
                print(f"DEBUG CATEGORIZATION RESULT: {fallback_result}")

                # Check for dual categorization

                dual_cat = get_dual_categorization(
                    fallback_result["category"],
                    fallback_result["subcategory"],
                    fallback_result["product_type"],
                )

                if dual_cat:
                    # Determine product_type for dual category
                    dual_product_type = self.determine_product_type(
                        product_text, dual_cat["main_category"], dual_cat["subcategory"]
                    )
                    dual_cat["product_type"] = dual_product_type
                    fallback_result["dual_categorization"] = dual_cat
                    logger.info(f"Added dual categorization: {dual_cat}")

                logger.info(f"FINAL CATEGORIZATION JSON: {json.dumps(fallback_result)}")
                return fallback_result
            elif available_product_types:
                fallback_result = {
                    "category": selected_category,
                    "subcategory": selected_subcategory,
                    "product_type": available_product_types[0]["product_type"],
                }
                logger.warning(
                    f"Falling back to first available product type: {fallback_result}"
                )
                logger.info(f"FINAL CATEGORIZATION JSON: {json.dumps(fallback_result)}")
                return fallback_result

            # If no type candidates, log failure and return the first pair candidate
            try:
                with open("failed_categorizations.jsonl", "a") as f:
                    f.write(
                        json.dumps(
                            {
                                "description": product_text,
                                "attempted_category": {
                                    "category": selected_category,
                                    "subcategory": selected_subcategory,
                                    "product_type": "Unknown",
                                },
                                "timestamp": str(datetime.now()),
                                "kroger_category": (
                                    product.get("categories", [""])[0]
                                    if product.get("categories")
                                    else ""
                                ),
                            }
                        )
                        + "\n"
                    )
            except Exception as e:
                logger.error(f"Failed to log categorization failure: {e}")

            final_result = pair_candidates[0]
            print(f"DEBUG CATEGORIZATION RESULT: {final_result}")

            # Check for dual categorization

            dual_cat = get_dual_categorization(
                final_result["category"],
                final_result["subcategory"],
                final_result["product_type"],
            )

            if dual_cat:
                # Determine product_type for dual category
                dual_product_type = self.determine_product_type(
                    product_text, dual_cat["main_category"], dual_cat["subcategory"]
                )
                dual_cat["product_type"] = dual_product_type
                final_result["dual_categorization"] = dual_cat
                logger.info(f"Added dual categorization: {dual_cat}")

            logger.info(f"FINAL CATEGORIZATION JSON: {json.dumps(final_result)}")

            return final_result
        except Exception as e:
            product_text = self.clean_description(product["description"])
            logger.error(f"Critical categorization error for {product_text}: {e}")
            # Log the failure
            try:
                with open("failed_categorizations.jsonl", "a") as f:
                    f.write(
                        json.dumps(
                            {
                                "description": product_text,
                                "error_message": str(e),
                                "kroger_categories": product.get("categories", []),
                                "timestamp": str(datetime.now()),
                            }
                        )
                        + "\n"
                    )
            except Exception as log_error:
                logger.error(f"Failed to log categorization failure: {log_error}")

            # Return uncategorized
            return {
                "category": "Uncategorized",
                "subcategory": "Unknown",
                "product_type": "Unknown",
            }

    def determine_product_type(self, product_text, category, subcategory):
        """
        Determine the appropriate product type within the given category and subcategory.
        Uses AI to select the best product type without going through the full categorization pipeline.
        """
        # Get available product types for this category/subcategory
        available_product_types = []
        for cat in self.categories:
            if cat["name"] == category:
                for subcat in cat["subcategories"]:
                    if subcat["name"] == subcategory:
                        if subcat.get("gridOnly", False):
                            return subcategory  # For gridOnly subcategories
                        else:
                            available_product_types = subcat["productTypes"]
                        break
                break

        if not available_product_types:
            logger.warning(f"No product types found for {category} → {subcategory}")
            return None

        # Simple string matching as backup method
        backup_match = None
        product_text_lower = product_text.lower()
        for pt in available_product_types:
            if pt.lower() in product_text_lower:
                backup_match = pt
                logger.info(f"Found backup match: {pt} in {product_text}")
                break

        # Try LLM approach with retries
        for attempt in range(3):
            try:
                # Create prompt for LLM to select product type
                prompt = f"""CLASSIFY THIS PRODUCT: "{product_text}"

                ⚠️ REQUIREMENTS:
                - Select ONE product type from the list below for this product in {category} → {subcategory}
                - Copy EXACTLY from the product types list - no inventing new types
                - Return ONLY a JSON object with ONLY a "product_type" field
                - DO NOT include markdown code blocks, explanations, justifications, or additional text
                - DO NOT start your response with "="

                AVAILABLE PRODUCT TYPES:
                {json.dumps(available_product_types, indent=2)}

                RETURN FORMAT (EXACTLY THIS FORMAT AND NOTHING ELSE):
                {{
                "product_type": "[EXACT product type from the list]"
                }}

                CRITICAL: YOUR ENTIRE RESPONSE MUST BE VALID JSON. NO EXPLANATIONS, NO MARKDOWN.
                """

                # Get LLM selection
                llm_response = self.query_ollama(prompt)
                result = self._process_llm_response(llm_response, ["product_type"])
                selected_type = result.get("product_type")

                # Validate selection
                if selected_type in available_product_types:
                    logger.info(
                        f"LLM selected valid product_type: {selected_type} (attempt {attempt+1})"
                    )
                    return selected_type
                else:
                    logger.warning(
                        f"LLM returned invalid product_type: {selected_type} (attempt {attempt+1})"
                    )
            except Exception as e:
                logger.error(
                    f"Error determining product type (attempt {attempt+1}): {e}"
                )

            # Don't immediately retry on last attempt
            if attempt < 2:
                logger.info(f"Retrying product type selection (attempt {attempt+2})")

        # Fallbacks (in order of preference)
        if backup_match:
            logger.info(
                f"Using string match fallback: {backup_match} for {product_text}"
            )
            return backup_match

        # Last resort: first available type
        logger.warning(
            f"Using first available type fallback for {product_text}: {available_product_types[0]}"
        )
        return available_product_types[0] if available_product_types else None

    def _validate_categorization(self, cat: Dict) -> bool:
        try:
            # Normalize category names to handle HTML entities and whitespace
            if "category" in cat:
                cat["category"] = cat["category"].strip()
            if "subcategory" in cat:
                cat["subcategory"] = cat["subcategory"].replace("&amp;", "&").strip()
            if "product_type" in cat:
                cat["product_type"] = cat["product_type"].replace("&amp;", "&").strip()

            # Check category exists
            if cat["category"] not in self.category_lookup:
                logger.warning(f"Invalid category: {cat['category']}")
                return False

            # Check subcategory exists
            if cat["subcategory"] not in self.category_lookup[cat["category"]]:
                logger.warning(
                    f"Invalid subcategory: '{cat['subcategory']}' not in {list(self.category_lookup[cat['category']].keys())}"
                )
                return False

            # Special case for "gridOnly" subcategories
            # If the subcategory has an empty product_types list
            if not self.category_lookup[cat["category"]][cat["subcategory"]]:
                # For gridOnly subcategories, product_type should match subcategory name
                return cat["product_type"] == cat["subcategory"]

            # Regular validation for subcategories with product types
            if (
                cat["product_type"]
                not in self.category_lookup[cat["category"]][cat["subcategory"]]
            ):
                logger.warning(
                    f"Invalid product_type: '{cat['product_type']}' not in {self.category_lookup[cat['category']][cat['subcategory']]}"
                )
                return False

            return True
        except KeyError as e:
            logger.warning(f"KeyError in validation: {str(e)}")
            return False

    def batch_categorize(self, products: List[Dict], batch_size: int = 5) -> List[Dict]:
        categorized = []
        total = len(products)

        for i in range(0, total, batch_size):
            batch = products[i : i + batch_size]
            logger.info(
                f"Processing batch {i//batch_size + 1}/{(total-1)//batch_size + 1}"
            )

            # Process batch
            batch_results = []
            for product in batch:
                try:
                    categorization = self.categorize_product(product)
                    product.update(categorization)
                    batch_results.append(product)
                except Exception as e:
                    logger.error(
                        f"Error categorizing product {product.get('description', '')}: {e}"
                    )
                    # Add with basic categorization if it fails
                    product.update(
                        {
                            "category": "Uncategorized",
                            "subcategory": "Unknown",
                            "product_type": "Unknown",
                        }
                    )
                    batch_results.append(product)

            categorized.extend(batch_results)

            # Force garbage collection
            import gc

            gc.collect()

            # Small delay to allow memory to be released
            import time

            time.sleep(0.5)

        return categorized

    def convert_failures_to_reports(self):
        """
        Converts entries in failed_categorizations.jsonl to the format used in
        reported_categorizations.jsonl for admin review.

        Returns:
            int: Number of failures converted to reports
        """
        failures_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "failed_categorizations.jsonl"
        )
        reports_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "reported_categorizations.jsonl"
        )

        if not os.path.exists(failures_file):
            logger.warning("No failed categorizations file found")
            return 0

        # Read existing reports to avoid duplicates
        existing_reports = set()
        if os.path.exists(reports_file):
            try:
                with open(reports_file, "r") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        report = json.loads(line)
                        # Use product description as unique identifier
                        if "product" in report and "name" in report["product"]:
                            existing_reports.add(report["product"]["name"])
            except Exception as e:
                logger.error(f"Error reading existing reports: {e}")

        # Read failures
        converted_count = 0
        with open(failures_file, "r") as f_in:
            failures = [json.loads(line) for line in f_in if line.strip()]

        new_reports = []
        for failure in failures:
            # Skip if already reported
            if failure["description"] in existing_reports:
                continue

            # Try to find image URL for the product
            image_url = None
            try:
                # Look for product in categorized_products.json
                products_file = os.path.join(
                    os.path.dirname(os.path.abspath(__file__)),
                    "categorized_products.json",
                )
                if os.path.exists(products_file):
                    with open(products_file, "r") as f:
                        categorized_products = json.load(f)
                        # Search for matching product by description
                        for product in categorized_products:
                            if product.get("description") and (
                                product["description"].lower()
                                == failure["description"].lower()
                                or failure["description"].lower()
                                in product["description"].lower()
                            ):
                                image_url = product.get("image_url")
                                if image_url:
                                    logger.info(
                                        f"Found image for {failure['description']}"
                                    )
                                    break
            except Exception as e:
                logger.error(f"Error looking up product image: {e}")

            # Convert to report format
            report = {
                "product": {
                    "name": failure["description"],
                    "price": 0,  # Default values
                    "size": "Unknown",
                    "stocks_status": "UNKNOWN",
                    "category": failure.get("kroger_category", "Unknown"),
                    "subcategory": "Unknown",
                    "product_type": "Unknown",
                    "image_url": image_url,  # Add the image URL if found
                },
                "currentCategory": {
                    "category": failure.get("kroger_category", "Unknown"),
                    "subcategory": "Unknown",
                    "product_type": "Unknown",
                },
                "suggestedCategory": None,  # Admin will fill this in
                "notes": "System-detected categorization failure",
                "timestamp": datetime.now().isoformat(),
                "server_timestamp": datetime.now().isoformat(),
                "status": "pending",
                "source": "system",  # Indicate this is system-generated
            }

            # Add attempted category if available
            if "attempted_category" in failure and failure["attempted_category"]:
                report["currentCategory"] = {
                    "category": failure["attempted_category"].get(
                        "category", "Unknown"
                    ),
                    "subcategory": failure["attempted_category"].get(
                        "subcategory", "Unknown"
                    ),
                    "product_type": failure["attempted_category"].get(
                        "product_type", "Unknown"
                    ),
                }

            new_reports.append(report)
            existing_reports.add(failure["description"])
            converted_count += 1

        # Append new reports to the reports file
        if new_reports:
            with open(reports_file, "a") as f_out:
                for report in new_reports:
                    f_out.write(json.dumps(report) + "\n")

        # Optionally, clear the failures file after processing
        if converted_count > 0:
            with open(failures_file, "w") as f:
                pass  # Clear the file

        return converted_count

    def _log_mapping_issue(
        self, product_text, kroger_categories, issue_type, details=None
    ):
        """Log issues with category mappings for later analysis"""
        try:
            issue_log_file = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "mapping_issues.jsonl"
            )

            issue = {
                "product_text": product_text,
                "kroger_categories": kroger_categories,
                "issue_type": issue_type,  # zero_candidates, invalid_category, etc.
                "details": details,
                "timestamp": datetime.now().isoformat(),
            }

            with open(issue_log_file, "a") as f:
                f.write(json.dumps(issue) + "\n")

            logger.info(f"🔴 Logged mapping issue: {issue_type} for {product_text}")
        except Exception as e:
            logger.error(f"Error logging mapping issue: {e}")


if __name__ == "__main__":
    import sys

    # Only run this code when directly executing this script, not when imported
    if not any("test.py" in arg for arg in sys.argv):
        categorizer = ProductCategorizer("categories.json")
        try:
            with open("products.json") as f:
                products = json.load(f)
            categorized_products = categorizer.batch_categorize(products)
            with open("categorized_products.json", "w") as f:
                json.dump(categorized_products, f, indent=2)
        except FileNotFoundError:
            logger.warning("products.json not found - skipping batch categorization")
