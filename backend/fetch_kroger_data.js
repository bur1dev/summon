import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Use import for ESM
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const LOCATION_ID_ARG_INDEX = 2; // Expected position of locationId in command line args
const MAX_PAGES_PER_TERM = 6; // Corresponds to start <= 300 with limit=50
const API_LIMIT_BUFFER = 10; // Stop N requests before the hard limit
const REQUEST_DELAY_MS = 400; // Delay between product API calls
const KROGER_API_DAILY_LIMIT = 10000;
// --- End Configuration ---


// --- Global Token Variables ---
let accessToken = null;
let tokenExpiresAt = null;
// --- End Global Token Variables ---


// --- Paste your searchTerms array here ---
const searchTerms = [
    // Initial User Examples + Basics
    'grapes', 'produce', 'apples', 'eggs', 'milk', 'yogurt', 'bread', 'fruit', 'vegetables', 'basil', 'soda', 'sprite', 'water', 'cheese', 'chicken', 'beef', 'coffee', 'cereal', 'chips', 'cookies', 'ice cream', 'pizza', 'shampoo', 'toilet paper', 'laundry detergent',

    // Produce
    'fresh fruits', 'berries', 'strawberries', 'blueberries', 'organic strawberries', 'raspberries', 'blackberries', 'red grapes', 'green grapes', 'seedless grapes', 'gala apples', 'honeycrisp apples', 'fuji apples', 'granny smith apples', 'organic apples', 'oranges', 'navel oranges', 'grapefruit', 'melon', 'watermelon', 'cantaloupe', 'peaches', 'plums', 'bananas', 'organic bananas', 'mango', 'pineapple', 'avocado', 'hass avocado', 'pears', 'bartlett pears', 'lemons', 'limes', 'pre-cut fruit', 'pomegranates',
    'fresh vegetables', 'leafy greens', 'spinach', 'Simple Truth organic spinach', 'romaine lettuce', 'kale', 'iceberg lettuce', 'potatoes', 'russet potatoes', 'sweet potatoes', 'yams', 'yukon gold potatoes', 'broccoli', 'cauliflower', 'broccoli florets', 'tomatoes', 'roma tomatoes', 'vine tomatoes', 'grape tomatoes', 'cherry tomatoes', 'organic tomatoes', 'carrots', 'baby carrots', 'celery', 'bell peppers', 'green peppers', 'red peppers', 'onions', 'yellow onions', 'red onions', 'garlic', 'fresh garlic', 'mushrooms', 'white mushrooms', 'cremini mushrooms', 'portobello mushrooms', 'squash', 'zucchini', 'butternut squash', 'cucumbers', 'english cucumbers', 'green beans', 'peas', 'snap peas', 'asparagus', 'corn', 'sweet corn', 'brussel sprouts', 'beets', 'radishes', 'mixed vegetables', 'eggplant', 'sprouts', 'alfalfa sprouts',
    'herbs', 'fresh basil', 'fresh parsley', 'fresh mint', 'fresh cilantro', 'chives', 'dill', 'rosemary', 'thyme',

    // Beverages
    'beverages', 'soft drinks', 'coke', 'coca-cola', 'pepsi', 'diet coke', 'diet pepsi', 'dr pepper', '7up', 'ginger ale', 'root beer',
    'water', 'sparkling water', 'bottled water', 'Kroger water', 'Arrowhead water', 'Dasani', 'Aquafina', 'flavored water', 'La Croix', 'Perrier', 'San Pellegrino',
    'coffee', 'coffee pods', 'k-cups', 'Keurig pods', 'ground coffee', 'Kroger coffee', 'Folgers coffee', 'Starbucks ground coffee', 'whole bean coffee', 'Starbucks whole bean', 'instant coffee', 'coffee drinks', 'cold brew coffee', 'coffee filters',
    'juice', 'orange juice', 'Tropicana orange juice', 'Simply Orange', 'apple juice', 'grape juice', 'cranberry juice', 'Ocean Spray cranberry juice', 'smoothie', 'Naked Juice', 'pressed juice', 'coconut water', 'vegetable juice', 'V8 juice', 'juice boxes', 'Capri Sun',
    'energy drinks', 'Red Bull', 'Monster Energy', 'energy shots', '5-hour energy',
    'milk', 'dairy milk', 'whole milk', '2% milk', 'Kroger 2% milk', 'skim milk', 'lactose-free milk', 'Lactaid', 'plant-based milk', 'almond milk', 'Silk almond milk', 'oat milk', 'Oatly', 'soy milk', 'flavored milk', 'chocolate milk',
    'tea', 'bottled tea', 'Lipton iced tea', 'Arizona green tea', 'leaf tea', 'black tea', 'green tea', 'herbal tea', 'tea bags', 'Bigelow tea', 'Celestial Seasonings tea', 'tea pods',
    'sports drinks', 'Gatorade', 'Powerade',
    'protein drinks', 'Muscle Milk', 'Ensure', 'Premier Protein',
    'kombucha', 'GTs Kombucha',
    'drink mixes', 'Crystal Light', 'Kool-Aid', 'hot cocoa mix', 'Swiss Miss',
    'mixers', 'tonic water', 'club soda', 'ginger beer', 'margarita mix', 'bloody mary mix', 'non-alcoholic beer', 'non-alcoholic wine',

    // Wine (Examples - Actual availability varies)
    'wine', 'red wine', 'Cabernet Sauvignon', 'Pinot Noir', 'Merlot', 'Malbec', 'red blend',
    'white wine', 'Chardonnay', 'Kendall Jackson Chardonnay', 'Pinot Grigio', 'Sauvignon Blanc', 'Moscato', 'Barefoot Moscato', 'Riesling',
    'champagne', 'sparkling wine', 'prosecco', 'La Marca Prosecco', 'sparkling rose',
    'rose wine', 'white zinfandel',
    'dessert wine', 'sake',

    // Snacks & Candy
    'snacks', 'candy', 'chocolate', 'chocolate candies', 'M&Ms', 'Reeses Peanut Butter Cups', 'Snickers', 'Hersheys bar', 'gummy candies', 'Haribo gummy bears', 'sour patch kids', 'hard candies', 'lollipops',
    'chips', 'potato chips', 'Lays potato chips', 'Ruffles', 'kettle chips', 'Cape Cod chips', 'tortilla chips', 'Tostitos tortilla chips', 'Doritos', 'cheese puffs', 'Cheetos', 'vegetable chips', 'pita chips', 'Stacys Pita Chips',
    'snack bars', 'protein bars', 'Quest bars', 'Clif Bars', 'granola bars', 'Nature Valley granola bars', 'Kind bars', 'fruit bars',
    'cookies', 'sweet treats', 'Oreos', 'Chips Ahoy', 'Kroger cookies', 'brownies',
    'nuts', 'trail mix', 'almonds', 'peanuts', 'cashews', 'Planters nuts', 'pistachios', 'walnuts',
    'crackers', 'Ritz crackers', 'Triscuits', 'Wheat Thins', 'saltine crackers',
    'jerky', 'beef jerky', 'Jack Links jerky', 'turkey jerky',
    'popcorn', 'pretzels', 'microwave popcorn', 'Orville Redenbacher popcorn', 'SkinnyPop', 'Rold Gold pretzels',
    'fruit snacks', 'Welchs fruit snacks', 'Gushers', 'rice cakes', 'squeeze pouches', 'GoGo Squeez applesauce',
    'dips', 'hummus', 'Sabra hummus', 'salsa', 'Pace salsa', 'Tostitos salsa', 'guacamole', 'fresh guacamole', 'ranch dip', 'french onion dip', 'cheese dip', 'spinach dip',
    'dried fruit', 'raisins', 'dried cranberries', 'dried apricots',
    'applesauce', 'Motts applesauce', 'fruit cups', 'Dole fruit cups',
    'gum', 'mints', 'Trident gum', 'Orbit gum', 'Altoids',
    'pudding', 'jello', 'Snack Pack pudding', 'Jell-O gelatin',

    // Meat & Seafood
    'meat', 'seafood',
    'beef', 'steak', 'ribeye steak', 'sirloin steak', 'new york strip', 'ground beef', '80/20 ground beef', '90/10 ground beef', 'organic ground beef', 'beef patties', 'beef roast', 'beef ribs',
    'chicken', 'chicken breast', 'boneless skinless chicken breast', 'organic chicken breast', 'Heritage Farm chicken breast', 'chicken thighs', 'whole chicken', 'rotisserie chicken', 'chicken wings', 'chicken drumsticks', 'ground chicken',
    'fish', 'salmon', 'fresh salmon', 'frozen salmon', 'atlantic salmon', 'sockeye salmon', 'swordfish', 'cod', 'tilapia', 'tuna steak',
    'pork', 'pork chops', 'bacon', 'Kroger bacon', 'Oscar Mayer bacon', 'pork tenderloin', 'pork roast', 'pork ribs', 'ground pork', 'pork sausage',
    'turkey', 'ground turkey', 'turkey breast', 'turkey bacon',
    'shellfish', 'shrimp', 'frozen shrimp', 'raw shrimp', 'cooked shrimp', 'scallops', 'crab', 'lobster', 'oysters', 'clams', 'mussels',
    'hot dogs', 'sausages', 'Oscar Mayer hot dogs', 'Ball Park franks', 'italian sausage', 'bratwurst', 'Johnsonville brats',
    'lamb', 'lamb chops',
    'plant-based meat', 'veggie burgers', 'Beyond Meat', 'Impossible Burger', 'tofu', 'firm tofu', 'tempeh', 'meat alternatives', 'plant-based sausage',

    // Frozen
    'frozen food', 'frozen meals', 'frozen pizza', 'DiGiorno pizza', 'Tombstone pizza', 'Lean Cuisine', 'Stouffers lasagna', 'frozen burritos', 'pot pies', 'frozen asian meals', 'frozen mexican meals', 'frozen italian meals',
    'ice cream', 'popsicles', 'Ben & Jerrys ice cream', 'Haagen-Dazs ice cream', 'Private Selection ice cream', 'Kroger ice cream', 'ice cream sandwiches', 'ice cream cones', 'frozen yogurt', 'sorbet', 'gelato',
    'frozen snacks', 'pizza rolls', 'Totinos pizza rolls', 'taquitos', 'french fries', 'frozen fries', 'Ore-Ida fries', 'chicken strips', 'chicken nuggets', 'Tyson chicken nuggets', 'mozzarella sticks', 'dumplings', 'egg rolls', 'frozen chicken wings', 'corn dogs', 'tater tots', 'onion rings',
    'frozen breakfast', 'breakfast sandwiches', 'frozen waffles', 'Eggo waffles', 'frozen pancakes', 'hash browns', 'frozen french toast',
    'frozen meat', 'frozen chicken breast', 'frozen seafood', 'frozen shrimp', 'frozen fish fillets', 'frozen burgers', 'frozen turkey', 'frozen meat alternatives',
    'frozen vegetables', 'frozen mixed vegetables', 'frozen broccoli', 'frozen green beans', 'frozen corn', 'frozen peas', 'frozen spinach', 'Birds Eye frozen vegetables',
    'frozen fruits', 'frozen berries', 'frozen mixed berries', 'frozen blueberries', 'frozen mango', 'frozen strawberries', 'frozen smoothie mix',
    'frozen desserts', 'frozen pies', 'Marie Callenders pie', 'frozen cheesecake', 'frozen pastries', 'pie crusts', 'whipped topping', 'Cool Whip',
    'frozen bread', 'frozen dough', 'frozen biscuits', 'Pillsbury biscuits', 'frozen garlic bread', 'Texas Toast', 'frozen pizza crust',
    'ice', 'bagged ice',
    'frozen juice concentrate',

    // Dairy & Eggs
    'dairy', 'eggs', 'large eggs', 'Kroger eggs', 'cage free eggs', 'organic eggs', 'egg whites',
    'cheese', 'cheddar cheese', 'Kroger cheddar', 'Tillamook cheddar', 'shredded cheddar', 'sliced cheddar', 'parmesan cheese', 'shredded parmesan', 'mozzarella cheese', 'shredded mozzarella', 'sliced provolone', 'american cheese', 'Kraft singles', 'brie cheese', 'feta cheese', 'goat cheese', 'blue cheese', 'swiss cheese', 'ricotta cheese', 'gouda cheese', 'cream cheese', 'Philadelphia cream cheese', 'cottage cheese', 'string cheese', 'dairy-free cheese',
    'milk', 'whole milk', '2% milk', 'skim milk', 'organic milk', 'Horizon Organic milk', 'lactose-free milk', 'Lactaid milk', 'chocolate milk',
    'yogurt', 'greek yogurt', 'Chobani greek yogurt', 'Fage greek yogurt', 'traditional yogurt', 'Yoplait yogurt', 'Dannon yogurt', 'yogurt drinks', 'dairy-free yogurt', 'kefir',
    'butter', 'salted butter', 'unsalted butter', 'Kroger butter', 'Land O Lakes butter', 'dairy free butter', 'margarine', 'ghee',
    'coffee creamer', 'Coffee Mate creamer', 'International Delight creamer', 'half & half',
    'sour cream', 'Daisy sour cream',
    'heavy cream', 'whipping cream', 'whipped cream', 'Reddi-wip', 'buttermilk',

    // Prepared Foods (Deli/Ready Meals - names vary greatly by store)
    'prepared foods', 'sandwiches', 'wraps', 'sushi', 'california roll', 'poke bowl', 'prepared meals', 'macaroni and cheese', 'mashed potatoes', 'prepared salads', 'green salad', 'caesar salad', 'potato salad', 'chicken salad', 'pasta salad', 'fried chicken', 'rotisserie chicken', 'prepared soup', 'snack packs', 'deli platters', 'cheese tray', 'meat and cheese tray',

    // Liquor (Examples - Actual availability varies)
    'liquor', 'whiskey', 'bourbon', 'Jim Beam', 'Makers Mark', 'scotch', 'Johnnie Walker', 'american whiskey', 'Jack Daniels', 'irish whiskey', 'Jameson', 'rye whiskey',
    'vodka', 'Smirnoff vodka', 'Titos vodka', 'Absolut vodka', 'flavored vodka',
    'canned cocktails', 'White Claw', 'Truly', 'High Noon',
    'tequila', 'Jose Cuervo', 'Patron', 'silver tequila', 'reposado tequila',
    'gin', 'Tanqueray gin', 'Bombay Sapphire gin',
    'rum', 'Bacardi rum', 'Captain Morgan spiced rum',
    'brandy', 'cognac', 'Hennessy',
    'mezcal', 'liqueurs', 'Baileys Irish Cream', 'Kahlua',

    // Floral
    'flowers', 'roses', 'bouquet', 'plants', 'indoor plants', 'orchids', 'potted herbs',

    // Household
    'household supplies', 'paper goods', 'toilet paper', 'Charmin toilet paper', 'Scott toilet paper', 'paper towels', 'Bounty paper towels', 'Viva paper towels', 'tissues', 'Kleenex tissues', 'Puffs tissues', 'napkins', 'wet wipes', 'baby wipes', 'Clorox wipes', 'Lysol wipes',
    'cleaning supplies', 'all purpose cleaner', 'Windex', 'bathroom cleaner', 'Scrubbing Bubbles', 'toilet bowl cleaner', 'dish soap', 'Dawn dish soap', 'Palmolive dish soap', 'dishwasher detergent', 'Cascade dishwasher pods', 'Finish dishwasher tabs', 'disinfectant spray', 'Lysol spray', 'kitchen cleaner', 'floor cleaner', 'Swiffer refills', 'laundry detergent', 'Tide laundry detergent', 'Gain laundry detergent', 'fabric softener', 'Downy fabric softener', 'dryer sheets', 'Bounce dryer sheets', 'bleach', 'Clorox bleach', 'stain remover', 'OxiClean',
    'trash bags', 'Glad trash bags', 'Hefty trash bags', 'kitchen trash bags', 'tall kitchen bags',
    'cleaning tools', 'sponges', 'Scotch-Brite sponges', 'mops', 'Swiffer mop', 'brooms', 'dustpan', 'rubber gloves', 'microfiber cloths',
    'foil', 'plastic wrap', 'Reynolds Wrap aluminum foil', 'Saran Wrap', 'parchment paper', 'Ziploc bags', 'storage bags', 'sandwich bags', 'freezer bags',
    'candles', 'air fresheners', 'Glade air freshener', 'Febreze',
    'housewares', 'batteries', 'AA batteries', 'AAA batteries', 'Duracell batteries', 'Energizer batteries', 'light bulbs', 'LED light bulbs', 'lighters', 'matches', 'glue', 'tape', 'scotch tape', 'duct tape',
    'pest control', 'bug spray', 'ant traps', 'mouse traps', 'Raid', 'Off bug spray',

    // Bakery
    'bakery', 'fresh bread', 'sliced bread', 'whole wheat bread', 'Wonder Bread', 'sourdough bread', 'white bread', 'baguette', 'french bread', 'rye bread', 'ciabatta', 'hamburger buns', 'hot dog buns', 'dinner rolls', 'croissants', 'muffins', 'blueberry muffins', 'donuts', 'Krispy Kreme donuts', 'cinnamon rolls', 'scones',
    'bakery cookies', 'chocolate chip cookies', 'brownies',
    'cakes', 'birthday cake', 'cupcakes', 'pies', 'apple pie', 'pumpkin pie', 'cheesecake',
    'bagels', 'Thomas english muffins', 'english muffins',
    'tortillas', 'flour tortillas', 'corn tortillas', 'Mission tortillas', 'flatbread', 'pita bread',
    'frozen baked goods',

    // Deli
    'deli meat', 'sliced turkey', 'Boars Head turkey', 'sliced ham', 'Boars Head ham', 'roast beef', 'salami', 'prosciutto', 'pepperoni', 'bologna',
    'deli cheese', 'sliced cheddar', 'sliced provolone', 'sliced swiss cheese', 'american cheese slices', 'Kroger deli cheese',
    'olives', 'kalamata olives', 'green olives', 'deli dips', 'spinach artichoke dip', 'deli salsa', 'deli guacamole', 'hummus',
    'meat and cheese combos', 'lunchables',
    'deli tofu', 'deli meat alternatives',

    // Canned Goods & Soups
    'canned goods', 'soup', 'canned soup', 'Campbells soup', 'Progresso soup', 'tomato soup', 'chicken noodle soup', 'instant soup', 'ramen noodles', 'Maruchan ramen',
    'canned fish', 'canned tuna', 'Starkist tuna', 'canned salmon', 'sardines', 'anchovies',
    'broth', 'stock', 'chicken broth', 'Swanson chicken broth', 'beef broth', 'vegetable broth', 'bone broth',
    'canned fruit', 'canned peaches', 'canned pineapple', 'canned pears', 'canned mandarin oranges', 'cranberry sauce', 'applesauce',
    'canned beans', 'canned black beans', 'canned kidney beans', 'canned pinto beans', 'canned garbanzo beans', 'chickpeas', 'refried beans', 'baked beans', 'Bushs baked beans',
    'canned meat', 'canned chicken', 'Spam', 'corned beef',
    'canned vegetables', 'canned corn', 'canned green beans', 'canned peas', 'canned mushrooms', 'canned artichoke hearts', 'canned pumpkin', 'canned diced tomatoes', 'canned crushed tomatoes', 'canned tomato sauce', 'canned tomato paste', 'Rotel diced tomatoes',
    'canned coconut milk',

    // Beer (Examples - Actual availability varies)
    'beer', 'lager', 'Budweiser', 'Coors Light', 'Michelob Ultra', 'Corona', 'Heineken',
    'IPA', 'India Pale Ale', 'Sierra Nevada Pale Ale', 'Lagunitas IPA',
    'light beer', 'Bud Light', 'Miller Lite', 'Coors Light',
    'ale', 'Blue Moon Belgian White',
    'non-alcoholic beer', 'Heineken 0.0',
    'beer variety pack', 'stout', 'Guinness stout',
    'craft beer',

    // Pets
    'pet supplies', 'dog food', 'Purina dog food', 'Blue Buffalo dog food', 'dry dog food', 'wet dog food', 'dog treats', 'Milk-Bone dog biscuits', 'dog toys',
    'cat food', 'Purina cat food', 'Friskies cat food', 'dry cat food', 'wet cat food', 'cat litter', 'Tidy Cats litter', 'cat treats', 'Temptations cat treats', 'cat toys',
    'fish food', 'bird seed',

    // Breakfast
    'breakfast food', 'cereal', 'Cheerios', 'Frosted Flakes', 'Special K', 'Raisin Bran', 'Kroger cereal', 'kids cereal',
    'granola', 'Kashi granola', 'Kind granola',
    'oatmeal', 'instant oatmeal', 'Quaker Oats oatmeal', 'rolled oats', 'steel cut oats', 'grits',
    'jam', 'jelly', 'preserves', 'Smuckers strawberry jam', 'grape jelly', 'marmalade',
    'nut butter', 'peanut butter', 'Jif peanut butter', 'Skippy peanut butter', 'almond butter', 'hazelnut spread', 'Nutella', 'sunflower butter',
    'breakfast bars', 'Nutri-Grain bars', 'Belvita breakfast biscuits',
    'pancake mix', 'waffle mix', 'Bisquick', 'Aunt Jemima pancake mix', // (Note: Brand name changed to Pearl Milling Company)
    'maple syrup', 'Aunt Jemima syrup', // (Note: Brand name changed to Pearl Milling Company)
    'toaster pastries', 'Pop-Tarts',

    // Condiments & Sauces
    'condiments', 'sauces',
    'salad dressing', 'ranch dressing', 'Hidden Valley Ranch', 'italian dressing', 'Wish-Bone italian', 'vinaigrette dressing', 'balsamic vinaigrette', 'caesar dressing', 'blue cheese dressing', 'thousand island dressing', 'honey mustard dressing',
    'pasta sauce', 'marinara sauce', 'Prego pasta sauce', 'Ragu pasta sauce', 'alfredo sauce', 'Classico alfredo', 'pesto sauce',
    'mayonnaise', 'mayo', 'Hellmanns mayonnaise', 'Best Foods mayonnaise', 'Miracle Whip', 'aioli',
    'pickles', 'dill pickles', 'Vlasic pickles', 'sweet pickles', 'relish', 'olives', 'pickled vegetables', 'kimchi', 'sauerkraut', 'pickled peppers', 'pepperoncini', 'jalapenos',
    'hot sauce', 'Tabasco sauce', 'Franks RedHot', 'Sriracha', 'cholula',
    'ketchup', 'Heinz ketchup', 'Hunts ketchup',
    'mustard', 'yellow mustard', 'Frenchs yellow mustard', 'dijon mustard', 'Grey Poupon dijon', 'spicy brown mustard', 'honey mustard',
    'asian sauces', 'soy sauce', 'Kikkoman soy sauce', 'teriyaki sauce', 'hoisin sauce', 'oyster sauce', 'fish sauce', 'sweet and sour sauce', 'curry sauce', 'chili oil', 'sesame oil',
    'bbq sauce', 'barbecue sauce', 'Sweet Baby Rays BBQ sauce', 'Kraft BBQ sauce',
    'salsa', 'Pace salsa', 'Tostitos salsa', 'mild salsa', 'medium salsa', 'hot salsa',
    'gravy', 'steak sauce', 'A1 steak sauce', 'worcestershire sauce', 'Lea & Perrins worcestershire', 'cocktail sauce', 'tartar sauce', 'taco sauce', 'enchilada sauce',
    'salad toppings', 'croutons', 'bacon bits',
    'horseradish', 'wasabi',

    // Personal Care
    'personal care', 'deodorant', 'antiperspirant', 'Dove deodorant', 'Old Spice deodorant', 'Secret deodorant',
    'body wash', 'bar soap', 'Dove body wash', 'Irish Spring soap', 'Dial soap', 'lotion', 'body lotion', 'hand soap', 'Softsoap hand soap', 'bubble bath', 'loofah', 'hand sanitizer', 'Purell hand sanitizer',
    'shaving cream', 'razors', 'Gillette razors', 'Schick razors', 'razor blades', 'disposable razors', 'aftershave',
    'feminine care', 'tampons', 'Tampax tampons', 'pads', 'Always pads', 'panty liners', 'feminine wash',
    'oral hygiene', 'toothpaste', 'Colgate toothpaste', 'Crest toothpaste', 'Sensodyne toothpaste', 'toothbrushes', 'Oral-B toothbrush', 'mouthwash', 'Listerine mouthwash', 'dental floss', 'floss picks', 'kids toothpaste', 'teeth whitening', 'Crest Whitestrips', 'denture care', 'Polident',
    'hair care', 'shampoo', 'conditioner', 'Pantene shampoo', 'Head & Shoulders shampoo', 'Herbal Essences conditioner', 'hairspray', 'hair gel', 'mousse', 'dry shampoo', 'hair ties', 'hair color', 'hair dye',
    'eye care', 'eye drops', 'Visine eye drops', 'contact solution', 'Bausch + Lomb Renu', 'cotton swabs', 'Q-tips', 'ear plugs',
    'skin care', 'face wash', 'Cetaphil cleanser', 'Neutrogena face wash', 'moisturizer', 'face cream', 'Olay Regenerist', 'facial wipes', 'makeup remover', 'face masks', 'lip balm', 'ChapStick', 'Blistex', 'sunscreen', 'Coppertone sunscreen', 'Neutrogena sunscreen', 'aloe vera gel',
    'intimacy', 'condoms', 'Trojan condoms', 'lubricant', 'KY Jelly', 'pregnancy test', 'First Response pregnancy test',
    'cosmetics', 'makeup', 'foundation', 'mascara', 'lipstick', 'nail polish', 'fragrance', 'perfume', 'cologne',

    // Dry Goods & Pasta
    'dry goods', 'pasta', 'spaghetti', 'Barilla spaghetti', 'penne', 'fettuccine', 'rotini', 'macaroni', 'elbow macaroni', 'lasagna noodles', 'egg noodles', 'couscous', 'quinoa', 'rice', 'white rice', 'brown rice', 'basmati rice', 'jasmine rice', 'instant rice', 'Minute Rice', 'lentils', 'barley',
    'boxed meals', 'mac and cheese', 'Kraft Macaroni & Cheese', 'Rice-A-Roni', 'Hamburger Helper', 'instant noodles', 'ramen',
    'seeds', 'chia seeds', 'flax seeds', 'pumpkin seeds', 'sunflower seeds', 'sesame seeds',
    'dried beans', 'dry black beans', 'dry pinto beans',

    // Oils, Vinegars, & Spices
    'cooking oil', 'olive oil', 'extra virgin olive oil', 'Bertolli olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'avocado oil', 'sesame oil', 'cooking spray', 'Pam cooking spray',
    'spices', 'seasoning', 'salt', 'sea salt', 'iodized salt', 'Morton salt', 'pepper', 'black pepper', 'peppercorns', 'garlic powder', 'onion powder', 'paprika', 'cumin', 'oregano', 'basil', 'thyme', 'cinnamon', 'nutmeg', 'chili powder', 'curry powder', 'italian seasoning', 'McCormick spices', 'seasoning salt', 'Lawrys seasoned salt',
    'vinegar', 'white vinegar', 'apple cider vinegar', 'Bragg apple cider vinegar', 'balsamic vinegar', 'red wine vinegar', 'rice vinegar',
    'bread crumbs', 'panko bread crumbs',
    'bouillon cubes', 'beef bouillon', 'chicken bouillon', 'Knorr bouillon',
    'marinades',

    // Health Care
    'health care', 'medicine', 'cold medicine', 'flu medicine', 'allergy medicine', 'Tylenol', 'Advil', 'ibuprofen', 'acetaminophen', 'Aleve', 'Benadryl', 'Claritin', 'Zyrtec', 'cough drops', 'Halls cough drops', 'Ricola', 'immune support', 'Emergen-C', 'Airborne', 'nasal spray', 'Afrin', 'pain relief cream', 'Bengay', 'Icy Hot',
    'vitamins', 'supplements', 'multivitamins', 'Centrum multivitamins', 'vitamin C', 'vitamin D', 'calcium supplements', 'fish oil', 'melatonin', 'prenatal vitamins', 'kids vitamins',
    'digestive health', 'antacid', 'Tums', 'Pepto-Bismol', 'fiber supplements', 'Metamucil', 'probiotics', 'laxatives',
    'first aid', 'bandages', 'Band-Aid bandages', 'gauze', 'medical tape', 'antiseptic wipes', 'hydrogen peroxide', 'rubbing alcohol', 'Neosporin', 'hydrocortisone cream', 'thermometer', 'heating pad', 'ice pack',
    'muscle care', 'epsom salt', 'muscle rub', 'pain relief patches',
    'face masks', 'disposable gloves',
    'childrens medicine', 'Childrens Tylenol', 'Childrens Motrin',
    'sleep aids', 'Unisom', 'wart remover', 'lice treatment',
    'protein powder', 'whey protein', 'energy supplements', 'pre-workout',
    'foot care', 'insoles', 'Dr. Scholls insoles', 'foot powder',

    // Baking Essentials
    'baking supplies', 'flour', 'all-purpose flour', 'Gold Medal flour', 'King Arthur flour', 'bread flour', 'whole wheat flour', 'almond flour', 'gluten-free flour', 'cornmeal',
    'sugar', 'granulated sugar', 'brown sugar', 'powdered sugar', 'C&H Sugar', 'Domino Sugar', 'sugar substitutes', 'Splenda', 'Stevia',
    'baking chocolate', 'chocolate chips', 'Nestle Toll House chocolate chips', 'Hersheys chocolate chips', 'baking cocoa', 'Hersheys cocoa powder',
    'honey', 'maple syrup', 'corn syrup', 'Karo corn syrup', 'molasses', 'agave nectar',
    'baking powder', 'baking soda', 'Arm & Hammer baking soda', 'corn starch', 'yeast', 'Fleischmanns yeast', 'cream of tartar',
    'vanilla extract', 'McCormick vanilla extract', 'almond extract', 'food coloring',
    'baking mixes', 'cake mix', 'Betty Crocker cake mix', 'Duncan Hines cake mix', 'brownie mix', 'cookie mix', 'biscuit mix', 'Jiffy corn muffin mix', 'pudding mix', 'Jell-O pudding mix', 'gelatin mix',
    'condensed milk', 'Eagle Brand condensed milk', 'evaporated milk', 'Carnation evaporated milk', 'powdered milk',
    'frosting', 'canned frosting', 'Pillsbury frosting', 'sprinkles', 'cake decorations', 'baking cups', 'cupcake liners', 'cake candles',
    'pie crust', 'Pillsbury pie crust', 'graham cracker crust', 'pie filling', 'canned pumpkin pie filling',
    'marshmallows', 'Kraft marshmallows',
    'ice cream cones',

    // Kitchen Supplies
    'kitchen supplies', 'food storage containers', 'Tupperware', 'Rubbermaid containers', 'food storage bags', 'Ziploc bags', 'Glad bags', 'freezer bags', 'sandwich bags', 'aluminum foil', 'plastic wrap', 'parchment paper', 'wax paper',
    'disposable plates', 'paper plates', 'plastic cups', 'Solo cups', 'disposable cutlery', 'plastic forks', 'straws', 'napkins', 'paper towels',
    'kitchen gadgets', 'can opener', 'vegetable peeler', 'whisk', 'spatula', 'measuring cups', 'measuring spoons', 'colander', 'grater', 'pizza cutter', 'kitchen timer', 'water filter', 'Brita filter',
    'cookware', 'pots', 'pans', 'frying pan', 'saucepan', 'baking sheet', 'cookie sheet', 'muffin tin', 'cake pan', 'casserole dish', 'Pyrex dish',
    'kitchen utensils', 'serving spoons', 'tongs', 'ladle', 'cutting board', 'knives', 'chef knife', 'paring knife', 'steak knives', 'silverware', 'forks', 'spoons',
    'kitchen towels', 'dish towels', 'oven mitts', 'pot holders',
    'plates', 'bowls', 'mugs', 'drinking glasses', 'wine glasses',
    'water bottles', 'reusable water bottle', 'thermos', 'travel mug', 'tumbler',

    // Hard Beverages
    'hard seltzer', 'White Claw', 'Truly', 'hard cider', 'Angry Orchard', 'hard lemonade', 'Mikes Hard Lemonade', 'hard tea', 'Twisted Tea', 'canned cocktails', 'pre-mixed cocktails', 'hard kombucha',

    // Miscellaneous
    'magazines', 'books', 'newspapers', 'greeting cards', 'birthday cards', 'thank you cards', 'gift wrap', 'wrapping paper', 'gift bags', 'tape', 'scotch tape', 'batteries', 'AA', 'AAA', 'light bulbs', 'charcoal', 'lighter fluid', 'firewood', 'school supplies', 'office supplies', 'pens', 'pencils', 'notebooks', 'printer paper', 'glue', 'scissors', 'toys', 'games', 'playing cards',

    // Baby and others
    'baby food', 'Gerber baby food', 'baby cereal', 'baby snacks', 'baby formula', 'Enfamil formula', 'Similac formula', 'diapers', 'Pampers diapers', 'Huggies diapers', 'baby wipes', 'Pampers wipes', 'Huggies wipes', 'diaper rash cream', 'Desitin', 'baby lotion', 'Johnson & Johnson baby lotion', 'baby wash', 'baby shampoo', 'baby bottles', 'pacifiers', 'teethers',
    'persimmons', 'mixed fruit', 'pre-cut fruit', 'grapefruits', 'apricots', 'more fruit', 'leafy greens', 'potatoes & yams', 'broccoli & cauliflower', 'carrots & celery', 'onions & garlic', 'squash & gourds', 'beans & peas', 'specialty vegetables', 'specialty herbs', 'coffee filters & accessories', 'smoothie juices', 'pressed juices', 'juice shots', 'more juice', 'juice blends', 'specialty juices', 'plain milk', 'leaf tea', 'powdered tea', 'tea pods', 'kombucha & probiotic drinks', 'water enhancers', 'powdered drink mixes', 'powdered energy drinks', 'cocktail syrups', 'cocktail mixers', 'cocktail rimmers', 'non-alcoholic wines', 'more wine', 'sake & rice wine', 'all other candies', 'variety pack chips', 'cheese crisps', 'puff chips', 'all other chips', 'pita & bread chips', 'more snack bars', 'more sweet treats', 'snack variety packs', 'snack mixes', 'more snacks', 'snack bites', 'all other dips', 'cheese dips', 'fruit snack cups', 'chewing gum', 'beef burgers', 'beef specialty cuts', 'beef roasts', 'chicken kabob meat', 'other chicken', 'other fish', 'pork roasts', 'pork specialty cuts', 'ground pork burgers', 'prawns', 'crab & lobster', 'oysters, clams & mussels', 'beef alternatives', 'other meat alternatives', 'sausage alternatives', 'specialty meats', 'frozen italian meals', 'other frozen meals', 'frozen mexican meals', 'frozen asian meals', 'frozen indian meals', 'frozen hamburgers', 'frozen bars', 'frozen pops', 'ice cream cones', 'more ice cream', 'more frozen snacks', 'pizza bites', 'other frozen breakfast', 'frozen breakfast pastries', 'frozen quiche', 'frozen meat alternatives', 'other frozen meats', 'frozen mixed vegetables', 'other frozen vegetables', 'frozen fruit mixes', 'other frozen fruit', 'frozen desserts', 'frozen pastries', 'frozen pie crusts', 'dessert topping', 'frozen toast', 'other frozen breads', 'puff pastry', 'frozen dough', 'frozen rolls', 'frozen pizza crusts', 'frozen broths', 'frozen juice concentrate', 'specialty cheeses', 'cheese blends', 'cheese sticks', 'cheese snacks', 'jack cheese', 'traditional yogurt', 'dairy-free yogurt', 'more yogurt', 'dairy free spreads', 'creme fraiche', 'cashew milk', 'more plant-based milk', 'sandwiches & wraps', 'poke', 'prepared meals & sides', 'prepared mexican', 'prepared asian', 'more salads', 'tuna salad', 'more chicken', 'prepared soups', 'prepared beef', 'prepared pork', 'prepared seafood', 'deli party trays', 'meat & cheese combos', 'desert trays', 'cheese party trays',
    'prepared breakfast', 'canadian whiskey', 'flavored whiskey', 'more whiskey', 'unflavored vodka', 'unflavored tequila', 'flavored tequila', 'light rum', 'flavored rum', 'more rum', 'brandy & cognac', 'more liquor', 'dishwasher solutions', 'furniture polish', 'wood polish', 'pet cleaners', 'specialty cleaners', 'laundry fragrance enhancers', 'fabric deodorizers', 'fabric dye', 'fabric starch', 'trash cans', 'recycle bins', 'cleaning brushes', 'cleaning cloths', 'dusters', 'other cleaning tools', 'toilet plungers', 'aromatherapy oils', 'aromatherapy diffusers', 'bag clips', 'lint rollers', 'flashlights', 'more housewares', 'pest baits', 'pest traps', 'bakery pastries', 'turnovers', 'parfaits', 'dessert bars', 'more breads', 'potato bread', 'italian bread', 'dessert breads', 'sprouted grain bread', 'more buns', 'more rolls', 'sandwich rolls', 'more bakery desserts', 'frozen pies', 'frozen cakes', 'more deli meats', 'deli specialty cheeses', 'deli string cheese', 'deli snacks', 'deli mexican cheese blend', 'deli cheese trays', 'deli jack cheese', 'olive bar', 'deli cheese dips', 'more deli dips', 'more deli spreads', 'dry soup kits', 'canned clams', 'canned crab meat', 'more canned fish', 'other broths', 'canned cranberries', 'canned mixed fruit', 'canned oranges', 'other canned fruit', 'canned meals', 'canned white beans', 'other canned beans', 'canned mixed beans', 'canned beef', 'canned pork', 'other canned meat', 'canned green chiles', 'other canned vegetables', 'canned mixed vegetables', 'canned peppers', 'canned artichokes', 'bamboo shoots', 'canned beets', 'hearts of palm', 'sun-dried tomatoes', 'canned coconut', 'non-alcoholic beers', 'more beer', 'dog health', 'dog supplies', 'litter box', 'cat health', 'cat supplies', 'more pet supplies', 'pet fish', 'pet birds', 'quick oats', 'other oats', 'fruit butters', 'jams & jellies', 'other nut butters', 'pancake & waffle mix', 'asian dressing', 'french dressing', 'more dressing', 'poppy seed dressing', 'yogurt dressing', 'red sauce', 'chili sauces', 'other mustard', 'soy sauces', 'peanut sauces', 'sesame sauces', 'stir-fry sauce', 'more sauces', 'mole sauces', 'sloppy joe sauces', 'buffalo sauce', 'pastes', 'body soap', 'self tan', 'body powder', 'other shaving tools', 'feminine medication', 'feminine wipes', 'feminine washers', 'kids oral hygiene', 'pain relief guards', 'night guards', 'breath spray', 'breath strips', '2-in-1 shampoo', 'hair styling products', 'hair styling tools', 'hair clips',
    'hair accessories', 'hair color treatments', '3-in-1 wash', 'incontinence pads', 'incontinence underwear', 'ear oil', 'skin cleaners', 'specialty skin care', 'sun protection', 'bug spray', 'other intimacy', 'nail care', 'tortellini', 'ravioli', 'pasta shells', 'rigatoni', 'more pasta', 'angel hair pasta', 'orzo pasta', 'linguine', 'fusilli pasta', 'gnocchi', 'grain-free pasta', 'ziti pasta', 'tomato based sauces', 'pizza sauce', 'rices', 'other grains', 'boxed meals & sides', 'noodles', 'poppy seeds', 'more dry goods', 'other cooking oils', 'spices & seasoning', 'other vinegars', 'bouillons', 'congestion medicine', 'pain relievers', 'fever relievers', 'inhaler', 'nasal strips', 'sinus rinse kits', 'throat spray', 'antioxidants', 'hair supplements', 'skin supplements', 'nail supplements', 'herbal supplements', 'minerals', 'nutritional oils', 'superfood supplements', 'kids vitamins', 'kids supplements', 'joint care supplements', 'more vitamins', 'more supplements', 'prebiotics', 'antidiarrheal', 'antigas', 'other digestive supplements', 'heartburn relief', 'antiseptics', 'chest rub', 'cotton balls', 'petroleum jelly', 'more first aid', 'joint braces', 'joint wraps', 'childrens health care', 'childrens allergy medicine', 'childrens cold medicine', 'childrens flu medicine', 'childrens digestive medicine', 'childrens pain reliever', 'childrens fever reliever', 'childrens supplements', 'childrens vitamins', 'more childrens health care', 'antifungals', 'cold sore treatment', 'motion sickness treatment', 'more specialty treatments', 'insole inserts', 'foot odor control', 'other foot care', 'baking bars', 'other sugars', 'more flours', 'ice cream syrups', 'other syrups', 'biscuit doughs', 'cookie doughs', 'pastry doughs', 'pizza doughs', 'wrapping dough', 'more extracts', 'bread mix', 'more baking mixes', 'cake decorating kits', 'icing', 'more cake decorating', 'food jars', 'lunch bags', 'table cloths', 'disposable utensils', 'toothpicks', 'disposable serveware', 'kitchen appliances', 'bar tools', 'silverware & flatware', 'kitchen serveware', 'kitchen organization', 'ready-to-drink cocktails', 'flavored malt beverages', 'home & garden', 'auto supplies', 'miscellaneous bags', 'apparel', 'accessories', 'sports equipment', 'outdoor equipment', 'electronics', 'party supplies', 'valentines day cards', 'wedding cards', 'other cards', 'gift bows', 'costumes', 'gift baskets', 'poster boards', 'index cards', 'sticky notes', 'craft paper', 'other paper',
    'binders', 'painting supplies', 'craft accessories', 'more crafts', 'staplers', 'staples', 'paper clips', 'pushpins', 'other office supplies', 'erasers', 'white out', 'classroom supplies', 'mailroom supplies', 'hobby supplies', 'chalk', 'crayons', 'paint sets', 'office organization', 'baby cereal', 'baby meals', 'baby purees', 'baby pouches', 'baby snacks', 'baby drinks', 'disposable training pants', 'bottle accessories', 'sippy cups', 'baby medicine', 'nasal aspirators', 'baby powders', 'baby skin care', 'baby supplements', 'baby electrolytes', 'pacifiers & teething', 'baby body wash', 'baby soap', 'baby bubble bath', 'baby grooming', 'baby shampoo', 'baby conditioner', 'breast feeding supplies', 'sugar-free', 'gluten free', 'vegan', 'vegetarian', 'box', 'bag', 'kit', 'powder', 'jug', 'carton', 'bundle',
    'apple', 'banana', 'orange', 'berry', 'grape', 'melon', 'peach', 'pear', 'lime', 'lemon', 'avocado', 'tomato', 'potato', 'onion', 'carrot', 'lettuce', 'mushroom', 'pepper', 'herb', 'butter', 'creamer', 'egg', 'pork', 'turkey', 'lamb', 'fish', 'shrimp', 'crab', 'lobster', 'cake', 'pie', 'muffin', 'donut', 'bagel', 'bun', 'roll', 'pastry', 'flour', 'sugar', 'oil', 'vinegar', 'spice', 'salt', 'pepper', 'pasta', 'rice', 'bean', 'nut', 'seed', 'cracker', 'cereal', 'oatmeal', 'soup', 'broth', 'can', 'jar', 'pizza', 'fries', 'vegetable', 'fruit', 'dessert', 'meal', 'juice', 'soda', 'water', 'tea', 'coffee', 'milk', 'wine', 'beer', 'liquor', 'chip', 'cookie', 'candy', 'chocolate', 'popcorn', 'pretzel', 'soap', 'detergent', 'cleaner', 'towel', 'tissue', 'napkin', 'sponge', 'trash', 'lightbulb', 'battery', 'shampoo', 'conditioner', 'lotion', 'deodorant', 'toothpaste', 'toothbrush', 'razor', 'sunscreen', 'makeup', 'diaper', 'wipe', 'formula', 'food', 'bottle', 'container', 'pack', 'mix',

    'added', 'aged', 'all natural', 'artisan', 'artisanal', 'assorted', 'baked', 'bar', 'base', 'basics', 'bath', 'beauty', 'blend', 'boiled', 'bonus pack', 'bulk', 'canned', 'care', 'choice', 'chopped', 'classic', 'club pack', 'coarse', 'cold', 'concentrate', 'concentrated', 'cooked', 'craft', 'cream', 'creamy', 'crisp', 'crisps', 'crispy', 'crunchy', 'crushed', 'cube', 'cubes', 'cured', 'daily', 'dairy free', 'decorations', 'diet', 'diluted', 'drink', 'dried', 'dye free', 'easy', 'eco friendly', 'edible', 'egg free', 'enriched', 'essential', 'extract', 'extra',
    'fair trade', 'family', 'family pack', 'family size', 'farm', 'farm raised', 'farmed', 'fat free', 'filler', 'fine', 'flake', 'flakes', 'flavor', 'flavored', 'flavors', 'fortified', 'fragrance free', 'free', 'free range', 'fresh', 'fried', 'frozen', 'fun size', 'garden', 'gel', 'general', 'generic', 'glaze', 'good', 'goods', 'gourmet', 'grab and go', 'grain', 'grains', 'grass fed', 'grilling', 'grilled', 'groceries', 'grocery', 'grooming', 'ground', 'halal', 'healthy', 'heat and eat', 'high fiber', 'high protein', 'holiday', 'homemade', 'homogenized', 'hot', 'hypoallergenic', 'improved',
    'ingredients', 'instant', 'item', 'jumbo', 'kernel', 'king', 'king size', 'kit', 'kitchen', 'kosher', 'lean', 'less', 'light', 'lite', 'liquid', 'loaf', 'low', 'low carb', 'low fat', 'low sodium', 'low sugar', 'meat free', 'medium', 'mild', 'minced', 'mini', 'multi', 'multi pack', 'natural', 'needs', 'new', 'no added', 'no salt', 'no sugar', 'non gmo', 'notions', 'nut free', 'old fashioned', 'on the go', 'organic', 'original', 'package', 'packet', 'paraben free', 'paste', 'pasteurized', 'peeled', 'plain', 'plant based', 'portion', 'pouch', 'premium', 'product', 'pure', 'puree', 'quick', 'ready', 'ready to cook', 'ready to eat', 'real', 'reduced',
    'refined', 'regular', 'rich', 'ripe', 'roasted', 'round', 'rub', 'sack', 'savory', 'scented', 'seasonal', 'select', 'serving', 'simple', 'single', 'slice', 'sliced', 'small', 'smoked', 'smooth', 'solid', 'sour', 'soy free', 'special', 'spicy', 'spray', 'spread', 'square', 'standard', 'staple', 'staples', 'steamed', 'stick', 'sticks', 'sulfate free', 'sundries', 'supply', 'supplies', 'sweet', 'tart', 'tender', 'thick', 'thin', 'traditional', 'travel size', 'treat', 'trial size', 'triple', 'tub', 'tube', 'uncured', 'unflavored', 'unrefined', 'unscented', 'utility', 'value', 'value pack', 'variety', 'wedge', 'wellness', 'whole', 'wild', 'wild caught', 'zesty', 'oz',
    'block', 'chunk', 'dust', 'essentials', 'foodstuff', 'grind', 'grill', 'individual', 'ingredient', 'large', 'layer', 'link', 'log', 'lump', 'mealtime', 'melt', 'miniature', 'mixed', 'moist', 'nugget', 'pantry', 'patty', 'pellet', 'piece', 'plank', 'pod', 'powdered', 'preparation', 'pressed', 'pulp', 'raw', 'refill', 'seedless', 'segment', 'shaved', 'sheet', 'shell', 'shredded', 'skin', 'slab', 'snackable', 'spear', 'sphere', 'spiral', 'split', 'sprig', 'stack', 'stalk', 'starch', 'starter', 'stone ground', 'strip', 'stuffing', 'style', 'sweetened', 'tablet', 'tangy', 'toasted', 'topping', 'trimmed', 'twin pack', 'twist', 'uncooked', 'unsalted', 'unsweetened', 'wafer', 'whipped', 'zest'

];
// --- End Search Terms ---


// --- Helper Function: Get Access Token (Copied from your index.js) ---
async function getAccessToken() {
    const now = Date.now();

    if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
        return accessToken;
    }
    console.log("[AUTH] Fetching new access token...");
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.KROGER_CLIENT_ID,
        client_secret: process.env.KROGER_CLIENT_SECRET,
        scope: 'product.compact',
    });

    try {
        const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AUTH ERROR] Token request failed with status ${response.status}: ${errorText}`);
            throw new Error(`Token request failed with status ${response.status}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        // Add a small buffer (e.g., 60 seconds) to expiry time
        tokenExpiresAt = now + (data.expires_in - 60) * 1000;

        console.log('[AUTH] Access token acquired successfully.');
        return accessToken;
    } catch (error) {
        console.error('[AUTH ERROR] Error fetching access token:', error.message);
        throw error; // Re-throw to stop the script if auth fails
    }
}
// --- End Helper Function ---


// --- Main Execution Logic ---
async function runFetch() {
    // --- Argument Handling ---
    const locationId = process.argv[LOCATION_ID_ARG_INDEX];
    if (!locationId) {
        console.error("Usage: node fetch_kroger_data.js <locationId>");
        console.error("Example: node fetch_kroger_data.js 70300168");
        process.exit(1); // Exit with error code
    }
    // --- End Argument Handling ---


    // --- Initialization ---
    const allProducts = [];
    const uniqueProductIds = new Set();
    let apiRequestCount = 0; // Counter for product API requests
    const startTime = Date.now();
    let limitReached = false;
    let fetchErrorOccurred = false;

    const outputDir = path.join(__dirname, 'output');
    const outputFileName = `kroger_data_${locationId}_${Date.now()}.json`;
    const outputFilePath = path.join(outputDir, outputFileName);
    const logFileName = `kroger_fetch_log_${locationId}_${Date.now()}.txt`;
    const logFilePath = path.join(outputDir, logFileName);
    // --- End Initialization ---


    // --- Setup Output ---
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
            console.log(`Created output directory: ${outputDir}`);
        }
        // Clear or create log file
        fs.writeFileSync(logFilePath, `Log started at ${new Date().toISOString()}\n`);
        console.log(`Logging details to: ${logFilePath}`);
    } catch (err) {
        console.error(`Error setting up output directory/log file: ${err.message}`);
        process.exit(1);
    }

    // Simple logger function
    const log = (message) => {
        console.log(message);
        try {
            fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
        } catch (logErr) {
            console.error("Failed to write to log file:", logErr.message);
        }
    };
    // --- End Setup Output ---


    log(`[FETCH START] Starting product fetch for location: ${locationId}.`);
    log(`Outputting products to: ${outputFilePath}`);
    log(`Total search terms configured: ${searchTerms.length}`);
    log(`Maximum pages per term: ${MAX_PAGES_PER_TERM}`);
    log(`Request delay: ${REQUEST_DELAY_MS}ms`);
    log(`API Limit Buffer: ${API_LIMIT_BUFFER}`);


    try {
        let termIndex = 0;
        for (const term of searchTerms) {
            termIndex++;
            let start = 0;
            const limit = 50; // Kroger API max limit per page
            let productsFoundForTermInRun = 0;
            let requestsForTerm = 0;
            const maxStart = (MAX_PAGES_PER_TERM - 1) * limit; // Calculate max start index based on config

            log(`[TERM ${termIndex}/${searchTerms.length}] Processing: "${term}"`);

            while (start <= maxStart) {
                // --- Pre-Request Checks ---
                if (apiRequestCount >= (KROGER_API_DAILY_LIMIT - API_LIMIT_BUFFER)) {
                    limitReached = true;
                    log(`[LIMIT REACHED] Approaching API limit (${apiRequestCount} requests). Stopping fetch before processing term "${term}" (start=${start}).`);
                    break; // Break inner while loop
                }
                // --- End Pre-Request Checks ---


                try {
                    const token = await getAccessToken(); // Get token (cached if possible)
                    const params = new URLSearchParams({
                        'filter.locationId': locationId,
                        'filter.limit': limit.toString(),
                        'filter.start': start.toString(),
                        'filter.term': term,
                        'filter.fulfillment': 'ais' // Available In Store
                    });

                    apiRequestCount++; // Increment PRODUCT API request counter *before* the request
                    requestsForTerm++;
                    log(` -> Request #${apiRequestCount} (Term: "${term}", Start: ${start})`);

                    const response = await fetch(`https://api.kroger.com/v1/products?${params.toString()}`, {
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        timeout: 15000 // Add a timeout (15 seconds)
                    });

                    // --- Response Handling ---
                    if (response.status === 429) {
                        limitReached = true;
                        log("[FATAL ERROR] Rate limit exceeded (429). Stopping entire process.");
                        throw new Error("Kroger API rate limit exceeded (429)."); // Throw to exit outer loop via catch
                    }

                    if (!response.ok) {
                        const errorText = await response.text();
                        log(`[ERROR] API Response not OK for term "${term}" (Start: ${start}, Status: ${response.status}): ${errorText}`);
                        // Don't throw here, just break the loop for this term to try the next one
                        break;
                    }

                    const data = await response.json();

                    // --- Data Processing ---
                    if (!data.data?.length) {
                        log(` -> No more products found for term "${term}" at start=${start}.`);
                        break; // Exit while loop for this term
                    }

                    let newProductsCount = 0;
                    data.data.forEach(product => {
                        const hasPrice = (product.items?.[0]?.price?.regular || 0) > 0;
                        if (product.productId && hasPrice && !uniqueProductIds.has(product.productId)) {
                            allProducts.push(product);
                            uniqueProductIds.add(product.productId);
                            newProductsCount++;
                        }
                    });

                    productsFoundForTermInRun += data.data.length; // Total returned in this page
                    log(` -> Got ${data.data.length} products, ${newProductsCount} were new & valid. (Total unique: ${allProducts.length})`);

                    start += limit; // Prepare for next page

                } catch (fetchError) {
                    // Handle errors during the fetch itself (like network errors, timeouts, or the 429 thrown above)
                    log(`[FETCH/PROCESS ERROR] Error during fetch for term "${term}" (Start: ${start}): ${fetchError.message}`);
                    if (fetchError.message.includes("429")) {
                        throw fetchError; // Re-throw the fatal 429 error
                    }
                    // Otherwise, log and break the inner loop to move to the next term
                    break;
                }


                // --- Rate Limiting Delay ---
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));

            } // End while loop (pagination for term)

            log(`[TERM ${termIndex}/${searchTerms.length}] Finished: "${term}". Found ~${productsFoundForTermInRun} results in this run across ${requestsForTerm} requests.`);

            // Check if outer loop needs to stop due to limit being hit
            if (limitReached) {
                log(`[LIMIT REACHED] Stopping outer loop as limit was hit or buffer reached.`);
                break; // Break the main for...of loop
            }

        } // End for loop (search terms)

    } catch (error) {
        // Catch major errors (like auth failure, 429, file system errors)
        log('[FATAL SCRIPT ERROR] An error occurred, stopping the script:');
        log(error.stack || error.message);
        fetchErrorOccurred = true;
    } finally {
        // --- Final Summary & Save ---
        const endTime = Date.now();
        const durationSeconds = Math.round((endTime - startTime) / 1000);
        const durationMinutes = (durationSeconds / 60).toFixed(2);

        log("==================================================");
        log("[FETCH SUMMARY]");
        log(`Status: ${fetchErrorOccurred ? 'FAILED' : (limitReached ? 'COMPLETED (LIMIT REACHED)' : 'COMPLETED')}`);
        log(`Duration: ${durationSeconds}s (~${durationMinutes} minutes)`);
        log(`Total Product API requests made: ${apiRequestCount}`);
        log(`Daily Limit Status: ${limitReached ? 'LIMIT HIT or BUFFER REACHED' : 'OK'}`);
        log(`Total unique products collected: ${allProducts.length}`);
        log(`Log file: ${logFilePath}`);
        log(`Product data file: ${outputFilePath}`);
        log("==================================================");

        // Attempt to save the collected data (even if partial)
        if (allProducts.length > 0) {
            log(`Attempting to save ${allProducts.length} collected products to ${outputFilePath}...`);
            try {
                fs.writeFileSync(outputFilePath, JSON.stringify(allProducts, null, 2)); // Pretty print
                log(`Successfully saved product data.`);
            } catch (saveError) {
                log(`[ERROR] Failed to save product data to file: ${saveError.message}`);
            }
        } else {
            log("No products collected, skipping file save.");
        }

        // Exit with appropriate code
        process.exit(fetchErrorOccurred ? 1 : 0);
    }
}

// --- Run the main function ---
runFetch();
// --- End Main Execution Logic ---