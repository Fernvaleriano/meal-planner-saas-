-- Update Exercise Coaching Data
-- Run this in Supabase SQL Editor

-- First, let's see what exercises exist (run this first to see names)
-- SELECT name FROM exercises WHERE coach_id IS NULL ORDER BY name;

-- ============== CHEST / BENCH PRESS VARIATIONS ==============

-- BARBELL BENCH PRESS (flat)
UPDATE exercises SET
    form_tips = '["Plant feet firmly on the floor, under or behind knees", "Retract shoulder blades and keep them pinched throughout", "Create slight arch in lower back while keeping glutes on bench", "Lower bar to mid-chest/nipple line with control", "Keep wrists straight, stacked over elbows", "Elbows at 45-75 degrees, not 90", "Use leg drive to assist the press"]'::jsonb,
    common_mistakes = '["Flaring elbows to 90 degrees (shoulder injury risk)", "Bouncing bar off chest", "Lifting hips off the bench", "Uneven bar path or grip", "Losing shoulder blade retraction", "Wrists bending backward"]'::jsonb,
    coaching_cues = '["Squeeze the bar", "Leg drive", "Chest up", "Touch and press", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%bench press%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%decline%' AND LOWER(name) NOT LIKE '%close%' AND coach_id IS NULL;

-- INCLINE BARBELL BENCH PRESS
UPDATE exercises SET
    form_tips = '["Set bench to 30-45 degree angle (30 is ideal)", "Retract shoulder blades into the bench", "Lower bar to upper chest/collarbone area", "Keep feet flat on floor for stability", "Bar path angles slightly back toward face"]'::jsonb,
    common_mistakes = '["Bench angle too steep (becomes shoulder press)", "Flaring elbows excessively", "Losing shoulder blade retraction", "Bar touching too low on chest"]'::jsonb,
    coaching_cues = '["Pinch shoulders back", "Upper chest", "Control down", "Drive up and back"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%bench%' AND LOWER(name) LIKE '%barbell%' AND coach_id IS NULL;

-- DECLINE BARBELL BENCH PRESS
UPDATE exercises SET
    form_tips = '["Set bench to 15-30 degree decline", "Secure feet under pads firmly", "Retract shoulder blades", "Lower bar to lower chest/below nipple line", "Press up and slightly back toward face"]'::jsonb,
    common_mistakes = '["Decline too steep (blood rushing to head)", "Bar path going straight up", "Losing shoulder blade retraction", "Feet not secured"]'::jsonb,
    coaching_cues = '["Feet locked in", "Lower chest", "Press up and back", "Squeeze at top"]'::jsonb
WHERE LOWER(name) LIKE '%decline%' AND LOWER(name) LIKE '%bench%' AND (LOWER(name) LIKE '%barbell%' OR LOWER(name) LIKE '%bar%') AND coach_id IS NULL;

-- CLOSE GRIP BENCH PRESS
UPDATE exercises SET
    form_tips = '["Hands 8-12 inches apart (shoulder width or closer)", "Keep elbows tucked close to body (30-45 degrees)", "Lower bar to lower chest/sternum", "Emphasizes triceps over chest", "Full lockout at top"]'::jsonb,
    common_mistakes = '["Grip too narrow (wrist strain)", "Flaring elbows out (defeats purpose)", "Bar bouncing off chest", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Elbows in tight", "Lower chest", "Lock out hard", "Triceps squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%close%' AND LOWER(name) LIKE '%grip%' AND LOWER(name) LIKE '%bench%' AND coach_id IS NULL;

-- DUMBBELL BENCH PRESS (flat)
UPDATE exercises SET
    form_tips = '["Start with dumbbells at chest level, palms forward", "Press up and slightly inward (dumbbells touch at top)", "Keep shoulder blades pinched throughout", "Lower with control to get full stretch", "Greater range of motion than barbell"]'::jsonb,
    common_mistakes = '["Dumbbells drifting too far apart at bottom", "Not going deep enough (losing ROM advantage)", "Unstable shoulder position", "Wrists not straight"]'::jsonb,
    coaching_cues = '["Squeeze together at top", "Deep stretch at bottom", "Control the weight", "Shoulder blades pinched"]'::jsonb
WHERE LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%bench%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%decline%' AND LOWER(name) NOT LIKE '%close%' AND LOWER(name) NOT LIKE '%single%' AND LOWER(name) NOT LIKE '%floor%' AND coach_id IS NULL;

-- INCLINE DUMBBELL BENCH PRESS
UPDATE exercises SET
    form_tips = '["Set bench to 30-45 degrees (30 is often best)", "Press dumbbells up and slightly together", "Lower to outer chest with elbows at 45-60 degrees", "Feel stretch in upper chest at bottom", "Targets upper chest fibers"]'::jsonb,
    common_mistakes = '["Angle too steep (all shoulders, no chest)", "Elbows flaring out to 90 degrees", "Partial range of motion", "Weights crashing together at top"]'::jsonb,
    coaching_cues = '["Upper chest focus", "Squeeze at top", "Full stretch at bottom", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%dumbbell%' AND (LOWER(name) LIKE '%bench%' OR LOWER(name) LIKE '%press%') AND LOWER(name) NOT LIKE '%fly%' AND coach_id IS NULL;

-- DECLINE DUMBBELL BENCH PRESS
UPDATE exercises SET
    form_tips = '["Set bench to 15-30 degree decline", "Secure feet under pads", "Press dumbbells up and together", "Lower to lower chest area", "Emphasizes lower chest fibers"]'::jsonb,
    common_mistakes = '["Decline too steep", "Dumbbells drifting apart", "Not controlling the weight", "Feet not secured"]'::jsonb,
    coaching_cues = '["Lower chest", "Press together", "Control down", "Squeeze at top"]'::jsonb
WHERE LOWER(name) LIKE '%decline%' AND LOWER(name) LIKE '%dumbbell%' AND (LOWER(name) LIKE '%bench%' OR LOWER(name) LIKE '%press%') AND coach_id IS NULL;

-- FLOOR PRESS
UPDATE exercises SET
    form_tips = '["Lie on floor with knees bent or legs straight", "Press weight from chest to lockout", "Elbows touch floor at bottom (natural ROM limiter)", "Great for lockout strength and shoulder health", "Can use barbell or dumbbells"]'::jsonb,
    common_mistakes = '["Bouncing elbows off floor", "Losing shoulder blade retraction", "Arching lower back excessively", "Not pausing at bottom"]'::jsonb,
    coaching_cues = '["Elbows to floor", "Pause", "Press up", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%floor%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- SQUEEZE PRESS (Dumbbell)
UPDATE exercises SET
    form_tips = '["Press dumbbells together throughout movement", "Maintain constant pressing force between dumbbells", "Works inner chest intensely", "Full range of motion with constant squeeze"]'::jsonb,
    common_mistakes = '["Letting dumbbells separate", "Losing the squeeze at bottom or top", "Going too heavy", "Rushing the movement"]'::jsonb,
    coaching_cues = '["Squeeze hard", "Constant pressure", "Feel inner chest", "Full ROM"]'::jsonb
WHERE LOWER(name) LIKE '%squeeze%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- SMITH MACHINE BENCH PRESS
UPDATE exercises SET
    form_tips = '["Position bench so bar path hits mid-chest", "Retract shoulder blades", "Unhook and lower with control", "Fixed bar path reduces stabilizer work"]'::jsonb,
    common_mistakes = '["Bench positioned wrong", "Not retracting shoulders", "Using too much weight (no stabilizers needed)", "Relying on safety catches"]'::jsonb,
    coaching_cues = '["Position check", "Shoulders back", "Control the bar", "Full ROM"]'::jsonb
WHERE LOWER(name) LIKE '%smith%' AND LOWER(name) LIKE '%bench%' AND coach_id IS NULL;

-- DUMBBELL FLY (flat)
UPDATE exercises SET
    form_tips = '["Keep slight bend in elbows throughout (15-30 degrees)", "Lower dumbbells in wide arc until deep chest stretch", "Squeeze chest to bring weights together at top", "Control the negative - this is key for muscle growth", "Imagine hugging a large tree"]'::jsonb,
    common_mistakes = '["Bending elbows too much (turns into press)", "Going too heavy and losing form", "Not feeling chest stretch at bottom", "Letting weights crash together at top"]'::jsonb,
    coaching_cues = '["Hug a tree", "Chest stretch", "Squeeze together", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%fly%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%decline%' AND LOWER(name) NOT LIKE '%cable%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%rear%' AND coach_id IS NULL;

-- INCLINE DUMBBELL FLY
UPDATE exercises SET
    form_tips = '["Set bench to 30-45 degrees", "Slight elbow bend maintained throughout", "Lower until upper chest stretch", "Squeeze upper chest to bring weights together", "Targets upper chest fibers specifically"]'::jsonb,
    common_mistakes = '["Bench too steep", "Arms too straight (shoulder stress)", "Not enough stretch at bottom", "Using momentum"]'::jsonb,
    coaching_cues = '["Upper chest stretch", "Squeeze at top", "Soft elbows", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%fly%' AND coach_id IS NULL;

-- CABLE FLY (all heights)
UPDATE exercises SET
    form_tips = '["Set cables at desired height (high, mid, or low)", "Step forward into split stance for stability", "Slight bend in elbows throughout", "Bring hands together in front of chest", "Squeeze and hold at contraction", "High cables target lower chest, low cables target upper chest"]'::jsonb,
    common_mistakes = '["Standing too upright (less chest involvement)", "Arms too straight", "Using momentum", "Not squeezing at contraction"]'::jsonb,
    coaching_cues = '["Lean forward slightly", "Squeeze together", "Hold contraction", "Control back"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%fly%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%rear%' AND coach_id IS NULL;

-- PEC DECK / MACHINE FLY
UPDATE exercises SET
    form_tips = '["Adjust seat so handles are at chest level", "Keep slight bend in elbows", "Bring arms together in front of chest", "Squeeze and hold contraction", "Control the return, feel the stretch"]'::jsonb,
    common_mistakes = '["Seat too high or low", "Arms too straight (shoulder strain)", "Letting weights slam back", "Using momentum"]'::jsonb,
    coaching_cues = '["Chest height", "Squeeze together", "Hold", "Slow negative"]'::jsonb
WHERE LOWER(name) LIKE '%pec deck%' OR (LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%fly%') AND coach_id IS NULL;

-- PUSH UP (standard)
UPDATE exercises SET
    form_tips = '["Hands slightly wider than shoulder width", "Body in straight line from head to heels (plank position)", "Lower chest to just above ground", "Keep core tight, glutes squeezed", "Elbows at 45 degrees, not flared to 90"]'::jsonb,
    common_mistakes = '["Hips sagging or piking up", "Flaring elbows to 90 degrees (shoulder stress)", "Partial range of motion", "Head dropping forward", "Losing core engagement"]'::jsonb,
    coaching_cues = '["Plank position", "Chest to floor", "Core tight", "Elbows 45 degrees", "Full extension"]'::jsonb
WHERE (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%' OR LOWER(name) LIKE '%push-up%') AND LOWER(name) NOT LIKE '%diamond%' AND LOWER(name) NOT LIKE '%wide%' AND LOWER(name) NOT LIKE '%close%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%decline%' AND LOWER(name) NOT LIKE '%pike%' AND LOWER(name) NOT LIKE '%archer%' AND LOWER(name) NOT LIKE '%clap%' AND LOWER(name) NOT LIKE '%explosive%' AND coach_id IS NULL;

-- DIAMOND PUSH UP
UPDATE exercises SET
    form_tips = '["Hands together forming diamond shape (thumbs and index fingers touching)", "Position hands under chest", "Lower chest to hands", "Elbows stay close to body", "Emphasizes triceps heavily"]'::jsonb,
    common_mistakes = '["Hands positioned too far forward", "Elbows flaring out", "Hips sagging", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Diamond under chest", "Elbows back", "Chest to hands", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%diamond%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- WIDE PUSH UP
UPDATE exercises SET
    form_tips = '["Hands wider than shoulder width (1.5-2x)", "Emphasizes chest stretch and outer chest", "Lower chest between hands", "Keep body in straight line"]'::jsonb,
    common_mistakes = '["Going too wide (shoulder strain)", "Elbows flaring excessively", "Sagging hips", "Not going deep enough"]'::jsonb,
    coaching_cues = '["Wide hands", "Chest stretch", "Full depth", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%wide%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- INCLINE PUSH UP
UPDATE exercises SET
    form_tips = '["Hands on elevated surface (bench, box, wall)", "Body in straight line at angle", "Lower chest to surface", "Easier variation - great for beginners"]'::jsonb,
    common_mistakes = '["Hips sagging", "Not going through full ROM", "Surface too high (too easy)", "Losing core tension"]'::jsonb,
    coaching_cues = '["Straight body line", "Chest to surface", "Full ROM", "Progress to lower surface"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- DECLINE PUSH UP
UPDATE exercises SET
    form_tips = '["Feet elevated on bench or box", "Hands on floor, shoulder width", "Targets upper chest more", "More challenging than standard push up"]'::jsonb,
    common_mistakes = '["Feet too high (becomes pike push up)", "Hips piking up", "Not full range of motion", "Losing core tension"]'::jsonb,
    coaching_cues = '["Feet elevated", "Body straight", "Upper chest focus", "Full depth"]'::jsonb
WHERE LOWER(name) LIKE '%decline%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- CLAP PUSH UP / EXPLOSIVE PUSH UP
UPDATE exercises SET
    form_tips = '["Start in push up position", "Explode up with enough force to leave the ground", "Clap hands (optional) and land softly", "Absorb landing with bent elbows", "Advanced plyometric movement"]'::jsonb,
    common_mistakes = '["Not enough explosion", "Landing with straight arms (injury risk)", "Hands landing in wrong position", "Hips sagging on landing"]'::jsonb,
    coaching_cues = '["Explode up", "Quick clap", "Soft landing", "Absorb impact"]'::jsonb
WHERE (LOWER(name) LIKE '%clap%' OR LOWER(name) LIKE '%explosive%' OR LOWER(name) LIKE '%plyo%') AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- CHEST DIP
UPDATE exercises SET
    form_tips = '["Lean torso forward to emphasize chest (30+ degrees)", "Lower until deep chest stretch (upper arm past parallel)", "Keep elbows slightly flared (not tucked)", "Press up while maintaining forward lean", "Cross feet behind you for stability"]'::jsonb,
    common_mistakes = '["Staying too upright (becomes tricep dip)", "Not going deep enough", "Swinging or using momentum", "Elbows flaring too much"]'::jsonb,
    coaching_cues = '["Lean forward", "Deep stretch", "Press up", "Squeeze chest"]'::jsonb
WHERE LOWER(name) LIKE '%dip%' AND LOWER(name) LIKE '%chest%' AND coach_id IS NULL;

-- DUMBBELL PULLOVER
UPDATE exercises SET
    form_tips = '["Lie perpendicular across bench, only shoulders supported", "Hold dumbbell with both hands over chest", "Lower behind head with slight elbow bend", "Feel deep stretch in lats and chest", "Pull weight back over chest using lats and chest"]'::jsonb,
    common_mistakes = '["Going too heavy (shoulder strain)", "Bending elbows too much", "Not getting full stretch", "Hips dropping too low"]'::jsonb,
    coaching_cues = '["Big stretch", "Slight elbow bend", "Pull with lats and chest", "Hips stable"]'::jsonb
WHERE LOWER(name) LIKE '%pullover%' AND (LOWER(name) LIKE '%dumbbell%' OR LOWER(name) LIKE '%db%') AND coach_id IS NULL;

-- MACHINE CHEST PRESS
UPDATE exercises SET
    form_tips = '["Adjust seat so handles align with mid-chest", "Keep shoulder blades against pad", "Grip handles, press forward", "Squeeze chest at full extension", "Control the return, dont let weights crash"]'::jsonb,
    common_mistakes = '["Seat too high or low", "Shoulders rolling forward off pad", "Using momentum", "Partial range of motion", "Weights crashing back"]'::jsonb,
    coaching_cues = '["Back against pad", "Chest level", "Squeeze at extension", "Control return"]'::jsonb
WHERE LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%chest%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- LANDMINE PRESS
UPDATE exercises SET
    form_tips = '["Bar anchored in landmine or corner", "Hold end of bar at shoulder", "Press up and forward in arc pattern", "Great for shoulder-friendly pressing", "Can be done standing, kneeling, or half-kneeling"]'::jsonb,
    common_mistakes = '["Bar drifting too far forward", "Using too much leg drive", "Not controlling the arc", "Losing core stability"]'::jsonb,
    coaching_cues = '["Arc pattern", "Press and reach", "Core tight", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%landmine%' AND LOWER(name) LIKE '%press%' AND LOWER(name) NOT LIKE '%shoulder%' AND coach_id IS NULL;

-- SVEND PRESS (plate press)
UPDATE exercises SET
    form_tips = '["Press plates together between palms", "Extend arms straight out at chest level", "Maintain constant pressure on plates", "Return to chest while squeezing", "Intense inner chest activation"]'::jsonb,
    common_mistakes = '["Letting plates separate", "Going too heavy", "Arms dropping below chest level", "Losing constant tension"]'::jsonb,
    coaching_cues = '["Squeeze plates hard", "Chest level", "Constant pressure", "Feel inner chest"]'::jsonb
WHERE LOWER(name) LIKE '%svend%' OR (LOWER(name) LIKE '%plate%' AND LOWER(name) LIKE '%press%') AND coach_id IS NULL;

-- ============== BACK / DEADLIFT VARIATIONS ==============

-- SUMO DEADLIFT (wide stance) - HIGH INJURY RISK - DETAILED FORM
UPDATE exercises SET
    form_tips = '["Wide stance with toes pointed 30-45 degrees outward", "Grip bar inside knees, arms straight down", "Push knees out over toes throughout lift", "Keep chest up and back flat - critical for spine safety", "Drive through whole foot, spreading the floor apart", "Hips and shoulders rise at same rate", "Lock out by squeezing glutes, not hyperextending back"]'::jsonb,
    common_mistakes = '["Knees caving inward (dangerous for knees)", "Hips shooting up first (turns into stiff-leg)", "Rounding lower back at any point", "Grip too wide (reduces leverage)", "Not pushing knees out enough", "Bar drifting away from body"]'::jsonb,
    coaching_cues = '["Spread the floor", "Knees out hard", "Chest proud", "Push through heels", "Squeeze glutes at top", "Bar drags up legs"]'::jsonb
WHERE LOWER(name) LIKE '%sumo%' AND LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%romanian%' AND coach_id IS NULL;

-- SUMO ROMANIAN DEADLIFT
UPDATE exercises SET
    form_tips = '["Wide stance with toes out 30-45 degrees", "Start at top position, bar at hips", "Push hips back while keeping knees slightly bent", "Lower until you feel deep hamstring/adductor stretch", "Keep back flat and chest up throughout", "Bar stays close to legs"]'::jsonb,
    common_mistakes = '["Rounding back to go lower", "Knees caving inward", "Bending knees too much (becomes sumo deadlift)", "Not feeling stretch in inner thighs"]'::jsonb,
    coaching_cues = '["Hips back", "Knees out", "Feel the stretch", "Squeeze glutes up"]'::jsonb
WHERE LOWER(name) LIKE '%sumo%' AND LOWER(name) LIKE '%romanian%' AND coach_id IS NULL;

-- CONVENTIONAL DEADLIFT (narrow stance)
UPDATE exercises SET
    form_tips = '["Bar over mid-foot, shins close to bar", "Feet hip-width apart, toes slightly out", "Grip just outside knees", "Hinge at hips, keep back flat and chest up", "Drive through heels, push the floor away", "Bar stays close to body entire lift", "Lock out by squeezing glutes at top"]'::jsonb,
    common_mistakes = '["Rounding lower back (dangerous)", "Bar drifting away from body", "Jerking the weight off floor", "Hyperextending at lockout", "Hips shooting up first", "Looking up (strains neck)"]'::jsonb,
    coaching_cues = '["Push floor away", "Bar close", "Chest up", "Hips through", "Squeeze glutes"]'::jsonb
WHERE LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%sumo%' AND LOWER(name) NOT LIKE '%romanian%' AND LOWER(name) NOT LIKE '%stiff%' AND LOWER(name) NOT LIKE '%rdl%' AND LOWER(name) NOT LIKE '%trap bar%' AND LOWER(name) NOT LIKE '%single leg%' AND LOWER(name) NOT LIKE '%straight leg%' AND coach_id IS NULL;

-- TRAP BAR / HEX BAR DEADLIFT
UPDATE exercises SET
    form_tips = '["Stand in center of trap bar, feet hip width", "Grip handles with neutral grip (palms facing in)", "Sit hips back and down like a squat", "Keep chest up and back flat", "Drive through whole foot to stand", "Lock out without leaning back"]'::jsonb,
    common_mistakes = '["Standing too far forward or back in bar", "Rounding back", "Knees caving inward", "Jerking the weight"]'::jsonb,
    coaching_cues = '["Sit back", "Chest up", "Drive through floor", "Stand tall"]'::jsonb
WHERE LOWER(name) LIKE '%trap bar%' OR LOWER(name) LIKE '%hex bar%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- SINGLE LEG DEADLIFT (all variations)
UPDATE exercises SET
    form_tips = '["Stand on one leg with slight knee bend", "Hinge at hip, keeping back flat", "Extend rear leg straight back for counterbalance", "Lower until torso parallel or hamstring stretch", "Keep hips square - dont rotate", "Return to standing by driving through front heel"]'::jsonb,
    common_mistakes = '["Hips rotating open", "Rounding back", "Rear leg not extending straight", "Losing balance by rushing", "Front knee locking out"]'::jsonb,
    coaching_cues = '["Hips square", "Reach back", "Flat back", "Controlled descent", "Squeeze glute up"]'::jsonb
WHERE LOWER(name) LIKE '%single leg%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- STAGGERED STANCE DEADLIFT
UPDATE exercises SET
    form_tips = '["Front foot flat, rear foot on toes for balance", "Most weight stays on front leg (about 80%)", "Hinge at hips keeping back flat", "Lower until hamstring stretch on front leg", "Drive through front heel to stand"]'::jsonb,
    common_mistakes = '["Too much weight on back foot", "Rounding back", "Twisting torso", "Not feeling front leg working"]'::jsonb,
    coaching_cues = '["Front leg does the work", "Hips hinge", "Flat back", "Squeeze glute"]'::jsonb
WHERE LOWER(name) LIKE '%staggered%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- ROMANIAN DEADLIFT (all variations - dumbbell, barbell, etc.)
UPDATE exercises SET
    form_tips = '["Start standing with weight at hips", "Push hips back while keeping legs nearly straight", "Slight knee bend maintained throughout", "Lower until hamstring stretch, not floor", "Keep weight close to legs throughout", "Squeeze glutes to return to standing"]'::jsonb,
    common_mistakes = '["Bending knees too much (becomes regular deadlift)", "Rounding back to reach lower", "Not feeling hamstring stretch", "Weight drifting away from legs"]'::jsonb,
    coaching_cues = '["Hips back", "Soft knees", "Hamstring stretch", "Squeeze glutes", "Weight close"]'::jsonb
WHERE (LOWER(name) LIKE '%romanian%' OR LOWER(name) LIKE '%rdl%') AND LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%sumo%' AND coach_id IS NULL;

-- DEFICIT DEADLIFT
UPDATE exercises SET
    form_tips = '["Stand on platform 1-4 inches high", "Same setup as conventional deadlift", "Requires more hip and ankle mobility", "Keep back flat despite greater range of motion", "Drive through heels, push floor away"]'::jsonb,
    common_mistakes = '["Rounding back at bottom (more common with deficit)", "Using too much weight", "Platform too high", "Jerking from the floor"]'::jsonb,
    coaching_cues = '["Extra tight core", "Patient off the floor", "Chest up", "Drive through heels"]'::jsonb
WHERE LOWER(name) LIKE '%deficit%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- SNATCH GRIP DEADLIFT
UPDATE exercises SET
    form_tips = '["Wide grip - hands near collar", "Requires more upper back strength", "Sit hips lower than conventional", "Keep chest up and lats engaged", "Bar path stays close to body"]'::jsonb,
    common_mistakes = '["Grip not wide enough", "Rounding upper back", "Starting with hips too high", "Losing lat tightness"]'::jsonb,
    coaching_cues = '["Wide grip", "Chest proud", "Lats tight", "Hips low", "Drive through floor"]'::jsonb
WHERE LOWER(name) LIKE '%snatch%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- CLEAN DEADLIFT
UPDATE exercises SET
    form_tips = '["Grip at shoulder width, hook grip recommended", "Start with hips lower than conventional", "First pull is slow and controlled", "Keep bar close with vertical torso", "Designed to set up for clean - explosive at top"]'::jsonb,
    common_mistakes = '["Hips shooting up first", "Bar drifting forward", "Rushing the first pull", "Not keeping chest up"]'::jsonb,
    coaching_cues = '["Patient off floor", "Chest up", "Bar close", "Vertical torso"]'::jsonb
WHERE LOWER(name) LIKE '%clean%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- KETTLEBELL DEADLIFT
UPDATE exercises SET
    form_tips = '["Kettlebell between feet, handle aligned with ankles", "Hinge at hips, keep back flat", "Grip handle with both hands", "Push through heels to stand", "Squeeze glutes at top"]'::jsonb,
    common_mistakes = '["Rounding back", "Squatting instead of hinging", "Kettlebell too far forward", "Not engaging lats"]'::jsonb,
    coaching_cues = '["Hinge back", "Flat back", "Squeeze glutes", "Stand tall"]'::jsonb
WHERE LOWER(name) LIKE '%kettlebell%' AND LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%sumo%' AND LOWER(name) NOT LIKE '%single%' AND coach_id IS NULL;

-- KETTLEBELL SUMO DEADLIFT
UPDATE exercises SET
    form_tips = '["Wide stance, toes pointed out", "Kettlebell between feet", "Push knees out over toes", "Chest up, back flat", "Drive through heels, squeeze glutes"]'::jsonb,
    common_mistakes = '["Knees caving in", "Rounding back", "Not pushing knees out", "Leaning forward"]'::jsonb,
    coaching_cues = '["Knees out", "Chest proud", "Spread the floor", "Squeeze glutes"]'::jsonb
WHERE LOWER(name) LIKE '%kettlebell%' AND LOWER(name) LIKE '%sumo%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- BAND DEADLIFT
UPDATE exercises SET
    form_tips = '["Stand on band with feet hip width", "Grip band handles or loop over hands", "Same mechanics as regular deadlift", "Tension increases as you stand (accommodating resistance)", "Control the return against band tension"]'::jsonb,
    common_mistakes = '["Rounding back", "Band not secure under feet", "Rushing through reps", "Not controlling eccentric"]'::jsonb,
    coaching_cues = '["Flat back", "Drive through heels", "Control down", "Squeeze at top"]'::jsonb
WHERE LOWER(name) LIKE '%band%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- DUMBBELL DEADLIFT
UPDATE exercises SET
    form_tips = '["Dumbbells at sides or in front of thighs", "Hinge at hips, push them back", "Keep back flat and chest up", "Lower until dumbbells at mid-shin or hamstring stretch", "Squeeze glutes to stand"]'::jsonb,
    common_mistakes = '["Rounding back", "Dumbbells drifting forward", "Squatting instead of hinging", "Not feeling hamstrings"]'::jsonb,
    coaching_cues = '["Hips back", "Flat back", "Weights close", "Squeeze glutes"]'::jsonb
WHERE LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%romanian%' AND LOWER(name) NOT LIKE '%rdl%' AND LOWER(name) NOT LIKE '%single%' AND LOWER(name) NOT LIKE '%stiff%' AND LOWER(name) NOT LIKE '%straight%' AND coach_id IS NULL;

-- ============== BACK ROW VARIATIONS ==============

-- BENT OVER BARBELL ROW
UPDATE exercises SET
    form_tips = '["Hinge forward to 45-60 degree angle from floor", "Maintain flat back throughout - critical", "Pull bar to lower chest/upper abs area", "Lead with elbows, driving them toward ceiling", "Squeeze shoulder blades together at top", "Lower with control, feel stretch in lats"]'::jsonb,
    common_mistakes = '["Standing too upright (reduces ROM)", "Rounding lower back (injury risk)", "Using momentum/jerking weight", "Not squeezing at top", "Bar path swinging out"]'::jsonb,
    coaching_cues = '["Elbows back and up", "Squeeze blades hard", "Flat back", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) NOT LIKE '%pendlay%' AND LOWER(name) NOT LIKE '%yates%' AND LOWER(name) NOT LIKE '%t-bar%' AND LOWER(name) NOT LIKE '%tbar%' AND LOWER(name) NOT LIKE '%upright%' AND coach_id IS NULL;

-- PENDLAY ROW (strict barbell row from floor)
UPDATE exercises SET
    form_tips = '["Bar starts on floor each rep", "Torso parallel to ground", "Explosive pull to lower chest", "Bar returns to floor with control", "Reset position between each rep", "Great for building explosive back strength"]'::jsonb,
    common_mistakes = '["Not letting bar touch floor", "Torso angle rising", "Using too much leg drive", "Bouncing off floor"]'::jsonb,
    coaching_cues = '["From the floor", "Explosive pull", "Stay parallel", "Reset each rep"]'::jsonb
WHERE LOWER(name) LIKE '%pendlay%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- YATES ROW (underhand grip)
UPDATE exercises SET
    form_tips = '["Underhand (supinated) grip, shoulder width", "More upright torso than standard row (about 70 degrees)", "Pull bar to lower abs/belt area", "Emphasizes lower lats and biceps", "Keep elbows close to body"]'::jsonb,
    common_mistakes = '["Grip too wide", "Leaning too far forward", "Pulling too high", "Elbows flaring out"]'::jsonb,
    coaching_cues = '["Underhand grip", "Pull to belt", "Elbows in", "Lower lat squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%yates%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- T-BAR ROW
UPDATE exercises SET
    form_tips = '["Straddle bar with feet shoulder width", "Hinge at hips, maintain flat back", "Pull to chest using V-handle or rope attachment", "Squeeze shoulder blades at top", "Control descent, feel stretch"]'::jsonb,
    common_mistakes = '["Rounding back", "Using too much leg drive", "Standing too upright", "Jerking weight up"]'::jsonb,
    coaching_cues = '["Flat back", "Pull to chest", "Squeeze blades", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%t-bar%' OR LOWER(name) LIKE '%tbar%' OR LOWER(name) LIKE '%t bar%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- ONE ARM DUMBBELL ROW
UPDATE exercises SET
    form_tips = '["Support yourself on bench with one hand and knee", "Keep back flat and parallel to floor", "Pull dumbbell to hip/lower rib area, not chest", "Lead with elbow toward ceiling", "Squeeze lat hard at top", "Control descent, feel stretch"]'::jsonb,
    common_mistakes = '["Rotating torso during pull", "Pulling to chest instead of hip", "Using momentum/swinging", "Not getting full stretch at bottom", "Shrugging shoulder up"]'::jsonb,
    coaching_cues = '["Elbow to ceiling", "Pull to hip", "Squeeze lat", "No rotation", "Full stretch"]'::jsonb
WHERE LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%bent%' AND LOWER(name) NOT LIKE '%upright%' AND LOWER(name) NOT LIKE '%renegade%' AND coach_id IS NULL;

-- BENT OVER DUMBBELL ROW (both arms)
UPDATE exercises SET
    form_tips = '["Hinge forward, dumbbells hanging", "Keep back flat throughout", "Pull both dumbbells to lower ribs", "Squeeze shoulder blades together", "Control descent"]'::jsonb,
    common_mistakes = '["Rounding back", "Using momentum", "Not squeezing at top", "Arms swinging wide"]'::jsonb,
    coaching_cues = '["Flat back", "Elbows up", "Squeeze", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%bent%' AND LOWER(name) LIKE '%over%' AND LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- RENEGADE ROW
UPDATE exercises SET
    form_tips = '["Start in push up position with dumbbells", "Row one dumbbell while stabilizing on other", "Minimize hip rotation - core stays tight", "Alternate sides or complete one side first", "Feet wider than normal push up for stability"]'::jsonb,
    common_mistakes = '["Excessive hip rotation", "Not stabilizing core", "Feet too narrow", "Rushing the movement"]'::jsonb,
    coaching_cues = '["Minimal rotation", "Core tight", "Wide feet", "Row to hip"]'::jsonb
WHERE LOWER(name) LIKE '%renegade%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- SEATED CABLE ROW
UPDATE exercises SET
    form_tips = '["Sit tall with slight knee bend", "Chest up, shoulders back", "Pull handle to lower chest/upper abs", "Lead with elbows, squeeze shoulder blades", "Control the return, feel stretch in lats"]'::jsonb,
    common_mistakes = '["Excessive forward lean (using back momentum)", "Using lower back to pull", "Not squeezing at contraction", "Rounding shoulders forward"]'::jsonb,
    coaching_cues = '["Sit tall", "Elbows back", "Squeeze blades", "Control stretch"]'::jsonb
WHERE LOWER(name) LIKE '%seated%' AND LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- STANDING CABLE ROW
UPDATE exercises SET
    form_tips = '["Stand facing cable machine", "Slight knee bend, core braced", "Pull to chest/upper abs", "Squeeze shoulder blades", "Resist being pulled forward on return"]'::jsonb,
    common_mistakes = '["Leaning back too much", "Using momentum", "Not controlling negative", "Core not engaged"]'::jsonb,
    coaching_cues = '["Stand tall", "Pull to chest", "Squeeze back", "Control return"]'::jsonb
WHERE LOWER(name) LIKE '%standing%' AND LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- SINGLE ARM CABLE ROW
UPDATE exercises SET
    form_tips = '["Stand or kneel beside cable machine", "Pull handle to lower rib area", "Rotate torso slightly (natural movement)", "Squeeze lat at contraction", "Control the return with slight rotation"]'::jsonb,
    common_mistakes = '["Too much torso rotation", "Not feeling lat working", "Using momentum", "Shrugging shoulder"]'::jsonb,
    coaching_cues = '["Pull to hip", "Rotate naturally", "Squeeze lat", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%single%' AND LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- MACHINE ROW (chest supported)
UPDATE exercises SET
    form_tips = '["Adjust seat so handles align with lower chest", "Press chest firmly against pad", "Pull handles back, squeeze shoulder blades", "Control the return, feel stretch"]'::jsonb,
    common_mistakes = '["Chest coming off pad", "Using momentum", "Not squeezing at contraction", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Chest on pad", "Squeeze blades", "Full ROM", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%row%' AND LOWER(name) NOT LIKE '%cable%' AND coach_id IS NULL;

-- SEAL ROW (chest supported barbell row)
UPDATE exercises SET
    form_tips = '["Lie face down on elevated bench", "Let arms hang with barbell", "Pull bar to bench/chest", "Eliminates lower back involvement", "Pure upper back isolation"]'::jsonb,
    common_mistakes = '["Using momentum", "Bench too low", "Not squeezing at top", "Partial reps"]'::jsonb,
    coaching_cues = '["Chest down", "Pull to bench", "Squeeze", "Full ROM"]'::jsonb
WHERE LOWER(name) LIKE '%seal%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- LANDMINE ROW
UPDATE exercises SET
    form_tips = '["Bar anchored in landmine or corner", "Straddle end of bar", "Hinge at hips, grab bar end", "Pull toward chest", "Natural arc pattern of movement"]'::jsonb,
    common_mistakes = '["Standing too upright", "Rounding back", "Using momentum", "Not controlling descent"]'::jsonb,
    coaching_cues = '["Hinge at hips", "Pull high", "Control arc", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%landmine%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- MEADOWS ROW (single arm landmine row)
UPDATE exercises SET
    form_tips = '["Stand perpendicular to bar", "One hand grips bar end, other supports on knee", "Pull bar toward hip with elbow driving up", "Great lat stretch and contraction", "Named after John Meadows"]'::jsonb,
    common_mistakes = '["Standing too square", "Pulling to chest instead of hip", "Not getting full stretch", "Elbow not driving high enough"]'::jsonb,
    coaching_cues = '["Hip position", "Elbow up", "Full stretch", "Lat squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%meadows%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- INVERTED ROW (body row / Australian pull up)
UPDATE exercises SET
    form_tips = '["Hang under bar with body straight", "Pull chest to bar", "Keep body in plank position", "Lower with control", "Feet on floor for easier, elevated for harder"]'::jsonb,
    common_mistakes = '["Hips sagging", "Not pulling high enough", "Using momentum", "Neck straining forward"]'::jsonb,
    coaching_cues = '["Body straight", "Chest to bar", "Core tight", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%inverted%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- UPRIGHT ROW
UPDATE exercises SET
    form_tips = '["Grip bar or dumbbells shoulder width or narrower", "Pull straight up to chin level", "Lead with elbows, keep them high", "Targets traps and side delts", "Can cause shoulder impingement - wider grip is safer"]'::jsonb,
    common_mistakes = '["Pulling too high (above chin)", "Grip too narrow (shoulder impingement)", "Using momentum", "Shrugging too much"]'::jsonb,
    coaching_cues = '["Elbows high", "To chin level", "Wide grip safer", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%upright%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- BAND ROW
UPDATE exercises SET
    form_tips = '["Secure band to anchor point", "Pull toward chest/abs", "Squeeze shoulder blades together", "Constant tension throughout", "Control return against resistance"]'::jsonb,
    common_mistakes = '["Not enough tension", "Using momentum", "Not squeezing at contraction", "Band slipping"]'::jsonb,
    coaching_cues = '["Constant tension", "Squeeze blades", "Control", "Full ROM"]'::jsonb
WHERE LOWER(name) LIKE '%band%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- KETTLEBELL ROW
UPDATE exercises SET
    form_tips = '["Hinge at hips or support on bench", "Pull kettlebell to hip area", "Squeeze lat at top", "Control descent", "Great grip work with KB handle"]'::jsonb,
    common_mistakes = '["Rounding back", "Pulling to chest", "Using momentum", "Grip slipping"]'::jsonb,
    coaching_cues = '["Pull to hip", "Squeeze lat", "Flat back", "Grip tight"]'::jsonb
WHERE LOWER(name) LIKE '%kettlebell%' AND LOWER(name) LIKE '%row%' AND coach_id IS NULL;

-- ============== PULL UPS / CHIN UPS / LAT PULLDOWN ==============

-- LAT PULLDOWN (wide grip)
UPDATE exercises SET
    form_tips = '["Grip bar wider than shoulders", "Lean back slightly (10-15 degrees)", "Pull bar to upper chest, not behind neck", "Drive elbows down and back", "Squeeze lats at bottom", "Control the return, feel stretch"]'::jsonb,
    common_mistakes = '["Leaning too far back (becomes row)", "Pulling bar behind neck (shoulder injury risk)", "Using momentum/swinging", "Not going through full ROM", "Gripping too narrow for lat focus"]'::jsonb,
    coaching_cues = '["Chest to bar", "Elbows down and back", "Squeeze lats", "Control up", "Feel stretch"]'::jsonb
WHERE LOWER(name) LIKE '%lat pulldown%' OR LOWER(name) LIKE '%lat pull down%' OR (LOWER(name) LIKE '%pulldown%' AND LOWER(name) NOT LIKE '%close%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%straight%') AND coach_id IS NULL;

-- CLOSE GRIP LAT PULLDOWN
UPDATE exercises SET
    form_tips = '["Use V-bar or close grip handle", "Emphasizes lower lats more", "Slight lean back, pull to chest", "Squeeze lats at bottom", "More bicep involvement than wide grip"]'::jsonb,
    common_mistakes = '["Leaning too far back", "Using too much bicep", "Not squeezing lats", "Partial ROM"]'::jsonb,
    coaching_cues = '["Pull to chest", "Lower lat focus", "Full ROM", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%close%' AND LOWER(name) LIKE '%grip%' AND LOWER(name) LIKE '%pulldown%' AND coach_id IS NULL;

-- REVERSE GRIP PULLDOWN
UPDATE exercises SET
    form_tips = '["Underhand grip, shoulder width", "Pull to lower chest", "Keep elbows close to body", "Emphasizes lower lats and biceps", "Control the return"]'::jsonb,
    common_mistakes = '["Elbows flaring out", "Using too much bicep momentum", "Leaning too far back", "Partial ROM"]'::jsonb,
    coaching_cues = '["Underhand grip", "Elbows in", "Lower lats", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%reverse%' AND LOWER(name) LIKE '%grip%' AND LOWER(name) LIKE '%pulldown%' AND coach_id IS NULL;

-- STRAIGHT ARM PULLDOWN
UPDATE exercises SET
    form_tips = '["Stand facing cable with arms extended", "Keep arms straight throughout", "Pull bar down in arc to thighs", "Squeeze lats at bottom", "Great lat isolation without biceps"]'::jsonb,
    common_mistakes = '["Bending elbows (becomes different exercise)", "Using momentum", "Not feeling lats", "Standing too far from cable"]'::jsonb,
    coaching_cues = '["Arms straight", "Squeeze lats", "Arc pattern", "Control up"]'::jsonb
WHERE LOWER(name) LIKE '%straight%' AND LOWER(name) LIKE '%arm%' AND LOWER(name) LIKE '%pulldown%' AND coach_id IS NULL;

-- PULL UP (wide grip, overhand)
UPDATE exercises SET
    form_tips = '["Grip bar wider than shoulders, overhand", "Start from dead hang, arms fully extended", "Pull until chin clears bar", "Lead with chest, drive elbows down", "Control the descent back to dead hang"]'::jsonb,
    common_mistakes = '["Kipping or swinging (strict is better for muscle)", "Partial range of motion", "Not going to full hang", "Straining neck to get chin over"]'::jsonb,
    coaching_cues = '["Dead hang start", "Chest to bar", "Elbows down", "Control down", "Full extension"]'::jsonb
WHERE (LOWER(name) LIKE '%pull up%' OR LOWER(name) LIKE '%pullup%' OR LOWER(name) LIKE '%pull-up%') AND LOWER(name) NOT LIKE '%chin%' AND LOWER(name) NOT LIKE '%neutral%' AND LOWER(name) NOT LIKE '%close%' AND LOWER(name) NOT LIKE '%assisted%' AND coach_id IS NULL;

-- CHIN UP (underhand grip)
UPDATE exercises SET
    form_tips = '["Underhand (supinated) grip, shoulder width", "Start from dead hang", "Pull chest toward bar", "More bicep involvement than pull up", "Squeeze biceps and lats at top", "Full extension at bottom"]'::jsonb,
    common_mistakes = '["Half reps - not going to dead hang", "Swinging for momentum", "Not controlling descent", "Grip too wide or narrow"]'::jsonb,
    coaching_cues = '["Full hang", "Chest up", "Squeeze at top", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%chin up%' OR LOWER(name) LIKE '%chinup%' OR LOWER(name) LIKE '%chin-up%' AND coach_id IS NULL;

-- NEUTRAL GRIP PULL UP
UPDATE exercises SET
    form_tips = '["Palms face each other (neutral grip)", "Often easiest on shoulders", "Start from dead hang", "Pull until chin over bars", "Good balance of lat and bicep work"]'::jsonb,
    common_mistakes = '["Partial ROM", "Using momentum", "Not full extension at bottom", "Rushing reps"]'::jsonb,
    coaching_cues = '["Full hang", "Pull high", "Control down", "Shoulder friendly"]'::jsonb
WHERE LOWER(name) LIKE '%neutral%' AND (LOWER(name) LIKE '%pull up%' OR LOWER(name) LIKE '%pullup%') AND coach_id IS NULL;

-- ASSISTED PULL UP
UPDATE exercises SET
    form_tips = '["Use machine, band, or partner for assistance", "Same form as regular pull up", "Full range of motion still required", "Reduce assistance over time"]'::jsonb,
    common_mistakes = '["Too much assistance (too easy)", "Partial ROM", "Using momentum", "Not progressing to less assistance"]'::jsonb,
    coaching_cues = '["Full ROM", "Same form", "Progress gradually", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%assisted%' AND (LOWER(name) LIKE '%pull up%' OR LOWER(name) LIKE '%pullup%' OR LOWER(name) LIKE '%chin%') AND coach_id IS NULL;

-- ============== FACE PULLS / REAR DELT ==============

-- FACE PULL
UPDATE exercises SET
    form_tips = '["Set cable at face height or slightly above", "Use rope attachment", "Pull toward face, separating hands", "External rotate at end - thumbs point back", "Squeeze rear delts and upper back", "Critical exercise for shoulder health"]'::jsonb,
    common_mistakes = '["Pulling too low (becomes row)", "Not externally rotating at end", "Using too much weight", "Body swaying", "Elbows dropping"]'::jsonb,
    coaching_cues = '["Pull apart", "Thumbs back", "Squeeze back", "Face height", "Light weight, high reps"]'::jsonb
WHERE LOWER(name) LIKE '%face pull%' AND coach_id IS NULL;

-- ============== SHOULDERS / PRESSING ==============

-- BARBELL OVERHEAD PRESS (Standing)
UPDATE exercises SET
    form_tips = '["Bar starts at collarbone/front delts", "Grip just outside shoulder width", "Brace core hard before pressing", "Press straight up, moving head back to let bar pass", "Once bar passes face, move head through (forward)", "Lock out with bar directly over mid-foot", "Keep glutes squeezed, no excessive back arch"]'::jsonb,
    common_mistakes = '["Excessive back arch (becomes standing incline press)", "Bar path going forward instead of straight up", "Not locking out fully overhead", "Flaring elbows out too much", "Holding breath entire rep"]'::jsonb,
    coaching_cues = '["Big breath, brace", "Head back then through", "Lock out overhead", "Bar over mid-foot", "Squeeze glutes"]'::jsonb
WHERE LOWER(name) LIKE '%overhead press%' OR LOWER(name) LIKE '%ohp%' OR (LOWER(name) LIKE '%military%' AND LOWER(name) LIKE '%press%') OR (LOWER(name) LIKE '%shoulder press%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) LIKE '%standing%') AND coach_id IS NULL;

-- SEATED BARBELL SHOULDER PRESS
UPDATE exercises SET
    form_tips = '["Sit with back firmly against pad", "Bar at collarbone level", "Press straight up, head moves back then through", "Lock out overhead", "Back stays against pad throughout"]'::jsonb,
    common_mistakes = '["Back coming off pad", "Bar going forward", "Not locking out", "Excessive flare"]'::jsonb,
    coaching_cues = '["Back on pad", "Straight up", "Lock out", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%seated%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) LIKE '%shoulder%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- DUMBBELL SHOULDER PRESS (seated or standing)
UPDATE exercises SET
    form_tips = '["Start with dumbbells at shoulder height, palms forward", "Press up and slightly inward (dumbbells can touch at top)", "Full lockout at top", "Control descent back to shoulders", "Keep core braced, avoid excessive arch"]'::jsonb,
    common_mistakes = '["Arching lower back excessively", "Not going through full ROM", "Elbows flaring out to 90 degrees", "Dumbbells crashing together at top"]'::jsonb,
    coaching_cues = '["Press up", "Lock out", "Control down", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%shoulder press%' AND LOWER(name) LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%arnold%' AND coach_id IS NULL;

-- ARNOLD PRESS
UPDATE exercises SET
    form_tips = '["Start with dumbbells at chin, palms facing you", "Rotate palms outward as you press up", "Full lockout at top with palms facing forward", "Reverse the rotation on the way down", "Smooth continuous movement"]'::jsonb,
    common_mistakes = '["Rushing the rotation (losing benefit)", "Not rotating fully (partial ROM)", "Using momentum to press", "Stopping rotation partway"]'::jsonb,
    coaching_cues = '["Rotate as you press", "Full turn at top", "Smooth and controlled", "Reverse on way down"]'::jsonb
WHERE LOWER(name) LIKE '%arnold%' AND coach_id IS NULL;

-- PUSH PRESS
UPDATE exercises SET
    form_tips = '["Start with bar at shoulders in front rack", "Dip by bending knees slightly (not a squat)", "Explosively extend legs and press bar", "Use leg drive to assist the press", "Lock out overhead"]'::jsonb,
    common_mistakes = '["Dip too deep (not efficient)", "Pressing before leg drive finishes", "Bar going forward", "Not locking out"]'::jsonb,
    coaching_cues = '["Quick dip", "Drive and press", "Bar close to face", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%push press%' AND coach_id IS NULL;

-- MACHINE SHOULDER PRESS
UPDATE exercises SET
    form_tips = '["Adjust seat so handles are at shoulder height", "Back firmly against pad", "Press up without locking elbows hard", "Control the descent"]'::jsonb,
    common_mistakes = '["Seat too high or low", "Back coming off pad", "Locking elbows hard", "Using momentum"]'::jsonb,
    coaching_cues = '["Back on pad", "Press up", "Control down", "Feel delts working"]'::jsonb
WHERE LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%shoulder%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- SMITH MACHINE SHOULDER PRESS
UPDATE exercises SET
    form_tips = '["Position bench so bar path is in front of face", "Unrack at shoulder level", "Press straight up in fixed path", "Lock out at top"]'::jsonb,
    common_mistakes = '["Bar path wrong (too far forward or back)", "Not retracting shoulders", "Using too much weight", "Partial ROM"]'::jsonb,
    coaching_cues = '["Position check", "Straight up", "Lock out", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%smith%' AND LOWER(name) LIKE '%shoulder%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- LATERAL RAISE (dumbbell)
UPDATE exercises SET
    form_tips = '["Slight bend in elbows throughout (15-30 degrees)", "Lead with elbows, not hands (pour water cue)", "Raise to shoulder height - no higher", "Control the lowering, dont drop", "Light weight, feel the muscle"]'::jsonb,
    common_mistakes = '["Using momentum/swinging body", "Going above shoulder height (traps take over)", "Shrugging shoulders up", "Arms too straight (elbow stress)", "Weight too heavy"]'::jsonb,
    coaching_cues = '["Lead with elbows", "Pour the water", "Shoulder height max", "Control down", "Light weight"]'::jsonb
WHERE LOWER(name) LIKE '%lateral raise%' OR LOWER(name) LIKE '%side raise%' AND LOWER(name) NOT LIKE '%cable%' AND LOWER(name) NOT LIKE '%machine%' AND coach_id IS NULL;

-- CABLE LATERAL RAISE
UPDATE exercises SET
    form_tips = '["Cable set low, stand sideways to machine", "Slight lean away from cable", "Lead with elbow to shoulder height", "Constant cable tension throughout", "Control the return"]'::jsonb,
    common_mistakes = '["Standing too upright", "Using momentum", "Going too high", "Letting cable snap back"]'::jsonb,
    coaching_cues = '["Lean away slightly", "Shoulder height", "Constant tension", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%lateral%' AND LOWER(name) LIKE '%raise%' AND coach_id IS NULL;

-- FRONT RAISE (dumbbell, barbell, plate)
UPDATE exercises SET
    form_tips = '["Arms nearly straight with slight elbow bend", "Raise to eye level, not higher", "Can alternate arms or raise together", "Control the descent", "Targets front delts specifically"]'::jsonb,
    common_mistakes = '["Swinging weight up with momentum", "Going too high (above eye level)", "Arching back", "Using too much weight"]'::jsonb,
    coaching_cues = '["Eye level", "Control up and down", "No swing", "Feel front delt"]'::jsonb
WHERE LOWER(name) LIKE '%front raise%' AND coach_id IS NULL;

-- REAR DELT FLY (bent over or machine)
UPDATE exercises SET
    form_tips = '["Bend over at hips or use incline bench (chest supported)", "Lead with elbows out to sides", "Squeeze rear delts hard at top", "Control the negative", "Light weight, high reps"]'::jsonb,
    common_mistakes = '["Using too much weight (common)", "Not bending over enough", "Pulling with arms instead of rear delts", "Shrugging during movement"]'::jsonb,
    coaching_cues = '["Elbows out", "Squeeze rear delts", "Light weight", "Feel the muscle"]'::jsonb
WHERE LOWER(name) LIKE '%rear delt%' AND (LOWER(name) LIKE '%fly%' OR LOWER(name) LIKE '%raise%') AND coach_id IS NULL;

-- REVERSE PEC DECK / MACHINE REAR DELT
UPDATE exercises SET
    form_tips = '["Face the pad, chest supported", "Grip handles with slight elbow bend", "Lead with elbows, pull handles apart", "Squeeze rear delts at contraction", "Control return"]'::jsonb,
    common_mistakes = '["Arms too straight", "Not squeezing at back", "Using too much weight", "Shrugging shoulders"]'::jsonb,
    coaching_cues = '["Elbows lead", "Squeeze back", "Control", "Light weight"]'::jsonb
WHERE LOWER(name) LIKE '%reverse%' AND LOWER(name) LIKE '%pec%' OR (LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%rear%' AND LOWER(name) LIKE '%delt%') AND coach_id IS NULL;

-- BARBELL SHRUG
UPDATE exercises SET
    form_tips = '["Stand tall with bar at thighs", "Shrug straight up toward ears", "Hold at top for 1-2 seconds", "Lower with control", "Keep arms straight throughout"]'::jsonb,
    common_mistakes = '["Rolling shoulders (unnecessary and risky)", "Using momentum", "Not pausing at top", "Bending elbows (becomes upright row)"]'::jsonb,
    coaching_cues = '["Ears to shoulders", "Hold at top", "Straight up and down", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%shrug%' AND LOWER(name) LIKE '%barbell%' AND coach_id IS NULL;

-- DUMBBELL SHRUG
UPDATE exercises SET
    form_tips = '["Dumbbells at sides, palms facing in", "Shrug straight up toward ears", "Hold at top briefly", "Lower with control"]'::jsonb,
    common_mistakes = '["Rolling shoulders", "Using momentum", "Not squeezing at top", "Going too fast"]'::jsonb,
    coaching_cues = '["Straight up", "Squeeze at top", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%shrug%' AND LOWER(name) LIKE '%dumbbell%' AND coach_id IS NULL;

-- TRAP BAR SHRUG
UPDATE exercises SET
    form_tips = '["Stand inside trap bar, grip handles", "Shrug straight up", "Hold at top", "Great for heavy shrugs - no bar interference"]'::jsonb,
    common_mistakes = '["Leaning forward", "Not full ROM", "Using momentum"]'::jsonb,
    coaching_cues = '["Stand tall", "Shrug up", "Squeeze traps"]'::jsonb
WHERE LOWER(name) LIKE '%trap%' AND LOWER(name) LIKE '%bar%' AND LOWER(name) LIKE '%shrug%' AND coach_id IS NULL;

-- GENERAL SHRUG (catches remaining)
UPDATE exercises SET
    form_tips = '["Stand tall with weights at sides", "Shrug straight up toward ears", "Hold at top briefly", "Lower with control"]'::jsonb,
    common_mistakes = '["Rolling shoulders (unnecessary)", "Using momentum", "Not pausing at top"]'::jsonb,
    coaching_cues = '["Ears to shoulders", "Hold at top", "Straight up"]'::jsonb
WHERE LOWER(name) LIKE '%shrug%' AND LOWER(name) NOT LIKE '%barbell%' AND LOWER(name) NOT LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%trap%' AND coach_id IS NULL;

-- ============== BICEPS CURL VARIATIONS ==============

-- BARBELL CURL
UPDATE exercises SET
    form_tips = '["Stand with feet shoulder width apart", "Grip bar slightly wider than hips", "Keep elbows pinned at sides throughout", "Curl bar to shoulder level with control", "Lower with control to full arm extension", "Slight forward lean okay at start"]'::jsonb,
    common_mistakes = '["Swinging body for momentum (ego lifting)", "Elbows drifting forward during curl", "Partial range of motion at bottom", "Using back to lift", "Grip too wide or narrow"]'::jsonb,
    coaching_cues = '["Elbows pinned", "Full extension at bottom", "Squeeze at top", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%curl%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) NOT LIKE '%preacher%' AND LOWER(name) NOT LIKE '%drag%' AND LOWER(name) NOT LIKE '%reverse%' AND coach_id IS NULL;

-- EZ BAR CURL
UPDATE exercises SET
    form_tips = '["Use angled grip for wrist comfort", "Grip on inner or outer angle based on preference", "Keep elbows stationary at sides", "Full range of motion", "Control the negative portion"]'::jsonb,
    common_mistakes = '["Using momentum", "Cutting ROM short", "Leaning back", "Elbows swinging forward"]'::jsonb,
    coaching_cues = '["Pin elbows", "Full stretch at bottom", "Squeeze at top", "Wrist friendly"]'::jsonb
WHERE LOWER(name) LIKE '%ez%' AND LOWER(name) LIKE '%curl%' AND LOWER(name) NOT LIKE '%preacher%' AND coach_id IS NULL;

-- DUMBBELL CURL (standing)
UPDATE exercises SET
    form_tips = '["Can alternate arms or curl both together", "Keep elbows pinned at sides", "Supinate (turn pinky up) at top for peak contraction", "Full extension at bottom", "Control the negative"]'::jsonb,
    common_mistakes = '["Swinging weights up", "Elbows moving forward", "Not supinating at top", "Partial ROM"]'::jsonb,
    coaching_cues = '["Turn and squeeze", "Elbows still", "Full range", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%curl%' AND LOWER(name) LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%hammer%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%preacher%' AND LOWER(name) NOT LIKE '%concentration%' AND LOWER(name) NOT LIKE '%seated%' AND LOWER(name) NOT LIKE '%spider%' AND LOWER(name) NOT LIKE '%cross%' AND coach_id IS NULL;

-- HAMMER CURL
UPDATE exercises SET
    form_tips = '["Neutral grip throughout (palms face each other)", "Keep elbows pinned at sides", "Curl to shoulder height", "Works brachialis (outer bicep) and forearms", "Can alternate or both together"]'::jsonb,
    common_mistakes = '["Swinging weights with momentum", "Letting elbows drift forward", "Going too fast (losing tension)", "Partial ROM"]'::jsonb,
    coaching_cues = '["Thumbs up position", "Elbows pinned", "Squeeze at top", "Feel brachialis"]'::jsonb
WHERE LOWER(name) LIKE '%hammer%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- INCLINE DUMBBELL CURL
UPDATE exercises SET
    form_tips = '["Set bench to 45-60 degree angle", "Let arms hang straight down at start", "Curl up with control, keeping elbows back", "Creates maximum stretch on biceps", "One of the best bicep builders"]'::jsonb,
    common_mistakes = '["Elbows moving forward (loses stretch)", "Bench angle too upright", "Using momentum", "Not getting full stretch at bottom"]'::jsonb,
    coaching_cues = '["Arms hang at start", "Elbows stay back", "Feel the stretch", "Squeeze at top"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%curl%' AND LOWER(name) LIKE '%dumbbell%' AND coach_id IS NULL;

-- PREACHER CURL
UPDATE exercises SET
    form_tips = '["Armpits snug against top of pad", "Arms fully supported on pad", "Lower until arms nearly straight (dont hyperextend)", "Curl up and squeeze biceps hard", "Eliminates momentum - strict isolation"]'::jsonb,
    common_mistakes = '["Not going low enough (partial reps)", "Lifting elbows off pad", "Using momentum", "Hyperextending at bottom (injury risk)", "Pad too high or low"]'::jsonb,
    coaching_cues = '["Armpits on pad", "Full range", "Squeeze hard", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%preacher%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- CONCENTRATION CURL
UPDATE exercises SET
    form_tips = '["Sit with elbow braced against inner thigh", "Curl dumbbell toward shoulder", "Squeeze and hold at top", "Complete isolation - no cheating possible", "Lower with control"]'::jsonb,
    common_mistakes = '["Moving elbow off thigh", "Using shoulder to lift", "Partial ROM", "Going too fast"]'::jsonb,
    coaching_cues = '["Elbow locked on thigh", "Pure bicep", "Squeeze at top", "Slow negative"]'::jsonb
WHERE LOWER(name) LIKE '%concentration%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- SPIDER CURL
UPDATE exercises SET
    form_tips = '["Lie face down on incline bench", "Arms hang straight down", "Curl up against gravity (brutal at top)", "Maintains constant tension throughout", "No momentum possible"]'::jsonb,
    common_mistakes = '["Not getting full extension", "Moving too fast", "Bench angle wrong", "Using momentum"]'::jsonb,
    coaching_cues = '["Arms hang down", "Curl against gravity", "Constant tension", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%spider%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- CABLE CURL (all variations)
UPDATE exercises SET
    form_tips = '["Stand facing low pulley", "Keep elbows pinned at sides", "Curl handle to chest/shoulders", "Constant cable tension throughout", "Control return against resistance"]'::jsonb,
    common_mistakes = '["Elbows moving forward", "Leaning back", "Not controlling negative", "Losing tension at bottom"]'::jsonb,
    coaching_cues = '["Elbows pinned", "Squeeze at top", "Constant tension", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%curl%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%hammer%' AND coach_id IS NULL;

-- DRAG CURL
UPDATE exercises SET
    form_tips = '["Bar starts at thighs, drag up body", "Elbows move backward, not forward", "Bar stays in contact with body", "Targets outer bicep head", "Very strict movement"]'::jsonb,
    common_mistakes = '["Elbows going forward (becomes regular curl)", "Bar drifting away from body", "Using momentum", "Going too heavy"]'::jsonb,
    coaching_cues = '["Drag up body", "Elbows back", "Bar touches torso", "Outer head focus"]'::jsonb
WHERE LOWER(name) LIKE '%drag%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- REVERSE CURL
UPDATE exercises SET
    form_tips = '["Overhand (pronated) grip", "Curl up keeping wrists straight", "Targets brachioradialis and forearms", "Use lighter weight than regular curls", "Great for forearm development"]'::jsonb,
    common_mistakes = '["Wrists bending", "Using too much weight", "Elbows moving", "Swinging"]'::jsonb,
    coaching_cues = '["Overhand grip", "Wrists straight", "Forearms focus", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%reverse%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- 21s (BICEP 21s)
UPDATE exercises SET
    form_tips = '["7 reps lower half (bottom to midpoint)", "7 reps upper half (midpoint to top)", "7 reps full range of motion", "No rest between the 21 reps", "Use lighter weight than normal"]'::jsonb,
    common_mistakes = '["Using too much weight", "Cheating form due to fatigue", "Resting between segments", "Not hitting each range properly"]'::jsonb,
    coaching_cues = '["7 bottom", "7 top", "7 full", "No rest"]'::jsonb
WHERE LOWER(name) LIKE '%21%' AND LOWER(name) LIKE '%curl%' OR LOWER(name) LIKE '%21s%' AND coach_id IS NULL;

-- BAND CURL
UPDATE exercises SET
    form_tips = '["Stand on band, grip handles", "Keep elbows at sides", "Curl up against increasing resistance", "Resistance increases at top (accommodating)", "Control the return"]'::jsonb,
    common_mistakes = '["Band slipping", "Elbows moving", "Not enough tension", "Rushing reps"]'::jsonb,
    coaching_cues = '["Elbows pinned", "Full ROM", "Squeeze at top", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%band%' AND LOWER(name) LIKE '%curl%' AND LOWER(name) NOT LIKE '%reverse%' AND coach_id IS NULL;

-- CROSS BODY CURL
UPDATE exercises SET
    form_tips = '["Curl dumbbell across body toward opposite shoulder", "Hits long head of bicep differently", "Keep elbow from moving forward", "Alternate arms"]'::jsonb,
    common_mistakes = '["Elbow moving forward", "Swinging", "Not crossing to opposite side", "Using momentum"]'::jsonb,
    coaching_cues = '["Cross to opposite shoulder", "Elbow stable", "Squeeze", "Alternate"]'::jsonb
WHERE LOWER(name) LIKE '%cross%' AND LOWER(name) LIKE '%body%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- ============== TRICEPS VARIATIONS ==============

-- CLOSE GRIP BENCH PRESS
UPDATE exercises SET
    form_tips = '["Hands 8-12 inches apart (shoulder width or narrower)", "Keep elbows tucked close to body (30-45 degrees)", "Lower bar to lower chest/sternum area", "Press up and lock out completely", "Emphasizes triceps heavily over chest"]'::jsonb,
    common_mistakes = '["Grip too narrow (wrist strain)", "Flaring elbows out (defeats purpose)", "Bouncing bar off chest", "Partial lockout"]'::jsonb,
    coaching_cues = '["Elbows in tight", "Lower chest", "Lock out hard", "Triceps squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%close%' AND LOWER(name) LIKE '%grip%' AND LOWER(name) LIKE '%bench%' AND coach_id IS NULL;

-- CABLE TRICEP PUSHDOWN (bar attachment)
UPDATE exercises SET
    form_tips = '["Keep elbows pinned at sides throughout", "Start with forearms parallel to floor", "Push down until arms fully extended", "Squeeze triceps hard at bottom", "Control the return"]'::jsonb,
    common_mistakes = '["Elbows flaring or moving forward", "Leaning over the weight (using bodyweight)", "Partial range of motion", "Using momentum"]'::jsonb,
    coaching_cues = '["Pin elbows", "Full extension", "Squeeze at bottom", "Control up"]'::jsonb
WHERE (LOWER(name) LIKE '%pushdown%' OR LOWER(name) LIKE '%push down%' OR LOWER(name) LIKE '%pressdown%') AND LOWER(name) NOT LIKE '%rope%' AND coach_id IS NULL;

-- ROPE TRICEP PUSHDOWN
UPDATE exercises SET
    form_tips = '["Use rope attachment on cable", "Keep elbows pinned at sides", "Push down and spread rope apart at bottom", "Full extension with external rotation", "This spreading motion hits lateral head"]'::jsonb,
    common_mistakes = '["Not splitting rope at bottom (losing lateral head work)", "Elbows drifting forward", "Using momentum", "Partial ROM"]'::jsonb,
    coaching_cues = '["Split the rope at bottom", "Elbows pinned", "Squeeze and spread", "Control up"]'::jsonb
WHERE LOWER(name) LIKE '%rope%' AND (LOWER(name) LIKE '%tricep%' OR LOWER(name) LIKE '%pushdown%' OR LOWER(name) LIKE '%press%') AND coach_id IS NULL;

-- SKULL CRUSHERS / LYING TRICEP EXTENSION
UPDATE exercises SET
    form_tips = '["Lie on bench, arms extended over chest", "Lower bar/dumbbells toward forehead or just behind head", "Keep upper arms vertical - elbows point at ceiling", "Extend arms fully at top with strong lockout", "Control the descent"]'::jsonb,
    common_mistakes = '["Elbows flaring out to sides", "Upper arms moving (swinging)", "Lowering to chest instead of head", "Not locking out fully"]'::jsonb,
    coaching_cues = '["Elbows to ceiling", "To forehead", "Lock out hard", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%skull crusher%' OR LOWER(name) LIKE '%skullcrusher%' OR (LOWER(name) LIKE '%lying%' AND LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%extension%') AND coach_id IS NULL;

-- OVERHEAD TRICEP EXTENSION (dumbbell or cable)
UPDATE exercises SET
    form_tips = '["Hold weight overhead with arms extended", "Keep elbows close to head pointing up", "Lower weight behind head feeling deep stretch", "Extend arms fully overhead", "Can be done standing, seated, or with cable"]'::jsonb,
    common_mistakes = '["Elbows flaring wide to sides", "Arching back excessively", "Partial range of motion", "Weight too heavy"]'::jsonb,
    coaching_cues = '["Elbows by ears", "Full stretch behind head", "Lock out overhead", "Feel the stretch"]'::jsonb
WHERE LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%extension%' AND coach_id IS NULL;

-- SINGLE ARM OVERHEAD EXTENSION
UPDATE exercises SET
    form_tips = '["One dumbbell held overhead", "Keep elbow close to head", "Lower behind head with control", "Full stretch, full extension", "Can support elbow with other hand"]'::jsonb,
    common_mistakes = '["Elbow flaring out", "Not going low enough", "Using momentum", "Arching back"]'::jsonb,
    coaching_cues = '["Elbow by ear", "Deep stretch", "Full lockout", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%single%' AND LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%extension%' AND coach_id IS NULL;

-- TRICEP DIP (bodyweight or weighted)
UPDATE exercises SET
    form_tips = '["Grip parallel bars or bench edge", "Keep torso upright (vertical) for tricep focus", "Lower until upper arms parallel to floor", "Press up to full lockout", "Keep elbows close to body, pointing back"]'::jsonb,
    common_mistakes = '["Leaning too far forward (shifts to chest)", "Not going deep enough", "Flaring elbows out to sides", "Partial lockout at top"]'::jsonb,
    coaching_cues = '["Stay upright", "Elbows back", "Full depth", "Lock out"]'::jsonb
WHERE (LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%dip%') OR (LOWER(name) LIKE '%dip%' AND LOWER(name) NOT LIKE '%chest%' AND LOWER(name) NOT LIKE '%hip%') AND coach_id IS NULL;

-- BENCH DIP
UPDATE exercises SET
    form_tips = '["Hands on bench behind you, fingers forward", "Feet on floor or elevated on another bench", "Lower until upper arms parallel", "Press up to full extension", "Keep back close to bench"]'::jsonb,
    common_mistakes = '["Going too deep (shoulder stress)", "Elbows flaring out", "Back drifting from bench", "Partial ROM"]'::jsonb,
    coaching_cues = '["Back close to bench", "Lower to parallel", "Press up", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%bench%' AND LOWER(name) LIKE '%dip%' AND coach_id IS NULL;

-- TRICEP KICKBACK
UPDATE exercises SET
    form_tips = '["Hinge at hips with upper arm parallel to floor", "Keep upper arm stationary throughout", "Extend forearm back until arm straight", "Squeeze tricep hard at full extension", "Control the return"]'::jsonb,
    common_mistakes = '["Upper arm dropping", "Swinging weight with momentum", "Not extending fully", "Using too much weight"]'::jsonb,
    coaching_cues = '["Upper arm still", "Full extension", "Squeeze hard", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%kickback%' AND coach_id IS NULL;

-- DIAMOND PUSH UP
UPDATE exercises SET
    form_tips = '["Hands together forming diamond shape", "Position hands under chest", "Lower chest to hands", "Elbows stay close to body", "Intense tricep focus"]'::jsonb,
    common_mistakes = '["Hands positioned too far forward", "Elbows flaring out", "Hips sagging", "Not touching hands"]'::jsonb,
    coaching_cues = '["Diamond under chest", "Elbows back", "Touch hands", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%diamond%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- CLOSE GRIP PUSH UP
UPDATE exercises SET
    form_tips = '["Hands close together (narrower than shoulders)", "Elbows stay close to body on descent", "Lower chest toward hands", "Push up to full extension"]'::jsonb,
    common_mistakes = '["Hands too far apart", "Elbows flaring", "Hips sagging", "Partial ROM"]'::jsonb,
    coaching_cues = '["Narrow hands", "Elbows in", "Full ROM", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%close%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND LOWER(name) NOT LIKE '%diamond%' AND coach_id IS NULL;

-- CABLE OVERHEAD TRICEP EXTENSION
UPDATE exercises SET
    form_tips = '["Face away from cable, rope behind head", "Lean forward slightly for stability", "Keep elbows by ears", "Extend arms forward and up", "Feel deep stretch, full contraction"]'::jsonb,
    common_mistakes = '["Elbows drifting forward", "Standing too upright", "Partial ROM", "Using momentum"]'::jsonb,
    coaching_cues = '["Elbows by ears", "Full stretch", "Full extension", "Lean forward"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%tricep%' AND coach_id IS NULL;

-- JM PRESS (hybrid movement)
UPDATE exercises SET
    form_tips = '["Cross between close grip bench and skull crusher", "Lower bar to chin/upper chest area", "Elbows move forward during descent", "Press up and back to lockout", "Advanced movement for experienced lifters"]'::jsonb,
    common_mistakes = '["Bar path too vertical", "Elbows not moving enough", "Using too much weight", "Incorrect starting position"]'::jsonb,
    coaching_cues = '["To chin area", "Elbows forward", "Press up and back", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%jm press%' AND coach_id IS NULL;

-- TATE PRESS
UPDATE exercises SET
    form_tips = '["Lie on bench with dumbbells", "Point elbows out, lower weights to chest (elbows lead)", "Press up by extending elbows, not pushing up", "Dumbbells almost touch at bottom", "Unique tricep isolation"]'::jsonb,
    common_mistakes = '["Pressing like bench press", "Elbows not staying up", "Using momentum", "Going too heavy"]'::jsonb,
    coaching_cues = '["Elbows stay up", "Lower to chest", "Extend from elbow", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%tate%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- BAND TRICEP EXTENSION
UPDATE exercises SET
    form_tips = '["Anchor band overhead", "Face away, grip band behind head", "Keep elbows by ears", "Extend arms forward", "Constant tension from band"]'::jsonb,
    common_mistakes = '["Elbows flaring", "Not enough tension", "Partial ROM", "Rushing"]'::jsonb,
    coaching_cues = '["Elbows by ears", "Full extension", "Control", "Constant tension"]'::jsonb
WHERE LOWER(name) LIKE '%band%' AND LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%extension%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Upper arm parallel to floor", "Extend arm fully back", "Squeeze tricep at contraction", "Control the return"]'::jsonb,
    common_mistakes = '["Swinging weight", "Upper arm dropping", "Not extending fully"]'::jsonb,
    coaching_cues = '["Upper arm still", "Full extension", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%kickback%' AND coach_id IS NULL;

-- ============== LEGS - QUADS / SQUAT VARIATIONS ==============

-- BACK SQUAT (barbell back squat)
UPDATE exercises SET
    form_tips = '["Bar on upper traps (high bar) or rear delts (low bar)", "Feet shoulder width, toes pointed 15-30 degrees out", "Brace core hard before descent", "Break at hips and knees simultaneously", "Knees track over toes throughout", "Descend until hip crease below knee (parallel+)", "Drive through whole foot, not just heels", "Keep chest proud and back tight"]'::jsonb,
    common_mistakes = '["Knees caving inward (valgus) - injury risk", "Rising on toes or heels coming up", "Rounding lower back at bottom", "Not hitting proper depth", "Leaning too far forward", "Bar rolling up neck", "Holding breath entire rep"]'::jsonb,
    coaching_cues = '["Big breath, brace core", "Knees out", "Chest up", "Sit back and down", "Drive through floor", "Squeeze glutes at top"]'::jsonb
WHERE LOWER(name) LIKE '%squat%' AND (LOWER(name) LIKE '%barbell%' OR LOWER(name) LIKE '%back%') AND LOWER(name) NOT LIKE '%front%' AND LOWER(name) NOT LIKE '%goblet%' AND LOWER(name) NOT LIKE '%hack%' AND LOWER(name) NOT LIKE '%split%' AND LOWER(name) NOT LIKE '%overhead%' AND LOWER(name) NOT LIKE '%zercher%' AND LOWER(name) NOT LIKE '%jefferson%' AND LOWER(name) NOT LIKE '%box%' AND LOWER(name) NOT LIKE '%jump%' AND LOWER(name) NOT LIKE '%low bar%' AND coach_id IS NULL;

-- LOW BAR SQUAT
UPDATE exercises SET
    form_tips = '["Bar sits on rear deltoids, below traps", "Requires more shoulder mobility", "More forward lean than high bar", "Sit back more, emphasizes hip drive", "Wider grip helps create shelf for bar", "Strong hip hinge pattern"]'::jsonb,
    common_mistakes = '["Bar too high (rolls down)", "Wrist pain from poor grip", "Too much forward lean", "Not sitting back enough"]'::jsonb,
    coaching_cues = '["Bar on shelf", "Sit back", "Hip drive", "Elbows under bar"]'::jsonb
WHERE LOWER(name) LIKE '%low bar%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- FRONT SQUAT
UPDATE exercises SET
    form_tips = '["Bar in front rack position on front delts", "Elbows HIGH - this is critical", "Fingertip grip or crossed arm grip", "More upright torso than back squat", "Drive knees forward and out", "Core must work harder to stay upright"]'::jsonb,
    common_mistakes = '["Elbows dropping (bar rolls forward)", "Leaning too far forward", "Wrist pain from poor rack position", "Not bracing core hard enough", "Cutting depth short"]'::jsonb,
    coaching_cues = '["Elbows UP", "Chest tall", "Sit between legs", "Stay upright", "Drive up and back"]'::jsonb
WHERE LOWER(name) LIKE '%front squat%' AND coach_id IS NULL;

-- GOBLET SQUAT
UPDATE exercises SET
    form_tips = '["Hold dumbbell/KB at chest like a goblet", "Elbows point down, inside knees at bottom", "Keep torso very upright", "Great for learning squat pattern", "Push knees out with elbows at bottom"]'::jsonb,
    common_mistakes = '["Leaning forward with weight", "Knees caving inward", "Not going deep enough", "Weight drifting away from chest"]'::jsonb,
    coaching_cues = '["Chest up tall", "Elbows push knees out", "Sit deep between legs", "Drive through floor"]'::jsonb
WHERE LOWER(name) LIKE '%goblet%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- BULGARIAN SPLIT SQUAT
UPDATE exercises SET
    form_tips = '["Rear foot on bench, laces down or toes tucked", "Front foot far enough forward that knee stays over ankle", "Keep torso upright, slight forward lean okay", "Lower straight down until back knee near floor", "Drive through front heel to stand", "Keep hips square, dont rotate"]'::jsonb,
    common_mistakes = '["Front foot too close to bench", "Rear knee slamming into floor", "Torso collapsing forward", "Front knee caving inward", "Hips rotating open", "Rear foot position unstable"]'::jsonb,
    coaching_cues = '["Straight down", "Front heel drive", "Chest up", "Hip square", "Control the descent"]'::jsonb
WHERE LOWER(name) LIKE '%bulgarian%' AND LOWER(name) LIKE '%split%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- SPLIT SQUAT (stationary, not Bulgarian)
UPDATE exercises SET
    form_tips = '["Staggered stance, both feet on floor", "Front foot flat, rear foot on toes", "Lower straight down like an elevator", "Both knees bend to 90 degrees", "Drive through front heel"]'::jsonb,
    common_mistakes = '["Pushing forward instead of straight down", "Front knee going past toes excessively", "Leaning forward", "Rear knee hitting floor hard"]'::jsonb,
    coaching_cues = '["Straight down", "90-90 position", "Front heel drive", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%split squat%' AND LOWER(name) NOT LIKE '%bulgarian%' AND coach_id IS NULL;

-- BOX SQUAT
UPDATE exercises SET
    form_tips = '["Set box at parallel or just below", "Sit back onto box with control - dont plop", "Pause briefly on box, keep tension", "Feet slightly wider than regular squat", "Shin angle more vertical", "Explode off box using hip drive"]'::jsonb,
    common_mistakes = '["Plopping onto box (compresses spine)", "Relaxing completely on box", "Rocking forward to stand", "Box too high or low"]'::jsonb,
    coaching_cues = '["Sit back", "Control to box", "Stay tight", "Explode up", "Hip drive"]'::jsonb
WHERE LOWER(name) LIKE '%box%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- JUMP SQUAT
UPDATE exercises SET
    form_tips = '["Start with quarter to half squat depth", "Explode up as high as possible", "Swing arms for momentum", "Land softly with bent knees", "Absorb landing before next rep", "Keep chest up throughout"]'::jsonb,
    common_mistakes = '["Landing with straight legs (injury risk)", "Not using full squat depth", "Landing too loud (not absorbing)", "Knees caving on landing"]'::jsonb,
    coaching_cues = '["Explode up", "Land soft", "Absorb impact", "Quiet feet", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%jump%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- OVERHEAD SQUAT
UPDATE exercises SET
    form_tips = '["Bar locked out overhead with wide grip", "Arms stay straight and active", "Requires excellent shoulder and hip mobility", "Keep bar over mid-foot throughout", "Torso very upright", "Slow controlled descent"]'::jsonb,
    common_mistakes = '["Arms bending", "Bar drifting forward", "Not enough depth due to mobility", "Losing balance", "Core not braced"]'::jsonb,
    coaching_cues = '["Lock arms out", "Bar over heels", "Stay upright", "Push up on bar", "Slow and controlled"]'::jsonb
WHERE LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- ZERCHER SQUAT
UPDATE exercises SET
    form_tips = '["Bar held in crook of elbows", "Requires strong core and upper back", "Keep elbows up and together", "More upright than back squat", "Challenging grip - use pad if needed"]'::jsonb,
    common_mistakes = '["Elbows dropping", "Rounding upper back", "Bar slipping", "Not bracing core hard enough"]'::jsonb,
    coaching_cues = '["Elbows up", "Bar tight to body", "Stay tall", "Big core brace"]'::jsonb
WHERE LOWER(name) LIKE '%zercher%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- JEFFERSON SQUAT
UPDATE exercises SET
    form_tips = '["Straddle the bar with staggered stance", "One foot in front, one behind bar", "Grip bar with mixed grip (one hand front, one back)", "Squat down keeping torso upright", "Unique anti-rotation demands on core"]'::jsonb,
    common_mistakes = '["Rotating torso too much", "Uneven stance", "Leaning to one side", "Not switching lead leg between sets"]'::jsonb,
    coaching_cues = '["Stay centered", "Resist rotation", "Sit straight down", "Switch sides"]'::jsonb
WHERE LOWER(name) LIKE '%jefferson%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- SUMO SQUAT
UPDATE exercises SET
    form_tips = '["Wide stance, toes pointed out 45 degrees", "Push knees out over toes", "Keep torso upright", "Weight at center (dumbbell or KB)", "Targets inner thighs more than regular squat"]'::jsonb,
    common_mistakes = '["Knees caving inward", "Leaning forward", "Not going deep enough", "Feet not wide enough"]'::jsonb,
    coaching_cues = '["Knees out", "Chest proud", "Sit deep", "Squeeze glutes up"]'::jsonb
WHERE LOWER(name) LIKE '%sumo%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- PISTOL SQUAT (single leg squat)
UPDATE exercises SET
    form_tips = '["Stand on one leg, other leg extended forward", "Squat down on single leg as deep as possible", "Keep extended leg off floor throughout", "Arms forward for counterbalance", "Drive through heel to stand"]'::jsonb,
    common_mistakes = '["Knee caving inward", "Losing balance", "Extended leg touching floor", "Not enough depth", "Heel coming up"]'::jsonb,
    coaching_cues = '["Arms forward", "Heel down", "Control descent", "Knee tracks toe", "Push through heel"]'::jsonb
WHERE LOWER(name) LIKE '%pistol%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- SISSY SQUAT
UPDATE exercises SET
    form_tips = '["Hold onto support for balance", "Rise onto toes and lean torso back", "Bend knees and lower hips forward", "Knees travel far forward - thats the point", "Feel intense quad stretch", "Control throughout - never bounce"]'::jsonb,
    common_mistakes = '["Going too fast", "Not controlling the descent", "Losing balance", "Not leaning back enough"]'::jsonb,
    coaching_cues = '["Rise on toes", "Lean back", "Knees forward", "Squeeze quads", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%sissy%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- WALL SQUAT / WALL SIT
UPDATE exercises SET
    form_tips = '["Back flat against wall", "Feet about 2 feet from wall", "Slide down until thighs parallel to floor", "Knees at 90 degrees, over ankles", "Hold position for time"]'::jsonb,
    common_mistakes = '["Thighs not parallel", "Knees going past toes", "Back coming off wall", "Holding breath"]'::jsonb,
    coaching_cues = '["Back flat on wall", "90 degree knees", "Breathe", "Hold strong"]'::jsonb
WHERE LOWER(name) LIKE '%wall%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- COSSACK SQUAT
UPDATE exercises SET
    form_tips = '["Wide stance, shift weight to one side", "Squat deep on one leg while other leg stays straight", "Straight leg toes point up", "Keep heel down on squatting leg", "Alternate sides"]'::jsonb,
    common_mistakes = '["Heel coming up", "Not going deep enough", "Straight leg bending", "Torso collapsing forward"]'::jsonb,
    coaching_cues = '["Heel down", "Sit deep", "Straight leg straight", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%cossack%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- NARROW STANCE SQUAT
UPDATE exercises SET
    form_tips = '["Feet close together, inside shoulder width", "Emphasizes quads more than wide stance", "Keep torso upright", "Requires good ankle mobility", "Knees track over toes"]'::jsonb,
    common_mistakes = '["Heels coming up", "Falling forward", "Knees caving in", "Not hitting depth"]'::jsonb,
    coaching_cues = '["Heels down", "Knees forward", "Stay upright", "Full depth"]'::jsonb
WHERE LOWER(name) LIKE '%narrow%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- PULSE SQUAT
UPDATE exercises SET
    form_tips = '["Lower to bottom of squat", "Pulse up and down in small range", "Stay in the bottom portion", "Keep constant tension on quads", "Dont stand fully between pulses"]'::jsonb,
    common_mistakes = '["Coming up too high", "Bouncing", "Losing form during fatigue", "Knees caving"]'::jsonb,
    coaching_cues = '["Small pulses", "Stay low", "Constant tension", "Burn is normal"]'::jsonb
WHERE LOWER(name) LIKE '%pulse%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- KNEELING SQUAT
UPDATE exercises SET
    form_tips = '["Start kneeling with bar on back", "Sit hips back to heels", "Drive hips forward to return to tall kneeling", "Isolates glutes and hip extension", "Keep core braced throughout"]'::jsonb,
    common_mistakes = '["Leaning too far forward", "Not squeezing glutes at top", "Using too much weight", "Hyperextending lower back"]'::jsonb,
    coaching_cues = '["Hips back", "Squeeze glutes forward", "Stay tall at top"]'::jsonb
WHERE LOWER(name) LIKE '%kneeling%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

-- HACK SQUAT MACHINE
UPDATE exercises SET
    form_tips = '["Shoulders under pads, back flat on pad", "Feet shoulder width on platform", "Lower with control until 90 degrees or deeper", "Drive through whole foot to stand", "Dont lock knees completely at top"]'::jsonb,
    common_mistakes = '["Heels coming up", "Knees caving inward", "Lower back rounding off pad", "Going too fast", "Locking out knees hard"]'::jsonb,
    coaching_cues = '["Back on pad", "Knees out", "Full depth", "Control", "Dont lock knees"]'::jsonb
WHERE LOWER(name) LIKE '%hack squat%' AND coach_id IS NULL;

-- LEG PRESS
UPDATE exercises SET
    form_tips = '["Feet shoulder width on platform, mid-height", "Lower until knees at 90 degrees", "Keep lower back pressed into seat", "Push through whole foot to extend", "Dont lock knees completely at top"]'::jsonb,
    common_mistakes = '["Going too deep (lower back rounds)", "Locking knees hard at top", "Feet too high or low on platform", "Heels coming up", "Holding breath"]'::jsonb,
    coaching_cues = '["Back on pad", "90 degrees", "Push through heels", "Dont lock out", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%leg press%' AND coach_id IS NULL;

-- BODYWEIGHT SQUAT (air squat)
UPDATE exercises SET
    form_tips = '["Feet shoulder width, toes slightly out", "Arms forward for counterbalance", "Sit back and down like sitting in chair", "Knees track over toes", "Go to full depth - below parallel"]'::jsonb,
    common_mistakes = '["Not going deep enough", "Knees caving in", "Heels coming up", "Leaning too far forward"]'::jsonb,
    coaching_cues = '["Sit back", "Knees out", "Chest up", "Full depth", "Drive through heels"]'::jsonb
WHERE (LOWER(name) LIKE '%bodyweight%' OR LOWER(name) LIKE '%air%') AND LOWER(name) LIKE '%squat%' AND LOWER(name) NOT LIKE '%jump%' AND LOWER(name) NOT LIKE '%pistol%' AND coach_id IS NULL;

-- DUMBBELL SQUAT
UPDATE exercises SET
    form_tips = '["Dumbbells at sides or at shoulders", "Feet shoulder width, toes slightly out", "Sit back and down with control", "Keep chest up and core braced", "Full depth - hip crease below knee"]'::jsonb,
    common_mistakes = '["Leaning forward", "Knees caving", "Partial depth", "Dumbbells swinging"]'::jsonb,
    coaching_cues = '["Chest up", "Knees out", "Full depth", "Control the weights"]'::jsonb
WHERE LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%squat%' AND LOWER(name) NOT LIKE '%goblet%' AND LOWER(name) NOT LIKE '%sumo%' AND LOWER(name) NOT LIKE '%split%' AND LOWER(name) NOT LIKE '%bulgarian%' AND LOWER(name) NOT LIKE '%front%' AND LOWER(name) NOT LIKE '%single%' AND LOWER(name) NOT LIKE '%jump%' AND coach_id IS NULL;

-- KETTLEBELL SQUAT
UPDATE exercises SET
    form_tips = '["KB at chest (goblet) or racked at shoulders", "Feet shoulder width, toes out slightly", "Sit back and down with upright torso", "Knees track over toes", "Drive through whole foot to stand"]'::jsonb,
    common_mistakes = '["Leaning forward with KB", "Knees caving", "Partial depth", "Losing core brace"]'::jsonb,
    coaching_cues = '["KB close to body", "Chest proud", "Sit deep", "Knees out"]'::jsonb
WHERE LOWER(name) LIKE '%kettlebell%' AND LOWER(name) LIKE '%squat%' AND LOWER(name) NOT LIKE '%sumo%' AND LOWER(name) NOT LIKE '%split%' AND LOWER(name) NOT LIKE '%bulgarian%' AND coach_id IS NULL;

-- BAND SQUAT
UPDATE exercises SET
    form_tips = '["Stand on band with feet shoulder width", "Band over shoulders or held at chest", "Resistance increases as you stand (accommodating)", "Same mechanics as regular squat", "Control the descent against band tension"]'::jsonb,
    common_mistakes = '["Band not secure under feet", "Rushing through reps", "Not going deep enough", "Band rolling on shoulders"]'::jsonb,
    coaching_cues = '["Band secure", "Full depth", "Control up and down", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%band%' AND LOWER(name) LIKE '%squat%' AND LOWER(name) NOT LIKE '%split%' AND coach_id IS NULL;

-- ============== LEG EXTENSION ==============
UPDATE exercises SET
    form_tips = '["Adjust pad to sit on lower shin, just above ankles", "Back firmly against seat pad", "Grip handles for stability", "Extend legs fully until knees straight", "Squeeze quads hard at top (1-2 sec hold)", "Lower with control - dont let weight slam"]'::jsonb,
    common_mistakes = '["Using momentum to swing weight up", "Not extending fully (partial reps)", "Coming down too fast", "Lifting butt off seat", "Hyperextending knees"]'::jsonb,
    coaching_cues = '["Full extension", "Squeeze quad hard", "Control down", "Stay seated"]'::jsonb
WHERE LOWER(name) LIKE '%leg extension%' AND coach_id IS NULL;

-- ============== LUNGE VARIATIONS ==============

-- WALKING LUNGE
UPDATE exercises SET
    form_tips = '["Take long stride forward", "Lower until back knee nearly touches floor", "Keep torso upright, core braced", "Drive through front heel to step forward", "Alternate legs continuously while moving"]'::jsonb,
    common_mistakes = '["Steps too short (incomplete ROM)", "Front knee going far past toes", "Leaning forward", "Knee caving inward", "Back knee slamming ground"]'::jsonb,
    coaching_cues = '["Long stride", "Chest up", "Drive through heel", "Control each step"]'::jsonb
WHERE LOWER(name) LIKE '%walking%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- REVERSE LUNGE
UPDATE exercises SET
    form_tips = '["Step backward instead of forward", "Lower until back knee nearly touches floor", "Keep torso upright", "Drive through front heel to return", "Often easier on knees than forward lunge"]'::jsonb,
    common_mistakes = '["Stepping back too short", "Leaning forward", "Front knee caving", "Losing balance"]'::jsonb,
    coaching_cues = '["Step back", "Straight down", "Front heel drive", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%reverse%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- FORWARD LUNGE
UPDATE exercises SET
    form_tips = '["Step forward into lunge", "Lower until back knee nearly touches floor", "Keep torso upright", "Push back to starting position", "Requires more deceleration than reverse lunge"]'::jsonb,
    common_mistakes = '["Steps too short", "Knee going past toe excessively", "Leaning forward", "Knee caving inward"]'::jsonb,
    coaching_cues = '["Long stride", "Chest up", "Push back", "Control landing"]'::jsonb
WHERE LOWER(name) LIKE '%forward%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- STATIONARY LUNGE
UPDATE exercises SET
    form_tips = '["Set stance then stay in place", "Both feet remain stationary throughout", "Lower straight down like elevator", "Both knees bend to approximately 90 degrees", "Drive through front heel"]'::jsonb,
    common_mistakes = '["Stance too narrow", "Leaning forward", "Knees caving", "Not going deep enough"]'::jsonb,
    coaching_cues = '["Straight down", "90-90", "Front heel", "Chest up"]'::jsonb
WHERE LOWER(name) LIKE '%stationary%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- LATERAL LUNGE / SIDE LUNGE
UPDATE exercises SET
    form_tips = '["Step out to side, wider than shoulder width", "Bend stepping knee while keeping other leg straight", "Push hips back as you lower", "Keep both feet flat on floor", "Drive through heel to return"]'::jsonb,
    common_mistakes = '["Not stepping wide enough", "Heel coming up", "Knee caving inward", "Torso leaning too far forward"]'::jsonb,
    coaching_cues = '["Wide step", "Hips back", "Heel down", "Push back"]'::jsonb
WHERE (LOWER(name) LIKE '%lateral%' OR LOWER(name) LIKE '%side%') AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- CURTSY LUNGE
UPDATE exercises SET
    form_tips = '["Step back and across behind front leg", "Like doing a curtsy", "Lower until front thigh parallel", "Keep torso upright", "Great for glutes and inner thighs"]'::jsonb,
    common_mistakes = '["Not crossing enough", "Torso collapsing", "Front knee caving", "Losing balance"]'::jsonb,
    coaching_cues = '["Cross behind", "Stay upright", "Control", "Squeeze glutes"]'::jsonb
WHERE LOWER(name) LIKE '%curtsy%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- DUMBBELL LUNGE (general)
UPDATE exercises SET
    form_tips = '["Hold dumbbells at sides", "Step forward or backward into lunge", "Lower until back knee near floor", "Keep torso upright, core tight", "Drive through front heel"]'::jsonb,
    common_mistakes = '["Dumbbells swinging", "Leaning forward", "Short steps", "Knee caving"]'::jsonb,
    coaching_cues = '["Weights steady", "Chest up", "Full depth", "Heel drive"]'::jsonb
WHERE LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%lunge%' AND LOWER(name) NOT LIKE '%walking%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%lateral%' AND coach_id IS NULL;

-- BARBELL LUNGE
UPDATE exercises SET
    form_tips = '["Bar across upper back like squat", "Step forward or backward into lunge", "Lower with control, back knee near floor", "Keep torso upright", "Drive through front heel to return"]'::jsonb,
    common_mistakes = '["Leaning forward with bar", "Losing balance", "Short steps", "Not bracing core"]'::jsonb,
    coaching_cues = '["Bar stable", "Core braced", "Long step", "Upright torso"]'::jsonb
WHERE LOWER(name) LIKE '%barbell%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- STEP UP
UPDATE exercises SET
    form_tips = '["Entire foot on box/bench", "Drive through heel to step up", "Stand fully on box before stepping down", "Control the descent", "Can hold dumbbells for added resistance"]'::jsonb,
    common_mistakes = '["Pushing off back foot (cheating)", "Not standing fully at top", "Falling off rather than controlling down", "Box too high"]'::jsonb,
    coaching_cues = '["Drive through top foot only", "Stand tall at top", "Control down", "Full step"]'::jsonb
WHERE LOWER(name) LIKE '%step up%' OR LOWER(name) LIKE '%step-up%' AND coach_id IS NULL;

-- ============== LEGS - HAMSTRINGS / LEG CURLS ==============

-- LYING LEG CURL
UPDATE exercises SET
    form_tips = '["Lie face down, pad above heels/on Achilles", "Hips pressed firmly into pad", "Curl heels toward glutes", "Squeeze hamstrings hard at top", "Control the lowering - dont let weight drop"]'::jsonb,
    common_mistakes = '["Using momentum to swing weight", "Hips rising off pad", "Not going through full range", "Letting weight slam down"]'::jsonb,
    coaching_cues = '["Hips down", "Squeeze hams", "Full ROM", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%lying%' AND LOWER(name) LIKE '%leg curl%' AND coach_id IS NULL;

-- SEATED LEG CURL
UPDATE exercises SET
    form_tips = '["Back against pad, thighs on seat", "Pad behind ankles/lower calves", "Curl heels under seat", "Squeeze hamstrings at full contraction", "Control return to starting position"]'::jsonb,
    common_mistakes = '["Not going through full range", "Using momentum", "Lifting off seat", "Rushing reps"]'::jsonb,
    coaching_cues = '["Full curl", "Squeeze hard", "Control up", "Stay seated"]'::jsonb
WHERE LOWER(name) LIKE '%seated%' AND LOWER(name) LIKE '%leg curl%' AND coach_id IS NULL;

-- STANDING LEG CURL
UPDATE exercises SET
    form_tips = '["Stand on one leg, other behind pad", "Curl working leg toward glutes", "Keep hips stable, dont rotate", "Squeeze at top", "Control the return"]'::jsonb,
    common_mistakes = '["Swinging leg", "Hips rotating", "Leaning forward", "Partial reps"]'::jsonb,
    coaching_cues = '["Hips square", "Squeeze at top", "Control", "Balance"]'::jsonb
WHERE LOWER(name) LIKE '%standing%' AND LOWER(name) LIKE '%leg curl%' AND coach_id IS NULL;

-- NORDIC CURL / NORDIC HAMSTRING CURL
UPDATE exercises SET
    form_tips = '["Kneel with ankles secured (partner or pad)", "Keep body straight from knees to head", "Lower yourself forward as slowly as possible", "Use hamstrings to control descent", "Catch yourself at bottom if needed, push up to restart"]'::jsonb,
    common_mistakes = '["Breaking at hips (bending forward)", "Falling uncontrolled", "Not going through full ROM", "Using arms too much to push up"]'::jsonb,
    coaching_cues = '["Body straight", "Control down", "Hams working hard", "Slow eccentric"]'::jsonb
WHERE LOWER(name) LIKE '%nordic%' AND coach_id IS NULL;

-- GOOD MORNING
UPDATE exercises SET
    form_tips = '["Bar across upper back", "Feet shoulder width, slight knee bend maintained", "Hinge at hips, pushing them back", "Lower torso until nearly parallel to floor", "Squeeze hamstrings and glutes to return upright"]'::jsonb,
    common_mistakes = '["Rounding back (dangerous)", "Bending knees too much", "Not feeling hamstring stretch", "Going too heavy"]'::jsonb,
    coaching_cues = '["Hips back", "Flat back", "Feel stretch", "Squeeze to stand"]'::jsonb
WHERE LOWER(name) LIKE '%good morning%' AND coach_id IS NULL;

-- STIFF LEG DEADLIFT
UPDATE exercises SET
    form_tips = '["Legs nearly straight throughout (soft knee)", "Hinge at hips, pushing them back", "Lower until hamstring stretch (not to floor)", "Keep bar close to legs", "Squeeze hamstrings and glutes to return"]'::jsonb,
    common_mistakes = '["Rounding back to go lower", "Bending knees too much", "Bar drifting away from legs", "Hyperextending at top"]'::jsonb,
    coaching_cues = '["Hips back", "Feel hamstring stretch", "Bar close", "Squeeze to stand"]'::jsonb
WHERE LOWER(name) LIKE '%stiff leg%' OR LOWER(name) LIKE '%straight leg%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

-- ============== LEGS - GLUTES ==============

-- HIP THRUST (Barbell or Dumbbell)
UPDATE exercises SET
    form_tips = '["Upper back resting on bench, feet flat on floor", "Bar across hip crease (use pad for comfort)", "Drive through heels to lift hips toward ceiling", "Squeeze glutes hard at top - full hip extension", "Chin tucked, dont hyperextend lower back", "Lower with control"]'::jsonb,
    common_mistakes = '["Hyperextending lower back at top", "Feet too far out or too close", "Not squeezing glutes at top", "Pushing through toes instead of heels", "Looking up (strains neck)"]'::jsonb,
    coaching_cues = '["Drive hips up", "Squeeze glutes hard", "Chin tucked", "Heels drive"]'::jsonb
WHERE LOWER(name) LIKE '%hip thrust%' AND coach_id IS NULL;

-- GLUTE BRIDGE
UPDATE exercises SET
    form_tips = '["Lie on back, feet flat close to glutes", "Arms at sides for stability", "Drive hips up by squeezing glutes", "Create straight line from knees to shoulders", "Hold at top briefly, squeeze glutes", "Lower with control"]'::jsonb,
    common_mistakes = '["Using lower back instead of glutes", "Feet too far away from body", "Not squeezing at top", "Hyperextending lower back"]'::jsonb,
    coaching_cues = '["Squeeze glutes", "Hips high", "Hold at top", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%glute bridge%' AND coach_id IS NULL;

-- SINGLE LEG GLUTE BRIDGE
UPDATE exercises SET
    form_tips = '["Same as glute bridge but one leg extended", "Extended leg stays straight throughout", "Drive through heel of planted foot", "Squeeze glute of working leg hard", "Keep hips level, dont rotate"]'::jsonb,
    common_mistakes = '["Hips rotating", "Extended leg dropping", "Not squeezing glute", "Using lower back"]'::jsonb,
    coaching_cues = '["Hips level", "Squeeze working glute", "Leg straight", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%single%' AND LOWER(name) LIKE '%glute bridge%' AND coach_id IS NULL;

-- CABLE PULL THROUGH
UPDATE exercises SET
    form_tips = '["Face away from low cable", "Rope attachment between legs", "Hinge at hips, pushing them back", "Feel hamstring stretch at bottom", "Drive hips forward by squeezing glutes"]'::jsonb,
    common_mistakes = '["Using arms to pull", "Not hinging properly", "Squatting instead of hinging", "Not squeezing at top"]'::jsonb,
    coaching_cues = '["Hips back", "Arms straight", "Squeeze glutes forward"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%pull through%' AND coach_id IS NULL;

-- KETTLEBELL SWING
UPDATE exercises SET
    form_tips = '["Feet slightly wider than shoulder width", "Hike KB back between legs (like hiking a football)", "Drive hips forward explosively to swing KB", "Arms straight, power comes from hips", "Let KB float at top, dont muscle it up", "Maintain flat back throughout"]'::jsonb,
    common_mistakes = '["Using arms to lift KB", "Squatting instead of hinging", "Rounding back", "KB going too high (overhead)", "Not using hip drive"]'::jsonb,
    coaching_cues = '["Hip snap", "Arms straight", "Flat back", "Float at top"]'::jsonb
WHERE LOWER(name) LIKE '%kettlebell%' AND LOWER(name) LIKE '%swing%' AND coach_id IS NULL;

-- DONKEY KICK
UPDATE exercises SET
    form_tips = '["Start on hands and knees (quadruped position)", "Keep one knee bent at 90 degrees", "Drive heel toward ceiling by squeezing glute", "Keep core tight, dont arch back excessively", "Lower with control"]'::jsonb,
    common_mistakes = '["Arching lower back to get height", "Not squeezing glute at top", "Swinging leg with momentum", "Letting hips rotate open"]'::jsonb,
    coaching_cues = '["Heel to ceiling", "Squeeze glute", "Core tight", "Hips square"]'::jsonb
WHERE LOWER(name) LIKE '%donkey%' AND LOWER(name) LIKE '%kick%' AND coach_id IS NULL;

-- FIRE HYDRANT
UPDATE exercises SET
    form_tips = '["Start on hands and knees", "Keep knee bent at 90 degrees", "Lift knee out to side (abduction)", "Keep hips and torso stable", "Squeeze glute at top"]'::jsonb,
    common_mistakes = '["Rotating hips", "Lifting leg too high (losing form)", "Using momentum", "Collapsing through supporting arm"]'::jsonb,
    coaching_cues = '["Knee out to side", "Hips stable", "Squeeze glute", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%fire hydrant%' AND coach_id IS NULL;

-- ============== LEGS - CALVES ==============

-- STANDING CALF RAISE
UPDATE exercises SET
    form_tips = '["Stand on edge of step or calf raise machine", "Lower heels as far as possible (full stretch)", "Rise onto balls of feet as high as possible", "Squeeze calves hard at top (1-2 sec hold)", "Control the lowering - no bouncing"]'::jsonb,
    common_mistakes = '["Bouncing at bottom (losing stretch)", "Partial range of motion", "Bending knees", "Going too fast"]'::jsonb,
    coaching_cues = '["Full stretch at bottom", "Squeeze at top", "Slow and controlled", "Straight legs"]'::jsonb
WHERE LOWER(name) LIKE '%standing%' AND LOWER(name) LIKE '%calf%' AND LOWER(name) LIKE '%raise%' AND coach_id IS NULL;

-- SEATED CALF RAISE
UPDATE exercises SET
    form_tips = '["Sit with pad on lower thighs", "Balls of feet on platform, heels hanging", "Lower heels for full stretch", "Press up onto toes, squeezing calves", "Targets soleus (lower calf) specifically"]'::jsonb,
    common_mistakes = '["Not getting full stretch", "Partial ROM at top", "Using momentum", "Going too fast"]'::jsonb,
    coaching_cues = '["Full stretch", "Squeeze at top", "Soleus focus", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%seated%' AND LOWER(name) LIKE '%calf%' AND LOWER(name) LIKE '%raise%' AND coach_id IS NULL;

-- DONKEY CALF RAISE
UPDATE exercises SET
    form_tips = '["Bend at hips, support upper body", "Heels hanging off edge of platform", "Full stretch at bottom, full squeeze at top", "Classic calf builder - great stretch"]'::jsonb,
    common_mistakes = '["Not enough stretch", "Using momentum", "Bending knees", "Rushing"]'::jsonb,
    coaching_cues = '["Big stretch", "Squeeze at top", "Straight legs", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%donkey%' AND LOWER(name) LIKE '%calf%' AND coach_id IS NULL;

-- LEG PRESS CALF RAISE
UPDATE exercises SET
    form_tips = '["Position feet low on leg press platform", "Only balls of feet on platform, heels off edge", "Press through toes, extending ankles", "Squeeze calves at full extension", "Control return"]'::jsonb,
    common_mistakes = '["Feet too high on platform", "Partial ROM", "Using leg drive", "Going too heavy"]'::jsonb,
    coaching_cues = '["Balls of feet only", "Full extension", "Squeeze calves", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%leg press%' AND LOWER(name) LIKE '%calf%' AND coach_id IS NULL;

-- SINGLE LEG CALF RAISE
UPDATE exercises SET
    form_tips = '["Stand on one foot on edge of step", "Lower heel below step level (deep stretch)", "Rise onto toes as high as possible", "Hold something for balance if needed", "Complete all reps on one leg, then switch"]'::jsonb,
    common_mistakes = '["Not getting full stretch", "Rushing reps", "Not squeezing at top", "Losing balance"]'::jsonb,
    coaching_cues = '["Deep stretch", "Full height", "Squeeze", "Balance"]'::jsonb
WHERE LOWER(name) LIKE '%single%' AND LOWER(name) LIKE '%calf%' AND LOWER(name) LIKE '%raise%' AND coach_id IS NULL;

-- GENERAL CALF RAISE (catches remaining)
UPDATE exercises SET
    form_tips = '["Full stretch at bottom (heels below toes)", "Rise onto balls of feet as high as possible", "Squeeze calves at top", "Control the lowering - no bouncing"]'::jsonb,
    common_mistakes = '["Bouncing at bottom", "Partial range of motion", "Knees bending", "Going too fast"]'::jsonb,
    coaching_cues = '["Full stretch", "Squeeze at top", "Slow down", "Straight legs"]'::jsonb
WHERE (LOWER(name) LIKE '%calf raise%' OR LOWER(name) LIKE '%calf%raise%') AND LOWER(name) NOT LIKE '%standing%' AND LOWER(name) NOT LIKE '%seated%' AND LOWER(name) NOT LIKE '%donkey%' AND LOWER(name) NOT LIKE '%leg press%' AND LOWER(name) NOT LIKE '%single%' AND coach_id IS NULL;

-- ============== CORE EXERCISES ==============

-- PLANK (standard)
UPDATE exercises SET
    form_tips = '["Forearms on ground, elbows under shoulders", "Body in straight line from head to heels", "Engage core by drawing belly button to spine", "Squeeze glutes to keep hips level", "Breathe normally, dont hold breath"]'::jsonb,
    common_mistakes = '["Hips sagging (lower back strain)", "Hips piking up too high", "Looking up (strains neck)", "Holding breath", "Shoulders shrugging to ears"]'::jsonb,
    coaching_cues = '["Flat back", "Squeeze glutes", "Core tight", "Breathe", "Eyes down"]'::jsonb
WHERE LOWER(name) LIKE '%plank%' AND LOWER(name) NOT LIKE '%side%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%dynamic%' AND LOWER(name) NOT LIKE '%walking%' AND LOWER(name) NOT LIKE '%shoulder tap%' AND coach_id IS NULL;

-- SIDE PLANK
UPDATE exercises SET
    form_tips = '["Lie on side, forearm on ground, elbow under shoulder", "Stack feet or stagger them for balance", "Lift hips to create straight line", "Keep hips high, dont let them sag", "Hold position while breathing normally"]'::jsonb,
    common_mistakes = '["Hips sagging toward ground", "Rolling forward or backward", "Holding breath", "Shoulder not stacked over elbow"]'::jsonb,
    coaching_cues = '["Hips up", "Body straight", "Stack shoulder", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%side%' AND LOWER(name) LIKE '%plank%' AND coach_id IS NULL;

-- CRUNCH
UPDATE exercises SET
    form_tips = '["Lie on back, knees bent, feet flat on floor", "Hands behind head or across chest", "Curl shoulders off ground by contracting abs", "Lower back stays pressed into floor", "Exhale as you crunch up"]'::jsonb,
    common_mistakes = '["Pulling on neck with hands", "Using momentum to sit up", "Coming up too high (becomes sit-up)", "Lower back arching off floor"]'::jsonb,
    coaching_cues = '["Shoulders off floor only", "Exhale up", "Lower back down", "Hands light on head"]'::jsonb
WHERE LOWER(name) LIKE '%crunch%' AND LOWER(name) NOT LIKE '%bicycle%' AND LOWER(name) NOT LIKE '%reverse%' AND LOWER(name) NOT LIKE '%cable%' AND LOWER(name) NOT LIKE '%machine%' AND LOWER(name) NOT LIKE '%oblique%' AND coach_id IS NULL;

-- BICYCLE CRUNCH
UPDATE exercises SET
    form_tips = '["Lie on back, hands behind head", "Lift shoulders and feet off ground", "Rotate to bring elbow to opposite knee", "Extend other leg out straight", "Alternate sides in pedaling motion"]'::jsonb,
    common_mistakes = '["Pulling on neck", "Moving too fast (losing control)", "Not rotating enough", "Legs dropping too low"]'::jsonb,
    coaching_cues = '["Rotate torso", "Elbow to knee", "Control pace", "Legs elevated"]'::jsonb
WHERE LOWER(name) LIKE '%bicycle%' AND LOWER(name) LIKE '%crunch%' AND coach_id IS NULL;

-- REVERSE CRUNCH
UPDATE exercises SET
    form_tips = '["Lie on back, legs raised with knees bent 90 degrees", "Arms at sides for stability", "Curl hips up off ground toward chest", "Lower with control", "Keep upper back on ground"]'::jsonb,
    common_mistakes = '["Using momentum to swing legs", "Not curling pelvis (just lifting legs)", "Arching lower back", "Going too fast"]'::jsonb,
    coaching_cues = '["Curl hips up", "Lower back down", "Control", "Feel lower abs"]'::jsonb
WHERE LOWER(name) LIKE '%reverse%' AND LOWER(name) LIKE '%crunch%' AND coach_id IS NULL;

-- RUSSIAN TWIST
UPDATE exercises SET
    form_tips = '["Sit with knees bent, feet elevated (or on ground for easier)", "Lean back slightly, core engaged", "Rotate torso side to side", "Touch weight to ground on each side", "Keep chest up, dont round forward"]'::jsonb,
    common_mistakes = '["Just moving arms, not rotating torso", "Rounding back too much", "Going too fast", "Feet dropping"]'::jsonb,
    coaching_cues = '["Rotate from core", "Touch each side", "Chest up", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%russian twist%' AND coach_id IS NULL;

-- HANGING LEG RAISE
UPDATE exercises SET
    form_tips = '["Hang from bar with straight arms", "Raise legs to parallel or higher", "Focus on curling pelvis up (not just lifting legs)", "Control the lowering", "Avoid swinging"]'::jsonb,
    common_mistakes = '["Swinging for momentum", "Using hip flexors only, not abs", "Partial range of motion", "Rushing reps"]'::jsonb,
    coaching_cues = '["No swing", "Curl pelvis up", "Control down", "Feel abs working"]'::jsonb
WHERE LOWER(name) LIKE '%hanging%' AND LOWER(name) LIKE '%leg raise%' AND coach_id IS NULL;

-- LYING LEG RAISE
UPDATE exercises SET
    form_tips = '["Lie on back, hands under glutes for support", "Keep legs straight (slight bend okay)", "Raise legs to 90 degrees or higher", "Lower with control, dont let feet touch ground", "Keep lower back pressed to floor"]'::jsonb,
    common_mistakes = '["Lower back arching off floor", "Legs bending too much", "Using momentum", "Letting feet slam down"]'::jsonb,
    coaching_cues = '["Lower back down", "Legs straight", "Control down", "Dont touch floor"]'::jsonb
WHERE LOWER(name) LIKE '%lying%' AND LOWER(name) LIKE '%leg raise%' AND coach_id IS NULL;

-- DEAD BUG
UPDATE exercises SET
    form_tips = '["Lie on back, arms extended toward ceiling", "Knees bent 90 degrees over hips", "Lower opposite arm and leg toward floor", "Keep lower back pressed to floor throughout", "Return to start and alternate sides"]'::jsonb,
    common_mistakes = '["Lower back arching off floor", "Moving too fast", "Not extending fully", "Holding breath"]'::jsonb,
    coaching_cues = '["Lower back down always", "Opposite arm/leg", "Control", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%dead bug%' AND coach_id IS NULL;

-- BIRD DOG
UPDATE exercises SET
    form_tips = '["Start on hands and knees (quadruped position)", "Extend opposite arm and leg simultaneously", "Keep back flat and hips level", "Hold briefly at full extension", "Return with control and alternate"]'::jsonb,
    common_mistakes = '["Hips rotating", "Arching lower back", "Not extending fully", "Moving too fast"]'::jsonb,
    coaching_cues = '["Flat back", "Opposite arm/leg", "Hips level", "Hold and squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%bird dog%' AND coach_id IS NULL;

-- AB WHEEL ROLLOUT
UPDATE exercises SET
    form_tips = '["Start kneeling with wheel in front", "Roll wheel forward extending body", "Go as far as possible while maintaining flat back", "Pull wheel back by contracting abs", "Dont let lower back arch"]'::jsonb,
    common_mistakes = '["Lower back arching (too much extension)", "Hips dropping", "Using arms instead of core", "Not going far enough"]'::jsonb,
    coaching_cues = '["Core tight", "Flat back", "Pull with abs", "Control throughout"]'::jsonb
WHERE LOWER(name) LIKE '%ab wheel%' OR LOWER(name) LIKE '%ab roller%' AND coach_id IS NULL;

-- MOUNTAIN CLIMBER
UPDATE exercises SET
    form_tips = '["Start in push-up/plank position", "Drive one knee toward chest", "Quickly switch legs in running motion", "Keep hips level, core tight", "Maintain plank position throughout"]'::jsonb,
    common_mistakes = '["Hips bouncing up and down", "Losing plank position", "Going too fast losing control", "Shoulders drifting back"]'::jsonb,
    coaching_cues = '["Plank position", "Knees to chest", "Core tight", "Smooth rhythm"]'::jsonb
WHERE LOWER(name) LIKE '%mountain climber%' AND coach_id IS NULL;

-- PALLOF PRESS (Anti-rotation)
UPDATE exercises SET
    form_tips = '["Stand sideways to cable machine", "Hold handle at chest", "Press straight out resisting rotation", "Hold at full extension", "Control return to chest"]'::jsonb,
    common_mistakes = '["Letting cable pull you around (rotating)", "Not bracing core", "Pressing at angle", "Going too fast"]'::jsonb,
    coaching_cues = '["Resist rotation", "Press straight out", "Core braced", "Hold at end"]'::jsonb
WHERE LOWER(name) LIKE '%pallof%' AND coach_id IS NULL;

-- SIT UP
UPDATE exercises SET
    form_tips = '["Lie on back, knees bent, feet anchored or free", "Cross arms on chest or hands behind head", "Curl up all the way to sitting position", "Use abs to lift, not hip flexors mainly", "Lower with control"]'::jsonb,
    common_mistakes = '["Using momentum to throw yourself up", "Pulling on neck", "Feet coming off ground", "Not controlling descent"]'::jsonb,
    coaching_cues = '["Curl up", "Hands light on head", "Control down", "Abs do the work"]'::jsonb
WHERE LOWER(name) LIKE '%sit up%' OR LOWER(name) LIKE '%situp%' OR LOWER(name) LIKE '%sit-up%' AND LOWER(name) NOT LIKE '%v%' AND LOWER(name) NOT LIKE '%butterfly%' AND coach_id IS NULL;

-- V-UP
UPDATE exercises SET
    form_tips = '["Lie flat, arms overhead, legs straight", "Simultaneously lift upper body and legs", "Touch toes at top (forming V shape)", "Lower with control to starting position"]'::jsonb,
    common_mistakes = '["Not reaching full V position", "Using momentum", "Legs bending too much", "Crashing down"]'::jsonb,
    coaching_cues = '["Touch toes", "V shape at top", "Control down", "Legs straight"]'::jsonb
WHERE LOWER(name) LIKE '%v-up%' OR LOWER(name) LIKE '%v up%' OR LOWER(name) LIKE '%vup%' AND coach_id IS NULL;

-- CABLE CRUNCH
UPDATE exercises SET
    form_tips = '["Kneel facing cable machine with rope attachment", "Hold rope behind head or at temples", "Crunch down bringing elbows toward knees", "Focus on curling spine, not just bending at hips", "Control the return"]'::jsonb,
    common_mistakes = '["Bending at hips instead of crunching", "Using arms to pull", "Going too heavy", "Not feeling abs"]'::jsonb,
    coaching_cues = '["Curl spine", "Elbows to knees", "Feel abs contract", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%crunch%' AND coach_id IS NULL;

-- WOODCHOP (Cable or Dumbbell)
UPDATE exercises SET
    form_tips = '["Start with weight high on one side", "Rotate and pull weight down across body", "Or reverse: low to high", "Power comes from hips and core rotation", "Arms stay relatively straight"]'::jsonb,
    common_mistakes = '["Only using arms", "Not rotating hips", "Going too heavy", "Losing control"]'::jsonb,
    coaching_cues = '["Rotate from core", "Hips turn", "Arms guide", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%woodchop%' OR LOWER(name) LIKE '%wood chop%' AND coach_id IS NULL;

-- ============== OLYMPIC LIFTS / COMPOUND MOVEMENTS ==============

-- POWER CLEAN
UPDATE exercises SET
    form_tips = '["Bar starts on floor, grip just outside knees", "First pull: slow and controlled to knee height", "Second pull: explosive hip extension", "Catch bar on front delts in front rack position", "Receive with slightly bent knees", "Stand up to complete lift"]'::jsonb,
    common_mistakes = '["Pulling with arms instead of hips", "Bar drifting away from body", "Not fully extending hips", "Slow turnover/catch", "Catching on straight legs"]'::jsonb,
    coaching_cues = '["Hips explode", "Pull under", "Fast elbows", "Catch and stand"]'::jsonb
WHERE LOWER(name) LIKE '%power clean%' AND coach_id IS NULL;

-- HANG CLEAN
UPDATE exercises SET
    form_tips = '["Start standing with bar at hips", "Push hips back (hang position)", "Explosive hip extension", "Pull under and catch in front rack", "Receive with bent knees"]'::jsonb,
    common_mistakes = '["Starting too high (not at hang)", "Using arms instead of hips", "Slow turnover", "Catching with low elbows"]'::jsonb,
    coaching_cues = '["Hips back first", "Explode up", "Fast elbows", "Catch low"]'::jsonb
WHERE LOWER(name) LIKE '%hang clean%' AND coach_id IS NULL;

-- CLEAN AND JERK
UPDATE exercises SET
    form_tips = '["Clean: bar from floor to front rack", "Pause and reset in rack position", "Dip and drive vertically", "Split or squat under bar to catch overhead", "Recover to standing with bar overhead"]'::jsonb,
    common_mistakes = '["Poor clean position before jerk", "Dip too deep or forward", "Pressing instead of driving", "Catching in bad position"]'::jsonb,
    coaching_cues = '["Good clean", "Dip and drive", "Get under", "Recover strong"]'::jsonb
WHERE LOWER(name) LIKE '%clean%' AND LOWER(name) LIKE '%jerk%' AND coach_id IS NULL;

-- SNATCH
UPDATE exercises SET
    form_tips = '["Wide grip on bar (snatch grip)", "First pull slow to knee height", "Second pull: explosive hip extension", "Pull under bar and receive overhead in squat", "Stand up with bar overhead to complete"]'::jsonb,
    common_mistakes = '["Grip too narrow", "Pulling with arms early", "Not extending hips fully", "Slow turnover", "Receiving with bent arms"]'::jsonb,
    coaching_cues = '["Wide grip", "Hips through", "Pull under fast", "Lock out overhead"]'::jsonb
WHERE LOWER(name) LIKE '%snatch%' AND LOWER(name) NOT LIKE '%grip%' AND LOWER(name) NOT LIKE '%deadlift%' AND coach_id IS NULL;

-- HANG SNATCH
UPDATE exercises SET
    form_tips = '["Wide grip, start from hang position", "Push hips back, bar at thighs", "Explosive hip extension", "Pull under and catch overhead in squat", "Lock arms immediately"]'::jsonb,
    common_mistakes = '["Starting position too high", "Not using hips", "Slow turnover", "Receiving with bent arms"]'::jsonb,
    coaching_cues = '["Hang position", "Hips explode", "Fast under", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%hang snatch%' AND coach_id IS NULL;

-- POWER SNATCH
UPDATE exercises SET
    form_tips = '["Same as snatch but receive standing (not squat)", "Wide grip from floor", "Explosive hip extension", "Catch overhead with slight knee bend only", "Requires more power than full snatch"]'::jsonb,
    common_mistakes = '["Receiving too low (becomes full snatch)", "Not locking out", "Using arms instead of hips", "Bar crashing overhead"]'::jsonb,
    coaching_cues = '["Hips through", "Pull high", "Punch overhead", "Catch high"]'::jsonb
WHERE LOWER(name) LIKE '%power snatch%' AND coach_id IS NULL;

-- CLEAN (full/squat clean)
UPDATE exercises SET
    form_tips = '["Bar from floor to front rack", "First pull slow and controlled", "Second pull: explosive hip extension", "Pull under and catch in full front squat", "Stand up to complete lift"]'::jsonb,
    common_mistakes = '["Arm pulling instead of hip drive", "Not getting under bar", "Slow turnover", "Catching on straight legs"]'::jsonb,
    coaching_cues = '["Slow off floor", "Hips explode", "Fast elbows", "Catch in squat"]'::jsonb
WHERE LOWER(name) LIKE '%clean%' AND LOWER(name) NOT LIKE '%hang%' AND LOWER(name) NOT LIKE '%power%' AND LOWER(name) NOT LIKE '%jerk%' AND LOWER(name) NOT LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%press%' AND coach_id IS NULL;

-- THRUSTER
UPDATE exercises SET
    form_tips = '["Bar in front rack position", "Perform full front squat", "At top of squat, explosively press bar overhead", "Use leg drive to power the press", "Lock out overhead, then lower to rack"]'::jsonb,
    common_mistakes = '["Not going full depth on squat", "Pressing before finishing squat", "Losing upright torso", "Not using leg drive"]'::jsonb,
    coaching_cues = '["Full squat", "Drive up", "Use legs to press", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%thruster%' AND coach_id IS NULL;

-- CLEAN AND PRESS
UPDATE exercises SET
    form_tips = '["Clean bar to front rack position", "Press or push press overhead", "Can be strict press or with leg drive", "Lock out fully overhead", "Lower back to rack"]'::jsonb,
    common_mistakes = '["Poor rack position", "Pressing before stable", "Excessive back arch", "Not locking out"]'::jsonb,
    coaching_cues = '["Good clean", "Stable rack", "Press up", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%clean%' AND LOWER(name) LIKE '%press%' AND LOWER(name) NOT LIKE '%bench%' AND coach_id IS NULL;

-- HANG POWER CLEAN
UPDATE exercises SET
    form_tips = '["Start from hang position (bar at thighs)", "Push hips back then explode forward", "Pull under, catch in quarter squat only", "Requires more power than full hang clean", "Stand up to complete"]'::jsonb,
    common_mistakes = '["Not enough hip drive", "Catching too low", "Pulling with arms", "Slow elbows"]'::jsonb,
    coaching_cues = '["Hips back", "Explode", "Catch high", "Fast elbows"]'::jsonb
WHERE LOWER(name) LIKE '%hang%' AND LOWER(name) LIKE '%power%' AND LOWER(name) LIKE '%clean%' AND coach_id IS NULL;

-- MUSCLE CLEAN
UPDATE exercises SET
    form_tips = '["Clean variation without any squat", "Pull and rotate directly to rack position", "All upper body movement, no leg catch", "Good for warmup and technique"]'::jsonb,
    common_mistakes = '["Bending knees to catch", "Too heavy", "Not rotating elbows", "Using momentum"]'::jsonb,
    coaching_cues = '["Stay tall", "Rotate elbows", "No squat", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%muscle clean%' AND coach_id IS NULL;

-- MUSCLE SNATCH
UPDATE exercises SET
    form_tips = '["Snatch variation without any squat", "Pull and punch overhead without dipping", "All pull power, no receiving squat", "Good for warmup and shoulder strength"]'::jsonb,
    common_mistakes = '["Dipping under bar", "Too heavy", "Not punching overhead", "Pressing instead of pulling"]'::jsonb,
    coaching_cues = '["Stay tall", "Pull high", "Punch overhead", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%muscle snatch%' AND coach_id IS NULL;

-- HIGH PULL
UPDATE exercises SET
    form_tips = '["Explosive hip extension", "Pull bar to chest/chin level", "Elbows stay above bar", "Dont turn over into rack", "Great power development drill"]'::jsonb,
    common_mistakes = '["Pulling with arms first", "Elbows dropping", "Not extending hips fully", "Bar too far from body"]'::jsonb,
    coaching_cues = '["Hips first", "Elbows high", "Bar close", "Explosive"]'::jsonb
WHERE LOWER(name) LIKE '%high pull%' AND coach_id IS NULL;

-- BURPEE
UPDATE exercises SET
    form_tips = '["Start standing, drop to floor", "Chest touches ground (or push-up at bottom)", "Jump or step feet forward", "Stand and jump with arms overhead", "Land soft, repeat immediately"]'::jsonb,
    common_mistakes = '["Not touching chest to floor", "Not fully extending at top", "Landing with straight legs", "Moving too slow"]'::jsonb,
    coaching_cues = '["Chest to floor", "Jump at top", "Arms overhead", "Keep moving"]'::jsonb
WHERE LOWER(name) LIKE '%burpee%' AND coach_id IS NULL;

-- MAN MAKER
UPDATE exercises SET
    form_tips = '["Start with dumbbells on floor", "Push up, then row right, row left", "Jump or step feet to hands", "Clean dumbbells to shoulders", "Perform thruster (squat + press)", "Return to start"]'::jsonb,
    common_mistakes = '["Rushing and losing form", "Skipping movements", "Not full push up", "Not full thruster"]'::jsonb,
    coaching_cues = '["Complete each movement", "Control", "Full reps", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%man maker%' OR LOWER(name) LIKE '%manmaker%' AND coach_id IS NULL;

-- ============== CARDIO / CONDITIONING EXERCISES ==============

-- JUMPING JACK
UPDATE exercises SET
    form_tips = '["Start standing, feet together, arms at sides", "Jump feet out wide while raising arms overhead", "Jump back to starting position", "Land softly with slightly bent knees", "Keep a steady rhythm"]'::jsonb,
    common_mistakes = '["Landing with straight legs", "Arms not going fully overhead", "Feet not going wide enough", "Losing rhythm"]'::jsonb,
    coaching_cues = '["Arms overhead", "Feet wide", "Land soft", "Stay rhythmic"]'::jsonb
WHERE LOWER(name) LIKE '%jumping jack%' AND coach_id IS NULL;

-- JUMP ROPE / SKIPPING
UPDATE exercises SET
    form_tips = '["Elbows close to body", "Turn rope with wrists, not arms", "Jump only high enough to clear rope", "Land on balls of feet", "Keep core tight, slight knee bend"]'::jsonb,
    common_mistakes = '["Jumping too high", "Using arms instead of wrists", "Landing on heels", "Hunching forward"]'::jsonb,
    coaching_cues = '["Wrists turn", "Small jumps", "Balls of feet", "Stay relaxed"]'::jsonb
WHERE LOWER(name) LIKE '%jump rope%' OR LOWER(name) LIKE '%skipping%' OR LOWER(name) LIKE '%skip%' AND LOWER(name) NOT LIKE '%burpee%' AND coach_id IS NULL;

-- BOX JUMP
UPDATE exercises SET
    form_tips = '["Stand facing box, feet shoulder width", "Swing arms back, load legs", "Explode up, driving knees high", "Land softly with both feet on box", "Stand fully, then step down (dont jump down)"]'::jsonb,
    common_mistakes = '["Landing too close to edge", "Jumping down (hard on joints)", "Not opening hips at top", "Under-rotating landing"]'::jsonb,
    coaching_cues = '["Explode up", "Knees high", "Land soft", "Step down"]'::jsonb
WHERE LOWER(name) LIKE '%box jump%' AND coach_id IS NULL;

-- BROAD JUMP / STANDING LONG JUMP
UPDATE exercises SET
    form_tips = '["Feet shoulder width", "Swing arms back, bend knees", "Explode forward and up", "Drive arms forward for momentum", "Land with soft knees, absorb impact"]'::jsonb,
    common_mistakes = '["Not using arm swing", "Jumping up more than forward", "Landing stiff", "Leaning back on landing"]'::jsonb,
    coaching_cues = '["Arms swing", "Jump forward", "Land soft", "Absorb"]'::jsonb
WHERE LOWER(name) LIKE '%broad jump%' OR LOWER(name) LIKE '%long jump%' AND coach_id IS NULL;

-- HIGH KNEES
UPDATE exercises SET
    form_tips = '["Run in place driving knees high", "Aim for hip height with each knee", "Pump arms in opposition", "Stay on balls of feet", "Keep chest up, core tight"]'::jsonb,
    common_mistakes = '["Knees not coming high enough", "Leaning back", "Flat footed landing", "Arms not moving"]'::jsonb,
    coaching_cues = '["Knees to hip height", "Pump arms", "Stay tall", "Quick feet"]'::jsonb
WHERE LOWER(name) LIKE '%high knee%' AND coach_id IS NULL;

-- BUTT KICKS
UPDATE exercises SET
    form_tips = '["Run in place kicking heels to glutes", "Aim to touch heels to butt each rep", "Pump arms in running motion", "Stay on balls of feet", "Keep torso upright"]'::jsonb,
    common_mistakes = '["Heels not reaching glutes", "Leaning forward", "Arms not moving", "Going too slow"]'::jsonb,
    coaching_cues = '["Heels to butt", "Quick turnover", "Arms pump", "Stay upright"]'::jsonb
WHERE LOWER(name) LIKE '%butt kick%' AND coach_id IS NULL;

-- SPRINT
UPDATE exercises SET
    form_tips = '["Drive arms powerfully forward and back", "High knee drive, powerful leg extension", "Stay on balls of feet", "Slight forward lean", "Keep face and hands relaxed"]'::jsonb,
    common_mistakes = '["Tensing up (face, hands)", "Arms crossing body", "Not driving knees high", "Heel striking"]'::jsonb,
    coaching_cues = '["Drive arms", "Knees high", "Balls of feet", "Relax face"]'::jsonb
WHERE LOWER(name) LIKE '%sprint%' AND LOWER(name) NOT LIKE '%lunge%' AND coach_id IS NULL;

-- BATTLE ROPES
UPDATE exercises SET
    form_tips = '["Grip rope ends firmly", "Create waves by alternating arms", "Keep core engaged, slight squat stance", "Movement comes from shoulders, not just arms", "Maintain rhythm"]'::jsonb,
    common_mistakes = '["Standing too upright", "Using only arms", "Losing wave pattern", "Going too light (no tension)"]'::jsonb,
    coaching_cues = '["Stay low", "Big waves", "Core tight", "Shoulders work"]'::jsonb
WHERE LOWER(name) LIKE '%battle rope%' OR LOWER(name) LIKE '%rope wave%' AND coach_id IS NULL;

-- SLED PUSH
UPDATE exercises SET
    form_tips = '["Drive through legs, not arms", "Keep arms straight against sled", "Body at 45 degree angle", "Take powerful, short steps", "Keep hips low, core braced"]'::jsonb,
    common_mistakes = '["Pushing with arms instead of legs", "Standing too upright", "Taking long slow steps", "Letting hips rise"]'::jsonb,
    coaching_cues = '["Leg drive", "Stay low", "Short powerful steps", "Arms straight"]'::jsonb
WHERE LOWER(name) LIKE '%sled push%' AND coach_id IS NULL;

-- SLED PULL
UPDATE exercises SET
    form_tips = '["Attach rope or straps", "Drive through legs pulling backward", "Keep core braced", "Short powerful steps", "Can face sled or away from sled"]'::jsonb,
    common_mistakes = '["Pulling with arms only", "Standing too upright", "Long slow steps", "Losing core tension"]'::jsonb,
    coaching_cues = '["Leg drive", "Core tight", "Short steps", "Pull through hips"]'::jsonb
WHERE LOWER(name) LIKE '%sled pull%' OR LOWER(name) LIKE '%sled drag%' AND coach_id IS NULL;

-- ROWING MACHINE / ERG
UPDATE exercises SET
    form_tips = '["Drive with legs first (60% of power)", "Lean back slightly, then pull handle to lower chest", "Arms pull at end of stroke", "Return in reverse order: arms, lean forward, legs", "Maintain smooth consistent rhythm"]'::jsonb,
    common_mistakes = '["Pulling with arms first", "Rushing the recovery", "Hunching back", "Legs and arms moving together"]'::jsonb,
    coaching_cues = '["Legs drive first", "Arms last", "Smooth recovery", "Power from legs"]'::jsonb
WHERE LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%machine%' OR LOWER(name) LIKE '%erg%' OR LOWER(name) LIKE '%rowing%' AND LOWER(name) NOT LIKE '%cable%' AND LOWER(name) NOT LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%barbell%' AND coach_id IS NULL;

-- ASSAULT BIKE / AIR BIKE / FAN BIKE
UPDATE exercises SET
    form_tips = '["Push and pull handles while pedaling", "Drive legs powerfully on downstroke", "Keep core engaged", "Match arm and leg tempo", "Pace yourself for longer efforts"]'::jsonb,
    common_mistakes = '["Only using legs or only arms", "Hunching forward", "Going all out immediately (burning out)", "Not pushing and pulling handles"]'::jsonb,
    coaching_cues = '["Arms and legs work together", "Core tight", "Pace yourself", "Drive hard on downstroke"]'::jsonb
WHERE LOWER(name) LIKE '%assault bike%' OR LOWER(name) LIKE '%air bike%' OR LOWER(name) LIKE '%fan bike%' AND coach_id IS NULL;

-- TREADMILL RUN / JOG
UPDATE exercises SET
    form_tips = '["Start with walking warmup", "Gradually increase speed", "Run on balls of feet, quick turnover", "Keep arms pumping naturally", "Stay relaxed in shoulders and hands"]'::jsonb,
    common_mistakes = '["Starting too fast", "Heel striking hard", "Holding handles (cheating)", "Tensing up"]'::jsonb,
    coaching_cues = '["Warm up first", "Quick feet", "Pump arms", "Stay relaxed"]'::jsonb
WHERE LOWER(name) LIKE '%treadmill%' AND coach_id IS NULL;

-- ELLIPTICAL
UPDATE exercises SET
    form_tips = '["Push and pull handles for upper body work", "Drive through whole foot on pedals", "Keep core engaged, stand upright", "Adjust resistance for challenge", "Maintain smooth circular motion"]'::jsonb,
    common_mistakes = '["Holding handles without pushing/pulling", "Hunching forward", "Letting resistance do all work", "Going through motions mindlessly"]'::jsonb,
    coaching_cues = '["Use arms", "Core engaged", "Stand tall", "Smooth motion"]'::jsonb
WHERE LOWER(name) LIKE '%elliptical%' AND coach_id IS NULL;

-- STAIR CLIMBER / STAIR MASTER
UPDATE exercises SET
    form_tips = '["Light touch on handles for balance only", "Drive through whole foot", "Keep core engaged, stand upright", "Dont lean heavily on handles", "Maintain steady pace"]'::jsonb,
    common_mistakes = '["Leaning on handles (too much support)", "Taking too small steps", "Hunching over", "Going too fast (bouncing)"]'::jsonb,
    coaching_cues = '["Stand tall", "Light touch on handles", "Drive through legs", "Steady pace"]'::jsonb
WHERE LOWER(name) LIKE '%stair%' AND coach_id IS NULL;

-- BIKE / CYCLING
UPDATE exercises SET
    form_tips = '["Adjust seat height (leg almost straight at bottom)", "Drive through balls of feet", "Keep core engaged", "Hands relaxed on handlebars", "Maintain cadence"]'::jsonb,
    common_mistakes = '["Seat too low or high", "Bouncing in saddle", "Death grip on handles", "Hunching shoulders"]'::jsonb,
    coaching_cues = '["Proper seat height", "Smooth pedal stroke", "Core engaged", "Relax shoulders"]'::jsonb
WHERE LOWER(name) LIKE '%bike%' OR LOWER(name) LIKE '%cycling%' AND LOWER(name) NOT LIKE '%assault%' AND LOWER(name) NOT LIKE '%air%' AND LOWER(name) NOT LIKE '%fan%' AND coach_id IS NULL;

-- FARMER CARRY / FARMER WALK
UPDATE exercises SET
    form_tips = '["Pick up heavy weights at sides", "Stand tall with shoulders back", "Core braced, dont lean to either side", "Take short, quick steps", "Maintain grip throughout"]'::jsonb,
    common_mistakes = '["Leaning to one side", "Shoulders hunching", "Taking long slow steps", "Losing grip"]'::jsonb,
    coaching_cues = '["Stand tall", "Shoulders back", "Quick steps", "Grip tight"]'::jsonb
WHERE LOWER(name) LIKE '%farmer%' AND (LOWER(name) LIKE '%carry%' OR LOWER(name) LIKE '%walk%') AND coach_id IS NULL;

-- SUITCASE CARRY
UPDATE exercises SET
    form_tips = '["Hold single weight at one side", "Resist leaning toward weighted side", "Core works hard to stay upright", "Keep shoulders level", "Switch sides for balance"]'::jsonb,
    common_mistakes = '["Leaning toward weight", "Shoulders tilting", "Core not engaged", "Forgetting to switch sides"]'::jsonb,
    coaching_cues = '["Stay upright", "Resist lean", "Core braced", "Switch sides"]'::jsonb
WHERE LOWER(name) LIKE '%suitcase%' AND LOWER(name) LIKE '%carry%' AND coach_id IS NULL;

-- OVERHEAD CARRY
UPDATE exercises SET
    form_tips = '["Lock weight out overhead", "Core extremely tight", "Take short controlled steps", "Dont let weight drift forward or back", "Keep arm straight throughout"]'::jsonb,
    common_mistakes = '["Arm bending", "Weight drifting", "Core not braced", "Arching lower back"]'::jsonb,
    coaching_cues = '["Lock arm out", "Core tight", "Weight over shoulder", "Controlled steps"]'::jsonb
WHERE LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%carry%' AND coach_id IS NULL;

-- BEAR CRAWL
UPDATE exercises SET
    form_tips = '["Hands and feet on ground, knees hovering", "Move opposite hand and foot together", "Keep hips low and stable", "Core engaged throughout", "Look slightly ahead, not down"]'::jsonb,
    common_mistakes = '["Hips too high", "Same side hand/foot moving together", "Core not engaged", "Moving too fast, losing control"]'::jsonb,
    coaching_cues = '["Opposite hand/foot", "Hips low", "Core tight", "Controlled"]'::jsonb
WHERE LOWER(name) LIKE '%bear crawl%' AND coach_id IS NULL;

-- CRAB WALK
UPDATE exercises SET
    form_tips = '["Sit, hands behind you, feet in front", "Lift hips off ground", "Walk hands and feet in desired direction", "Keep hips elevated throughout", "Core and shoulders working hard"]'::jsonb,
    common_mistakes = '["Hips dropping", "Going too fast", "Shoulders straining", "Not coordinating movement"]'::jsonb,
    coaching_cues = '["Hips up", "Controlled movement", "Core engaged", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%crab walk%' AND coach_id IS NULL;

-- WALL BALL
UPDATE exercises SET
    form_tips = '["Hold medicine ball at chest", "Perform squat to full depth", "As you stand, throw ball at target on wall", "Catch ball and immediately descend into next squat", "Use legs to power throw, not just arms"]'::jsonb,
    common_mistakes = '["Not squatting deep enough", "Using arms instead of legs to throw", "Losing rhythm", "Not catching properly"]'::jsonb,
    coaching_cues = '["Full squat", "Legs power throw", "Catch and descend", "Stay rhythmic"]'::jsonb
WHERE LOWER(name) LIKE '%wall ball%' AND coach_id IS NULL;

-- MEDICINE BALL SLAM
UPDATE exercises SET
    form_tips = '["Raise ball overhead with straight arms", "Forcefully slam ball into ground", "Use core and lats, not just arms", "Squat down to pick up ball", "Immediately repeat"]'::jsonb,
    common_mistakes = '["Only using arms", "Not picking up ball properly", "Not generating power from core", "Slamming at angle"]'::jsonb,
    coaching_cues = '["Full extension overhead", "Slam with whole body", "Pick up with legs", "Stay explosive"]'::jsonb
WHERE LOWER(name) LIKE '%slam%' AND LOWER(name) LIKE '%ball%' AND coach_id IS NULL;

-- TURKISH GET UP
UPDATE exercises SET
    form_tips = '["Start lying down, weight locked out overhead", "Series of precise movements to standing", "Keep arm straight and weight stable throughout", "Reverse movements to return to lying", "Go slow and controlled - this is a skill"]'::jsonb,
    common_mistakes = '["Rushing (this is a slow, controlled movement)", "Letting arm bend", "Losing weight position", "Skipping transitions"]'::jsonb,
    coaching_cues = '["Arm locked", "Eye on weight", "Slow transitions", "Controlled throughout"]'::jsonb
WHERE LOWER(name) LIKE '%turkish get up%' OR LOWER(name) LIKE '%tgu%' AND coach_id IS NULL;

-- JUMPING LUNGES
UPDATE exercises SET
    form_tips = '["Start in lunge position", "Explosively jump and switch legs mid-air", "Land in opposite lunge position", "Soft landing, absorb impact", "Immediately jump into next rep"]'::jsonb,
    common_mistakes = '["Landing too hard", "Not switching legs fully", "Knees caving on landing", "Losing balance"]'::jsonb,
    coaching_cues = '["Explode up", "Switch in air", "Land soft", "Stay balanced"]'::jsonb
WHERE LOWER(name) LIKE '%jumping%' AND LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

-- SKATER JUMPS
UPDATE exercises SET
    form_tips = '["Jump laterally from one foot to other", "Land on single leg with soft knee", "Touch trailing leg behind for balance", "Immediately push off to other side", "Like speed skating motion"]'::jsonb,
    common_mistakes = '["Not jumping far enough", "Landing stiff", "Losing balance", "Not touching trailing leg"]'::jsonb,
    coaching_cues = '["Jump wide", "Land soft", "Touch back leg", "Push off quickly"]'::jsonb
WHERE LOWER(name) LIKE '%skater%' AND coach_id IS NULL;

-- PLYO PUSH UP
UPDATE exercises SET
    form_tips = '["Start in push up position", "Lower to bottom of push up", "Explosively push up, hands leaving ground", "Land softly, immediately into next rep", "Maintain core stability"]'::jsonb,
    common_mistakes = '["Landing with straight arms", "Hips sagging", "Not enough explosion", "Losing plank position"]'::jsonb,
    coaching_cues = '["Explode up", "Land soft", "Keep plank", "Immediate next rep"]'::jsonb
WHERE LOWER(name) LIKE '%plyo%' AND (LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%') AND coach_id IS NULL;

-- Show how many exercises were updated
SELECT
    COUNT(*) FILTER (WHERE form_tips IS NOT NULL AND form_tips != '[]'::jsonb) as exercises_with_form_tips,
    COUNT(*) as total_exercises
FROM exercises
WHERE coach_id IS NULL;
