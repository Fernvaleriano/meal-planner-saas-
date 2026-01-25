/**
 * Script to update exercise coaching data (form_tips, common_mistakes, coaching_cues)
 *
 * Usage: node scripts/update-exercise-coaching-data.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ===========================================
// EXERCISE COACHING DATA - 100+ EXERCISES
// ===========================================
const EXERCISE_DATA = [
    // ============== CHEST ==============
    {
        name: "Barbell Bench Press",
        form_tips: [
            "Plant feet firmly on the floor",
            "Retract shoulder blades and keep them pinched throughout",
            "Lower bar to mid-chest with control",
            "Keep wrists straight, stacked over elbows",
            "Maintain slight arch in lower back"
        ],
        common_mistakes: [
            "Flaring elbows to 90 degrees",
            "Bouncing bar off chest",
            "Lifting hips off the bench",
            "Uneven bar path or grip"
        ],
        coaching_cues: ["Squeeze the bar", "Leg drive", "Chest up", "Lock out"]
    },
    {
        name: "Incline Barbell Bench Press",
        form_tips: [
            "Set bench to 30-45 degree angle",
            "Retract shoulder blades into the bench",
            "Lower bar to upper chest/collarbone area",
            "Keep feet flat on floor for stability"
        ],
        common_mistakes: [
            "Bench angle too steep (becomes shoulder press)",
            "Flaring elbows excessively",
            "Losing shoulder blade retraction"
        ],
        coaching_cues: ["Pinch shoulders back", "Control down", "Drive up"]
    },
    {
        name: "Decline Barbell Bench Press",
        form_tips: [
            "Secure legs under pads firmly",
            "Lower bar to lower chest",
            "Keep shoulder blades retracted",
            "Control the weight throughout"
        ],
        common_mistakes: [
            "Bar path too high on chest",
            "Not securing legs properly",
            "Excessive back arch"
        ],
        coaching_cues: ["Lock legs in", "Lower chest", "Squeeze pecs"]
    },
    {
        name: "Dumbbell Bench Press",
        form_tips: [
            "Start with dumbbells at chest level",
            "Press up and slightly inward",
            "Keep shoulder blades pinched throughout",
            "Lower with control to get a full stretch"
        ],
        common_mistakes: [
            "Dumbbells drifting too far apart at bottom",
            "Not going deep enough",
            "Unstable shoulder position"
        ],
        coaching_cues: ["Squeeze together", "Deep stretch", "Control down"]
    },
    {
        name: "Incline Dumbbell Bench Press",
        form_tips: [
            "Set bench to 30-45 degrees",
            "Press dumbbells up and slightly together",
            "Lower to outer chest with elbows at 45 degrees",
            "Feel stretch in upper chest at bottom"
        ],
        common_mistakes: [
            "Angle too steep",
            "Elbows flaring out",
            "Partial range of motion"
        ],
        coaching_cues: ["Upper chest", "Squeeze at top", "Full stretch"]
    },
    {
        name: "Dumbbell Fly",
        form_tips: [
            "Keep slight bend in elbows throughout",
            "Lower dumbbells in wide arc until chest stretch",
            "Squeeze chest to bring weights together",
            "Control the negative portion"
        ],
        common_mistakes: [
            "Bending elbows too much (turns into press)",
            "Going too heavy and losing form",
            "Not feeling chest stretch at bottom"
        ],
        coaching_cues: ["Hug a tree", "Chest stretch", "Squeeze together"]
    },
    {
        name: "Cable Fly",
        form_tips: [
            "Set pulleys to appropriate height for target area",
            "Step forward for constant tension",
            "Keep slight bend in elbows",
            "Squeeze hands together at peak contraction"
        ],
        common_mistakes: [
            "Using too much weight and bending arms",
            "Not stepping forward enough",
            "Rushing the movement"
        ],
        coaching_cues: ["Constant tension", "Squeeze", "Control back"]
    },
    {
        name: "Push Up",
        form_tips: [
            "Hands slightly wider than shoulder width",
            "Body in straight line from head to heels",
            "Lower chest to just above ground",
            "Keep core tight throughout"
        ],
        common_mistakes: [
            "Hips sagging or piking up",
            "Flaring elbows to 90 degrees",
            "Partial range of motion",
            "Head dropping forward"
        ],
        coaching_cues: ["Plank position", "Chest to floor", "Core tight"]
    },
    {
        name: "Chest Dip",
        form_tips: [
            "Lean torso forward to target chest",
            "Lower until upper arms parallel to floor",
            "Keep elbows slightly flared",
            "Control the descent"
        ],
        common_mistakes: [
            "Staying too upright (becomes tricep dip)",
            "Not going deep enough",
            "Swinging or using momentum"
        ],
        coaching_cues: ["Lean forward", "Deep stretch", "Squeeze chest"]
    },
    {
        name: "Machine Chest Press",
        form_tips: [
            "Adjust seat so handles are at mid-chest",
            "Keep shoulder blades against pad",
            "Press forward and squeeze chest",
            "Control the weight back"
        ],
        common_mistakes: [
            "Seat height wrong",
            "Shoulders rolling forward",
            "Using momentum"
        ],
        coaching_cues: ["Back against pad", "Squeeze", "Control"]
    },

    // ============== BACK ==============
    {
        name: "Barbell Deadlift",
        form_tips: [
            "Bar over mid-foot, shins close to bar",
            "Hinge at hips, keep back flat",
            "Drive through heels, push the floor away",
            "Lock out by squeezing glutes at top"
        ],
        common_mistakes: [
            "Rounding lower back",
            "Bar drifting away from body",
            "Jerking the weight off floor",
            "Hyperextending at lockout"
        ],
        coaching_cues: ["Push floor away", "Bar close", "Chest up", "Hips through"]
    },
    {
        name: "Conventional Deadlift",
        form_tips: [
            "Feet hip-width apart, hands just outside legs",
            "Engage lats before pulling",
            "Keep bar against legs entire lift",
            "Stand tall at top, don't lean back"
        ],
        common_mistakes: [
            "Starting with hips too low (squat stance)",
            "Back rounding off the floor",
            "Hitching the weight up"
        ],
        coaching_cues: ["Protect armpits", "Drag bar up", "Stand tall"]
    },
    {
        name: "Romanian Deadlift",
        form_tips: [
            "Start standing with bar at hips",
            "Push hips back while keeping legs nearly straight",
            "Lower until hamstring stretch, not floor",
            "Keep bar close to legs throughout"
        ],
        common_mistakes: [
            "Bending knees too much",
            "Rounding back to reach lower",
            "Not feeling hamstring stretch"
        ],
        coaching_cues: ["Hips back", "Soft knees", "Hamstring stretch", "Squeeze glutes"]
    },
    {
        name: "Barbell Row",
        form_tips: [
            "Hinge forward to 45-degree angle",
            "Pull bar to lower chest/upper abs",
            "Squeeze shoulder blades at top",
            "Control the lowering phase"
        ],
        common_mistakes: [
            "Standing too upright",
            "Using momentum/jerking",
            "Not squeezing at top"
        ],
        coaching_cues: ["Elbows back", "Squeeze blades", "Control down"]
    },
    {
        name: "Bent Over Barbell Row",
        form_tips: [
            "Maintain flat back throughout",
            "Pull to lower chest area",
            "Lead with elbows, not hands",
            "Keep core braced"
        ],
        common_mistakes: [
            "Rounding upper back",
            "Using body English",
            "Pulling to belly button"
        ],
        coaching_cues: ["Flat back", "Elbows high", "Chest out"]
    },
    {
        name: "Dumbbell Row",
        form_tips: [
            "Support yourself on bench with one hand",
            "Keep back flat and parallel to floor",
            "Pull dumbbell to hip, not chest",
            "Squeeze lat at top of movement"
        ],
        common_mistakes: [
            "Rotating torso during pull",
            "Pulling to chest instead of hip",
            "Using momentum"
        ],
        coaching_cues: ["Elbow to ceiling", "Squeeze lat", "No rotation"]
    },
    {
        name: "Single Arm Dumbbell Row",
        form_tips: [
            "Keep hips and shoulders square",
            "Pull elbow toward ceiling",
            "Full stretch at bottom",
            "Control the weight down"
        ],
        common_mistakes: [
            "Opening up the hips",
            "Shortening range of motion",
            "Jerking weight up"
        ],
        coaching_cues: ["Stay square", "Full stretch", "Squeeze"]
    },
    {
        name: "Lat Pulldown",
        form_tips: [
            "Grip slightly wider than shoulders",
            "Lean back slightly, chest up",
            "Pull bar to upper chest",
            "Squeeze lats at bottom"
        ],
        common_mistakes: [
            "Leaning too far back",
            "Pulling bar behind neck",
            "Using momentum/swinging"
        ],
        coaching_cues: ["Chest to bar", "Elbows down", "Squeeze lats"]
    },
    {
        name: "Wide Grip Lat Pulldown",
        form_tips: [
            "Grip 1.5x shoulder width",
            "Focus on driving elbows down and back",
            "Full stretch at top",
            "Control the negative"
        ],
        common_mistakes: [
            "Grip too wide causing shoulder strain",
            "Not getting full stretch",
            "Rushing reps"
        ],
        coaching_cues: ["Elbows to ribs", "Stretch at top", "Squeeze"]
    },
    {
        name: "Close Grip Lat Pulldown",
        form_tips: [
            "Use V-bar or close grip attachment",
            "Pull to chest with elbows close",
            "Emphasize lat squeeze at bottom",
            "Full extension at top"
        ],
        common_mistakes: [
            "Pulling with arms only",
            "Cutting range short",
            "Excessive momentum"
        ],
        coaching_cues: ["Elbows tight", "Chest up", "Full stretch"]
    },
    {
        name: "Pull Up",
        form_tips: [
            "Start from dead hang, arms fully extended",
            "Pull until chin clears bar",
            "Lead with chest, not chin",
            "Control the descent"
        ],
        common_mistakes: [
            "Kipping or swinging",
            "Partial range of motion",
            "Not going to full hang"
        ],
        coaching_cues: ["Dead hang start", "Chest to bar", "Control down"]
    },
    {
        name: "Chin Up",
        form_tips: [
            "Underhand grip, shoulder width",
            "Pull chest toward bar",
            "Full extension at bottom",
            "Squeeze biceps and lats at top"
        ],
        common_mistakes: [
            "Half reps",
            "Swinging for momentum",
            "Not controlling descent"
        ],
        coaching_cues: ["Full hang", "Chest up", "Squeeze"]
    },
    {
        name: "Seated Cable Row",
        form_tips: [
            "Sit tall with slight knee bend",
            "Pull handle to lower chest/upper abs",
            "Squeeze shoulder blades together",
            "Control the return, feel stretch"
        ],
        common_mistakes: [
            "Excessive forward lean",
            "Using lower back to pull",
            "Not squeezing at contraction"
        ],
        coaching_cues: ["Sit tall", "Elbows back", "Squeeze blades"]
    },
    {
        name: "T-Bar Row",
        form_tips: [
            "Keep chest supported on pad if available",
            "Pull to lower chest",
            "Squeeze back at top",
            "Control descent"
        ],
        common_mistakes: [
            "Rounding upper back",
            "Using momentum",
            "Standing too upright"
        ],
        coaching_cues: ["Chest up", "Elbows back", "Squeeze"]
    },
    {
        name: "Face Pull",
        form_tips: [
            "Set cable at face height",
            "Pull toward face, separating hands",
            "External rotate at end of movement",
            "Squeeze rear delts and upper back"
        ],
        common_mistakes: [
            "Pulling too low",
            "Not externally rotating",
            "Using too much weight"
        ],
        coaching_cues: ["Pull apart", "Rotate out", "Squeeze back"]
    },

    // ============== SHOULDERS ==============
    {
        name: "Overhead Press",
        form_tips: [
            "Start with bar at collarbone",
            "Press straight up, moving head back then forward",
            "Lock out overhead with bar over mid-foot",
            "Keep core braced throughout"
        ],
        common_mistakes: [
            "Excessive back arch",
            "Pressing in front of face",
            "Not locking out fully"
        ],
        coaching_cues: ["Head through", "Lock out", "Core tight"]
    },
    {
        name: "Barbell Overhead Press",
        form_tips: [
            "Grip just outside shoulder width",
            "Brace core before pressing",
            "Drive bar straight up",
            "Finish with bar over mid-foot"
        ],
        common_mistakes: [
            "Leaning back excessively",
            "Flaring elbows too wide",
            "Not bracing core"
        ],
        coaching_cues: ["Brace core", "Straight up", "Head through"]
    },
    {
        name: "Dumbbell Shoulder Press",
        form_tips: [
            "Start with dumbbells at shoulder height",
            "Press up and slightly inward",
            "Full lockout at top",
            "Control descent to shoulders"
        ],
        common_mistakes: [
            "Arching lower back",
            "Not going through full ROM",
            "Elbows flaring excessively"
        ],
        coaching_cues: ["Press up", "Lock out", "Control down"]
    },
    {
        name: "Seated Dumbbell Shoulder Press",
        form_tips: [
            "Keep back firmly against pad",
            "Press dumbbells up and together",
            "Lower to ear level",
            "Maintain control throughout"
        ],
        common_mistakes: [
            "Back coming off pad",
            "Partial range of motion",
            "Excessive weight causing form breakdown"
        ],
        coaching_cues: ["Back on pad", "Full range", "Squeeze at top"]
    },
    {
        name: "Arnold Press",
        form_tips: [
            "Start with palms facing you at shoulder level",
            "Rotate palms outward as you press",
            "Full lockout with palms facing forward",
            "Reverse rotation on way down"
        ],
        common_mistakes: [
            "Rushing the rotation",
            "Not rotating fully",
            "Using momentum"
        ],
        coaching_cues: ["Rotate and press", "Full turn", "Control"]
    },
    {
        name: "Lateral Raise",
        form_tips: [
            "Slight bend in elbows throughout",
            "Lead with elbows, not hands",
            "Raise to shoulder height",
            "Control the lowering"
        ],
        common_mistakes: [
            "Using momentum/swinging",
            "Going above shoulder height",
            "Shrugging shoulders up"
        ],
        coaching_cues: ["Lead with elbows", "Shoulder height", "Control down"]
    },
    {
        name: "Dumbbell Lateral Raise",
        form_tips: [
            "Stand with slight forward lean",
            "Raise arms to sides until parallel",
            "Keep thumbs neutral or slightly down",
            "Lower with control"
        ],
        common_mistakes: [
            "Swinging weights",
            "Lifting too high",
            "Using traps instead of delts"
        ],
        coaching_cues: ["Pour water", "Elbows high", "Slow down"]
    },
    {
        name: "Cable Lateral Raise",
        form_tips: [
            "Stand perpendicular to cable machine",
            "Keep arm nearly straight",
            "Raise to shoulder level",
            "Control return under tension"
        ],
        common_mistakes: [
            "Bending elbow too much",
            "Using body momentum",
            "Not controlling negative"
        ],
        coaching_cues: ["Constant tension", "Shoulder height", "Control"]
    },
    {
        name: "Front Raise",
        form_tips: [
            "Arms nearly straight throughout",
            "Raise to eye level",
            "Alternate arms or both together",
            "Control descent"
        ],
        common_mistakes: [
            "Swinging weight up",
            "Going too high (above eye level)",
            "Arching back"
        ],
        coaching_cues: ["Eye level", "Control", "No swing"]
    },
    {
        name: "Rear Delt Fly",
        form_tips: [
            "Bend over or use incline bench",
            "Lead with elbows out to sides",
            "Squeeze rear delts at top",
            "Control the negative"
        ],
        common_mistakes: [
            "Using too much weight",
            "Not bending over enough",
            "Pulling with arms, not rear delts"
        ],
        coaching_cues: ["Elbows out", "Squeeze back", "Light weight"]
    },
    {
        name: "Reverse Pec Deck",
        form_tips: [
            "Adjust seat so handles are at shoulder height",
            "Keep slight bend in elbows",
            "Squeeze rear delts at contraction",
            "Control the return"
        ],
        common_mistakes: [
            "Going too heavy",
            "Not squeezing at back",
            "Using momentum"
        ],
        coaching_cues: ["Squeeze back", "Control", "Elbows high"]
    },
    {
        name: "Barbell Shrug",
        form_tips: [
            "Stand tall with bar at thighs",
            "Shrug straight up toward ears",
            "Hold at top briefly",
            "Lower with control"
        ],
        common_mistakes: [
            "Rolling shoulders (unnecessary)",
            "Using momentum",
            "Not pausing at top"
        ],
        coaching_cues: ["Ears to shoulders", "Hold at top", "Straight up"]
    },
    {
        name: "Dumbbell Shrug",
        form_tips: [
            "Hold dumbbells at sides",
            "Shrug straight up",
            "Squeeze traps at top",
            "Lower slowly"
        ],
        common_mistakes: [
            "Bending elbows",
            "Rolling shoulders",
            "Rushing reps"
        ],
        coaching_cues: ["Straight up", "Squeeze", "Hold"]
    },

    // ============== BICEPS ==============
    {
        name: "Barbell Curl",
        form_tips: [
            "Stand with feet shoulder width",
            "Keep elbows pinned at sides",
            "Curl bar to shoulder level",
            "Lower with control, full extension"
        ],
        common_mistakes: [
            "Swinging body for momentum",
            "Elbows drifting forward",
            "Partial range of motion"
        ],
        coaching_cues: ["Elbows pinned", "Full extension", "Squeeze at top"]
    },
    {
        name: "EZ Bar Curl",
        form_tips: [
            "Use angled grip for wrist comfort",
            "Keep elbows stationary",
            "Full range of motion",
            "Control the negative"
        ],
        common_mistakes: [
            "Using momentum",
            "Cutting ROM short",
            "Leaning back"
        ],
        coaching_cues: ["Pin elbows", "Full stretch", "Squeeze"]
    },
    {
        name: "Dumbbell Curl",
        form_tips: [
            "Can alternate or both together",
            "Keep elbows at sides",
            "Supinate (turn pinky up) at top",
            "Full extension at bottom"
        ],
        common_mistakes: [
            "Swinging weights",
            "Elbows moving forward",
            "Not supinating"
        ],
        coaching_cues: ["Turn and squeeze", "Elbows still", "Full range"]
    },
    {
        name: "Dumbbell Bicep Curl",
        form_tips: [
            "Stand tall, dumbbells at sides",
            "Curl with palms rotating upward",
            "Squeeze biceps at top",
            "Lower with control"
        ],
        common_mistakes: [
            "Using body momentum",
            "Rushing the movement",
            "Partial reps"
        ],
        coaching_cues: ["Squeeze at top", "Control down", "Full stretch"]
    },
    {
        name: "Hammer Curl",
        form_tips: [
            "Neutral grip throughout (palms facing each other)",
            "Keep elbows at sides",
            "Curl to shoulder height",
            "Works brachialis and forearms"
        ],
        common_mistakes: [
            "Swinging weights",
            "Letting elbows drift",
            "Going too fast"
        ],
        coaching_cues: ["Thumbs up", "Elbows pinned", "Squeeze"]
    },
    {
        name: "Incline Dumbbell Curl",
        form_tips: [
            "Set bench to 45-60 degrees",
            "Let arms hang straight down",
            "Curl without moving upper arms",
            "Great stretch at bottom"
        ],
        common_mistakes: [
            "Bench angle too upright",
            "Bringing elbows forward",
            "Rushing through stretch"
        ],
        coaching_cues: ["Arms back", "Full stretch", "Squeeze"]
    },
    {
        name: "Preacher Curl",
        form_tips: [
            "Armpits snug against top of pad",
            "Lower until arms nearly straight",
            "Curl up and squeeze biceps",
            "Don't hyperextend at bottom"
        ],
        common_mistakes: [
            "Not going low enough",
            "Lifting elbows off pad",
            "Using momentum"
        ],
        coaching_cues: ["Armpits on pad", "Full range", "Squeeze"]
    },
    {
        name: "Cable Curl",
        form_tips: [
            "Stand facing low pulley",
            "Keep elbows at sides",
            "Curl handle to chest",
            "Constant tension throughout"
        ],
        common_mistakes: [
            "Elbows moving forward",
            "Leaning back",
            "Not controlling negative"
        ],
        coaching_cues: ["Elbows pinned", "Squeeze", "Constant tension"]
    },
    {
        name: "Concentration Curl",
        form_tips: [
            "Elbow braced against inner thigh",
            "Curl dumbbell toward shoulder",
            "Squeeze hard at top",
            "Lower with control"
        ],
        common_mistakes: [
            "Moving elbow off thigh",
            "Using momentum",
            "Partial range of motion"
        ],
        coaching_cues: ["Elbow anchored", "Squeeze peak", "Full range"]
    },

    // ============== TRICEPS ==============
    {
        name: "Close Grip Bench Press",
        form_tips: [
            "Hands 8-12 inches apart",
            "Keep elbows close to body",
            "Lower to lower chest",
            "Press up and lock out"
        ],
        common_mistakes: [
            "Grip too close (wrist strain)",
            "Flaring elbows out",
            "Bouncing off chest"
        ],
        coaching_cues: ["Elbows in", "Lock out", "Control down"]
    },
    {
        name: "Tricep Pushdown",
        form_tips: [
            "Keep elbows pinned at sides",
            "Push down until arms fully extended",
            "Squeeze triceps at bottom",
            "Control the return"
        ],
        common_mistakes: [
            "Elbows flaring or moving",
            "Leaning over the weight",
            "Partial range of motion"
        ],
        coaching_cues: ["Pin elbows", "Lock out", "Squeeze"]
    },
    {
        name: "Cable Tricep Pushdown",
        form_tips: [
            "Stand tall, slight lean forward",
            "Upper arms stationary throughout",
            "Extend fully at bottom",
            "Control the eccentric"
        ],
        common_mistakes: [
            "Using shoulder/body momentum",
            "Elbows moving forward",
            "Cutting range short"
        ],
        coaching_cues: ["Elbows still", "Full extension", "Squeeze"]
    },
    {
        name: "Rope Tricep Pushdown",
        form_tips: [
            "Spread rope at bottom of movement",
            "Keep elbows at sides",
            "Full extension and squeeze",
            "Control the return"
        ],
        common_mistakes: [
            "Not splitting rope at bottom",
            "Elbows drifting forward",
            "Using momentum"
        ],
        coaching_cues: ["Split the rope", "Elbows pinned", "Squeeze out"]
    },
    {
        name: "Skull Crusher",
        form_tips: [
            "Lower bar to forehead or just behind",
            "Keep upper arms vertical",
            "Extend arms fully at top",
            "Control the descent"
        ],
        common_mistakes: [
            "Elbows flaring out",
            "Upper arms moving",
            "Lowering to chest instead of head"
        ],
        coaching_cues: ["Elbows in", "To forehead", "Lock out"]
    },
    {
        name: "Overhead Tricep Extension",
        form_tips: [
            "Keep elbows close to head",
            "Lower weight behind head",
            "Extend arms fully overhead",
            "Feel stretch at bottom"
        ],
        common_mistakes: [
            "Elbows flaring wide",
            "Arching back excessively",
            "Partial range of motion"
        ],
        coaching_cues: ["Elbows by ears", "Full stretch", "Lock out"]
    },
    {
        name: "Dumbbell Overhead Tricep Extension",
        form_tips: [
            "Hold dumbbell with both hands",
            "Keep elbows pointing forward",
            "Lower behind head until stretch",
            "Extend fully overhead"
        ],
        common_mistakes: [
            "Elbows flaring out",
            "Moving upper arms",
            "Using momentum"
        ],
        coaching_cues: ["Elbows forward", "Deep stretch", "Squeeze"]
    },
    {
        name: "Tricep Dip",
        form_tips: [
            "Keep torso upright",
            "Lower until upper arms parallel",
            "Press up to full lockout",
            "Keep elbows close to body"
        ],
        common_mistakes: [
            "Leaning too far forward (chest focus)",
            "Not going deep enough",
            "Flaring elbows"
        ],
        coaching_cues: ["Stay upright", "Elbows back", "Lock out"]
    },
    {
        name: "Tricep Kickback",
        form_tips: [
            "Upper arm parallel to floor",
            "Extend arm fully back",
            "Squeeze tricep at contraction",
            "Control the return"
        ],
        common_mistakes: [
            "Swinging weight",
            "Upper arm dropping",
            "Not extending fully"
        ],
        coaching_cues: ["Upper arm still", "Full extension", "Squeeze"]
    },
    {
        name: "Diamond Push Up",
        form_tips: [
            "Hands together forming diamond shape",
            "Lower chest to hands",
            "Keep elbows close to body",
            "Push up to full extension"
        ],
        common_mistakes: [
            "Elbows flaring wide",
            "Hips sagging",
            "Partial range of motion"
        ],
        coaching_cues: ["Elbows in", "Chest to hands", "Full push"]
    },

    // ============== LEGS - QUADS ==============
    {
        name: "Barbell Squat",
        form_tips: [
            "Bar on upper traps, not neck",
            "Feet shoulder width, toes slightly out",
            "Break at hips and knees together",
            "Drive through whole foot, keep chest up"
        ],
        common_mistakes: [
            "Knees caving inward",
            "Rising on toes",
            "Rounding lower back",
            "Not hitting depth"
        ],
        coaching_cues: ["Chest up", "Knees out", "Drive through heels", "Brace core"]
    },
    {
        name: "Back Squat",
        form_tips: [
            "Brace core before descending",
            "Keep weight over mid-foot",
            "Hit at least parallel depth",
            "Stand up by driving hips forward"
        ],
        common_mistakes: [
            "Good morning squat (hips rise first)",
            "Knees collapsing",
            "Butt wink at bottom"
        ],
        coaching_cues: ["Brace hard", "Sit back", "Chest up", "Drive up"]
    },
    {
        name: "Front Squat",
        form_tips: [
            "Bar in front rack position on shoulders",
            "Elbows high throughout",
            "More upright torso than back squat",
            "Drive knees forward over toes"
        ],
        common_mistakes: [
            "Elbows dropping (bar rolls forward)",
            "Leaning too far forward",
            "Wrist pain from poor rack position"
        ],
        coaching_cues: ["Elbows up", "Chest tall", "Sit down between legs"]
    },
    {
        name: "Goblet Squat",
        form_tips: [
            "Hold dumbbell at chest like a goblet",
            "Elbows inside knees at bottom",
            "Keep torso upright",
            "Great for learning squat pattern"
        ],
        common_mistakes: [
            "Leaning forward",
            "Knees caving",
            "Not going deep enough"
        ],
        coaching_cues: ["Chest up", "Elbows in", "Sit deep"]
    },
    {
        name: "Leg Press",
        form_tips: [
            "Feet shoulder width on platform",
            "Lower until 90 degrees at knee",
            "Don't lock out knees completely",
            "Keep lower back pressed into pad"
        ],
        common_mistakes: [
            "Going too deep (back rounds)",
            "Locking knees at top",
            "Feet too high or low"
        ],
        coaching_cues: ["Back flat on pad", "90 degrees", "Push through heels"]
    },
    {
        name: "Hack Squat",
        form_tips: [
            "Shoulders under pads, back flat",
            "Feet shoulder width on platform",
            "Lower with control",
            "Drive through whole foot"
        ],
        common_mistakes: [
            "Heels coming up",
            "Knees caving",
            "Not going deep enough"
        ],
        coaching_cues: ["Back on pad", "Knees out", "Full depth"]
    },
    {
        name: "Leg Extension",
        form_tips: [
            "Adjust pad to sit on lower shin",
            "Extend fully and squeeze quad",
            "Control the lowering",
            "Don't use momentum"
        ],
        common_mistakes: [
            "Using momentum to swing",
            "Not extending fully",
            "Coming down too fast"
        ],
        coaching_cues: ["Full extension", "Squeeze quad", "Control down"]
    },
    {
        name: "Walking Lunge",
        form_tips: [
            "Take long enough stride",
            "Lower until back knee nearly touches",
            "Keep torso upright",
            "Drive through front heel"
        ],
        common_mistakes: [
            "Steps too short",
            "Knee going past toe excessively",
            "Leaning forward"
        ],
        coaching_cues: ["Long stride", "Chest up", "Drive through heel"]
    },
    {
        name: "Dumbbell Lunge",
        form_tips: [
            "Hold dumbbells at sides",
            "Step forward into lunge",
            "Lower until back knee nearly touches",
            "Push back to start"
        ],
        common_mistakes: [
            "Leaning forward",
            "Knee going too far forward",
            "Not stepping far enough"
        ],
        coaching_cues: ["Upright torso", "90-90 position", "Push back"]
    },
    {
        name: "Bulgarian Split Squat",
        form_tips: [
            "Rear foot on bench, laces down",
            "Front foot far enough forward",
            "Lower until back knee near floor",
            "Keep torso upright"
        ],
        common_mistakes: [
            "Front foot too close to bench",
            "Leaning too far forward",
            "Rushing the movement"
        ],
        coaching_cues: ["Upright torso", "Straight down", "Drive up"]
    },
    {
        name: "Step Up",
        form_tips: [
            "Place entire foot on box",
            "Drive through heel to step up",
            "Control the step down",
            "Don't push off back foot"
        ],
        common_mistakes: [
            "Pushing off back leg",
            "Box too high",
            "Leaning forward"
        ],
        coaching_cues: ["Drive through heel", "Stand tall", "Control down"]
    },

    // ============== LEGS - HAMSTRINGS/GLUTES ==============
    {
        name: "Leg Curl",
        form_tips: [
            "Adjust pad above heels",
            "Curl heels toward glutes",
            "Squeeze hamstrings at top",
            "Control the lowering"
        ],
        common_mistakes: [
            "Using momentum",
            "Hips rising off pad",
            "Not going through full range"
        ],
        coaching_cues: ["Squeeze hams", "Control down", "Hips down"]
    },
    {
        name: "Lying Leg Curl",
        form_tips: [
            "Lie flat, pad above heels",
            "Curl heels to glutes",
            "Keep hips pressed into bench",
            "Control the negative"
        ],
        common_mistakes: [
            "Hips lifting up",
            "Partial range of motion",
            "Going too fast"
        ],
        coaching_cues: ["Hips down", "Full curl", "Squeeze"]
    },
    {
        name: "Seated Leg Curl",
        form_tips: [
            "Thigh pad secure on quads",
            "Curl heels under seat",
            "Squeeze hamstrings fully",
            "Control return"
        ],
        common_mistakes: [
            "Not adjusting machine properly",
            "Using momentum",
            "Cutting range short"
        ],
        coaching_cues: ["Squeeze under", "Full range", "Control"]
    },
    {
        name: "Stiff Leg Deadlift",
        form_tips: [
            "Legs straight but not locked",
            "Hinge at hips, push them back",
            "Lower until hamstring stretch",
            "Keep bar close to legs"
        ],
        common_mistakes: [
            "Rounding back",
            "Bending knees too much",
            "Bar drifting away"
        ],
        coaching_cues: ["Hips back", "Feel the stretch", "Bar close"]
    },
    {
        name: "Good Morning",
        form_tips: [
            "Bar on upper back like squat",
            "Soft bend in knees",
            "Hinge forward until torso near parallel",
            "Drive hips forward to stand"
        ],
        common_mistakes: [
            "Rounding back",
            "Bending knees too much (becomes squat)",
            "Going too heavy"
        ],
        coaching_cues: ["Push hips back", "Flat back", "Squeeze glutes"]
    },
    {
        name: "Hip Thrust",
        form_tips: [
            "Upper back on bench, feet flat",
            "Drive through heels to lift hips",
            "Squeeze glutes hard at top",
            "Chin tucked, don't hyperextend"
        ],
        common_mistakes: [
            "Hyperextending lower back",
            "Feet too close or far",
            "Not squeezing at top"
        ],
        coaching_cues: ["Drive hips up", "Squeeze glutes", "Chin down"]
    },
    {
        name: "Barbell Hip Thrust",
        form_tips: [
            "Pad barbell for comfort",
            "Feet flat, about shoulder width",
            "Full hip extension at top",
            "Lower with control"
        ],
        common_mistakes: [
            "Not reaching full extension",
            "Pushing through toes",
            "Lower back doing the work"
        ],
        coaching_cues: ["Through heels", "Full squeeze", "Hold at top"]
    },
    {
        name: "Glute Bridge",
        form_tips: [
            "Lie on back, feet flat near glutes",
            "Drive hips up by squeezing glutes",
            "Hold at top briefly",
            "Lower with control"
        ],
        common_mistakes: [
            "Using lower back instead of glutes",
            "Feet too far out",
            "Not squeezing at top"
        ],
        coaching_cues: ["Squeeze glutes", "Hips high", "Hold"]
    },
    {
        name: "Cable Pull Through",
        form_tips: [
            "Stand facing away from low cable",
            "Hinge at hips, letting cable pull through legs",
            "Drive hips forward to stand",
            "Squeeze glutes at top"
        ],
        common_mistakes: [
            "Squatting instead of hinging",
            "Using arms to pull",
            "Not getting full hip extension"
        ],
        coaching_cues: ["Hips back", "Arms straight", "Squeeze glutes"]
    },
    {
        name: "Kettlebell Swing",
        form_tips: [
            "Hinge at hips, not squat",
            "Power comes from hip drive",
            "Arms are just along for the ride",
            "Squeeze glutes at top"
        ],
        common_mistakes: [
            "Squatting the swing",
            "Using arms to lift",
            "Not hinging deeply enough"
        ],
        coaching_cues: ["Hip snap", "Squeeze glutes", "Arms relaxed"]
    },

    // ============== LEGS - CALVES ==============
    {
        name: "Standing Calf Raise",
        form_tips: [
            "Full stretch at bottom",
            "Rise onto balls of feet",
            "Squeeze calves at top",
            "Control the lowering"
        ],
        common_mistakes: [
            "Bouncing at bottom",
            "Partial range of motion",
            "Knees bending"
        ],
        coaching_cues: ["Full stretch", "Squeeze at top", "Slow down"]
    },
    {
        name: "Seated Calf Raise",
        form_tips: [
            "Pad secure on lower thighs",
            "Full stretch at bottom",
            "Press through balls of feet",
            "Squeeze at top"
        ],
        common_mistakes: [
            "Bouncing",
            "Not going through full range",
            "Going too fast"
        ],
        coaching_cues: ["Deep stretch", "Full press", "Squeeze"]
    },
    {
        name: "Leg Press Calf Raise",
        form_tips: [
            "Only balls of feet on platform",
            "Press through toes, extending ankles",
            "Full stretch at bottom",
            "Don't lock knees"
        ],
        common_mistakes: [
            "Moving the sled with legs",
            "Partial range of motion",
            "Knees bending"
        ],
        coaching_cues: ["Ankles only", "Full range", "Squeeze"]
    },

    // ============== CORE ==============
    {
        name: "Plank",
        form_tips: [
            "Straight line from head to heels",
            "Engage core, squeeze glutes",
            "Don't let hips sag or pike",
            "Breathe normally"
        ],
        common_mistakes: [
            "Hips too high or sagging",
            "Looking up (strains neck)",
            "Holding breath"
        ],
        coaching_cues: ["Flat back", "Squeeze everything", "Breathe"]
    },
    {
        name: "Dead Bug",
        form_tips: [
            "Lower back pressed into floor",
            "Extend opposite arm and leg",
            "Move slowly with control",
            "Breathe out as you extend"
        ],
        common_mistakes: [
            "Back arching off floor",
            "Moving too fast",
            "Not coordinating breath"
        ],
        coaching_cues: ["Back flat", "Slow motion", "Exhale extend"]
    },
    {
        name: "Bird Dog",
        form_tips: [
            "Start on hands and knees",
            "Extend opposite arm and leg",
            "Keep hips level",
            "Hold briefly at extension"
        ],
        common_mistakes: [
            "Hips rotating",
            "Rushing the movement",
            "Arching lower back"
        ],
        coaching_cues: ["Hips square", "Reach long", "Hold"]
    },
    {
        name: "Crunch",
        form_tips: [
            "Lower back stays on floor",
            "Curl shoulders toward hips",
            "Don't pull on neck",
            "Exhale as you crunch"
        ],
        common_mistakes: [
            "Pulling neck with hands",
            "Using momentum",
            "Coming up too high"
        ],
        coaching_cues: ["Shoulders off floor", "Exhale up", "Lower back down"]
    },
    {
        name: "Bicycle Crunch",
        form_tips: [
            "Hands behind head lightly",
            "Bring elbow to opposite knee",
            "Extend other leg straight",
            "Control the rotation"
        ],
        common_mistakes: [
            "Pulling on neck",
            "Going too fast",
            "Not fully extending leg"
        ],
        coaching_cues: ["Elbow to knee", "Full extension", "Control"]
    },
    {
        name: "Russian Twist",
        form_tips: [
            "Lean back slightly, feet off floor",
            "Rotate torso side to side",
            "Keep core tight throughout",
            "Touch weight to floor each side"
        ],
        common_mistakes: [
            "Moving arms only, not torso",
            "Losing balance",
            "Rounding back"
        ],
        coaching_cues: ["Rotate torso", "Touch each side", "Core tight"]
    },
    {
        name: "Hanging Leg Raise",
        form_tips: [
            "Hang from bar with straight arms",
            "Raise legs to parallel or higher",
            "Control the lowering",
            "Avoid swinging"
        ],
        common_mistakes: [
            "Swinging for momentum",
            "Using hip flexors only",
            "Partial range of motion"
        ],
        coaching_cues: ["No swing", "Curl pelvis", "Control down"]
    },
    {
        name: "Ab Wheel Rollout",
        form_tips: [
            "Start on knees, wheel under shoulders",
            "Roll out while keeping core tight",
            "Go as far as you can control",
            "Pull back using core, not arms"
        ],
        common_mistakes: [
            "Lower back sagging",
            "Going too far and losing control",
            "Using arms to pull back"
        ],
        coaching_cues: ["Core tight", "Control range", "Pull with abs"]
    },
    {
        name: "Cable Woodchop",
        form_tips: [
            "Stand perpendicular to cable",
            "Rotate through core, not arms",
            "Keep arms relatively straight",
            "Control the return"
        ],
        common_mistakes: [
            "Using only arms",
            "Not rotating hips",
            "Moving too fast"
        ],
        coaching_cues: ["Rotate through core", "Hips follow", "Control"]
    },
    {
        name: "Pallof Press",
        form_tips: [
            "Stand perpendicular to cable",
            "Press handle straight out",
            "Resist rotation throughout",
            "Hold at extension"
        ],
        common_mistakes: [
            "Letting cable rotate you",
            "Not pressing straight",
            "Not holding at extension"
        ],
        coaching_cues: ["Resist rotation", "Press straight", "Hold"]
    },

    // ============== COMPOUND/FULL BODY ==============
    {
        name: "Clean and Press",
        form_tips: [
            "Start with bar at floor or hang",
            "Clean to front rack with hip drive",
            "Press overhead immediately",
            "Control the descent"
        ],
        common_mistakes: [
            "Using arms to pull clean",
            "Not catching in rack position",
            "Pressing before stable"
        ],
        coaching_cues: ["Hip power", "Catch and press", "Lock out"]
    },
    {
        name: "Thruster",
        form_tips: [
            "Front squat with bar in rack position",
            "Drive out of squat into press",
            "One fluid motion",
            "Full lockout overhead"
        ],
        common_mistakes: [
            "Pausing between squat and press",
            "Not hitting depth",
            "Bar getting forward"
        ],
        coaching_cues: ["Drive up", "One motion", "Lock out"]
    },
    {
        name: "Burpee",
        form_tips: [
            "Drop to floor with control",
            "Chest touches ground",
            "Jump feet to hands",
            "Jump up with arms overhead"
        ],
        common_mistakes: [
            "Not getting chest to floor",
            "Not fully extending on jump",
            "Pace too fast to maintain form"
        ],
        coaching_cues: ["Chest down", "Explode up", "Full extension"]
    },
    {
        name: "Farmers Walk",
        form_tips: [
            "Heavy weights at sides",
            "Stand tall, shoulders back",
            "Walk with short, quick steps",
            "Keep core braced"
        ],
        common_mistakes: [
            "Leaning to one side",
            "Hunching shoulders",
            "Steps too long"
        ],
        coaching_cues: ["Stand tall", "Quick steps", "Core tight"]
    },
    {
        name: "Battle Rope",
        form_tips: [
            "Athletic stance, knees bent",
            "Create waves with alternating arms",
            "Power from hips and core",
            "Keep consistent rhythm"
        ],
        common_mistakes: [
            "Standing too upright",
            "Using only arms",
            "Losing rhythm"
        ],
        coaching_cues: ["Athletic stance", "Hips power", "Keep rhythm"]
    },
    {
        name: "Box Jump",
        form_tips: [
            "Start in athletic stance",
            "Swing arms and explode up",
            "Land softly with bent knees",
            "Step down, don't jump"
        ],
        common_mistakes: [
            "Landing with straight legs",
            "Jumping down (injury risk)",
            "Box too high for ability"
        ],
        coaching_cues: ["Soft landing", "Swing arms", "Step down"]
    }
];

async function updateExercises() {
    console.log(`\nUpdating ${EXERCISE_DATA.length} exercises with coaching data...\n`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const exercise of EXERCISE_DATA) {
        try {
            // Find exercise by name (case-insensitive, partial match)
            const { data: existing, error: findError } = await supabase
                .from('exercises')
                .select('id, name')
                .ilike('name', `%${exercise.name}%`)
                .is('coach_id', null)
                .limit(5);

            if (findError || !existing || existing.length === 0) {
                console.log(`❌ Not found: "${exercise.name}"`);
                notFound++;
                continue;
            }

            // Update all matching exercises
            for (const ex of existing) {
                const { error: updateError } = await supabase
                    .from('exercises')
                    .update({
                        form_tips: exercise.form_tips || [],
                        common_mistakes: exercise.common_mistakes || [],
                        coaching_cues: exercise.coaching_cues || []
                    })
                    .eq('id', ex.id);

                if (updateError) {
                    console.log(`⚠️ Error updating "${ex.name}": ${updateError.message}`);
                    errors++;
                } else {
                    console.log(`✅ Updated: "${ex.name}"`);
                    updated++;
                }
            }
        } catch (err) {
            console.log(`⚠️ Error processing "${exercise.name}": ${err.message}`);
            errors++;
        }
    }

    console.log(`\n========== Summary ==========`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Not found: ${notFound}`);
    console.log(`⚠️ Errors: ${errors}`);
    console.log(`==============================\n`);
}

// List all exercises
async function listExercises(muscleGroup = null) {
    let query = supabase
        .from('exercises')
        .select('name, muscle_group')
        .is('coach_id', null)
        .order('muscle_group')
        .order('name');

    if (muscleGroup) {
        query = query.ilike('muscle_group', `%${muscleGroup}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching exercises:', error.message);
        return;
    }

    console.log(`\n${data.length} exercises found:\n`);

    let currentGroup = '';
    for (const ex of data) {
        if (ex.muscle_group !== currentGroup) {
            currentGroup = ex.muscle_group;
            console.log(`\n=== ${currentGroup?.toUpperCase() || 'UNCATEGORIZED'} ===`);
        }
        console.log(`  - ${ex.name}`);
    }
}

// Run based on command line args
const args = process.argv.slice(2);

if (args[0] === 'list') {
    listExercises(args[1]);
} else if (args[0] === 'update') {
    updateExercises();
} else {
    console.log(`
Exercise Coaching Data Updater - ${EXERCISE_DATA.length} exercises pre-filled

Usage:
  node scripts/update-exercise-coaching-data.js list [muscle_group]  - List all exercises
  node scripts/update-exercise-coaching-data.js update               - Update exercises with data

Examples:
  node scripts/update-exercise-coaching-data.js list                 - List all exercises
  node scripts/update-exercise-coaching-data.js list chest           - List chest exercises
  node scripts/update-exercise-coaching-data.js update               - Run the update
    `);
}
