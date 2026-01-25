-- Update Exercise Coaching Data
-- Run this in Supabase SQL Editor

-- First, let's see what exercises exist (run this first to see names)
-- SELECT name FROM exercises WHERE coach_id IS NULL ORDER BY name;

-- ============== CHEST ==============
UPDATE exercises SET
    form_tips = '["Plant feet firmly on the floor", "Retract shoulder blades and keep them pinched throughout", "Lower bar to mid-chest with control", "Keep wrists straight, stacked over elbows", "Maintain slight arch in lower back"]'::jsonb,
    common_mistakes = '["Flaring elbows to 90 degrees", "Bouncing bar off chest", "Lifting hips off the bench", "Uneven bar path or grip"]'::jsonb,
    coaching_cues = '["Squeeze the bar", "Leg drive", "Chest up", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%bench press%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%decline%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Set bench to 30-45 degree angle", "Retract shoulder blades into the bench", "Lower bar to upper chest/collarbone area", "Keep feet flat on floor for stability"]'::jsonb,
    common_mistakes = '["Bench angle too steep (becomes shoulder press)", "Flaring elbows excessively", "Losing shoulder blade retraction"]'::jsonb,
    coaching_cues = '["Pinch shoulders back", "Control down", "Drive up"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%bench%' AND LOWER(name) LIKE '%barbell%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Start with dumbbells at chest level", "Press up and slightly inward", "Keep shoulder blades pinched throughout", "Lower with control to get a full stretch"]'::jsonb,
    common_mistakes = '["Dumbbells drifting too far apart at bottom", "Not going deep enough", "Unstable shoulder position"]'::jsonb,
    coaching_cues = '["Squeeze together", "Deep stretch", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%dumbbell%' AND LOWER(name) LIKE '%bench%' AND LOWER(name) NOT LIKE '%incline%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Set bench to 30-45 degrees", "Press dumbbells up and slightly together", "Lower to outer chest with elbows at 45 degrees", "Feel stretch in upper chest at bottom"]'::jsonb,
    common_mistakes = '["Angle too steep", "Elbows flaring out", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Upper chest", "Squeeze at top", "Full stretch"]'::jsonb
WHERE LOWER(name) LIKE '%incline%' AND LOWER(name) LIKE '%dumbbell%' AND (LOWER(name) LIKE '%bench%' OR LOWER(name) LIKE '%press%') AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Keep slight bend in elbows throughout", "Lower dumbbells in wide arc until chest stretch", "Squeeze chest to bring weights together", "Control the negative portion"]'::jsonb,
    common_mistakes = '["Bending elbows too much (turns into press)", "Going too heavy and losing form", "Not feeling chest stretch at bottom"]'::jsonb,
    coaching_cues = '["Hug a tree", "Chest stretch", "Squeeze together"]'::jsonb
WHERE LOWER(name) LIKE '%fly%' OR LOWER(name) LIKE '%flye%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Hands slightly wider than shoulder width", "Body in straight line from head to heels", "Lower chest to just above ground", "Keep core tight throughout"]'::jsonb,
    common_mistakes = '["Hips sagging or piking up", "Flaring elbows to 90 degrees", "Partial range of motion", "Head dropping forward"]'::jsonb,
    coaching_cues = '["Plank position", "Chest to floor", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%push up%' OR LOWER(name) LIKE '%pushup%' OR LOWER(name) LIKE '%push-up%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Lean torso forward to target chest", "Lower until upper arms parallel to floor", "Keep elbows slightly flared", "Control the descent"]'::jsonb,
    common_mistakes = '["Staying too upright (becomes tricep dip)", "Not going deep enough", "Swinging or using momentum"]'::jsonb,
    coaching_cues = '["Lean forward", "Deep stretch", "Squeeze chest"]'::jsonb
WHERE LOWER(name) LIKE '%dip%' AND LOWER(name) LIKE '%chest%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Adjust seat so handles are at mid-chest", "Keep shoulder blades against pad", "Press forward and squeeze chest", "Control the weight back"]'::jsonb,
    common_mistakes = '["Seat height wrong", "Shoulders rolling forward", "Using momentum"]'::jsonb,
    coaching_cues = '["Back against pad", "Squeeze", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%machine%' AND LOWER(name) LIKE '%chest%' AND LOWER(name) LIKE '%press%' AND coach_id IS NULL;

-- ============== BACK ==============
UPDATE exercises SET
    form_tips = '["Bar over mid-foot, shins close to bar", "Hinge at hips, keep back flat", "Drive through heels, push the floor away", "Lock out by squeezing glutes at top"]'::jsonb,
    common_mistakes = '["Rounding lower back", "Bar drifting away from body", "Jerking the weight off floor", "Hyperextending at lockout"]'::jsonb,
    coaching_cues = '["Push floor away", "Bar close", "Chest up", "Hips through"]'::jsonb
WHERE LOWER(name) LIKE '%deadlift%' AND LOWER(name) NOT LIKE '%romanian%' AND LOWER(name) NOT LIKE '%stiff%' AND LOWER(name) NOT LIKE '%rdl%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Start standing with bar at hips", "Push hips back while keeping legs nearly straight", "Lower until hamstring stretch, not floor", "Keep bar close to legs throughout"]'::jsonb,
    common_mistakes = '["Bending knees too much", "Rounding back to reach lower", "Not feeling hamstring stretch"]'::jsonb,
    coaching_cues = '["Hips back", "Soft knees", "Hamstring stretch", "Squeeze glutes"]'::jsonb
WHERE (LOWER(name) LIKE '%romanian%' OR LOWER(name) LIKE '%rdl%') AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Hinge forward to 45-degree angle", "Pull bar to lower chest/upper abs", "Squeeze shoulder blades at top", "Control the lowering phase"]'::jsonb,
    common_mistakes = '["Standing too upright", "Using momentum/jerking", "Not squeezing at top"]'::jsonb,
    coaching_cues = '["Elbows back", "Squeeze blades", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%barbell%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Support yourself on bench with one hand", "Keep back flat and parallel to floor", "Pull dumbbell to hip, not chest", "Squeeze lat at top of movement"]'::jsonb,
    common_mistakes = '["Rotating torso during pull", "Pulling to chest instead of hip", "Using momentum"]'::jsonb,
    coaching_cues = '["Elbow to ceiling", "Squeeze lat", "No rotation"]'::jsonb
WHERE LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%dumbbell%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Grip slightly wider than shoulders", "Lean back slightly, chest up", "Pull bar to upper chest", "Squeeze lats at bottom"]'::jsonb,
    common_mistakes = '["Leaning too far back", "Pulling bar behind neck", "Using momentum/swinging"]'::jsonb,
    coaching_cues = '["Chest to bar", "Elbows down", "Squeeze lats"]'::jsonb
WHERE LOWER(name) LIKE '%lat pulldown%' OR LOWER(name) LIKE '%lat pull down%' OR LOWER(name) LIKE '%pulldown%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Start from dead hang, arms fully extended", "Pull until chin clears bar", "Lead with chest, not chin", "Control the descent"]'::jsonb,
    common_mistakes = '["Kipping or swinging", "Partial range of motion", "Not going to full hang"]'::jsonb,
    coaching_cues = '["Dead hang start", "Chest to bar", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%pull up%' OR LOWER(name) LIKE '%pullup%' OR LOWER(name) LIKE '%pull-up%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Underhand grip, shoulder width", "Pull chest toward bar", "Full extension at bottom", "Squeeze biceps and lats at top"]'::jsonb,
    common_mistakes = '["Half reps", "Swinging for momentum", "Not controlling descent"]'::jsonb,
    coaching_cues = '["Full hang", "Chest up", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%chin up%' OR LOWER(name) LIKE '%chinup%' OR LOWER(name) LIKE '%chin-up%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Sit tall with slight knee bend", "Pull handle to lower chest/upper abs", "Squeeze shoulder blades together", "Control the return, feel stretch"]'::jsonb,
    common_mistakes = '["Excessive forward lean", "Using lower back to pull", "Not squeezing at contraction"]'::jsonb,
    coaching_cues = '["Sit tall", "Elbows back", "Squeeze blades"]'::jsonb
WHERE LOWER(name) LIKE '%seated%' AND LOWER(name) LIKE '%row%' AND LOWER(name) LIKE '%cable%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Set cable at face height", "Pull toward face, separating hands", "External rotate at end of movement", "Squeeze rear delts and upper back"]'::jsonb,
    common_mistakes = '["Pulling too low", "Not externally rotating", "Using too much weight"]'::jsonb,
    coaching_cues = '["Pull apart", "Rotate out", "Squeeze back"]'::jsonb
WHERE LOWER(name) LIKE '%face pull%' AND coach_id IS NULL;

-- ============== SHOULDERS ==============
UPDATE exercises SET
    form_tips = '["Start with bar at collarbone", "Press straight up, moving head back then forward", "Lock out overhead with bar over mid-foot", "Keep core braced throughout"]'::jsonb,
    common_mistakes = '["Excessive back arch", "Pressing in front of face", "Not locking out fully"]'::jsonb,
    coaching_cues = '["Head through", "Lock out", "Core tight"]'::jsonb
WHERE LOWER(name) LIKE '%overhead press%' OR LOWER(name) LIKE '%ohp%' OR (LOWER(name) LIKE '%shoulder press%' AND LOWER(name) LIKE '%barbell%') AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Start with dumbbells at shoulder height", "Press up and slightly inward", "Full lockout at top", "Control descent to shoulders"]'::jsonb,
    common_mistakes = '["Arching lower back", "Not going through full ROM", "Elbows flaring excessively"]'::jsonb,
    coaching_cues = '["Press up", "Lock out", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%shoulder press%' AND LOWER(name) LIKE '%dumbbell%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Start with palms facing you at shoulder level", "Rotate palms outward as you press", "Full lockout with palms facing forward", "Reverse rotation on way down"]'::jsonb,
    common_mistakes = '["Rushing the rotation", "Not rotating fully", "Using momentum"]'::jsonb,
    coaching_cues = '["Rotate and press", "Full turn", "Control"]'::jsonb
WHERE LOWER(name) LIKE '%arnold%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Slight bend in elbows throughout", "Lead with elbows, not hands", "Raise to shoulder height", "Control the lowering"]'::jsonb,
    common_mistakes = '["Using momentum/swinging", "Going above shoulder height", "Shrugging shoulders up"]'::jsonb,
    coaching_cues = '["Lead with elbows", "Shoulder height", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%lateral raise%' OR LOWER(name) LIKE '%side raise%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Arms nearly straight throughout", "Raise to eye level", "Alternate arms or both together", "Control descent"]'::jsonb,
    common_mistakes = '["Swinging weight up", "Going too high (above eye level)", "Arching back"]'::jsonb,
    coaching_cues = '["Eye level", "Control", "No swing"]'::jsonb
WHERE LOWER(name) LIKE '%front raise%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Bend over or use incline bench", "Lead with elbows out to sides", "Squeeze rear delts at top", "Control the negative"]'::jsonb,
    common_mistakes = '["Using too much weight", "Not bending over enough", "Pulling with arms, not rear delts"]'::jsonb,
    coaching_cues = '["Elbows out", "Squeeze back", "Light weight"]'::jsonb
WHERE LOWER(name) LIKE '%rear delt%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Stand tall with weights at sides", "Shrug straight up toward ears", "Hold at top briefly", "Lower with control"]'::jsonb,
    common_mistakes = '["Rolling shoulders (unnecessary)", "Using momentum", "Not pausing at top"]'::jsonb,
    coaching_cues = '["Ears to shoulders", "Hold at top", "Straight up"]'::jsonb
WHERE LOWER(name) LIKE '%shrug%' AND coach_id IS NULL;

-- ============== BICEPS ==============
UPDATE exercises SET
    form_tips = '["Stand with feet shoulder width", "Keep elbows pinned at sides", "Curl bar to shoulder level", "Lower with control, full extension"]'::jsonb,
    common_mistakes = '["Swinging body for momentum", "Elbows drifting forward", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Elbows pinned", "Full extension", "Squeeze at top"]'::jsonb
WHERE LOWER(name) LIKE '%curl%' AND LOWER(name) LIKE '%barbell%' AND LOWER(name) NOT LIKE '%preacher%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Use angled grip for wrist comfort", "Keep elbows stationary", "Full range of motion", "Control the negative"]'::jsonb,
    common_mistakes = '["Using momentum", "Cutting ROM short", "Leaning back"]'::jsonb,
    coaching_cues = '["Pin elbows", "Full stretch", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%ez%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Can alternate or both together", "Keep elbows at sides", "Supinate (turn pinky up) at top", "Full extension at bottom"]'::jsonb,
    common_mistakes = '["Swinging weights", "Elbows moving forward", "Not supinating"]'::jsonb,
    coaching_cues = '["Turn and squeeze", "Elbows still", "Full range"]'::jsonb
WHERE LOWER(name) LIKE '%curl%' AND LOWER(name) LIKE '%dumbbell%' AND LOWER(name) NOT LIKE '%hammer%' AND LOWER(name) NOT LIKE '%incline%' AND LOWER(name) NOT LIKE '%preacher%' AND LOWER(name) NOT LIKE '%concentration%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Neutral grip throughout (palms facing each other)", "Keep elbows at sides", "Curl to shoulder height", "Works brachialis and forearms"]'::jsonb,
    common_mistakes = '["Swinging weights", "Letting elbows drift", "Going too fast"]'::jsonb,
    coaching_cues = '["Thumbs up", "Elbows pinned", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%hammer%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Armpits snug against top of pad", "Lower until arms nearly straight", "Curl up and squeeze biceps", "Dont hyperextend at bottom"]'::jsonb,
    common_mistakes = '["Not going low enough", "Lifting elbows off pad", "Using momentum"]'::jsonb,
    coaching_cues = '["Armpits on pad", "Full range", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%preacher%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Stand facing low pulley", "Keep elbows at sides", "Curl handle to chest", "Constant tension throughout"]'::jsonb,
    common_mistakes = '["Elbows moving forward", "Leaning back", "Not controlling negative"]'::jsonb,
    coaching_cues = '["Elbows pinned", "Squeeze", "Constant tension"]'::jsonb
WHERE LOWER(name) LIKE '%cable%' AND LOWER(name) LIKE '%curl%' AND coach_id IS NULL;

-- ============== TRICEPS ==============
UPDATE exercises SET
    form_tips = '["Hands 8-12 inches apart", "Keep elbows close to body", "Lower to lower chest", "Press up and lock out"]'::jsonb,
    common_mistakes = '["Grip too close (wrist strain)", "Flaring elbows out", "Bouncing off chest"]'::jsonb,
    coaching_cues = '["Elbows in", "Lock out", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%close grip%' AND LOWER(name) LIKE '%bench%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Keep elbows pinned at sides", "Push down until arms fully extended", "Squeeze triceps at bottom", "Control the return"]'::jsonb,
    common_mistakes = '["Elbows flaring or moving", "Leaning over the weight", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Pin elbows", "Lock out", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%pushdown%' OR LOWER(name) LIKE '%push down%' OR LOWER(name) LIKE '%pressdown%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Spread rope at bottom of movement", "Keep elbows at sides", "Full extension and squeeze", "Control the return"]'::jsonb,
    common_mistakes = '["Not splitting rope at bottom", "Elbows drifting forward", "Using momentum"]'::jsonb,
    coaching_cues = '["Split the rope", "Elbows pinned", "Squeeze out"]'::jsonb
WHERE LOWER(name) LIKE '%rope%' AND (LOWER(name) LIKE '%tricep%' OR LOWER(name) LIKE '%pushdown%') AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Lower bar to forehead or just behind", "Keep upper arms vertical", "Extend arms fully at top", "Control the descent"]'::jsonb,
    common_mistakes = '["Elbows flaring out", "Upper arms moving", "Lowering to chest instead of head"]'::jsonb,
    coaching_cues = '["Elbows in", "To forehead", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%skull crusher%' OR LOWER(name) LIKE '%skullcrusher%' OR LOWER(name) LIKE '%lying tricep%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Keep elbows close to head", "Lower weight behind head", "Extend arms fully overhead", "Feel stretch at bottom"]'::jsonb,
    common_mistakes = '["Elbows flaring wide", "Arching back excessively", "Partial range of motion"]'::jsonb,
    coaching_cues = '["Elbows by ears", "Full stretch", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%overhead%' AND LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%extension%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Keep torso upright", "Lower until upper arms parallel", "Press up to full lockout", "Keep elbows close to body"]'::jsonb,
    common_mistakes = '["Leaning too far forward (chest focus)", "Not going deep enough", "Flaring elbows"]'::jsonb,
    coaching_cues = '["Stay upright", "Elbows back", "Lock out"]'::jsonb
WHERE LOWER(name) LIKE '%tricep%' AND LOWER(name) LIKE '%dip%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Upper arm parallel to floor", "Extend arm fully back", "Squeeze tricep at contraction", "Control the return"]'::jsonb,
    common_mistakes = '["Swinging weight", "Upper arm dropping", "Not extending fully"]'::jsonb,
    coaching_cues = '["Upper arm still", "Full extension", "Squeeze"]'::jsonb
WHERE LOWER(name) LIKE '%kickback%' AND coach_id IS NULL;

-- ============== LEGS - QUADS ==============
UPDATE exercises SET
    form_tips = '["Bar on upper traps, not neck", "Feet shoulder width, toes slightly out", "Break at hips and knees together", "Drive through whole foot, keep chest up"]'::jsonb,
    common_mistakes = '["Knees caving inward", "Rising on toes", "Rounding lower back", "Not hitting depth"]'::jsonb,
    coaching_cues = '["Chest up", "Knees out", "Drive through heels", "Brace core"]'::jsonb
WHERE LOWER(name) LIKE '%squat%' AND (LOWER(name) LIKE '%barbell%' OR LOWER(name) LIKE '%back%') AND LOWER(name) NOT LIKE '%front%' AND LOWER(name) NOT LIKE '%goblet%' AND LOWER(name) NOT LIKE '%hack%' AND LOWER(name) NOT LIKE '%split%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Bar in front rack position on shoulders", "Elbows high throughout", "More upright torso than back squat", "Drive knees forward over toes"]'::jsonb,
    common_mistakes = '["Elbows dropping (bar rolls forward)", "Leaning too far forward", "Wrist pain from poor rack position"]'::jsonb,
    coaching_cues = '["Elbows up", "Chest tall", "Sit down between legs"]'::jsonb
WHERE LOWER(name) LIKE '%front squat%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Hold dumbbell at chest like a goblet", "Elbows inside knees at bottom", "Keep torso upright", "Great for learning squat pattern"]'::jsonb,
    common_mistakes = '["Leaning forward", "Knees caving", "Not going deep enough"]'::jsonb,
    coaching_cues = '["Chest up", "Elbows in", "Sit deep"]'::jsonb
WHERE LOWER(name) LIKE '%goblet%' AND LOWER(name) LIKE '%squat%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Feet shoulder width on platform", "Lower until 90 degrees at knee", "Dont lock out knees completely", "Keep lower back pressed into pad"]'::jsonb,
    common_mistakes = '["Going too deep (back rounds)", "Locking knees at top", "Feet too high or low"]'::jsonb,
    coaching_cues = '["Back flat on pad", "90 degrees", "Push through heels"]'::jsonb
WHERE LOWER(name) LIKE '%leg press%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Shoulders under pads, back flat", "Feet shoulder width on platform", "Lower with control", "Drive through whole foot"]'::jsonb,
    common_mistakes = '["Heels coming up", "Knees caving", "Not going deep enough"]'::jsonb,
    coaching_cues = '["Back on pad", "Knees out", "Full depth"]'::jsonb
WHERE LOWER(name) LIKE '%hack squat%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Adjust pad to sit on lower shin", "Extend fully and squeeze quad", "Control the lowering", "Dont use momentum"]'::jsonb,
    common_mistakes = '["Using momentum to swing", "Not extending fully", "Coming down too fast"]'::jsonb,
    coaching_cues = '["Full extension", "Squeeze quad", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%leg extension%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Take long enough stride", "Lower until back knee nearly touches", "Keep torso upright", "Drive through front heel"]'::jsonb,
    common_mistakes = '["Steps too short", "Knee going past toe excessively", "Leaning forward"]'::jsonb,
    coaching_cues = '["Long stride", "Chest up", "Drive through heel"]'::jsonb
WHERE LOWER(name) LIKE '%lunge%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Rear foot on bench, laces down", "Front foot far enough forward", "Lower until back knee near floor", "Keep torso upright"]'::jsonb,
    common_mistakes = '["Front foot too close to bench", "Leaning too far forward", "Rushing the movement"]'::jsonb,
    coaching_cues = '["Upright torso", "Straight down", "Drive up"]'::jsonb
WHERE LOWER(name) LIKE '%bulgarian%' OR LOWER(name) LIKE '%split squat%' AND coach_id IS NULL;

-- ============== LEGS - HAMSTRINGS/GLUTES ==============
UPDATE exercises SET
    form_tips = '["Adjust pad above heels", "Curl heels toward glutes", "Squeeze hamstrings at top", "Control the lowering"]'::jsonb,
    common_mistakes = '["Using momentum", "Hips rising off pad", "Not going through full range"]'::jsonb,
    coaching_cues = '["Squeeze hams", "Control down", "Hips down"]'::jsonb
WHERE LOWER(name) LIKE '%leg curl%' OR LOWER(name) LIKE '%hamstring curl%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Legs straight but not locked", "Hinge at hips, push them back", "Lower until hamstring stretch", "Keep bar close to legs"]'::jsonb,
    common_mistakes = '["Rounding back", "Bending knees too much", "Bar drifting away"]'::jsonb,
    coaching_cues = '["Hips back", "Feel the stretch", "Bar close"]'::jsonb
WHERE LOWER(name) LIKE '%stiff leg%' OR LOWER(name) LIKE '%straight leg%' AND LOWER(name) LIKE '%deadlift%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Upper back on bench, feet flat", "Drive through heels to lift hips", "Squeeze glutes hard at top", "Chin tucked, dont hyperextend"]'::jsonb,
    common_mistakes = '["Hyperextending lower back", "Feet too close or far", "Not squeezing at top"]'::jsonb,
    coaching_cues = '["Drive hips up", "Squeeze glutes", "Chin down"]'::jsonb
WHERE LOWER(name) LIKE '%hip thrust%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Lie on back, feet flat near glutes", "Drive hips up by squeezing glutes", "Hold at top briefly", "Lower with control"]'::jsonb,
    common_mistakes = '["Using lower back instead of glutes", "Feet too far out", "Not squeezing at top"]'::jsonb,
    coaching_cues = '["Squeeze glutes", "Hips high", "Hold"]'::jsonb
WHERE LOWER(name) LIKE '%glute bridge%' AND coach_id IS NULL;

-- ============== LEGS - CALVES ==============
UPDATE exercises SET
    form_tips = '["Full stretch at bottom", "Rise onto balls of feet", "Squeeze calves at top", "Control the lowering"]'::jsonb,
    common_mistakes = '["Bouncing at bottom", "Partial range of motion", "Knees bending"]'::jsonb,
    coaching_cues = '["Full stretch", "Squeeze at top", "Slow down"]'::jsonb
WHERE LOWER(name) LIKE '%calf raise%' OR LOWER(name) LIKE '%calf%raise%' AND coach_id IS NULL;

-- ============== CORE ==============
UPDATE exercises SET
    form_tips = '["Straight line from head to heels", "Engage core, squeeze glutes", "Dont let hips sag or pike", "Breathe normally"]'::jsonb,
    common_mistakes = '["Hips too high or sagging", "Looking up (strains neck)", "Holding breath"]'::jsonb,
    coaching_cues = '["Flat back", "Squeeze everything", "Breathe"]'::jsonb
WHERE LOWER(name) LIKE '%plank%' AND LOWER(name) NOT LIKE '%side%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Lower back stays on floor", "Curl shoulders toward hips", "Dont pull on neck", "Exhale as you crunch"]'::jsonb,
    common_mistakes = '["Pulling neck with hands", "Using momentum", "Coming up too high"]'::jsonb,
    coaching_cues = '["Shoulders off floor", "Exhale up", "Lower back down"]'::jsonb
WHERE LOWER(name) LIKE '%crunch%' AND coach_id IS NULL;

UPDATE exercises SET
    form_tips = '["Hang from bar with straight arms", "Raise legs to parallel or higher", "Control the lowering", "Avoid swinging"]'::jsonb,
    common_mistakes = '["Swinging for momentum", "Using hip flexors only", "Partial range of motion"]'::jsonb,
    coaching_cues = '["No swing", "Curl pelvis", "Control down"]'::jsonb
WHERE LOWER(name) LIKE '%leg raise%' OR LOWER(name) LIKE '%hanging%' AND coach_id IS NULL;

-- Show how many exercises were updated
SELECT
    COUNT(*) FILTER (WHERE form_tips IS NOT NULL AND form_tips != '[]'::jsonb) as exercises_with_form_tips,
    COUNT(*) as total_exercises
FROM exercises
WHERE coach_id IS NULL;
