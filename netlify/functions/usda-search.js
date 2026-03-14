// Netlify Function to search Edamam Food Database API
// With fallback to local branded foods database

const EDAMAM_API_URL = 'https://api.edamam.com/api/food-database/v2/parser';

// Local fallback database for common fitness foods (subset)
const LOCAL_FOODS = {
  'chicken_breast': { name: 'Chicken Breast', cal: 165, protein: 31, carbs: 0, fat: 4, per: '100g', grams: 100 },
  'ground_beef_93': { name: 'Ground Beef 93% Lean', cal: 164, protein: 22, carbs: 0, fat: 7, per: '100g', grams: 100 },
  'salmon': { name: 'Salmon', cal: 177, protein: 20, carbs: 0, fat: 11, per: '100g', grams: 100 },
  'egg_large': { name: 'Large Egg', cal: 70, protein: 6, carbs: 0, fat: 5, per: '1 large egg (50g)', grams: 50 },
  'rice_white': { name: 'White Rice (cooked)', cal: 130, protein: 2.7, carbs: 28, fat: 0.3, per: '100g', grams: 100 },
  'rice_brown': { name: 'Brown Rice (cooked)', cal: 112, protein: 2.6, carbs: 24, fat: 0.9, per: '100g', grams: 100 },
  'oatmeal': { name: 'Oatmeal (cooked)', cal: 68, protein: 2.5, carbs: 12, fat: 1.4, per: '100g', grams: 100 },
  'broccoli': { name: 'Broccoli', cal: 34, protein: 2.8, carbs: 7, fat: 0.4, per: '100g', grams: 100 },
  'sweet_potato': { name: 'Sweet Potato', cal: 86, protein: 1.6, carbs: 20, fat: 0.1, per: '100g', grams: 100 },
  'avocado': { name: 'Avocado', cal: 160, protein: 2, carbs: 9, fat: 15, per: '100g', grams: 100 },
  // Branded fitness foods
  'quest_bar_original': { name: 'Quest Bar (Original)', cal: 200, protein: 21, carbs: 21, fat: 8, per: '1 bar (60g)', grams: 60, brand: 'Quest' },
  'quest_bar_chocolate': { name: 'Quest Bar Chocolate Chip Cookie Dough', cal: 200, protein: 21, carbs: 22, fat: 8, per: '1 bar (60g)', grams: 60, brand: 'Quest' },
  'rxbar_chocolate': { name: 'RXBar Chocolate Sea Salt', cal: 210, protein: 12, carbs: 24, fat: 9, per: '1 bar (52g)', grams: 52, brand: 'RXBar' },
  'premier_protein_chocolate': { name: 'Premier Protein Chocolate Shake', cal: 160, protein: 30, carbs: 5, fat: 3, per: '1 bottle (11.5 fl oz)', grams: 340, brand: 'Premier Protein' },
  'premier_protein_vanilla': { name: 'Premier Protein Vanilla Shake', cal: 160, protein: 30, carbs: 4, fat: 3, per: '1 bottle (11.5 fl oz)', grams: 340, brand: 'Premier Protein' },
  'fairlife_chocolate': { name: 'Fairlife Chocolate Protein Shake', cal: 150, protein: 30, carbs: 3, fat: 2.5, per: '1 bottle (11.5 fl oz)', grams: 340, brand: 'Fairlife' },
  'fairlife_vanilla': { name: 'Fairlife Vanilla Protein Shake', cal: 150, protein: 30, carbs: 3, fat: 2.5, per: '1 bottle (11.5 fl oz)', grams: 340, brand: 'Fairlife' },
  'oikos_triple_zero_vanilla': { name: 'Oikos Triple Zero Vanilla', cal: 100, protein: 15, carbs: 7, fat: 0, per: '1 container (5.3 oz)', grams: 150, brand: 'Oikos' },
  'oikos_triple_zero_strawberry': { name: 'Oikos Triple Zero Strawberry', cal: 100, protein: 15, carbs: 8, fat: 0, per: '1 container (5.3 oz)', grams: 150, brand: 'Oikos' },
  'chobani_zero_sugar': { name: 'Chobani Zero Sugar Vanilla', cal: 60, protein: 10, carbs: 5, fat: 0, per: '1 container (5.3 oz)', grams: 150, brand: 'Chobani' },
  'greek_yogurt_nonfat': { name: 'Greek Yogurt (Nonfat)', cal: 59, protein: 10, carbs: 4, fat: 0, per: '100g', grams: 100 },
  'halo_top_vanilla': { name: 'Halo Top Vanilla Bean', cal: 280, protein: 20, carbs: 44, fat: 8, per: '1 pint (473ml)', grams: 473, brand: 'Halo Top' },
  'halo_top_chocolate': { name: 'Halo Top Chocolate', cal: 280, protein: 20, carbs: 48, fat: 8, per: '1 pint (473ml)', grams: 473, brand: 'Halo Top' },
  'kodiak_cakes_mix': { name: 'Kodiak Cakes Power Cakes Mix', cal: 190, protein: 14, carbs: 30, fat: 3, per: '0.5 cup dry (53g)', grams: 53, brand: 'Kodiak Cakes' },
  'daves_killer_bread_21grain': { name: "Dave's Killer Bread 21 Grain", cal: 110, protein: 5, carbs: 22, fat: 1.5, per: '1 slice (45g)', grams: 45, brand: "Dave's Killer Bread" },
  'ezekiel_bread': { name: 'Ezekiel 4:9 Sprouted Bread', cal: 80, protein: 5, carbs: 15, fat: 0.5, per: '1 slice (34g)', grams: 34, brand: 'Ezekiel' },
  'chomps_original': { name: 'Chomps Original Beef Stick', cal: 100, protein: 10, carbs: 0, fat: 7, per: '1 stick (1.15 oz)', grams: 32, brand: 'Chomps' },
  'built_bar_coconut': { name: 'Built Bar Coconut', cal: 130, protein: 17, carbs: 15, fat: 3, per: '1 bar (49g)', grams: 49, brand: 'Built Bar' },
  'muscle_milk_chocolate': { name: 'Muscle Milk Chocolate Shake', cal: 160, protein: 25, carbs: 9, fat: 3, per: '1 bottle (14 fl oz)', grams: 414, brand: 'Muscle Milk' },
  'core_power_chocolate': { name: 'Core Power Elite Chocolate', cal: 230, protein: 42, carbs: 8, fat: 4, per: '1 bottle (14 fl oz)', grams: 414, brand: 'Core Power' },
  'pbfit_powder': { name: 'PBfit Peanut Butter Powder', cal: 70, protein: 8, carbs: 5, fat: 2, per: '2 tbsp (16g)', grams: 16, brand: 'PBfit' },
  'pb2_powder': { name: 'PB2 Powdered Peanut Butter', cal: 60, protein: 5, carbs: 5, fat: 1.5, per: '2 tbsp (12g)', grams: 12, brand: 'PB2' },
  'siggis_vanilla': { name: "Siggi's Vanilla Skyr", cal: 100, protein: 15, carbs: 8, fat: 0, per: '1 container (5.3 oz)', grams: 150, brand: "Siggi's" },
  'fage_0_percent': { name: 'Fage Total 0%', cal: 90, protein: 18, carbs: 5, fat: 0, per: '1 container (6 oz)', grams: 170, brand: 'Fage' },
  'two_good_vanilla': { name: 'Two Good Vanilla Greek Yogurt', cal: 80, protein: 12, carbs: 3, fat: 2, per: '1 container (5.3 oz)', grams: 150, brand: 'Two Good' },
  'barebells_cookies_cream': { name: 'Barebells Cookies & Cream Bar', cal: 200, protein: 20, carbs: 18, fat: 8, per: '1 bar (55g)', grams: 55, brand: 'Barebells' },
  'one_bar_birthday_cake': { name: 'ONE Bar Birthday Cake', cal: 220, protein: 20, carbs: 24, fat: 8, per: '1 bar (60g)', grams: 60, brand: 'ONE' },
  'think_thin_brownie': { name: 'Think! High Protein Brownie Crunch', cal: 230, protein: 20, carbs: 24, fat: 8, per: '1 bar (60g)', grams: 60, brand: 'Think!' },
  'kind_protein_crunchy': { name: 'KIND Protein Crunchy Peanut Butter', cal: 250, protein: 12, carbs: 17, fat: 17, per: '1 bar (50g)', grams: 50, brand: 'KIND' },
  'smart_sweets_gummy_bears': { name: 'Smart Sweets Gummy Bears', cal: 80, protein: 0, carbs: 32, fat: 0, per: '1 bag (1.8 oz)', grams: 50, brand: 'Smart Sweets' },
  'enlightened_ice_cream': { name: 'Enlightened Chocolate Peanut Butter', cal: 280, protein: 24, carbs: 36, fat: 7, per: '1 pint', grams: 473, brand: 'Enlightened' },
  'almond_butter': { name: 'Almond Butter', cal: 98, protein: 3.4, carbs: 3, fat: 9, per: '1 tbsp (16g)', grams: 16 },
  'peanut_butter': { name: 'Peanut Butter', cal: 94, protein: 4, carbs: 3, fat: 8, per: '1 tbsp (16g)', grams: 16 },
  'banana': { name: 'Banana', cal: 105, protein: 1.3, carbs: 27, fat: 0.4, per: '1 medium (118g)', grams: 118 },
  'apple': { name: 'Apple', cal: 95, protein: 0.5, carbs: 25, fat: 0.3, per: '1 medium (182g)', grams: 182 },
  'blueberries': { name: 'Blueberries', cal: 84, protein: 1.1, carbs: 21, fat: 0.5, per: '1 cup (148g)', grams: 148 },
  'strawberries': { name: 'Strawberries', cal: 49, protein: 1, carbs: 12, fat: 0.5, per: '1 cup (152g)', grams: 152 },
  'almonds': { name: 'Almonds', cal: 164, protein: 6, carbs: 6, fat: 14, per: '1 oz (28g)', grams: 28 },
  'cashews': { name: 'Cashews', cal: 157, protein: 5, carbs: 9, fat: 12, per: '1 oz (28g)', grams: 28 },
  'cottage_cheese': { name: 'Cottage Cheese (Low Fat)', cal: 163, protein: 28, carbs: 6, fat: 2.3, per: '1 cup (226g)', grams: 226 },
  'tuna_canned_water': { name: 'Tuna (canned in water)', cal: 116, protein: 26, carbs: 0, fat: 1, per: '100g', grams: 100 },
  'turkey_breast': { name: 'Turkey Breast', cal: 135, protein: 30, carbs: 0, fat: 1, per: '100g', grams: 100 },
  'shrimp': { name: 'Shrimp', cal: 106, protein: 23, carbs: 1, fat: 1, per: '100g', grams: 100 },
  'tilapia': { name: 'Tilapia', cal: 128, protein: 26, carbs: 0, fat: 3, per: '100g', grams: 100 },
  'cod': { name: 'Cod', cal: 82, protein: 18, carbs: 0, fat: 1, per: '100g', grams: 100 },
  'quinoa': { name: 'Quinoa (cooked)', cal: 222, protein: 8, carbs: 39, fat: 3.5, per: '1 cup (185g)', grams: 185 },
  'pasta': { name: 'Pasta (cooked)', cal: 220, protein: 8, carbs: 43, fat: 1.3, per: '1 cup (140g)', grams: 140 },
  'bread_whole_wheat': { name: 'Whole Wheat Bread', cal: 81, protein: 4, carbs: 14, fat: 1, per: '1 slice (32g)', grams: 32 },
  'tortilla_flour': { name: 'Flour Tortilla', cal: 150, protein: 4, carbs: 26, fat: 3.5, per: '1 tortilla (45g)', grams: 45 },
  'olive_oil': { name: 'Olive Oil', cal: 119, protein: 0, carbs: 0, fat: 14, per: '1 tbsp (14ml)', grams: 14 },
  'coconut_oil': { name: 'Coconut Oil', cal: 121, protein: 0, carbs: 0, fat: 14, per: '1 tbsp (14ml)', grams: 14 },
  'protein_powder_whey': { name: 'Whey Protein Powder (generic)', cal: 120, protein: 24, carbs: 3, fat: 1.5, per: '1 scoop (32g)', grams: 32 },
  // Prepared / restaurant foods
  'dumpling_steamed_pork': { name: 'Pork Dumplings (steamed)', cal: 50, protein: 2.5, carbs: 5, fat: 2, per: '1 piece (30g)', grams: 30 },
  'dumpling_steamed_shrimp': { name: 'Shrimp Dumplings (steamed)', cal: 45, protein: 3, carbs: 4.5, fat: 1.5, per: '1 piece (28g)', grams: 28 },
  'dumpling_fried': { name: 'Fried Dumplings / Potstickers', cal: 70, protein: 3, carbs: 7, fat: 3.5, per: '1 piece (30g)', grams: 30 },
  'gyoza': { name: 'Gyoza (pan-fried)', cal: 65, protein: 2.5, carbs: 7, fat: 3, per: '1 piece (28g)', grams: 28 },
  'sushi_california_roll': { name: 'California Roll', cal: 255, protein: 9, carbs: 38, fat: 7, per: '6 pieces (180g)', grams: 180 },
  'sushi_salmon_nigiri': { name: 'Salmon Nigiri', cal: 60, protein: 4, carbs: 8, fat: 1, per: '1 piece (40g)', grams: 40 },
  'sushi_tuna_roll': { name: 'Tuna Roll', cal: 200, protein: 12, carbs: 30, fat: 3, per: '6 pieces (160g)', grams: 160 },
  'pizza_cheese': { name: 'Pizza (Cheese)', cal: 270, protein: 12, carbs: 34, fat: 10, per: '1 slice (107g)', grams: 107 },
  'pizza_pepperoni': { name: 'Pizza (Pepperoni)', cal: 300, protein: 13, carbs: 34, fat: 13, per: '1 slice (113g)', grams: 113 },
  'burrito_chicken': { name: 'Chicken Burrito', cal: 580, protein: 32, carbs: 60, fat: 22, per: '1 burrito (350g)', grams: 350 },
  'taco_beef': { name: 'Beef Taco', cal: 210, protein: 10, carbs: 21, fat: 10, per: '1 taco (100g)', grams: 100 },
  'fried_rice': { name: 'Fried Rice', cal: 228, protein: 5.5, carbs: 32, fat: 8.5, per: '1 cup (200g)', grams: 200 },
  'lo_mein': { name: 'Lo Mein (chicken)', cal: 310, protein: 14, carbs: 38, fat: 12, per: '1 cup (200g)', grams: 200 },
  'pad_thai': { name: 'Pad Thai (shrimp)', cal: 360, protein: 14, carbs: 46, fat: 14, per: '1 cup (200g)', grams: 200 },
  'spring_roll_fried': { name: 'Spring Roll (fried)', cal: 110, protein: 3, carbs: 13, fat: 5, per: '1 roll (64g)', grams: 64 },
  'mac_and_cheese': { name: 'Mac and Cheese', cal: 310, protein: 11, carbs: 30, fat: 17, per: '1 cup (200g)', grams: 200 },
  'cheeseburger': { name: 'Cheeseburger', cal: 530, protein: 28, carbs: 40, fat: 28, per: '1 burger (220g)', grams: 220 },
  'french_fries': { name: 'French Fries', cal: 365, protein: 4, carbs: 44, fat: 19, per: '1 medium serving (117g)', grams: 117 },
  'chicken_wings_buffalo': { name: 'Buffalo Chicken Wings', cal: 80, protein: 7, carbs: 0.5, fat: 5.5, per: '1 wing (32g)', grams: 32 },
  'chicken_nuggets': { name: 'Chicken Nuggets', cal: 48, protein: 2.5, carbs: 3, fat: 3, per: '1 piece (18g)', grams: 18 },
  'grilled_cheese': { name: 'Grilled Cheese Sandwich', cal: 440, protein: 18, carbs: 36, fat: 26, per: '1 sandwich (150g)', grams: 150 },
  'pho_beef': { name: 'Pho (beef)', cal: 350, protein: 24, carbs: 42, fat: 8, per: '1 bowl (600g)', grams: 600 },
  'ramen_pork': { name: 'Ramen (pork broth)', cal: 450, protein: 20, carbs: 55, fat: 16, per: '1 bowl (500g)', grams: 500 },
  'acai_bowl': { name: 'Acai Bowl', cal: 380, protein: 6, carbs: 62, fat: 12, per: '1 bowl (300g)', grams: 300 },
  // Ethnic / cultural foods
  'hummus': { name: 'Hummus', cal: 166, protein: 8, carbs: 14, fat: 10, per: '100g', grams: 100 },
  'falafel': { name: 'Falafel', cal: 57, protein: 2.3, carbs: 5, fat: 3.4, per: '1 piece (17g)', grams: 17 },
  'naan_bread': { name: 'Naan Bread', cal: 260, protein: 9, carbs: 45, fat: 5, per: '1 piece (90g)', grams: 90 },
  'samosa_vegetable': { name: 'Samosa (vegetable)', cal: 150, protein: 3, carbs: 18, fat: 7, per: '1 piece (70g)', grams: 70 },
  'empanada_beef': { name: 'Empanada (beef)', cal: 280, protein: 10, carbs: 26, fat: 15, per: '1 piece (130g)', grams: 130 },
  'chicken_tikka_masala': { name: 'Chicken Tikka Masala', cal: 300, protein: 22, carbs: 12, fat: 18, per: '1 cup (200g)', grams: 200 },
  'bibimbap': { name: 'Bibimbap', cal: 490, protein: 22, carbs: 70, fat: 14, per: '1 bowl (400g)', grams: 400 },
  'chicken_shawarma_wrap': { name: 'Chicken Shawarma (wrap)', cal: 520, protein: 30, carbs: 42, fat: 24, per: '1 wrap (250g)', grams: 250 },
  // Breakfast items
  'pancakes': { name: 'Pancakes', cal: 175, protein: 5, carbs: 25, fat: 6, per: '2 medium (150g)', grams: 150 },
  'waffle': { name: 'Waffle', cal: 218, protein: 6, carbs: 25, fat: 11, per: '1 waffle (75g)', grams: 75 },
  'french_toast': { name: 'French Toast', cal: 149, protein: 5, carbs: 16, fat: 7, per: '1 slice (65g)', grams: 65 },
  'breakfast_burrito': { name: 'Breakfast Burrito', cal: 450, protein: 20, carbs: 40, fat: 22, per: '1 burrito (250g)', grams: 250 },
  'bagel_plain': { name: 'Bagel (plain)', cal: 270, protein: 10, carbs: 53, fat: 1.5, per: '1 bagel (105g)', grams: 105 },
  'cream_cheese': { name: 'Cream Cheese', cal: 50, protein: 1, carbs: 1, fat: 5, per: '1 tbsp (15g)', grams: 15 },
  // Common snacks & beverages
  'popcorn_air_popped': { name: 'Popcorn (air-popped)', cal: 31, protein: 1, carbs: 6, fat: 0.4, per: '1 cup (8g)', grams: 8 },
  'trail_mix': { name: 'Trail Mix', cal: 175, protein: 5, carbs: 16, fat: 11, per: '1 oz (30g)', grams: 30 },
  'granola': { name: 'Granola', cal: 210, protein: 5, carbs: 28, fat: 9, per: '0.5 cup (45g)', grams: 45 },
  'orange_juice': { name: 'Orange Juice', cal: 112, protein: 2, carbs: 26, fat: 0.5, per: '1 cup (248ml)', grams: 248 },
  'latte_whole_milk': { name: 'Latte (whole milk)', cal: 190, protein: 10, carbs: 18, fat: 8, per: '1 grande (473ml)', grams: 473 },
  'latte_oat_milk': { name: 'Latte (oat milk)', cal: 170, protein: 5, carbs: 27, fat: 5, per: '1 grande (473ml)', grams: 473 },
  'smoothie_fruit_protein': { name: 'Smoothie (fruit, protein)', cal: 250, protein: 20, carbs: 35, fat: 3, per: '1 cup (300ml)', grams: 300 },
};

// Micronutrient estimates per 100g by food category (USDA-based)
function estimateMicronutrientsPer100g(key, name) {
  const lower = `${key} ${name}`.toLowerCase();
  // Meats/Poultry
  if (lower.includes('chicken') || lower.includes('turkey'))
    return { fiber: 0, sugar: 0, sodium: 70, potassium: 240, calcium: 12, iron: 0.6, vitaminC: 0, cholesterol: 85 };
  if (lower.includes('beef') || lower.includes('steak') || lower.includes('bison'))
    return { fiber: 0, sugar: 0, sodium: 60, potassium: 310, calcium: 12, iron: 2.3, vitaminC: 0, cholesterol: 73 };
  if (lower.includes('pork') || lower.includes('ham') || lower.includes('bacon'))
    return { fiber: 0, sugar: 0, sodium: 800, potassium: 280, calcium: 10, iron: 0.8, vitaminC: 0, cholesterol: 70 };
  if (lower.includes('jerky') || lower.includes('chomps'))
    return { fiber: 0, sugar: 3, sodium: 590, potassium: 200, calcium: 10, iron: 2, vitaminC: 0, cholesterol: 45 };
  // Seafood
  if (lower.includes('salmon'))
    return { fiber: 0, sugar: 0, sodium: 44, potassium: 363, calcium: 12, iron: 0.3, vitaminC: 0, cholesterol: 55 };
  if (lower.includes('tuna'))
    return { fiber: 0, sugar: 0, sodium: 247, potassium: 237, calcium: 11, iron: 1.3, vitaminC: 0, cholesterol: 42 };
  if (lower.includes('shrimp'))
    return { fiber: 0, sugar: 0, sodium: 119, potassium: 182, calcium: 64, iron: 0.5, vitaminC: 2, cholesterol: 189 };
  if (lower.includes('fish') || lower.includes('tilapia') || lower.includes('cod') || lower.includes('halibut') || lower.includes('mahi'))
    return { fiber: 0, sugar: 0, sodium: 50, potassium: 380, calcium: 15, iron: 0.5, vitaminC: 0, cholesterol: 50 };
  // Eggs
  if (lower.includes('egg'))
    return { fiber: 0, sugar: 0.4, sodium: 142, potassium: 138, calcium: 56, iron: 1.8, vitaminC: 0, cholesterol: 372 };
  // Dairy/Yogurt
  if (lower.includes('yogurt') || lower.includes('skyr') || lower.includes('oikos') || lower.includes('chobani') || lower.includes('fage') || lower.includes('siggis') || lower.includes('two_good'))
    return { fiber: 0, sugar: 4, sodium: 40, potassium: 140, calcium: 115, iron: 0.1, vitaminC: 0, cholesterol: 8 };
  if (lower.includes('cottage'))
    return { fiber: 0, sugar: 3, sodium: 364, potassium: 104, calcium: 83, iron: 0.1, vitaminC: 0, cholesterol: 17 };
  if (lower.includes('cheese') || lower.includes('cream_cheese'))
    return { fiber: 0, sugar: 1, sodium: 500, potassium: 80, calcium: 500, iron: 0.5, vitaminC: 0, cholesterol: 80 };
  if (lower.includes('milk') || lower.includes('latte') || lower.includes('fairlife'))
    return { fiber: 0, sugar: 5, sodium: 43, potassium: 132, calcium: 113, iron: 0, vitaminC: 0, cholesterol: 10 };
  if (lower.includes('halo top') || lower.includes('enlightened') || lower.includes('ice cream'))
    return { fiber: 3, sugar: 10, sodium: 100, potassium: 200, calcium: 150, iron: 0.5, vitaminC: 0, cholesterol: 20 };
  // Protein bars/shakes
  if (lower.includes('quest') || lower.includes('rxbar') || lower.includes('built') || lower.includes('barebells') || lower.includes('one_bar') || lower.includes('think') || lower.includes('kind') || lower.includes('larabar') || lower.includes('protein bar'))
    return { fiber: 14, sugar: 3, sodium: 200, potassium: 150, calcium: 150, iron: 2, vitaminC: 0, cholesterol: 10 };
  if (lower.includes('premier') || lower.includes('core_power') || lower.includes('muscle_milk') || lower.includes('protein shake') || lower.includes('whey') || lower.includes('protein_powder'))
    return { fiber: 0, sugar: 2, sodium: 250, potassium: 300, calcium: 350, iron: 1, vitaminC: 0, cholesterol: 20 };
  // Grains/Bread
  if (lower.includes('oat') || lower.includes('oatmeal') || lower.includes('kodiak'))
    return { fiber: 10, sugar: 1, sodium: 2, potassium: 360, calcium: 50, iron: 4, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('rice'))
    return { fiber: 1, sugar: 0.2, sodium: 3, potassium: 40, calcium: 10, iron: 0.8, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('quinoa'))
    return { fiber: 2.8, sugar: 0.9, sodium: 7, potassium: 172, calcium: 17, iron: 1.5, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('pasta') || lower.includes('noodle') || lower.includes('lo_mein'))
    return { fiber: 2.5, sugar: 0.5, sodium: 2, potassium: 44, calcium: 10, iron: 1.3, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('bread') || lower.includes('bagel') || lower.includes('ezekiel') || lower.includes('dave'))
    return { fiber: 6, sugar: 4, sodium: 400, potassium: 200, calcium: 100, iron: 2.5, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('tortilla') || lower.includes('wrap') || lower.includes('naan'))
    return { fiber: 3, sugar: 2, sodium: 400, potassium: 80, calcium: 80, iron: 2, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('pancake') || lower.includes('waffle') || lower.includes('french_toast'))
    return { fiber: 1.5, sugar: 5, sodium: 400, potassium: 100, calcium: 100, iron: 1.5, vitaminC: 0, cholesterol: 40 };
  // Vegetables
  if (lower.includes('broccoli') || lower.includes('cauliflower') || lower.includes('brussels'))
    return { fiber: 2.6, sugar: 2, sodium: 30, potassium: 300, calcium: 40, iron: 0.7, vitaminC: 70, cholesterol: 0 };
  if (lower.includes('sweet_potato'))
    return { fiber: 3, sugar: 4.2, sodium: 36, potassium: 337, calcium: 30, iron: 0.6, vitaminC: 2.4, cholesterol: 0 };
  if (lower.includes('avocado'))
    return { fiber: 6.7, sugar: 0.7, sodium: 7, potassium: 485, calcium: 12, iron: 0.6, vitaminC: 10, cholesterol: 0 };
  // Fruits
  if (lower.includes('banana'))
    return { fiber: 2.6, sugar: 12, sodium: 1, potassium: 358, calcium: 5, iron: 0.3, vitaminC: 8.7, cholesterol: 0 };
  if (lower.includes('apple'))
    return { fiber: 2.4, sugar: 10.4, sodium: 1, potassium: 107, calcium: 6, iron: 0.1, vitaminC: 4.6, cholesterol: 0 };
  if (lower.includes('blueberr'))
    return { fiber: 2.4, sugar: 10, sodium: 1, potassium: 77, calcium: 6, iron: 0.3, vitaminC: 9.7, cholesterol: 0 };
  if (lower.includes('strawberr'))
    return { fiber: 2, sugar: 4.9, sodium: 1, potassium: 153, calcium: 16, iron: 0.4, vitaminC: 58.8, cholesterol: 0 };
  if (lower.includes('orange'))
    return { fiber: 0.2, sugar: 8.4, sodium: 1, potassium: 200, calcium: 11, iron: 0.2, vitaminC: 50, cholesterol: 0 };
  // Nuts/Nut butters
  if (lower.includes('almond'))
    return { fiber: 12.5, sugar: 4, sodium: 1, potassium: 733, calcium: 269, iron: 3.7, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('peanut') || lower.includes('pb'))
    return { fiber: 5.7, sugar: 6, sodium: 136, potassium: 650, calcium: 54, iron: 1.7, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('cashew'))
    return { fiber: 3.3, sugar: 6, sodium: 12, potassium: 660, calcium: 37, iron: 6.7, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('trail_mix') || lower.includes('granola'))
    return { fiber: 4, sugar: 14, sodium: 100, potassium: 300, calcium: 50, iron: 2, vitaminC: 0, cholesterol: 0 };
  // Oils
  if (lower.includes('oil'))
    return { fiber: 0, sugar: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0, cholesterol: 0 };
  // Prepared/restaurant foods
  if (lower.includes('pizza'))
    return { fiber: 2, sugar: 3, sodium: 640, potassium: 170, calcium: 180, iron: 2, vitaminC: 2, cholesterol: 25 };
  if (lower.includes('burrito') || lower.includes('taco') || lower.includes('empanada'))
    return { fiber: 4, sugar: 2, sodium: 700, potassium: 300, calcium: 100, iron: 2.5, vitaminC: 3, cholesterol: 40 };
  if (lower.includes('burger') || lower.includes('cheeseburger'))
    return { fiber: 1.5, sugar: 5, sodium: 750, potassium: 250, calcium: 100, iron: 3, vitaminC: 1, cholesterol: 65 };
  if (lower.includes('fried_rice') || lower.includes('pad_thai') || lower.includes('bibimbap'))
    return { fiber: 2, sugar: 3, sodium: 800, potassium: 200, calcium: 40, iron: 1.5, vitaminC: 3, cholesterol: 30 };
  if (lower.includes('pho') || lower.includes('ramen') || lower.includes('soup'))
    return { fiber: 1, sugar: 2, sodium: 1200, potassium: 300, calcium: 30, iron: 2, vitaminC: 2, cholesterol: 25 };
  if (lower.includes('sushi') || lower.includes('dumpling') || lower.includes('gyoza') || lower.includes('spring_roll'))
    return { fiber: 1, sugar: 2, sodium: 500, potassium: 150, calcium: 20, iron: 1, vitaminC: 1, cholesterol: 20 };
  if (lower.includes('hummus') || lower.includes('falafel'))
    return { fiber: 6, sugar: 0.5, sodium: 400, potassium: 200, calcium: 40, iron: 2.5, vitaminC: 3, cholesterol: 0 };
  if (lower.includes('samosa'))
    return { fiber: 2, sugar: 1, sodium: 400, potassium: 200, calcium: 20, iron: 1.5, vitaminC: 3, cholesterol: 10 };
  if (lower.includes('tikka') || lower.includes('shawarma') || lower.includes('curry'))
    return { fiber: 2, sugar: 3, sodium: 600, potassium: 300, calcium: 40, iron: 2, vitaminC: 5, cholesterol: 50 };
  if (lower.includes('mac_and_cheese') || lower.includes('grilled_cheese'))
    return { fiber: 1, sugar: 3, sodium: 700, potassium: 150, calcium: 200, iron: 1.5, vitaminC: 0, cholesterol: 40 };
  if (lower.includes('nugget') || lower.includes('wing'))
    return { fiber: 0.5, sugar: 0.5, sodium: 500, potassium: 180, calcium: 15, iron: 0.8, vitaminC: 0, cholesterol: 60 };
  if (lower.includes('fries') || lower.includes('french'))
    return { fiber: 3, sugar: 0.3, sodium: 280, potassium: 500, calcium: 12, iron: 0.8, vitaminC: 5, cholesterol: 0 };
  if (lower.includes('acai'))
    return { fiber: 5, sugar: 20, sodium: 10, potassium: 300, calcium: 80, iron: 1, vitaminC: 15, cholesterol: 0 };
  if (lower.includes('smoothie'))
    return { fiber: 3, sugar: 20, sodium: 50, potassium: 400, calcium: 100, iron: 0.5, vitaminC: 30, cholesterol: 5 };
  if (lower.includes('popcorn'))
    return { fiber: 14.5, sugar: 0.9, sodium: 8, potassium: 329, calcium: 7, iron: 3.2, vitaminC: 0, cholesterol: 0 };
  if (lower.includes('smart_sweets') || lower.includes('candy') || lower.includes('chocolate') || lower.includes('lily'))
    return { fiber: 2, sugar: 30, sodium: 20, potassium: 50, calcium: 20, iron: 1, vitaminC: 0, cholesterol: 5 };
  // Default
  return { fiber: 1, sugar: 2, sodium: 200, potassium: 150, calcium: 30, iron: 1, vitaminC: 1, cholesterol: 15 };
}

// Parse serving label from "per" field - e.g., "1 large egg (50g)" -> "Large"
function parseServingLabel(perString, foodName) {
  if (!perString) return null;

  // Common patterns:
  // "1 large egg (50g)" -> "Large"
  // "1 bar (60g)" -> "Bar"
  // "1 bottle (11.5 fl oz)" -> "Bottle"
  // "1 cup (226g)" -> "Cup"
  // "1 slice (45g)" -> "Slice"
  // "1 scoop (32g)" -> "Scoop"
  // "1 medium (118g)" -> "Medium"
  // "1 tbsp (16g)" -> "Tbsp"
  // "100g" -> null (just grams)

  const lowerPer = perString.toLowerCase();

  // Check for egg-specific serving
  if (lowerPer.includes('egg') || foodName.toLowerCase().includes('egg')) {
    if (lowerPer.includes('large')) return 'Large Egg';
    if (lowerPer.includes('medium')) return 'Medium Egg';
    if (lowerPer.includes('small')) return 'Small Egg';
    return 'Egg';
  }

  // Match pattern: "1 X (Yg)" or "N X"
  const match = perString.match(/^\d+\.?\d*\s+(\w+(?:\s+\w+)?)/i);
  if (match) {
    const unit = match[1].toLowerCase();
    // Skip if it's just a unit of measure
    if (['g', 'gram', 'grams', 'ml', 'oz'].includes(unit)) return null;
    // Capitalize first letter
    return unit.charAt(0).toUpperCase() + unit.slice(1);
  }

  return null;
}

// Search local database - returns actual serving sizes
function searchLocalDatabase(query) {
  const searchTerms = query.toLowerCase().split(' ');
  const results = [];

  for (const [key, food] of Object.entries(LOCAL_FOODS)) {
    const searchText = `${key} ${food.name} ${food.brand || ''}`.toLowerCase();
    const matches = searchTerms.every(term => searchText.includes(term));

    if (matches) {
      const grams = food.grams || 100;

      // Build measures array with proper serving size
      const measures = [];
      const servingLabel = parseServingLabel(food.per, food.name);
      if (servingLabel && grams !== 100) {
        measures.push({
          label: servingLabel,
          weight: grams
        });
      }

      // Get micronutrient estimates for this food
      const micros = estimateMicronutrientsPer100g(key, food.name);
      const microFactor = grams / 100;

      results.push({
        fdcId: `local_${key}`,
        name: food.name,
        brand: food.brand || null,
        category: food.brand ? 'Branded Food' : 'Generic Food',
        // Per serving (as labeled)
        servingSize: food.per,
        servingGrams: grams,
        caloriesPerServing: food.cal,
        proteinPerServing: food.protein,
        carbsPerServing: food.carbs,
        fatPerServing: food.fat,
        fiberPerServing: Math.round(micros.fiber * microFactor * 10) / 10,
        sugarPerServing: Math.round(micros.sugar * microFactor * 10) / 10,
        sodiumPerServing: Math.round(micros.sodium * microFactor),
        potassiumPerServing: Math.round(micros.potassium * microFactor),
        calciumPerServing: Math.round(micros.calcium * microFactor),
        ironPerServing: Math.round(micros.iron * microFactor * 10) / 10,
        vitaminCPerServing: Math.round(micros.vitaminC * microFactor * 10) / 10,
        cholesterolPerServing: Math.round(micros.cholesterol * microFactor),
        // Per 100g (calculated)
        caloriesPer100g: Math.round(food.cal * 100 / grams),
        proteinPer100g: Math.round(food.protein * 100 / grams * 10) / 10,
        carbsPer100g: Math.round(food.carbs * 100 / grams * 10) / 10,
        fatPer100g: Math.round(food.fat * 100 / grams * 10) / 10,
        fiberPer100g: micros.fiber,
        sugarPer100g: micros.sugar,
        sodiumPer100g: micros.sodium,
        potassiumPer100g: micros.potassium,
        calciumPer100g: micros.calcium,
        ironPer100g: micros.iron,
        vitaminCPer100g: micros.vitaminC,
        cholesterolPer100g: micros.cholesterol,
        // Include measures array for UI dropdown
        measures: measures,
        source: 'local'
      });
    }
  }

  return results;
}

// Get best serving size from Edamam measures
function getBestServing(measures) {
  if (!measures || measures.length === 0) return null;

  // Priority order for serving types - includes egg sizes and common units
  const priority = ['large', 'whole', 'egg', 'medium', 'small', 'serving', 'container', 'package', 'bar', 'bottle', 'cup', 'piece', 'slice', 'tablespoon', 'ounce', 'gram'];

  for (const type of priority) {
    const measure = measures.find(m => m.label && m.label.toLowerCase().includes(type));
    if (measure) {
      return {
        label: measure.label,
        weight: measure.weight || 100
      };
    }
  }

  // Return first measure if no priority match
  return {
    label: measures[0].label,
    weight: measures[0].weight || 100
  };
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
  const EDAMAM_API_KEY = process.env.EDAMAM_API_KEY;

  const query = event.queryStringParameters?.query;

  if (!query || query.trim().length < 2) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Search query must be at least 2 characters' })
    };
  }

  // Always search local database first for curated, accurate results
  const localResults = searchLocalDatabase(query);

  // Track names already in local results to avoid duplicates
  const seenNames = new Set(localResults.map(r => r.name.toLowerCase()));

  // Also try Edamam if credentials are configured
  let edamamFoods = [];
  if (EDAMAM_APP_ID && EDAMAM_API_KEY) {
    try {
      const searchUrl = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_API_KEY}&ingr=${encodeURIComponent(query)}&nutrition-type=logging`;

      // Add 5-second timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Edamam API error ${response.status}:`, errorText);
        throw new Error(`Edamam API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Transform Edamam results - include measures for serving sizes
      const allFoods = [];
      if (data.parsed && data.parsed.length > 0) {
        data.parsed.forEach(item => {
          if (item.food) {
            allFoods.push({
              food: item.food,
              measures: item.measures || []
            });
          }
        });
      }
      if (data.hints && data.hints.length > 0) {
        data.hints.forEach(hint => {
          if (hint.food) {
            allFoods.push({
              food: hint.food,
              measures: hint.measures || []
            });
          }
        });
      }

      edamamFoods = allFoods.slice(0, 20).map(item => {
        const food = item.food;
        const nutrients = food.nutrients || {};
        const serving = getBestServing(item.measures);

        // Calculate per 100g - macros
        const calPer100g = Math.round(nutrients.ENERC_KCAL || 0);
        const proteinPer100g = Math.round((nutrients.PROCNT || 0) * 10) / 10;
        const carbsPer100g = Math.round((nutrients.CHOCDF || 0) * 10) / 10;
        const fatPer100g = Math.round((nutrients.FAT || 0) * 10) / 10;

        // Calculate per 100g - micronutrients
        const fiberPer100g = Math.round((nutrients.FIBTG || 0) * 10) / 10;
        const sugarPer100g = Math.round((nutrients.SUGAR || 0) * 10) / 10;
        const sodiumPer100g = Math.round(nutrients.NA || 0);
        const potassiumPer100g = Math.round(nutrients.K || 0);
        const calciumPer100g = Math.round(nutrients.CA || 0);
        const ironPer100g = Math.round((nutrients.FE || 0) * 10) / 10;
        const vitaminCPer100g = Math.round((nutrients.VITC || 0) * 10) / 10;
        const cholesterolPer100g = Math.round(nutrients.CHOLE || 0);

        // Calculate per serving if serving info available
        let servingInfo = null;
        if (serving && serving.weight) {
          const factor = serving.weight / 100;
          servingInfo = {
            servingSize: serving.label,
            servingGrams: Math.round(serving.weight),
            caloriesPerServing: Math.round(calPer100g * factor),
            proteinPerServing: Math.round(proteinPer100g * factor * 10) / 10,
            carbsPerServing: Math.round(carbsPer100g * factor * 10) / 10,
            fatPerServing: Math.round(fatPer100g * factor * 10) / 10,
            fiberPerServing: Math.round(fiberPer100g * factor * 10) / 10,
            sugarPerServing: Math.round(sugarPer100g * factor * 10) / 10,
            sodiumPerServing: Math.round(sodiumPer100g * factor),
            potassiumPerServing: Math.round(potassiumPer100g * factor),
            calciumPerServing: Math.round(calciumPer100g * factor),
            ironPerServing: Math.round(ironPer100g * factor * 10) / 10,
            vitaminCPerServing: Math.round(vitaminCPer100g * factor * 10) / 10,
            cholesterolPerServing: Math.round(cholesterolPer100g * factor)
          };
        }

        return {
          fdcId: food.foodId,
          name: food.label,
          brand: food.brand || null,
          category: food.category || food.categoryLabel || null,
          image: food.image || null,
          // Per 100g - macros
          caloriesPer100g: calPer100g,
          proteinPer100g: proteinPer100g,
          carbsPer100g: carbsPer100g,
          fatPer100g: fatPer100g,
          // Per 100g - micronutrients
          fiberPer100g: fiberPer100g,
          sugarPer100g: sugarPer100g,
          sodiumPer100g: sodiumPer100g,
          potassiumPer100g: potassiumPer100g,
          calciumPer100g: calciumPer100g,
          ironPer100g: ironPer100g,
          vitaminCPer100g: vitaminCPer100g,
          cholesterolPer100g: cholesterolPer100g,
          // Per serving (if available)
          ...(servingInfo || {}),
          // All available measures for UI dropdown
          measures: item.measures.slice(0, 8).map(m => ({
            label: m.label,
            weight: Math.round(m.weight || 100)
          })),
          source: 'edamam'
        };
      }).filter(food => food.caloriesPer100g > 0 && !seenNames.has(food.name.toLowerCase()));

    } catch (edamamError) {
      if (edamamError.name === 'AbortError') {
        console.error('❌ Edamam search timed out after 5s');
      } else {
        console.error('❌ Edamam search failed:', edamamError.message);
      }
      // Continue with local results only
    }
  } else {
  }

  // Merge: local curated results first, then Edamam results
  const allResults = [...localResults, ...edamamFoods].slice(0, 20);
  const source = edamamFoods.length > 0 ? 'local+edamam' : 'local';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify({
      query: query,
      totalHits: allResults.length,
      foods: allResults,
      source: source
    })
  };
};
