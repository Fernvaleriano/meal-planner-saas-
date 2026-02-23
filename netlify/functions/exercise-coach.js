const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Exercise-specific form cues database for common exercises
const EXERCISE_CUES = {
  // Chest
  'bench press': ['Drive feet into floor for leg drive', 'Retract shoulder blades and arch upper back', 'Lower bar to nipple line, not neck', 'Keep wrists straight, bar over forearms', 'Squeeze chest at top, don\'t lock elbows hard'],
  'incline press': ['Set bench to 30-45 degrees, not too steep', 'Keep elbows at 45-degree angle, not flared', 'Touch bar to upper chest below collarbone', 'Drive through heels for stability'],
  'decline press': ['Secure legs under pads', 'Lower bar to lower chest', 'Keep shoulder blades retracted', 'Press up and slightly back'],
  'dumbbell press': ['Start with dumbbells at shoulder level', 'Press up in slight arc, dumbbells meet at top', 'Keep elbows at 45 degrees', 'Control the descent'],
  'dumbbell fly': ['Keep slight bend in elbows throughout', 'Lower until you feel chest stretch, not shoulder pain', 'Squeeze dumbbells together at top like hugging a tree', 'Don\'t go too heavy - this is an isolation move'],
  'cable fly': ['Set cables at chest height or higher', 'Step forward for stretch', 'Bring hands together in arc motion', 'Squeeze chest at the peak contraction'],
  'push up': ['Hands shoulder-width, fingers spread', 'Body forms straight line from head to heels', 'Lower chest to floor, not just your chin', 'Elbows at 45 degrees, not flared out'],
  'chest press': ['Adjust seat so handles are at chest level', 'Keep back flat against pad', 'Press forward, don\'t lock elbows', 'Control the return'],
  'pec deck': ['Adjust seat so arms are parallel to floor', 'Keep slight bend in elbows', 'Squeeze chest to bring pads together', 'Don\'t let weights slam back'],
  'incline dumbbell press': ['Set bench to 30-45 degrees', 'Start with dumbbells at shoulder level', 'Press up and slightly together', 'Keep elbows at 45 degrees, not flared', 'Control the descent, feel the stretch'],
  'dip': ['Lean forward for more chest, upright for triceps', 'Lower until upper arms parallel to floor', 'Don\'t go too deep if shoulders hurt', 'Keep elbows from flaring too wide', 'Lock out at top, squeeze target muscle'],
  'chest dip': ['Lean torso forward 30-45 degrees', 'Elbows flare out slightly', 'Lower until chest stretch, upper arms parallel', 'Focus on chest squeeze as you press up'],
  'machine chest press': ['Adjust seat so handles are at mid-chest', 'Keep shoulder blades squeezed back', 'Press forward, slight arc motion', 'Don\'t lock elbows hard at full extension'],

  // Back
  'pull up': ['Start from dead hang, shoulders engaged', 'Pull elbows down and back toward hips', 'Chin clears bar at top', 'Control the descent, no dropping'],
  'chin up': ['Underhand grip, shoulder-width', 'Pull chest to bar', 'Squeeze biceps and lats at top', 'Full extension at bottom'],
  'lat pulldown': ['Lean back slightly, chest up', 'Pull bar to upper chest, not behind neck', 'Squeeze shoulder blades together at bottom', 'Control the weight up, don\'t let it yank you'],
  'barbell row': ['Bend over until torso is at 45 degrees (closer to parallel targets lats more)', 'Keep back FLAT - if it rounds, weight is too heavy', 'Pull bar to lower chest/upper abs', 'Squeeze shoulder blades at top, hold for a beat', 'Knees slightly bent, weight in heels, torso stays STILL'],
  'bent over row': ['Hinge at hips until torso is 45-60 degrees from floor', 'Back must stay flat throughout - no rounding', 'Pull to belly button for lats, higher for upper back', 'Torso position should not change during the rep', 'Keep knees bent, core braced, neck neutral'],
  'dumbbell row': ['Support yourself with one hand on bench', 'Keep back flat and parallel to floor', 'Pull elbow straight back, not out to side', 'Squeeze lat at top, full stretch at bottom', 'Don\'t rotate torso - keep hips square'],
  'cable row': ['Sit tall, chest up, slight lean forward at start', 'Pull to lower chest/upper abs', 'Squeeze shoulder blades together, hold 1 sec', 'Don\'t lean way back - torso stays mostly upright', 'Control the return, feel the stretch'],
  'seated row': ['Sit with chest against pad', 'Pull handles to sides of torso', 'Squeeze shoulder blades together', 'Keep elbows close to body'],
  't-bar row': ['Straddle the bar or use landmine', 'Hinge at hips, back flat', 'Pull to chest, squeeze at top', 'Don\'t round lower back'],
  'face pull': ['Set cable at face height', 'Pull to face, elbows high', 'Externally rotate at end', 'Squeeze rear delts and upper back'],
  'deadlift': ['Bar over mid-foot, shins touch bar', 'Chest up, back flat, brace core hard', 'Push floor away, don\'t pull with back', 'Lock out with glutes, don\'t hyperextend'],
  'sumo deadlift': ['Wide stance (1.5-2x shoulder width), toes pointed out 45°', 'Grip inside knees, arms straight down', 'Push knees OUT over toes throughout', 'Chest up, back flat - if back rounds, stance may be too wide', 'Drive through heels, squeeze glutes at lockout', 'Head neutral - look at floor 6-10 feet ahead, not up'],
  'romanian deadlift': ['Start standing with bar at hips', 'Push hips BACK, not down', 'Keep bar close to legs throughout', 'Lower until hamstring stretch, usually knee level', 'Back stays flat, slight knee bend'],
  'rdl': ['Start standing with bar at hips', 'Push hips BACK, not down', 'Keep bar close to legs throughout', 'Lower until hamstring stretch, usually knee level', 'Back stays flat, slight knee bend'],
  'pendlay row': ['Bar starts on floor each rep', 'Back parallel to floor, flat not rounded', 'Explosive pull to lower chest', 'Let bar return to floor, reset position', 'Great for power, not just hypertrophy'],
  'meadows row': ['Stand perpendicular to landmine', 'Staggered stance, hinge forward', 'Pull elbow up and back', 'Great for lat stretch and contraction', 'Control the eccentric'],
  'straight arm pulldown': ['Arms stay straight throughout', 'Pull bar down in arc to thighs', 'Squeeze lats hard at bottom', 'Don\'t lean too far forward', 'Great lat isolation and mind-muscle connection'],
  'hyperextension': ['Pad at hip crease, not waist', 'Lower with control, don\'t round back', 'Rise until body is straight, not hyperextended', 'Squeeze glutes at top', 'Can hold weight at chest for added resistance'],
  'back extension': ['Same as hyperextension', 'Control the descent', 'Don\'t swing or use momentum', 'Body forms straight line at top', 'Great for lower back and glutes'],
  'inverted row': ['Body straight like reverse plank', 'Pull chest to bar', 'Squeeze shoulder blades together', 'Easier with bent knees, harder with feet elevated', 'Great pull-up progression'],
  'single arm lat pulldown': ['One arm at a time', 'Lean slightly toward working side', 'Pull elbow down and back', 'Full stretch at top, squeeze at bottom', 'Great for fixing imbalances'],

  // Shoulders
  'overhead press': ['Grip just outside shoulder width', 'Bar starts at front delts, not chest', 'Press straight up, head moves back then forward', 'Lock out overhead, biceps by ears'],
  'military press': ['Feet together or shoulder-width for stability', 'Brace core like taking a punch', 'Press in straight line, move head out of way', 'Full lockout at top'],
  'shoulder press': ['Dumbbells at shoulder height, palms forward', 'Press straight up, dumbbells can touch at top', 'Don\'t arch lower back', 'Control the descent'],
  'arnold press': ['Start with palms facing you at shoulder level', 'Rotate palms outward as you press up', 'Full rotation at top, palms face forward', 'Reverse the motion on the way down'],
  'lateral raise': ['Slight bend in elbows, maintain throughout', 'Lead with elbows, not hands', 'Raise to shoulder height, not higher', 'Pinky slightly higher than thumb at top'],
  'front raise': ['Alternate arms or both together', 'Raise to eye level maximum', 'Control the descent - no swinging', 'Keep core tight, don\'t lean back'],
  'rear delt fly': ['Bend over or use machine with chest support', 'Arms go straight out to sides', 'Squeeze shoulder blades at top', 'Don\'t use momentum'],
  'upright row': ['Grip narrower than shoulders', 'Pull elbows up and out', 'Bring bar to chest level', 'If shoulder pain, widen grip or skip'],
  'shrug': ['Hold weight at sides or front', 'Lift shoulders straight up to ears', 'Hold at top, squeeze traps', 'Don\'t roll shoulders'],
  'cable lateral raise': ['Cable at side or behind you', 'Slight lean away from cable', 'Raise arm to shoulder height', 'Control the descent - don\'t let it snap back', 'Better constant tension than dumbbells'],
  'machine shoulder press': ['Adjust seat so handles at shoulder height', 'Press straight up, don\'t let elbows flare', 'Keep back against pad', 'Control the weight down'],
  'reverse pec deck': ['Adjust handles so arms straight at chest height', 'Lead with elbows, squeeze rear delts', 'Don\'t go too far back - shoulder height is enough', 'Keep a slight bend in elbows'],
  'cable face pull': ['Set cable at face height or above', 'Pull to face, elbows high and wide', 'Externally rotate hands at end (thumbs back)', 'Squeeze rear delts and upper back', 'Great for shoulder health and posture'],
  'dumbbell shoulder press': ['Start with dumbbells at shoulders', 'Press straight up, slight touch at top', 'Don\'t arch lower back excessively', 'Control the descent'],
  'seated dumbbell press': ['Back against pad for support', 'Same as standing but more stable', 'Can go heavier with back support', 'Don\'t bounce at the bottom'],
  'barbell shrug': ['Grip outside shoulder width', 'Straight up, not rolling', 'Hold at top, squeeze traps', 'Heavy is fine but control it'],

  // Arms
  'bicep curl': ['Keep elbows pinned to sides', 'Full extension at bottom, full squeeze at top', 'Don\'t swing or use momentum', 'Control the negative for growth'],
  'dumbbell curl': ['Can alternate or curl both together', 'Supinate (rotate palms up) as you curl', 'Squeeze at top', 'Don\'t let elbows drift forward'],
  'barbell curl': ['Shoulder-width grip', 'Keep upper arms stationary', 'Full range of motion', 'Don\'t use body swing'],
  'preacher curl': ['Armpits rest at top of pad', 'Full stretch at bottom', 'Don\'t let elbows flare', 'Control the negative'],
  'concentration curl': ['Elbow braced against inner thigh', 'Curl to shoulder', 'Twist pinky up at top', 'Pure isolation - no cheating'],
  'hammer curl': ['Palms face each other throughout', 'Curl in straight line, not across body', 'Good for brachialis and forearms', 'Keep wrists neutral'],
  'cable curl': ['Step back for tension at bottom', 'Keep elbows at sides', 'Squeeze biceps at top', 'Control the entire range'],
  'tricep pushdown': ['Keep elbows locked at sides', 'Push down until arms fully straight', 'Squeeze triceps hard at bottom', 'Don\'t let shoulders roll forward'],
  'tricep extension': ['Keep upper arms vertical/still', 'Only forearms move', 'Full stretch at bottom, full squeeze at top', 'Don\'t flare elbows'],
  'skull crusher': ['Keep upper arms vertical throughout', 'Lower bar to forehead or just behind', 'Elbows point to ceiling, don\'t flare', 'Full extension at top'],
  'overhead tricep extension': ['Keep elbows close to head', 'Lower weight behind head', 'Extend fully, squeeze at top', 'Don\'t let elbows flare out'],
  'tricep dip': ['Lean forward for more chest, upright for triceps', 'Lower until arms at 90 degrees', 'Don\'t go too deep if shoulder pain', 'Lock out at top'],
  'close grip bench': ['Hands shoulder-width or narrower', 'Keep elbows tucked to sides', 'Lower to lower chest', 'Focus on tricep squeeze'],
  'incline curl': ['Set bench to 45-60 degrees, sit back', 'Arms hang straight down at start', 'Curl without moving upper arms forward', 'Great stretch at bottom, squeeze at top', 'Don\'t go heavy - long head stretch is the goal'],
  'spider curl': ['Chest against incline bench (opposite of incline curl)', 'Arms hang straight down', 'Curl up, extreme peak contraction', 'No momentum possible - pure bicep', 'Don\'t swing or use body'],
  'drag curl': ['Instead of curling out, drag bar up your body', 'Elbows go BACK as you curl', 'Bar stays close to torso', 'Great for long head of biceps', 'Different feel than regular curl'],
  'ez bar curl': ['Angled grip is easier on wrists', 'Same cues as barbell curl', 'Keep elbows pinned', 'Full range of motion'],
  'cable tricep kickback': ['Hinge forward, upper arm parallel to floor', 'Extend arm straight back', 'Squeeze tricep hard at full extension', 'Don\'t let elbow drop', 'Light weight, focus on contraction'],
  'tricep kickback': ['Same as cable version but with dumbbell', 'Upper arm stays stationary', 'Only forearm moves', 'Squeeze at full extension', 'Don\'t swing the weight'],
  'diamond push up': ['Hands together under chest, diamond shape', 'Elbows track back close to body', 'Lower chest to hands', 'Great tricep exercise', 'Harder than regular push-ups'],
  'dip machine': ['Grip handles, lean slightly forward', 'Lower with control, 90 degrees at elbow', 'Press back up, squeeze triceps', 'Good for building strength for bodyweight dips'],
  'reverse curl': ['Overhand grip on bar or dumbbells', 'Curl with palms facing down', 'Targets brachioradialis and forearms', 'Don\'t go heavy - focus on control'],
  'wrist curl': ['Forearms on bench, wrists hanging off', 'Curl weight up using only wrists', 'Full range of motion', 'Can do palms up or palms down'],

  // Legs
  'squat': ['Feet shoulder-width, toes slightly out', 'Break at hips and knees together', 'Knees track over toes, don\'t cave in', 'Depth: hip crease below knee', 'Drive through whole foot, not just toes'],
  'back squat': ['Bar on upper traps, not neck', 'Feet shoulder-width, toes out 15-30°', 'Sit back and down, chest up', 'Knees track over toes', 'Drive through whole foot'],
  'front squat': ['Bar rests on front delts, elbows HIGH', 'More upright torso than back squat', 'Emphasizes quads more', 'Go as deep as mobility allows'],
  'goblet squat': ['Hold dumbbell/kettlebell at chest', 'Elbows between knees at bottom', 'Great for learning squat depth', 'Keep chest up throughout'],
  'hack squat': ['Feet middle of platform for balanced quad/glute work', 'Higher foot placement = more glutes, lower = more quads', 'Keep back flat against pad throughout', 'Don\'t lock knees at top', 'Lower until thighs are parallel or slightly below', 'Whole foot stays flat - if heels lift, move feet higher'],
  'leg press': ['Feet middle of platform - higher for glutes, lower for quads', 'Keep whole foot flat - heels lifting means feet too low', 'Lower until 90 degrees at knee, no deeper if back rounds', 'Don\'t lock knees at top - keep slight bend', 'Keep lower back pressed firmly into pad'],
  'smith machine squat': ['Feet slightly in front of body', 'Back stays against bar path', 'Adjust foot position for comfort', 'Don\'t lock knees at top'],
  'lunge': ['Take a big step, both knees at 90 degrees', 'Front knee stays over ankle', 'Back knee hovers just above floor', 'Push through front heel to stand'],
  'walking lunge': ['Take controlled steps forward', 'Keep torso upright', 'Alternate legs each step', 'Front knee tracks over toes'],
  'split squat': ['Rear foot elevated on bench', 'Front foot far enough forward that knee stays over ankle', 'Lower until back knee nearly touches floor', 'Push through front heel'],
  'bulgarian split squat': ['Rear foot on bench behind you', 'Most weight on front leg', 'Lower until deep stretch', 'Keep torso upright'],
  'step up': ['Step onto box with full foot', 'Drive through heel, don\'t push off back foot', 'Control the descent', 'Keep torso upright'],
  'leg curl': ['Adjust pad to sit above heels', 'Curl all the way up, squeeze hamstrings', 'Control the negative slowly', 'Don\'t lift hips off the pad'],
  'seated leg curl': ['Adjust thigh pad snugly', 'Curl heels toward glutes', 'Squeeze at full contraction', 'Control the release'],
  'leg extension': ['Adjust back pad for knee at pivot point', 'Extend fully, squeeze quads at top', 'Control descent, don\'t drop weight', 'Don\'t use momentum'],
  'hip thrust': ['Upper back on bench, feet flat on floor', 'Drive through heels, squeeze glutes at top', 'Full hip extension at top', 'Don\'t hyperextend lower back'],
  'glute bridge': ['Lie on back, feet flat, knees bent', 'Drive through heels, lift hips', 'Squeeze glutes hard at top', 'Don\'t push through lower back'],
  'good morning': ['Bar on upper back like squat', 'Hinge at hips, push butt back', 'Keep back flat, slight knee bend', 'Go until hamstring stretch'],
  'calf raise': ['Full stretch at bottom, pause', 'Rise onto balls of feet, not toes', 'Squeeze calves hard at top, hold 1 sec', 'Slow and controlled beats fast'],
  'seated calf raise': ['Pad on lower thighs', 'Full stretch at bottom', 'Push through balls of feet', 'Hold at top for peak contraction'],
  'sumo squat': ['Wide stance, toes pointed out 45 degrees', 'Squat straight down, knees track over toes', 'Push knees out throughout', 'Great for inner thighs and glutes', 'Keep torso upright'],
  'pendulum squat': ['Machine handles the balance', 'Feet forward on platform', 'Lower deep, great quad stretch', 'Push through whole foot', 'Very joint-friendly'],
  'sissy squat': ['Hold something for balance', 'Lean back, knees travel forward', 'Heels come up, quads stretch hard', 'Advanced move - build up to it', 'Amazing quad isolation'],
  'hip abduction': ['Seated or lying machine', 'Push legs outward against pads', 'Squeeze outer glutes at end', 'Control the return', 'Targets glute medius'],
  'hip adduction': ['Push legs inward against pads', 'Squeeze inner thighs', 'Don\'t let weights slam', 'Good for groin/inner thigh strength'],
  'glute kickback': ['On all fours or cable machine', 'Kick leg straight back', 'Squeeze glute at top', 'Don\'t arch lower back', 'Foot can be flexed or pointed'],
  'donkey kick': ['On all fours, one leg kicks back', 'Keep knee bent at 90 degrees', 'Push heel toward ceiling', 'Squeeze glute at top', 'Don\'t rotate hips'],
  'fire hydrant': ['On all fours, lift knee to side', 'Keep knee bent at 90 degrees', 'Abduct leg away from body', 'Great for glute medius', 'Don\'t lean away from working leg'],
  'cable pull through': ['Face away from low cable', 'Hinge at hips, push butt back', 'Pull cable through legs by squeezing glutes', 'Great hip hinge pattern', 'Keep arms straight'],
  'nordic curl': ['Kneel on pad, feet anchored', 'Lower body forward with control', 'Use hamstrings to resist fall', 'Very advanced - use band for assistance', 'One of best hamstring exercises'],
  'glute ham raise': ['Machine supports thighs, feet hooked', 'Lower chest toward floor', 'Use hamstrings and glutes to rise', 'Keep back flat', 'Can use push-up assist from floor'],
  'reverse lunge': ['Step backward instead of forward', 'Lower back knee toward floor', 'Push through front heel to stand', 'Often easier to balance than forward lunge'],
  'deficit lunge': ['Front foot on raised surface', 'Allows deeper range of motion', 'Great glute stretch at bottom', 'Control the descent'],
  'zercher squat': ['Bar in crooks of elbows', 'Squat down, keeping torso upright', 'Great for core and quads', 'Uncomfortable but effective'],
  'single leg press': ['One leg at a time', 'Great for fixing imbalances', 'Don\'t let knee cave in', 'Use less weight than bilateral'],
  'standing calf raise': ['Shoulders under pads', 'Full stretch at bottom, rise to toes', 'Squeeze hard at top', 'Don\'t bounce at bottom'],

  // Core
  'plank': ['Forearms parallel, elbows under shoulders', 'Body straight line, no sagging hips', 'Squeeze glutes and brace core', 'Breathe steadily, don\'t hold breath'],
  'side plank': ['Elbow under shoulder', 'Hips stacked, body straight', 'Don\'t let hips sag', 'Can stack feet or stagger'],
  'crunch': ['Lower back stays on floor', 'Curl shoulders up, don\'t pull neck', 'Focus on squeezing abs, not sitting up', 'Exhale on the way up'],
  'sit up': ['Anchor feet if needed', 'Use abs to sit up, not momentum', 'Touch elbows to knees', 'Control the descent'],
  'russian twist': ['Lean back to 45 degrees, chest up', 'Rotate from core, not just arms', 'Touch floor on each side', 'Keep feet elevated for harder variation'],
  'leg raise': ['Lower back pressed into floor', 'Keep legs straight or slight bend', 'Lower until just before back arches', 'Exhale as you raise legs'],
  'hanging leg raise': ['Dead hang from bar', 'Raise legs to parallel or higher', 'Don\'t swing - use control', 'Can bend knees to make easier'],
  'cable crunch': ['Kneel facing cable machine', 'Hold rope behind head', 'Crunch down, bringing elbows to thighs', 'Don\'t pull with arms'],
  'ab rollout': ['Start on knees, hands on wheel', 'Roll out with straight arms', 'Go as far as you can control', 'Use abs to roll back, not arms'],
  'dead bug': ['Lower back pressed into floor', 'Opposite arm and leg extend', 'Move slowly with control', 'Don\'t let lower back arch'],
  'mountain climber': ['Start in push-up position', 'Drive knees to chest alternating', 'Keep hips down, core tight', 'Can go fast or slow and controlled'],
  'woodchop': ['Rotate from hips and core', 'Arms stay relatively straight', 'Power comes from core rotation', 'Control the return'],
  'pallof press': ['Stand sideways to cable', 'Hold handle at chest', 'Press straight out, resisting rotation', 'Great anti-rotation core exercise', 'Keep hips and shoulders square'],
  'bird dog': ['On all fours, extend opposite arm and leg', 'Keep back flat, don\'t rotate', 'Move slowly with control', 'Great for core stability', 'Return to start, repeat other side'],
  'hollow body hold': ['Lie on back, arms overhead', 'Press lower back into floor', 'Lift legs and shoulders off ground', 'Hold position, breathe', 'Harder with limbs extended'],
  'bicycle crunch': ['Lie on back, hands behind head', 'Bring opposite elbow to knee', 'Rotate from core, not just shoulders', 'Extend other leg straight', 'Controlled tempo, don\'t rush'],
  'toe touch': ['Lie on back, legs straight up', 'Reach hands toward toes', 'Lift shoulders off floor', 'Control descent', 'Keep legs vertical'],
  'flutter kick': ['Lie on back, hands under butt', 'Alternate lifting each leg', 'Keep legs straight, small range', 'Lower back stays on floor', 'Good for lower abs'],
  'v-up': ['Lie flat, arms overhead', 'Simultaneously lift legs and torso', 'Touch hands to toes at top', 'Control descent back to flat', 'Advanced ab exercise'],
  'reverse crunch': ['Lie on back, knees bent', 'Lift hips off floor, knees toward chest', 'Don\'t swing - use abs to lift', 'Lower with control', 'Great for lower abs'],
  'decline crunch': ['Secure feet on decline bench', 'Crunch up, exhale at top', 'Don\'t pull on neck', 'Control the descent', 'Can hold weight at chest'],
  'hanging knee raise': ['Dead hang from bar', 'Raise knees toward chest', 'Control the movement, no swinging', 'Easier than straight leg version', 'Great for lower abs'],
  'ab wheel': ['Kneel, grip wheel handles', 'Roll out keeping core tight', 'Go only as far as you can control', 'Roll back using abs', 'Start small, progress range'],
  'farmer walk': ['Heavy weights in each hand', 'Walk with upright posture', 'Shoulders back, core braced', 'Great for grip and core stability', 'Keep steady pace'],
  'suitcase carry': ['Weight in one hand only', 'Walk without leaning to one side', 'Resist lateral flexion', 'Great anti-lateral flexion exercise', 'Alternate sides']
};

// Find matching exercise cues
function getExerciseCues(exerciseName) {
  const nameLower = exerciseName.toLowerCase();

  // Don't match stretches to strength exercise cues
  if (nameLower.includes('stretch') || nameLower.includes('yoga') || nameLower.includes('mobility')) {
    return null; // Let AI generate stretch-specific tips
  }

  // Try exact match first
  if (EXERCISE_CUES[nameLower]) {
    return EXERCISE_CUES[nameLower];
  }

  // Try if exercise name contains a key (e.g., "Barbell Bench Press" contains "bench press")
  for (const [key, cues] of Object.entries(EXERCISE_CUES)) {
    if (nameLower.includes(key)) {
      return cues;
    }
  }

  // IMPORTANT: Match by PRIMARY MOVEMENT first (curl, press, row, etc.)
  // Longer/more specific patterns first to prevent incorrect matches
  const movementMap = {
    // Specific exercises first (longer matches)
    'hack squat': 'hack squat',
    'leg press': 'leg press',
    'leg curl': 'leg curl',
    'leg extension': 'leg extension',
    'leg raise': 'leg raise',
    'calf raise': 'calf raise',
    'lateral raise': 'lateral raise',
    'front raise': 'front raise',
    'hip thrust': 'hip thrust',
    'glute bridge': 'glute bridge',
    'good morning': 'good morning',
    'skull crusher': 'skull crusher',
    'overhead press': 'overhead press',
    'military press': 'military press',
    'shoulder press': 'shoulder press',
    'bench press': 'bench press',
    'chest press': 'chest press',
    'incline press': 'incline press',
    'decline press': 'decline press',
    'close grip bench': 'close grip bench',
    'romanian deadlift': 'romanian deadlift',
    'split squat': 'split squat',
    'bulgarian split': 'bulgarian split squat',
    'goblet squat': 'goblet squat',
    'front squat': 'front squat',
    'back squat': 'back squat',
    'walking lunge': 'walking lunge',
    'preacher curl': 'preacher curl',
    'hammer curl': 'hammer curl',
    'concentration curl': 'concentration curl',
    'cable curl': 'cable curl',
    'bicep curl': 'bicep curl',
    'tricep pushdown': 'tricep pushdown',
    'tricep extension': 'tricep extension',
    'tricep dip': 'tricep dip',
    'cable row': 'cable row',
    'seated row': 'seated row',
    'dumbbell row': 'dumbbell row',
    'barbell row': 'barbell row',
    't-bar row': 't-bar row',
    'face pull': 'face pull',
    'lat pulldown': 'lat pulldown',
    'pull up': 'pull up',
    'chin up': 'chin up',
    'cable fly': 'cable fly',
    'dumbbell fly': 'dumbbell fly',
    'pec deck': 'pec deck',
    'rear delt': 'rear delt fly',
    'upright row': 'upright row',
    'arnold press': 'arnold press',
    'ab rollout': 'ab rollout',
    'dead bug': 'dead bug',
    'russian twist': 'russian twist',
    'mountain climber': 'mountain climber',
    'hanging leg raise': 'hanging leg raise',
    'hanging knee raise': 'hanging knee raise',
    'cable crunch': 'cable crunch',
    'side plank': 'side plank',
    'sumo deadlift': 'sumo deadlift',
    'sumo squat': 'sumo squat',
    'pendlay row': 'pendlay row',
    'meadows row': 'meadows row',
    'inverted row': 'inverted row',
    'straight arm pulldown': 'straight arm pulldown',
    'hyperextension': 'hyperextension',
    'back extension': 'back extension',
    'incline dumbbell press': 'incline dumbbell press',
    'incline curl': 'incline curl',
    'spider curl': 'spider curl',
    'drag curl': 'drag curl',
    'ez bar curl': 'ez bar curl',
    'reverse curl': 'reverse curl',
    'tricep kickback': 'tricep kickback',
    'diamond push up': 'diamond push up',
    'cable lateral raise': 'cable lateral raise',
    'cable face pull': 'cable face pull',
    'reverse pec deck': 'reverse pec deck',
    'hip abduction': 'hip abduction',
    'hip adduction': 'hip adduction',
    'glute kickback': 'glute kickback',
    'donkey kick': 'donkey kick',
    'fire hydrant': 'fire hydrant',
    'cable pull through': 'cable pull through',
    'nordic curl': 'nordic curl',
    'glute ham raise': 'glute ham raise',
    'reverse lunge': 'reverse lunge',
    'deficit lunge': 'deficit lunge',
    'zercher squat': 'zercher squat',
    'sissy squat': 'sissy squat',
    'pendulum squat': 'pendulum squat',
    'pallof press': 'pallof press',
    'bird dog': 'bird dog',
    'hollow body': 'hollow body hold',
    'bicycle crunch': 'bicycle crunch',
    'flutter kick': 'flutter kick',
    'v-up': 'v-up',
    'reverse crunch': 'reverse crunch',
    'farmer walk': 'farmer walk',
    'suitcase carry': 'suitcase carry',

    // Generic patterns (shorter matches - checked last)
    'hack': 'hack squat',
    'rdl': 'romanian deadlift',
    'curl': 'bicep curl',
    'press': 'bench press',
    'row': 'barbell row',
    'fly': 'dumbbell fly',
    'raise': 'lateral raise',
    'pulldown': 'lat pulldown',
    'pushdown': 'tricep pushdown',
    'squat': 'squat',
    'lunge': 'lunge',
    'deadlift': 'deadlift',
    'pullup': 'pull up',
    'chinup': 'chin up',
    'crunch': 'crunch',
    'plank': 'plank',
    'twist': 'russian twist',
    'extension': 'leg extension',
    'shrug': 'shrug',
    'dip': 'tricep dip',
    'thrust': 'hip thrust',
    'bridge': 'glute bridge',
    'step up': 'step up',
    'woodchop': 'woodchop',
    'kickback': 'glute kickback',
    'abduction': 'hip abduction',
    'adduction': 'hip adduction',
    'hyper': 'hyperextension',
    'nordic': 'nordic curl',
    'pallof': 'pallof press',
    'hollow': 'hollow body hold',
    'bicycle': 'bicycle crunch',
    'flutter': 'flutter kick',
    'farmer': 'farmer walk',
    'carry': 'suitcase carry',
    'v up': 'v-up'
  };

  // Check for each movement keyword (longer matches first)
  const sortedMovements = Object.keys(movementMap).sort((a, b) => b.length - a.length);

  for (const movement of sortedMovements) {
    const regex = new RegExp(`\\b${movement.replace(' ', '\\s*')}\\b`, 'i');
    if (regex.test(nameLower)) {
      const cueKey = movementMap[movement];
      if (EXERCISE_CUES[cueKey]) {
        console.log(`Matched "${exerciseName}" to "${cueKey}" via movement "${movement}"`);
        return EXERCISE_CUES[cueKey];
      }
    }
  }

  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { mode, exercise, question, conversationHistory } = JSON.parse(event.body || '{}');

    if (!exercise || !exercise.name) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Exercise name is required' })
      };
    }

    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AI service not configured' })
      };
    }

    const exerciseName = exercise.name;
    const muscleGroup = exercise.muscle_group || exercise.muscleGroup || 'general';
    const equipment = exercise.equipment || 'bodyweight';
    const instructions = exercise.instructions || '';

    let prompt;
    let maxTokens = 400;

    if (mode === 'tips') {
      // Check if we have pre-defined expert cues
      const expertCues = getExerciseCues(exerciseName);

      if (expertCues) {
        // Return 3 random cues from our expert database
        const shuffled = [...expertCues].sort(() => Math.random() - 0.5);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            tips: shuffled.slice(0, 3)
          })
        };
      }

      // Fall back to AI generation for exercises not in our database
      prompt = `You are an expert strength coach and physical therapist. Generate 3 specific, technical form cues for "${exerciseName}".

Exercise details:
- Primary muscle: ${muscleGroup}
- Equipment: ${equipment}
${instructions ? `- Custom instructions from coach: ${instructions}` : ''}

Requirements for each tip:
- Be SPECIFIC to this exact exercise, not generic advice
- Include body positioning, joint angles, or breathing cues
- Focus on common mistakes and how to avoid them
- Use coaching language (action verbs, specific body parts)

BAD examples (too generic):
- "Keep good form"
- "Control the weight"
- "Don't use momentum"

GOOD examples:
- "Keep elbows at 45 degrees, not flared to 90"
- "Lower bar to nipple line, touch chest on each rep"
- "Squeeze shoulder blades together before initiating the pull"

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no explanation):
{"tips":["Specific tip 1","Specific tip 2","Specific tip 3"]}`;

      maxTokens = 200;
    } else if (mode === 'ask') {
      // Answer a specific question
      if (!question) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Question is required for ask mode' })
        };
      }

      // Build conversation context if available
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        conversationContext = '\n\nPrevious conversation:\n' +
          conversationHistory.slice(-4).map(msg =>
            `${msg.role === 'user' ? 'Client' : 'Coach'}: ${msg.content}`
          ).join('\n');
      }

      // Get exercise-specific cues if available - gives AI important context
      const expertCues = getExerciseCues(exerciseName);
      let cuesContext = '';
      if (expertCues && expertCues.length > 0) {
        cuesContext = `\n\nKey form cues for this exercise:\n${expertCues.map(c => `• ${c}`).join('\n')}`;
      }

      prompt = `You are an ELITE personal trainer and exercise scientist with 20+ years of experience coaching everyone from beginners to professional athletes. You have deep expertise in biomechanics, anatomy, and exercise programming.

A client is asking about: "${exerciseName}"
Target muscle: ${muscleGroup}
Equipment: ${equipment}
${instructions ? `\n**CUSTOM INSTRUCTIONS FROM COACH (IMPORTANT - prioritize these):**\n${instructions}` : ''}${cuesContext}
${conversationContext}

CLIENT'S QUESTION: "${question}"

=== YOUR KNOWLEDGE BASE (use this to answer) ===

**MOVEMENT PATTERN IDENTIFICATION:**
Look at the exercise name and identify the pattern. Keywords tell you what it is:

HINGE (keywords: deadlift, RDL, romanian, good morning, hip hinge)
→ Hip-dominant, hamstrings/glutes primary, back stays FLAT
→ Feel it in: hamstrings (stretch), glutes (squeeze at top)
→ NOT in lower back (if you do, form is wrong)

SQUAT (keywords: squat, leg press, hack, lunge, split squat, step up)
→ Knee + hip flexion, quads/glutes primary
→ Depth matters: deeper = more glutes, shallower = more quads

LEG CURL (keywords: leg curl, hamstring curl, lying curl, seated curl)
→ Knee flexion ONLY, hamstrings isolated
→ Toes pointed = more hamstring, toes up = calves assist
→ Don't lift hips off pad

LEG EXTENSION (keywords: leg extension, quad extension)
→ Knee extension ONLY, quads isolated
→ Full squeeze at top, control descent
→ Don't use momentum

CALF RAISE (keywords: calf, calve, raise, press with calf)
→ Ankle plantarflexion, calves isolated
→ Full stretch at bottom, squeeze at top
→ Toe angle changes emphasis (out=inner, in=outer)

GLUTE (keywords: hip thrust, glute bridge, kickback, abduction)
→ Hip extension, glutes primary
→ Squeeze glutes HARD at top, don't hyperextend spine

HORIZONTAL PUSH (keywords: bench, chest press, push-up, fly, pec)
→ Chest/triceps/front delts
→ Shoulder blades retracted, elbows 45-75°

VERTICAL PUSH (keywords: overhead press, shoulder press, military, OHP)
→ Shoulders/triceps primary
→ Core braced, no excessive back arch

HORIZONTAL PULL (keywords: row, cable row, dumbbell row, barbell row)
→ Back/biceps, pull toward torso
→ Squeeze shoulder blades, don't use momentum

VERTICAL PULL (keywords: pulldown, pull-up, chin-up, lat)
→ Lats/biceps primary
→ Full stretch at top, pull to chest not behind neck

BICEP CURL (keywords: curl + arm/bicep/dumbbell/barbell/cable, NOT leg curl)
→ Elbow flexion only, biceps isolated
→ Elbows pinned at sides, no swinging

TRICEP (keywords: pushdown, tricep extension, skull crusher, dip)
→ Elbow extension only, triceps isolated
→ Upper arm stationary, squeeze at lockout

SHOULDER ISOLATION (keywords: lateral raise, front raise, rear delt, face pull)
→ Single joint shoulder work
→ Lead with elbows not hands, control the weight

CORE (keywords: crunch, plank, ab, sit-up, leg raise, rollout, twist)
→ Spinal flexion/rotation/anti-movement
→ Breathe out on contraction, don't pull on neck

**BODY POSITION PRINCIPLES:**

HEAD/NECK (if asked):
- Hinges/Rows: Neutral = look at floor 6-10 feet ahead, NOT up, NOT down. "Pack your neck" - slight chin tuck
- Squats: Pick a spot at eye level, head moves with spine
- Bench press: Head stays ON bench, eyes roughly under bar
- Standing: Look straight ahead, chin level
- Machines: Usually neutral, looking forward

FOOT POSITION (if asked):
- Squats: Shoulder-width+, toes 15-30° out, knees track over toes
- Conventional deadlift: Hip-width, toes forward/slightly out
- Sumo deadlift: 1.5-2x shoulder width, toes 45° out, knees OUT
- Leg press/hack: HEIGHT MATTERS - higher=glutes, lower=quads, middle=balanced
- Calf raises: Straight=overall, out=inner calf, in=outer calf
- Lunges: Hip-width apart (not tightrope), front foot flat
- Leg curl: Feet hip-width, toes pointed down = more hamstring

BACK POSITION (if asked):
- Deadlifts/rows/squats: FLAT - if it rounds, too heavy
- Bench press: Slight upper back arch = GOOD (shelf for pressing)
- Seated machines: Pressed against pad
- Leg curl/extension: Pressed into pad, don't lift hips/butt

GRIP/HAND POSITION (if asked):
- Bench: Just outside shoulder width, wrists straight
- Rows: Wider=upper back, narrower=lats
- Curls: Shoulder-width or narrower, elbows pinned
- Pulldowns: 1.5x shoulder width, pull to upper chest
- Overhand=more back, underhand=more bicep, neutral=joint-friendly

PAD/MACHINE SETUP (if asked):
- Leg curl: Pad just above heels/Achilles, not on calves
- Leg extension: Pad on lower shin, knee aligned with pivot
- Lat pulldown: Thigh pad snug so you don't lift up
- Chest press: Handles at mid-chest height
- Shoulder press: Handles at shoulder height

**HOW TO ANSWER DIFFERENT QUESTION TYPES:**

"How far apart / where should feet/hands be?":
→ Give SPECIFIC measurements (shoulder-width, hip-width, 1.5x shoulder width)
→ Explain how changing position changes muscle emphasis
→ Include toe/finger angle if relevant

"Up or down? / Which direction?":
→ Give the ANSWER first (up, down, neutral, etc.)
→ Then explain WHY
→ Describe what "neutral" actually looks like

"Should I feel this in X?" / "I feel it in wrong place":
→ Describe where they SHOULD feel it
→ Explain what's causing wrong muscle activation
→ Give specific fix (form change, cue, or weight reduction)

"How deep/low/far should I go?":
→ Give specific range of motion targets
→ Explain what limits safe ROM (back rounding, pain, etc.)
→ Mention mobility as a factor if relevant

"Common mistakes?":
→ List 3-4 specific, common errors
→ For each, explain what it looks like and how to fix it

"Alternatives?":
→ Name 2-3 specific exercises
→ Briefly explain why each is a good substitute

"How much weight / reps?":
→ Explain it depends on goal
→ Give specific rep ranges (strength: 4-6, hypertrophy: 8-12, endurance: 15+)
→ "Right weight = last 2-3 reps are challenging but form stays good"

**RESPONSE FORMAT:**
- Answer the actual question FIRST in the first sentence
- Then provide supporting detail
- Use bullet points for multiple items
- Be concise but specific
- Use coaching cues in quotes when helpful (e.g., "spread the floor", "proud chest")

**NEVER DO THIS:**
- Say "maintain proper form" without explaining what proper form IS
- Give generic advice like "use controlled movement" when asked a specific question
- Say "keep a neutral position" without describing what neutral looks like
- Ignore the specific question and give general form tips
- Use filler phrases like "Great question!"

NOW ANSWER THE CLIENT'S QUESTION: "${question}"`;

      maxTokens = 600;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid mode. Use "tips" or "ask"' })
      };
    }

    // Call GPT-4o Mini API
    console.log(`Exercise coach: Calling GPT-4o Mini for ${mode} mode, exercise: ${exerciseName}`);

    let responseText;
    try {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7
      });
      responseText = completion.choices?.[0]?.message?.content || '';
    } catch (apiError) {
      console.error('OpenAI API error:', apiError);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'AI API error',
          debugInfo: apiError.message?.substring(0, 200) || 'Unknown error'
        })
      };
    }

    console.log(`GPT-4o Mini response length: ${responseText.length} chars`);

    if (!responseText) {
      console.error('Empty response from GPT-4o Mini');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Empty response from AI'
        })
      };
    }

    if (mode === 'tips') {
      // Parse JSON response for tips
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tips && parsed.tips.length > 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                tips: parsed.tips
              })
            };
          }
        }
      } catch (parseError) {
        console.error('Failed to parse tips JSON:', parseError);
      }

      // Fallback: Generate basic tips based on muscle group
      const fallbackTips = {
        'chest': ['Squeeze chest muscles at peak contraction', 'Keep shoulder blades retracted throughout', 'Control the negative portion slowly'],
        'back': ['Initiate movement by squeezing shoulder blades', 'Pull with elbows, not hands', 'Full stretch at bottom, squeeze at top'],
        'shoulders': ['Keep core braced to protect lower back', 'Don\'t use momentum - control the weight', 'Lead with elbows, not hands'],
        'arms': ['Keep elbows stationary throughout', 'Full range of motion on every rep', 'Squeeze the target muscle at contraction'],
        'legs': ['Push through heels, not toes', 'Keep knees tracking over toes', 'Brace core before each rep'],
        'core': ['Maintain neutral spine position', 'Breathe steadily, don\'t hold breath', 'Focus on mind-muscle connection']
      };

      const muscleKey = muscleGroup.toLowerCase();
      const tips = fallbackTips[muscleKey] || fallbackTips['core'];

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tips: tips
        })
      };
    } else {
      // Return the coach's answer
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          answer: responseText.trim()
        })
      };
    }

  } catch (error) {
    console.error('Exercise coach error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get coaching advice', details: error.message })
    };
  }
};
