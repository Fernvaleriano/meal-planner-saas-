// Netlify Function: Seed default supplements for new coaches
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ============================================================
// DEFAULT SUPPLEMENT LIBRARY — 75+ supplements across 12 categories
// ============================================================
const DEFAULT_SUPPLEMENTS = [
    // ── VITAMINS ──
    { name: 'Vitamin D3', category: 'Vitamins', timing: 'morning', dose: '5000 IU', frequency_type: 'daily', notes: 'Supports bone health, immune function, and mood. Best absorbed with a fat-containing meal.' },
    { name: 'Vitamin C', category: 'Vitamins', timing: 'morning', dose: '1000mg', frequency_type: 'daily', notes: 'Boosts immune system, supports skin health, and aids in iron absorption.' },
    { name: 'Vitamin B12', category: 'Vitamins', timing: 'morning', dose: '1000mcg', frequency_type: 'daily', notes: 'Essential for energy production, red blood cell formation, and nervous system function.' },
    { name: 'B-Complex', category: 'Vitamins', timing: 'morning', dose: '1 capsule', frequency_type: 'daily', notes: 'Full spectrum of B vitamins for energy metabolism, brain function, and cell health.' },
    { name: 'Vitamin A', category: 'Vitamins', timing: 'with_meals', dose: '5000 IU', frequency_type: 'daily', notes: 'Supports vision, immune health, and skin repair. Take with a meal containing fat.' },
    { name: 'Vitamin E', category: 'Vitamins', timing: 'with_meals', dose: '400 IU', frequency_type: 'daily', notes: 'Powerful antioxidant that protects cells from damage and supports skin health.' },
    { name: 'Vitamin K2 (MK-7)', category: 'Vitamins', timing: 'morning', dose: '100mcg', frequency_type: 'daily', notes: 'Directs calcium to bones and teeth. Pair with Vitamin D3 for best results.' },
    { name: 'Folate (Methylfolate)', category: 'Vitamins', timing: 'morning', dose: '800mcg', frequency_type: 'daily', notes: 'Supports cell growth, DNA synthesis, and red blood cell production.' },
    { name: 'Biotin', category: 'Vitamins', timing: 'morning', dose: '5000mcg', frequency_type: 'daily', notes: 'Supports healthy hair, skin, and nails. Also aids in energy metabolism.' },
    { name: 'Multivitamin', category: 'Vitamins', timing: 'morning', dose: '1 tablet', frequency_type: 'daily', notes: 'Covers baseline micronutrient needs. A good foundation if your diet has gaps.' },

    // ── MINERALS ──
    { name: 'Magnesium Glycinate', category: 'Minerals', timing: 'bedtime', dose: '400mg', frequency_type: 'daily', notes: 'Supports muscle relaxation, sleep quality, and stress reduction. Gentle on the stomach.' },
    { name: 'Zinc', category: 'Minerals', timing: 'with_meals', dose: '30mg', frequency_type: 'daily', notes: 'Supports immune function, testosterone production, and wound healing.' },
    { name: 'Iron (Ferrous Bisglycinate)', category: 'Minerals', timing: 'morning', dose: '25mg', frequency_type: 'daily', notes: 'Supports oxygen transport in blood. Take on an empty stomach with Vitamin C for better absorption.' },
    { name: 'Calcium', category: 'Minerals', timing: 'with_meals', dose: '500mg', frequency_type: 'daily', notes: 'Essential for strong bones and teeth. Split doses for better absorption.' },
    { name: 'Potassium', category: 'Minerals', timing: 'with_meals', dose: '500mg', frequency_type: 'daily', notes: 'Supports muscle contractions, nerve function, and healthy blood pressure.' },
    { name: 'Selenium', category: 'Minerals', timing: 'morning', dose: '200mcg', frequency_type: 'daily', notes: 'Antioxidant that supports thyroid function and immune health.' },
    { name: 'Chromium Picolinate', category: 'Minerals', timing: 'with_meals', dose: '200mcg', frequency_type: 'daily', notes: 'Helps regulate blood sugar and may reduce carb cravings.' },
    { name: 'Electrolyte Complex', category: 'Minerals', timing: 'morning', dose: '1 scoop', frequency_type: 'daily', notes: 'Sodium, potassium, and magnesium blend. Essential for hydration, especially during training.' },

    // ── PROTEIN ──
    { name: 'Whey Protein Isolate', category: 'Protein', timing: 'post_workout', dose: '25-30g (1 scoop)', frequency_type: 'daily', notes: 'Fast-absorbing protein to support muscle recovery after training. Mix with water or milk.' },
    { name: 'Casein Protein', category: 'Protein', timing: 'bedtime', dose: '25-30g (1 scoop)', frequency_type: 'daily', notes: 'Slow-release protein that feeds your muscles overnight while you sleep.' },
    { name: 'Plant-Based Protein', category: 'Protein', timing: 'post_workout', dose: '25-30g (1 scoop)', frequency_type: 'daily', notes: 'Dairy-free protein blend (pea, rice, hemp). Great alternative if you\'re lactose intolerant.' },
    { name: 'Collagen Peptides', category: 'Protein', timing: 'morning', dose: '10-15g', frequency_type: 'daily', notes: 'Supports joint health, skin elasticity, hair growth, and gut lining repair.' },
    { name: 'EAAs (Essential Amino Acids)', category: 'Protein', timing: 'pre_workout', dose: '10g', frequency_type: 'daily', notes: 'All 9 essential amino acids to fuel muscle building. Great for sipping during workouts.' },
    { name: 'BCAAs', category: 'Protein', timing: 'pre_workout', dose: '5-10g', frequency_type: 'daily', notes: 'Leucine, isoleucine, and valine to reduce muscle breakdown during training.' },

    // ── PRE-WORKOUT ──
    { name: 'Caffeine', category: 'Pre-workout', timing: 'pre_workout', dose: '200mg', frequency_type: 'daily', notes: 'Increases alertness, focus, and exercise performance. Take 30 min before training.' },
    { name: 'Beta-Alanine', category: 'Pre-workout', timing: 'pre_workout', dose: '3.2g', frequency_type: 'daily', notes: 'Buffers lactic acid for better endurance during high-rep sets. May cause a harmless tingling sensation.' },
    { name: 'Citrulline Malate', category: 'Pre-workout', timing: 'pre_workout', dose: '6-8g', frequency_type: 'daily', notes: 'Boosts nitric oxide for better blood flow, pumps, and endurance during training.' },
    { name: 'L-Tyrosine', category: 'Pre-workout', timing: 'pre_workout', dose: '500-1000mg', frequency_type: 'daily', notes: 'Supports focus and mental clarity under stress. Great for intense training sessions.' },
    { name: 'Pre-Workout Blend', category: 'Pre-workout', timing: 'pre_workout', dose: '1 scoop', frequency_type: 'daily', notes: 'All-in-one formula with caffeine, citrulline, and beta-alanine. Take 20-30 min before training.' },
    { name: 'Beetroot Powder', category: 'Pre-workout', timing: 'pre_workout', dose: '5g', frequency_type: 'daily', notes: 'Natural nitric oxide booster for better blood flow and endurance. Caffeine-free option.' },

    // ── POST-WORKOUT ──
    { name: 'L-Glutamine', category: 'Post-workout', timing: 'post_workout', dose: '5g', frequency_type: 'daily', notes: 'Supports gut health and muscle recovery. Especially helpful during intense training phases.' },
    { name: 'Fast Carbs (Dextrose)', category: 'Post-workout', timing: 'post_workout', dose: '25-50g', frequency_type: 'daily', notes: 'Rapidly replenishes glycogen stores after training. Mix with your protein shake.' },
    { name: 'Tart Cherry Extract', category: 'Post-workout', timing: 'post_workout', dose: '500mg', frequency_type: 'daily', notes: 'Reduces exercise-induced inflammation and muscle soreness. Speeds recovery between sessions.' },
    { name: 'Post-Workout Electrolyte Mix', category: 'Post-workout', timing: 'post_workout', dose: '1 scoop', frequency_type: 'daily', notes: 'Replaces minerals lost through sweat. Helps prevent cramps and aids rehydration.' },

    // ── PERFORMANCE ──
    { name: 'Creatine Monohydrate', category: 'Performance', timing: 'post_workout', dose: '5g', frequency_type: 'daily', notes: 'The most researched supplement for strength and power. Take daily — timing doesn\'t matter much.' },
    { name: 'HMB (Beta-Hydroxy Beta-Methylbutyrate)', category: 'Performance', timing: 'with_meals', dose: '3g', frequency_type: 'daily', notes: 'Helps prevent muscle breakdown during caloric deficit or intense training phases.' },
    { name: 'Sodium Bicarbonate', category: 'Performance', timing: 'pre_workout', dose: '0.3g/kg body weight', frequency_type: 'daily', notes: 'Buffers acid in muscles for better performance in high-intensity efforts lasting 1-7 minutes.' },
    { name: 'Cordyceps', category: 'Performance', timing: 'morning', dose: '1000mg', frequency_type: 'daily', notes: 'Medicinal mushroom that supports oxygen utilization and endurance capacity.' },
    { name: 'Rhodiola Rosea', category: 'Performance', timing: 'morning', dose: '400mg', frequency_type: 'daily', notes: 'Adaptogen that reduces fatigue and improves performance under stress. Take on an empty stomach.' },
    { name: 'Alpha-GPC', category: 'Performance', timing: 'pre_workout', dose: '300-600mg', frequency_type: 'daily', notes: 'Enhances mind-muscle connection and power output. Also supports cognitive function.' },

    // ── RECOVERY ──
    { name: 'Fish Oil (Omega-3)', category: 'Recovery', timing: 'with_meals', dose: '2-3g (EPA/DHA)', frequency_type: 'daily', notes: 'Reduces inflammation, supports joint health, and improves heart and brain function.' },
    { name: 'Turmeric / Curcumin', category: 'Recovery', timing: 'with_meals', dose: '500mg (with piperine)', frequency_type: 'daily', notes: 'Powerful anti-inflammatory. Take with black pepper extract (piperine) for 20x better absorption.' },
    { name: 'MSM (Methylsulfonylmethane)', category: 'Recovery', timing: 'morning', dose: '1000-3000mg', frequency_type: 'daily', notes: 'Supports joint comfort and reduces exercise-induced inflammation. Also benefits skin and hair.' },
    { name: 'Glucosamine & Chondroitin', category: 'Recovery', timing: 'with_meals', dose: '1500mg / 1200mg', frequency_type: 'daily', notes: 'Supports cartilage repair and joint lubrication. Best for long-term joint maintenance.' },
    { name: 'CBD Oil', category: 'Recovery', timing: 'bedtime', dose: '25-50mg', frequency_type: 'daily', notes: 'May help reduce inflammation, ease muscle soreness, and improve sleep quality.' },
    { name: 'Bromelain', category: 'Recovery', timing: 'with_meals', dose: '500mg', frequency_type: 'daily', notes: 'Enzyme from pineapple that reduces swelling and speeds recovery from muscle damage.' },

    // ── FAT BURNER ──
    { name: 'L-Carnitine', category: 'Fat Burner', timing: 'pre_workout', dose: '2g', frequency_type: 'daily', notes: 'Helps shuttle fatty acids into cells to be burned for energy. Most effective taken before cardio.' },
    { name: 'CLA (Conjugated Linoleic Acid)', category: 'Fat Burner', timing: 'with_meals', dose: '3g', frequency_type: 'daily', notes: 'May support modest fat loss and help maintain lean body mass during a cut.' },
    { name: 'Green Tea Extract (EGCG)', category: 'Fat Burner', timing: 'morning', dose: '500mg', frequency_type: 'daily', notes: 'Boosts metabolism and fat oxidation. Contains natural caffeine for mild energy boost.' },
    { name: 'Caffeine (Fat Loss)', category: 'Fat Burner', timing: 'morning', dose: '100-200mg', frequency_type: 'daily', notes: 'Increases metabolic rate and mobilizes fatty acids. Use strategically, not chronically.' },
    { name: 'Yohimbine', category: 'Fat Burner', timing: 'morning', dose: '2.5-5mg', frequency_type: 'daily', notes: 'Targets stubborn body fat. Take fasted for best effect. Start with the lowest dose.' },
    { name: 'Forskolin', category: 'Fat Burner', timing: 'morning', dose: '250mg (10% extract)', frequency_type: 'daily', notes: 'May support fat loss by increasing cellular cAMP levels. Works best combined with exercise.' },

    // ── HORMONE SUPPORT ──
    { name: 'Ashwagandha (KSM-66)', category: 'Hormone Support', timing: 'bedtime', dose: '600mg', frequency_type: 'daily', notes: 'Reduces cortisol, supports testosterone, improves stress resilience and sleep quality.' },
    { name: 'Tongkat Ali', category: 'Hormone Support', timing: 'morning', dose: '400mg', frequency_type: 'daily', notes: 'Supports healthy testosterone levels, energy, and libido. Also known as Longjack.' },
    { name: 'Fenugreek', category: 'Hormone Support', timing: 'with_meals', dose: '600mg', frequency_type: 'daily', notes: 'Supports testosterone levels, blood sugar regulation, and may boost strength.' },
    { name: 'DIM (Diindolylmethane)', category: 'Hormone Support', timing: 'with_meals', dose: '200mg', frequency_type: 'daily', notes: 'Supports healthy estrogen metabolism. Helpful during hormone optimization protocols.' },
    { name: 'Boron', category: 'Hormone Support', timing: 'morning', dose: '10mg', frequency_type: 'daily', notes: 'Trace mineral that supports free testosterone levels and bone health.' },
    { name: 'DHEA', category: 'Hormone Support', timing: 'morning', dose: '25-50mg', frequency_type: 'daily', notes: 'Precursor hormone that supports testosterone and estrogen production. Use under guidance.' },
    { name: 'Maca Root', category: 'Hormone Support', timing: 'morning', dose: '1500-3000mg', frequency_type: 'daily', notes: 'Adaptogen that supports energy, libido, and hormonal balance for both men and women.' },

    // ── SLEEP ──
    { name: 'Melatonin', category: 'Sleep', timing: 'bedtime', dose: '3-5mg', frequency_type: 'daily', notes: 'Helps you fall asleep faster. Take 30-60 minutes before bed. Best for short-term use.' },
    { name: 'Magnesium L-Threonate', category: 'Sleep', timing: 'bedtime', dose: '2000mg', frequency_type: 'daily', notes: 'Crosses the blood-brain barrier to calm the mind. Best magnesium form for sleep and cognition.' },
    { name: 'L-Theanine', category: 'Sleep', timing: 'bedtime', dose: '200mg', frequency_type: 'daily', notes: 'Promotes relaxation without drowsiness. Great on its own or stacked with magnesium.' },
    { name: 'Glycine', category: 'Sleep', timing: 'bedtime', dose: '3g', frequency_type: 'daily', notes: 'Lowers core body temperature to help you fall asleep faster and improve sleep quality.' },
    { name: 'ZMA (Zinc, Magnesium, B6)', category: 'Sleep', timing: 'bedtime', dose: '1 serving (3 capsules)', frequency_type: 'daily', notes: 'Supports recovery, sleep depth, and hormone production overnight. Take on an empty stomach.' },
    { name: 'Valerian Root', category: 'Sleep', timing: 'bedtime', dose: '500mg', frequency_type: 'daily', notes: 'Herbal sedative that promotes calmness and may improve sleep onset.' },
    { name: 'Apigenin', category: 'Sleep', timing: 'bedtime', dose: '50mg', frequency_type: 'daily', notes: 'Compound from chamomile that promotes relaxation and sleep. Mild and well-tolerated.' },

    // ── PEPTIDES ──
    { name: 'BPC-157', category: 'Peptides', timing: 'morning', dose: '250-500mcg', frequency_type: 'daily', notes: 'Body Protection Compound that supports tissue repair, gut healing, and injury recovery.' },
    { name: 'TB-500 (Thymosin Beta-4)', category: 'Peptides', timing: 'custom', timing_custom: '2x per week', dose: '2.5mg', frequency_type: 'every_other_day', notes: 'Promotes tissue repair, reduces inflammation, and accelerates recovery from injuries.' },
    { name: 'CJC-1295 / Ipamorelin', category: 'Peptides', timing: 'bedtime', dose: '100mcg / 100mcg', frequency_type: 'daily', notes: 'Growth hormone releasing peptide combo. Supports muscle growth, fat loss, and deep sleep.' },
    { name: 'MK-677 (Ibutamoren)', category: 'Peptides', timing: 'bedtime', dose: '10-25mg', frequency_type: 'daily', notes: 'Oral growth hormone secretagogue. Supports muscle growth, recovery, and sleep quality.' },
    { name: 'GHK-Cu', category: 'Peptides', timing: 'morning', dose: '1-2mg', frequency_type: 'daily', notes: 'Copper peptide that promotes skin repair, collagen synthesis, and anti-aging effects.' },
    { name: 'Semaglutide', category: 'Peptides', timing: 'custom', timing_custom: 'Once weekly injection', dose: '0.25-2.4mg', frequency_type: 'once_weekly', notes: 'GLP-1 agonist for weight management. Reduces appetite and supports significant fat loss.' },
    { name: 'Tirzepatide', category: 'Peptides', timing: 'custom', timing_custom: 'Once weekly injection', dose: '2.5-15mg', frequency_type: 'once_weekly', notes: 'Dual GIP/GLP-1 agonist for weight management. Strong appetite suppression and metabolic benefits.' },

    // ── OTHER ──
    { name: 'Probiotics (Multi-Strain)', category: 'Other', timing: 'morning', dose: '10-50 billion CFU', frequency_type: 'daily', notes: 'Supports gut health, digestion, and immune function. Take on an empty stomach.' },
    { name: 'Digestive Enzymes', category: 'Other', timing: 'with_meals', dose: '1 capsule', frequency_type: 'daily', notes: 'Helps break down protein, carbs, and fats for better nutrient absorption. Take with your largest meal.' },
    { name: 'Psyllium Husk (Fiber)', category: 'Other', timing: 'bedtime', dose: '5g', frequency_type: 'daily', notes: 'Soluble fiber that supports digestive regularity and helps you feel fuller longer.' },
    { name: 'Apple Cider Vinegar', category: 'Other', timing: 'with_meals', dose: '1-2 tbsp (diluted)', frequency_type: 'daily', notes: 'May support blood sugar regulation and digestion. Always dilute in water before drinking.' },
    { name: 'Berberine', category: 'Other', timing: 'with_meals', dose: '500mg', frequency_type: 'daily', notes: 'Supports blood sugar management and metabolic health. Take with meals, 2-3x daily.' },
    { name: 'Inositol (Myo-Inositol)', category: 'Other', timing: 'morning', dose: '2-4g', frequency_type: 'daily', notes: 'Supports insulin sensitivity, hormonal balance, and mood. Especially helpful for PCOS.' },
    { name: 'NAC (N-Acetyl Cysteine)', category: 'Other', timing: 'morning', dose: '600mg', frequency_type: 'daily', notes: 'Powerful antioxidant precursor to glutathione. Supports liver health and respiratory function.' },
    { name: 'Coenzyme Q10 (CoQ10)', category: 'Other', timing: 'morning', dose: '100-200mg', frequency_type: 'daily', notes: 'Supports cellular energy production and heart health. Important if you take statins.' },
];

exports.handler = async (event, context) => {
    // Handle CORS preflight
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const body = JSON.parse(event.body);
        const { coachId } = body;

        if (!coachId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Coach ID is required' })
            };
        }

        // Authenticate
        const { user, error: authError } = await authenticateCoach(event, coachId);
        if (authError) return authError;

        // Check if coach already has ANY supplements (including inactive) to avoid re-seeding
        const { data: existing, error: checkError } = await supabase
            .from('supplement_library')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', coachId);

        if (checkError) throw checkError;

        // If coach already has supplements, skip seeding
        if (existing && existing.length > 0) {
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, seeded: false, message: 'Library already has supplements' })
            };
        }

        // Build insert rows
        const now = new Date().toISOString();
        const rows = DEFAULT_SUPPLEMENTS.map(s => ({
            coach_id: coachId,
            name: s.name,
            category: s.category,
            timing: s.timing,
            timing_custom: s.timing_custom || null,
            dose: s.dose,
            has_schedule: false,
            schedule: null,
            notes: s.notes,
            private_notes: null,
            frequency_type: s.frequency_type || 'daily',
            frequency_interval: null,
            frequency_days: null,
            is_active: true,
            usage_count: 0,
            created_at: now,
            updated_at: now
        }));

        // Insert in batches of 25 to avoid payload limits
        const batchSize = 25;
        let totalInserted = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);

            // Try with frequency fields first
            let { error } = await supabase
                .from('supplement_library')
                .insert(batch);

            // Retry without frequency fields if columns don't exist
            if (error && error.message && error.message.includes('frequency')) {
                const simpleBatch = batch.map(({ frequency_type, frequency_interval, frequency_days, ...rest }) => rest);
                const retryResult = await supabase
                    .from('supplement_library')
                    .insert(simpleBatch);
                error = retryResult.error;
            }

            if (error) throw error;
            totalInserted += batch.length;
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                seeded: true,
                count: totalInserted,
                message: `Seeded ${totalInserted} default supplements`
            })
        };

    } catch (error) {
        console.error('Error seeding supplements:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Failed to seed supplements', details: error.message })
        };
    }
};
