import { DatabaseFood, FoodCategory, Nutrients100g, ServingOption } from "@/types/domain";

/**
 * Bundled offline food database.
 *
 * Everything is normalized to nutrition per 100 g so that any serving can be
 * derived by scaling, which is what `foodSearch.buildFoodItem` relies on.
 * Values are rounded reference figures for common foods; a production build
 * would sync these from USDA FDC or a licensed provider, but keeping them
 * local means search works offline and in Expo Go with no backend.
 */

type Macros = [
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber?: number,
  sugar?: number,
  sodium?: number
];

type Row = [
  id: string,
  name: string,
  category: FoodCategory,
  macros: Macros,
  servings: Array<[label: string, grams: number]>,
  brand?: string
];

function toNutrients([calories, proteinGrams, carbGrams, fatGrams, fiberGrams, sugarGrams, sodiumMg]: Macros): Nutrients100g {
  return { calories, proteinGrams, carbGrams, fatGrams, fiberGrams, sugarGrams, sodiumMg };
}

function toServings(id: string, servings: Array<[string, number]>): ServingOption[] {
  const options = servings.map(([label, grams], index) => ({ id: `${id}-s${index}`, label, grams }));
  if (!options.some((option) => option.grams === 100)) {
    options.push({ id: `${id}-s100g`, label: "100 g", grams: 100 });
  }
  return options;
}

function build(rows: Row[]): DatabaseFood[] {
  return rows.map(([id, name, category, macros, servings, brand]) => ({
    id,
    name,
    category,
    brand,
    source: "local" as const,
    verified: Boolean(brand),
    per100g: toNutrients(macros),
    servings: toServings(id, servings)
  }));
}

const rows: Row[] = [
  // ---------------------------------------------------------------- protein
  ["chicken-breast", "Chicken Breast, grilled, skinless", "protein", [165, 31, 0, 3.6, 0, 0, 74], [["4 oz (113 g)", 113], ["1 breast (174 g)", 174], ["1 oz (28 g)", 28]]],
  ["chicken-thigh", "Chicken Thigh, roasted", "protein", [209, 26, 0, 10.9, 0, 0, 88], [["1 thigh (85 g)", 85], ["4 oz (113 g)", 113]]],
  ["chicken-wing", "Chicken Wings, baked", "protein", [203, 30, 0, 8.1, 0, 0, 82], [["1 wing (34 g)", 34], ["6 wings (204 g)", 204]]],
  ["ground-beef-85", "Ground Beef, 85/15, cooked", "protein", [250, 26, 0, 15, 0, 0, 75], [["4 oz (113 g)", 113], ["1 patty (85 g)", 85]]],
  ["ground-turkey-93", "Ground Turkey, 93/7, cooked", "protein", [176, 27, 0, 7, 0, 0, 78], [["4 oz (113 g)", 113]]],
  ["ribeye", "Ribeye Steak, grilled", "protein", [291, 24, 0, 21, 0, 0, 62], [["8 oz (227 g)", 227], ["4 oz (113 g)", 113]]],
  ["sirloin", "Sirloin Steak, grilled", "protein", [206, 30, 0, 9, 0, 0, 55], [["6 oz (170 g)", 170], ["4 oz (113 g)", 113]]],
  ["pork-chop", "Pork Chop, grilled", "protein", [231, 27, 0, 13, 0, 0, 62], [["1 chop (131 g)", 131]]],
  ["bacon", "Bacon, cooked", "protein", [541, 37, 1.4, 42, 0, 0, 1717], [["1 slice (10 g)", 10], ["3 slices (30 g)", 30]]],
  ["sausage-link", "Pork Sausage Link, cooked", "protein", [339, 19, 1.5, 29, 0, 0.8, 900], [["1 link (45 g)", 45]]],
  ["salmon", "Salmon, Atlantic, baked", "protein", [208, 20, 0, 13, 0, 0, 59], [["6 oz fillet (170 g)", 170], ["4 oz (113 g)", 113]]],
  ["tuna-canned", "Tuna, canned in water, drained", "protein", [116, 26, 0, 0.8, 0, 0, 247], [["1 can (142 g)", 142], ["1/2 can (71 g)", 71]]],
  ["shrimp", "Shrimp, cooked", "protein", [99, 24, 0.2, 0.3, 0, 0, 111], [["4 oz (113 g)", 113], ["6 large (43 g)", 43]]],
  ["cod", "Cod, baked", "protein", [105, 23, 0, 0.9, 0, 0, 78], [["6 oz fillet (170 g)", 170]]],
  ["tilapia", "Tilapia, baked", "protein", [128, 26, 0, 2.7, 0, 0, 56], [["1 fillet (113 g)", 113]]],
  ["egg-whole", "Egg, whole, large", "protein", [143, 13, 0.7, 9.5, 0, 0.4, 142], [["1 large egg (50 g)", 50], ["2 large eggs (100 g)", 100]]],
  ["egg-white", "Egg White", "protein", [52, 11, 0.7, 0.2, 0, 0.7, 166], [["1 white (33 g)", 33], ["1 cup (243 g)", 243]]],
  ["tofu-firm", "Tofu, firm", "protein", [144, 17, 3, 9, 2, 0.6, 14], [["1/2 block (126 g)", 126], ["3 oz (85 g)", 85]]],
  ["tempeh", "Tempeh", "protein", [192, 20, 8, 11, 0, 0, 9], [["3 oz (85 g)", 85]]],
  ["black-beans", "Black Beans, cooked", "protein", [132, 8.9, 24, 0.5, 8.7, 0.3, 1], [["1 cup (172 g)", 172], ["1/2 cup (86 g)", 86]]],
  ["chickpeas", "Chickpeas, cooked", "protein", [164, 8.9, 27, 2.6, 7.6, 4.8, 7], [["1 cup (164 g)", 164], ["1/2 cup (82 g)", 82]]],
  ["lentils", "Lentils, cooked", "protein", [116, 9, 20, 0.4, 7.9, 1.8, 2], [["1 cup (198 g)", 198]]],
  ["whey-protein", "Whey Protein Powder", "protein", [375, 78, 8, 3, 1, 4, 250], [["1 scoop (32 g)", 32], ["2 scoops (64 g)", 64]]],
  ["turkey-deli", "Turkey Breast, deli slices", "protein", [104, 17, 3.5, 2.3, 0, 2, 1050], [["2 slices (56 g)", 56], ["4 slices (112 g)", 112]]],
  ["ham-deli", "Ham, deli slices", "protein", [145, 17, 3, 6.5, 0, 2, 1200], [["2 slices (56 g)", 56]]],

  // ------------------------------------------------------------------ grain
  ["white-rice", "White Rice, cooked", "grain", [130, 2.7, 28, 0.3, 0.4, 0.1, 1], [["1 cup (158 g)", 158], ["1/2 cup (79 g)", 79]]],
  ["brown-rice", "Brown Rice, cooked", "grain", [123, 2.7, 26, 1, 1.6, 0.4, 4], [["1 cup (195 g)", 195], ["1/2 cup (98 g)", 98]]],
  ["quinoa", "Quinoa, cooked", "grain", [120, 4.4, 21, 1.9, 2.8, 0.9, 7], [["1 cup (185 g)", 185]]],
  ["pasta", "Pasta, cooked", "grain", [158, 5.8, 31, 0.9, 1.8, 0.6, 1], [["1 cup (140 g)", 140], ["2 oz dry (56 g)", 56]]],
  ["whole-wheat-bread", "Whole Wheat Bread", "grain", [247, 13, 41, 3.4, 6, 6, 450], [["1 slice (43 g)", 43], ["2 slices (86 g)", 86]]],
  ["white-bread", "White Bread", "grain", [265, 9, 49, 3.2, 2.7, 5, 490], [["1 slice (28 g)", 28], ["2 slices (56 g)", 56]]],
  ["dkb-21-grains", "21 Whole Grains and Seeds Bread", "grain", [244, 11, 44, 3.3, 11, 5.6, 378], [["1 slice (45 g)", 45], ["2 slices (90 g)", 90]], "Dave's Killer Bread"],
  ["bagel-plain", "Bagel, plain", "grain", [250, 10, 49, 1.5, 2.1, 5, 430], [["1 bagel (98 g)", 98], ["1/2 bagel (49 g)", 49]]],
  ["oats-dry", "Rolled Oats, dry", "grain", [379, 13, 67, 6.5, 10, 1, 6], [["1/2 cup (40 g)", 40], ["1 cup (81 g)", 81]]],
  ["oatmeal-cooked", "Oatmeal, cooked with water", "grain", [71, 2.5, 12, 1.5, 1.7, 0.3, 4], [["1 cup (234 g)", 234]]],
  ["flour-tortilla", "Flour Tortilla, 8 inch", "grain", [306, 8, 51, 7.7, 3, 2.5, 610], [["1 tortilla (49 g)", 49]]],
  ["corn-tortilla", "Corn Tortilla", "grain", [218, 5.7, 45, 2.9, 6.3, 0.8, 45], [["1 tortilla (26 g)", 26], ["2 tortillas (52 g)", 52]]],
  ["cheerios", "Cheerios", "grain", [380, 12, 74, 6.7, 10, 4.4, 630], [["1 cup (28 g)", 28]], "General Mills"],
  ["granola-cereal", "Granola", "grain", [471, 10, 64, 20, 7, 22, 26], [["1/2 cup (55 g)", 55]]],
  ["couscous", "Couscous, cooked", "grain", [112, 3.8, 23, 0.2, 1.4, 0.1, 5], [["1 cup (157 g)", 157]]],
  ["english-muffin", "English Muffin", "grain", [235, 8, 46, 1.8, 2.7, 3.6, 420], [["1 muffin (57 g)", 57]]],
  ["pita", "Pita Bread, whole wheat", "grain", [275, 9.1, 55, 1.2, 2.2, 0.9, 536], [["1 pita (64 g)", 64]]],
  ["rice-cake", "Rice Cake, plain", "grain", [387, 8.2, 82, 2.8, 4.2, 0.6, 30], [["1 cake (9 g)", 9], ["2 cakes (18 g)", 18]]],
  ["saltines", "Saltine Crackers", "grain", [421, 9, 74, 9, 2.8, 1, 1100], [["5 crackers (15 g)", 15]]],

  // -------------------------------------------------------------- vegetable
  ["broccoli", "Broccoli, cooked", "vegetable", [35, 2.4, 7.2, 0.4, 3.3, 1.4, 41], [["1 cup (156 g)", 156], ["1/2 cup (78 g)", 78]]],
  ["spinach", "Spinach, raw", "vegetable", [23, 2.9, 3.6, 0.4, 2.2, 0.4, 79], [["1 cup (30 g)", 30], ["3 cups (90 g)", 90]]],
  ["arugula", "Arugula", "vegetable", [25, 2.6, 3.7, 0.7, 1.6, 2, 27], [["1 cup (20 g)", 20], ["1/2 cup (10 g)", 10]]],
  ["kale", "Kale, raw", "vegetable", [49, 4.3, 8.8, 0.9, 3.6, 2.3, 38], [["1 cup (21 g)", 21]]],
  ["romaine", "Romaine Lettuce", "vegetable", [17, 1.2, 3.3, 0.3, 2.1, 1.2, 8], [["1 cup shredded (47 g)", 47]]],
  ["tomato", "Tomato", "vegetable", [18, 0.9, 3.9, 0.2, 1.2, 2.6, 5], [["1 large (182 g)", 182], ["1 medium (123 g)", 123], ["1 slice (20 g)", 20]]],
  ["cucumber", "Cucumber", "vegetable", [15, 0.7, 3.6, 0.1, 0.5, 1.7, 2], [["1/2 cup sliced (52 g)", 52]]],
  ["bell-pepper", "Bell Pepper, red", "vegetable", [31, 1, 6, 0.3, 2.1, 4.2, 4], [["1 medium (119 g)", 119], ["1/2 cup (75 g)", 75]]],
  ["carrot", "Carrot", "vegetable", [41, 0.9, 9.6, 0.2, 2.8, 4.7, 69], [["1 medium (61 g)", 61], ["1 cup chopped (128 g)", 128]]],
  ["sweet-potato", "Sweet Potato, baked", "vegetable", [90, 2, 21, 0.2, 3.3, 6.5, 36], [["1 medium (114 g)", 114], ["1 cup (200 g)", 200]]],
  ["potato-baked", "Potato, baked", "vegetable", [93, 2.5, 21, 0.1, 2.2, 1.2, 10], [["1 medium (173 g)", 173]]],
  ["french-fries", "French Fries", "vegetable", [312, 3.4, 41, 15, 3.8, 0.3, 210], [["1 medium serving (117 g)", 117], ["10 fries (70 g)", 70]]],
  ["onion", "Onion", "vegetable", [40, 1.1, 9.3, 0.1, 1.7, 4.2, 4], [["1/2 cup chopped (80 g)", 80]]],
  ["mushrooms", "Mushrooms, white", "vegetable", [22, 3.1, 3.3, 0.3, 1, 2, 5], [["1 cup sliced (70 g)", 70]]],
  ["zucchini", "Zucchini, cooked", "vegetable", [17, 1.2, 3.1, 0.3, 1, 2.5, 8], [["1 cup (180 g)", 180]]],
  ["green-beans", "Green Beans, cooked", "vegetable", [35, 1.9, 7.9, 0.3, 3.2, 3.3, 1], [["1 cup (125 g)", 125]]],
  ["asparagus", "Asparagus, cooked", "vegetable", [22, 2.4, 4.1, 0.2, 2, 1.3, 14], [["6 spears (90 g)", 90]]],
  ["cauliflower", "Cauliflower", "vegetable", [25, 1.9, 5, 0.3, 2, 1.9, 30], [["1 cup (107 g)", 107]]],
  ["corn", "Corn, sweet", "vegetable", [96, 3.4, 21, 1.5, 2.4, 4.5, 15], [["1 ear (90 g)", 90], ["1 cup (164 g)", 164]]],
  ["peas", "Green Peas", "vegetable", [81, 5.4, 14, 0.4, 5.7, 5.7, 5], [["1 cup (160 g)", 160]]],
  ["avocado", "Avocado", "fruit", [160, 2, 8.5, 15, 6.7, 0.7, 7], [["1/2 avocado (68 g)", 68], ["1 whole (136 g)", 136]]],

  // ------------------------------------------------------------------ fruit
  ["banana", "Banana", "fruit", [89, 1.1, 23, 0.3, 2.6, 12, 1], [["1 medium (118 g)", 118], ["1 large (136 g)", 136]]],
  ["apple", "Apple", "fruit", [52, 0.3, 14, 0.2, 2.4, 10, 1], [["1 medium (182 g)", 182], ["1 small (149 g)", 149]]],
  ["orange", "Orange", "fruit", [47, 0.9, 12, 0.1, 2.4, 9, 0], [["1 medium (131 g)", 131]]],
  ["strawberries", "Strawberries", "fruit", [32, 0.7, 7.7, 0.3, 2, 4.9, 1], [["1 cup (152 g)", 152], ["1/2 cup (76 g)", 76]]],
  ["blueberries", "Blueberries", "fruit", [57, 0.7, 14, 0.3, 2.4, 10, 1], [["1 cup (148 g)", 148], ["1/2 cup (74 g)", 74]]],
  ["grapes", "Grapes", "fruit", [69, 0.7, 18, 0.2, 0.9, 16, 2], [["1 cup (151 g)", 151]]],
  ["mango", "Mango", "fruit", [60, 0.8, 15, 0.4, 1.6, 14, 1], [["1 cup diced (165 g)", 165]]],
  ["pineapple", "Pineapple", "fruit", [50, 0.5, 13, 0.1, 1.4, 10, 1], [["1 cup chunks (165 g)", 165]]],
  ["watermelon", "Watermelon", "fruit", [30, 0.6, 7.6, 0.2, 0.4, 6.2, 1], [["1 cup diced (152 g)", 152]]],
  ["raspberries", "Raspberries", "fruit", [52, 1.2, 12, 0.7, 6.5, 4.4, 1], [["1 cup (123 g)", 123]]],
  ["peach", "Peach", "fruit", [39, 0.9, 10, 0.3, 1.5, 8.4, 0], [["1 medium (150 g)", 150]]],
  ["pear", "Pear", "fruit", [57, 0.4, 15, 0.1, 3.1, 9.8, 1], [["1 medium (178 g)", 178]]],
  ["cherries", "Cherries", "fruit", [63, 1.1, 16, 0.2, 2.1, 13, 0], [["1 cup (154 g)", 154]]],
  ["kiwi", "Kiwi", "fruit", [61, 1.1, 15, 0.5, 3, 9, 3], [["1 medium (69 g)", 69]]],
  ["dates", "Medjool Dates", "fruit", [277, 1.8, 75, 0.2, 6.7, 66, 1], [["1 date (24 g)", 24], ["3 dates (72 g)", 72]]],
  ["raisins", "Raisins", "fruit", [299, 3.1, 79, 0.5, 3.7, 59, 11], [["1/4 cup (40 g)", 40]]],

  // ------------------------------------------------------------------ dairy
  ["milk-whole", "Milk, whole", "dairy", [61, 3.2, 4.8, 3.3, 0, 5.1, 43], [["1 cup (244 g)", 244], ["1/2 cup (122 g)", 122]]],
  ["milk-2", "Milk, 2%", "dairy", [50, 3.3, 4.8, 2, 0, 5.1, 47], [["1 cup (244 g)", 244]]],
  ["milk-skim", "Milk, skim", "dairy", [34, 3.4, 5, 0.1, 0, 5.1, 42], [["1 cup (245 g)", 245]]],
  ["almond-milk", "Almond Milk, unsweetened", "dairy", [15, 0.6, 0.6, 1.2, 0.3, 0, 72], [["1 cup (240 g)", 240]]],
  ["oat-milk", "Oat Milk", "dairy", [47, 1, 7.5, 1.5, 0.8, 4, 42], [["1 cup (240 g)", 240]]],
  ["greek-yogurt-nonfat", "Greek Yogurt, plain nonfat", "dairy", [59, 10, 3.6, 0.4, 0, 3.2, 36], [["1 container (170 g)", 170], ["1 cup (245 g)", 245]]],
  ["greek-yogurt-vanilla", "Greek Yogurt, vanilla lowfat", "dairy", [95, 8.5, 13, 1.5, 0, 12, 45], [["1 container (150 g)", 150]]],
  ["yogurt-whole", "Yogurt, plain whole milk", "dairy", [61, 3.5, 4.7, 3.3, 0, 4.7, 46], [["1 cup (245 g)", 245]]],
  ["cheddar", "Cheddar Cheese", "dairy", [403, 25, 1.3, 33, 0, 0.5, 621], [["1 slice (28 g)", 28], ["1 cup shredded (113 g)", 113]]],
  ["mozzarella", "Mozzarella Cheese", "dairy", [300, 22, 2.2, 22, 0, 1, 627], [["1 slice (28 g)", 28], ["2 slices (56 g)", 56]]],
  ["parmesan", "Parmesan Cheese, grated", "dairy", [420, 38, 4.1, 28, 0, 0.9, 1600], [["1 tbsp (5 g)", 5], ["1/4 cup (20 g)", 20]]],
  ["cottage-cheese", "Cottage Cheese, 2%", "dairy", [84, 11, 4.3, 2.3, 0, 4.1, 330], [["1/2 cup (113 g)", 113], ["1 cup (226 g)", 226]]],
  ["cream-cheese", "Cream Cheese", "dairy", [342, 6, 5.5, 34, 0, 3.8, 314], [["1 tbsp (14 g)", 14], ["2 tbsp (28 g)", 28]]],
  ["butter", "Butter", "dairy", [717, 0.9, 0.1, 81, 0, 0.1, 643], [["1 tbsp (14 g)", 14], ["1 tsp (5 g)", 5]]],
  ["feta", "Feta Cheese", "dairy", [264, 14, 4.1, 21, 0, 4.1, 1116], [["1/4 cup crumbled (38 g)", 38]]],
  ["ice-cream", "Ice Cream, vanilla", "dairy", [207, 3.5, 24, 11, 0.7, 21, 80], [["1/2 cup (66 g)", 66], ["1 cup (132 g)", 132]]],

  // ------------------------------------------------------------------ snack
  ["almonds", "Almonds", "snack", [579, 21, 22, 50, 12.5, 4.4, 1], [["1 oz (28 g)", 28], ["1/4 cup (35 g)", 35]]],
  ["peanut-butter", "Peanut Butter", "snack", [588, 25, 20, 50, 6, 9, 429], [["2 tbsp (32 g)", 32], ["1 tbsp (16 g)", 16]]],
  ["peanuts", "Peanuts, roasted", "snack", [567, 26, 16, 49, 8.5, 4.7, 18], [["1 oz (28 g)", 28]]],
  ["walnuts", "Walnuts", "snack", [654, 15, 14, 65, 6.7, 2.6, 2], [["1 oz (28 g)", 28]]],
  ["cashews", "Cashews", "snack", [553, 18, 30, 44, 3.3, 5.9, 12], [["1 oz (28 g)", 28]]],
  ["potato-chips", "Potato Chips", "snack", [536, 7, 53, 34, 4.4, 0.3, 525], [["1 oz (28 g)", 28], ["small bag (43 g)", 43]]],
  ["tortilla-chips", "Tortilla Chips", "snack", [489, 7, 63, 23, 5, 1.5, 400], [["1 oz (28 g)", 28]]],
  ["popcorn", "Popcorn, air popped", "snack", [387, 13, 78, 4.5, 15, 0.9, 8], [["3 cups (24 g)", 24]]],
  ["dark-chocolate", "Dark Chocolate, 70%", "snack", [598, 7.8, 46, 43, 11, 24, 20], [["1 square (10 g)", 10], ["1 oz (28 g)", 28]]],
  ["milk-chocolate", "Milk Chocolate", "snack", [535, 7.6, 59, 30, 3.4, 52, 79], [["1 bar (43 g)", 43]]],
  ["choc-chip-cookie", "Chocolate Chip Cookie", "snack", [488, 5.1, 64, 24, 2.4, 35, 350], [["1 cookie (30 g)", 30]]],
  ["protein-bar", "Protein Bar", "snack", [371, 30, 40, 11, 9, 3, 200], [["1 bar (60 g)", 60]]],
  ["granola-bar", "Granola Bar", "snack", [471, 8, 64, 20, 5, 27, 265], [["1 bar (40 g)", 40]]],
  ["trail-mix", "Trail Mix", "snack", [462, 13, 45, 29, 5, 30, 210], [["1/4 cup (35 g)", 35]]],
  ["hummus", "Hummus", "snack", [166, 7.9, 14, 9.6, 6, 0.3, 379], [["2 tbsp (30 g)", 30], ["1/4 cup (60 g)", 60]]],
  ["pretzels", "Pretzels", "snack", [384, 10, 80, 3, 3, 2.2, 1240], [["1 oz (28 g)", 28]]],

  // --------------------------------------------------------------- beverage
  ["coffee-black", "Coffee, black", "beverage", [2, 0.3, 0, 0, 0, 0, 5], [["1 cup (237 g)", 237], ["16 oz (473 g)", 473]]],
  ["latte-2", "Caffe Latte, 2% milk", "beverage", [44, 2.4, 4.3, 1.7, 0, 4.3, 40], [["grande 16 oz (473 g)", 473], ["tall 12 oz (355 g)", 355]], "Starbucks"],
  ["orange-juice", "Orange Juice", "beverage", [45, 0.7, 10, 0.2, 0.2, 8.4, 1], [["1 cup (248 g)", 248]]],
  ["coca-cola", "Coca-Cola", "beverage", [42, 0, 10.6, 0, 0, 10.6, 4], [["1 can (355 g)", 355], ["1 bottle (591 g)", 591]], "Coca-Cola"],
  ["diet-coke", "Diet Coke", "beverage", [0.4, 0, 0.1, 0, 0, 0, 4], [["1 can (355 g)", 355]], "Coca-Cola"],
  ["beer", "Beer, regular", "beverage", [43, 0.5, 3.6, 0, 0, 0, 4], [["1 can 12 oz (356 g)", 356]]],
  ["red-wine", "Red Wine", "beverage", [85, 0.1, 2.6, 0, 0, 0.6, 4], [["1 glass 5 oz (147 g)", 147]]],
  ["sports-drink", "Sports Drink", "beverage", [26, 0, 6.7, 0, 0, 6.3, 41], [["20 oz (591 g)", 591]]],
  ["green-tea", "Green Tea, unsweetened", "beverage", [1, 0, 0.2, 0, 0, 0, 1], [["1 cup (245 g)", 245]]],
  ["protein-shake", "Protein Shake, ready to drink", "beverage", [42, 6.7, 1.7, 0.8, 0.4, 0.4, 83], [["1 bottle (325 g)", 325]]],

  // -------------------------------------------------------------- condiment
  ["olive-oil", "Olive Oil", "condiment", [884, 0, 0, 100, 0, 0, 2], [["1 tbsp (14 g)", 14], ["1 tsp (5 g)", 5]]],
  ["mayonnaise", "Mayonnaise", "condiment", [680, 1, 0.6, 75, 0, 0.6, 635], [["1 tbsp (14 g)", 14]]],
  ["ketchup", "Ketchup", "condiment", [101, 1.2, 26, 0.1, 0.3, 21, 907], [["1 tbsp (17 g)", 17]]],
  ["mustard", "Mustard", "condiment", [66, 4, 6, 3.3, 3.3, 1, 1104], [["1 tsp (5 g)", 5]]],
  ["ranch", "Ranch Dressing", "condiment", [430, 1.3, 6.7, 45, 0, 4.7, 1000], [["2 tbsp (30 g)", 30]]],
  ["soy-sauce", "Soy Sauce", "condiment", [53, 8, 4.9, 0.1, 0.8, 0.4, 5493], [["1 tbsp (16 g)", 16]]],
  ["honey", "Honey", "condiment", [304, 0.3, 82, 0, 0.2, 82, 4], [["1 tbsp (21 g)", 21]]],
  ["maple-syrup", "Maple Syrup", "condiment", [260, 0, 67, 0.1, 0, 60, 12], [["1 tbsp (20 g)", 20], ["1/4 cup (80 g)", 80]]],
  ["pesto", "Pesto", "condiment", [450, 5, 6, 45, 2, 2, 850], [["1 tablespoon (16 g)", 16], ["1/4 cup (64 g)", 64]]],
  ["sriracha", "Sriracha", "condiment", [93, 1.9, 19, 0.9, 2.4, 15, 2124], [["1 tsp (5 g)", 5]]],
  ["salsa", "Salsa", "condiment", [36, 1.5, 7, 0.2, 1.8, 4, 430], [["2 tbsp (32 g)", 32]]],
  ["balsamic-vinaigrette", "Balsamic Vinaigrette", "condiment", [300, 0.4, 12, 28, 0, 10, 750], [["2 tbsp (31 g)", 31]]],

  // --------------------------------------------------------------- prepared
  ["pizza-cheese", "Cheese Pizza", "prepared", [266, 11, 33, 10, 2.3, 3.6, 598], [["1 slice (107 g)", 107], ["2 slices (214 g)", 214]]],
  ["pizza-pepperoni", "Pepperoni Pizza", "prepared", [298, 13, 34, 12, 2.3, 3.9, 683], [["1 slice (111 g)", 111]]],
  ["cheeseburger", "Cheeseburger", "prepared", [250, 13, 21, 12, 1.4, 4.5, 500], [["1 burger (154 g)", 154]]],
  ["caesar-salad-chicken", "Chicken Caesar Salad", "prepared", [190, 12, 5, 14, 1.5, 2, 480], [["1 salad (300 g)", 300]]],
  ["burrito-chicken", "Chicken Burrito", "prepared", [206, 11, 25, 6.5, 2.5, 1.7, 470], [["1 burrito (330 g)", 330]]],
  ["california-roll", "California Roll", "prepared", [145, 5, 27, 2, 2, 5, 350], [["6 pieces (170 g)", 170]]],
  ["pad-thai", "Pad Thai", "prepared", [181, 8, 24, 6, 1.6, 6, 550], [["1 plate (350 g)", 350]]],
  ["fried-rice", "Fried Rice", "prepared", [163, 5.5, 22, 5.5, 1, 1.5, 480], [["1 cup (198 g)", 198]]],
  ["mac-and-cheese", "Macaroni and Cheese", "prepared", [164, 6.4, 20, 6.4, 1, 3.5, 440], [["1 cup (198 g)", 198]]],
  ["chicken-noodle-soup", "Chicken Noodle Soup", "prepared", [36, 2, 4.2, 1.1, 0.4, 0.5, 340], [["1 cup (241 g)", 241]]],
  ["chili", "Chili con Carne", "prepared", [121, 8.5, 10, 5.4, 3, 2.7, 380], [["1 cup (253 g)", 253]]],
  ["grilled-cheese", "Grilled Cheese Sandwich", "prepared", [350, 13, 30, 20, 1.6, 4, 800], [["1 sandwich (120 g)", 120]]],
  ["pancakes", "Pancakes", "prepared", [227, 6.4, 28, 9.7, 0.9, 6, 439], [["1 pancake (77 g)", 77], ["3 pancakes (231 g)", 231]]],
  ["scrambled-eggs", "Scrambled Eggs", "prepared", [149, 10, 1.6, 11, 0, 1.4, 145], [["2 eggs (122 g)", 122]]],
  ["omelette-cheese", "Cheese Omelette", "prepared", [180, 12, 1.5, 14, 0, 1.2, 300], [["1 omelette (180 g)", 180]]],
  ["lasagna", "Lasagna", "prepared", [132, 8, 11, 6, 1.2, 3, 380], [["1 serving (250 g)", 250]]],
  ["ramen-instant", "Instant Ramen", "prepared", [448, 10, 63, 17, 3, 2, 1730], [["1 package (85 g)", 85]]],
  ["overnight-oats", "Overnight Oats with berries", "prepared", [128, 4.5, 20, 3.4, 3, 7, 40], [["1 jar (300 g)", 300]]],
  ["smoothie-berry", "Berry Smoothie", "prepared", [63, 1.6, 13, 0.8, 1.8, 9, 25], [["16 oz (473 g)", 473]]],

  // ------------------------------------------------------------- restaurant
  ["mcd-big-mac", "Big Mac", "restaurant", [257, 13, 20, 14, 1.4, 4.1, 466], [["1 burger (219 g)", 219]], "McDonald's"],
  ["mcd-fries-med", "Medium French Fries", "restaurant", [323, 3.4, 43, 15, 3.8, 0.3, 260], [["1 medium (111 g)", 111]], "McDonald's"],
  ["mcd-mcchicken", "McChicken", "restaurant", [258, 13, 26, 11, 1.5, 4.6, 540], [["1 sandwich (143 g)", 143]], "McDonald's"],
  ["chipotle-bowl", "Chicken Burrito Bowl", "restaurant", [145, 10, 12, 5.5, 2, 1.5, 400], [["1 bowl (510 g)", 510]], "Chipotle"],
  ["subway-turkey-6", "6 inch Turkey Breast Sub", "restaurant", [152, 10, 24, 2.4, 1.6, 4, 640], [["1 sub (219 g)", 219]], "Subway"],
  ["cfa-chicken-sandwich", "Chicken Sandwich", "restaurant", [253, 15, 27, 9.4, 1.4, 3.5, 800], [["1 sandwich (174 g)", 174]], "Chick-fil-A"],
  ["kfc-breast", "Original Recipe Chicken Breast", "restaurant", [220, 25, 6.5, 11, 0.5, 0, 720], [["1 breast (161 g)", 161]], "KFC"],
  ["taco-bell-crunchy", "Crunchy Taco", "restaurant", [218, 10.3, 16.7, 12.8, 3.8, 1.3, 397], [["1 taco (78 g)", 78], ["3 tacos (234 g)", 234]], "Taco Bell"],
  ["starbucks-cold-brew", "Cold Brew, black", "restaurant", [1, 0.1, 0.2, 0, 0, 0, 3], [["grande 16 oz (473 g)", 473]], "Starbucks"],
  ["panera-greek-salad", "Greek Salad", "restaurant", [128, 3.5, 6.5, 10, 2.5, 3.5, 520], [["1 salad (283 g)", 283]], "Panera"]
];

export const foodDatabase: DatabaseFood[] = build(rows);

export const foodsById = new Map(foodDatabase.map((food) => [food.id, food]));

export function getFoodById(id: string): DatabaseFood | undefined {
  return foodsById.get(id);
}

/** Barcode scans resolve through the same table so lookups stay offline. */
export function getFoodByBarcode(barcode: string): DatabaseFood | undefined {
  return foodDatabase.find((food) => food.barcode === barcode);
}
