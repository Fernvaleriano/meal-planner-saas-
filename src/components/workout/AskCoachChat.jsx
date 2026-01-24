import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, MessageCircle, Bot, ChevronLeft } from 'lucide-react';
import { apiPost } from '../../utils/api';

function AskCoachChat({ exercise, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Force close handler - used for escape routes (back button, escape key)
  const forceClose = useCallback(() => {
    try {
      onClose?.();
    } catch (e) {
      console.error('Error in forceClose:', e);
      window.history.back();
    }
  }, [onClose]);

  // Handle browser back button - critical for mobile "escape" functionality
  useEffect(() => {
    const modalState = { modal: 'ask-coach', timestamp: Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = () => {
      forceClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [forceClose]);

  // Handle escape key press
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        forceClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceClose]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Add welcome message on mount
  useEffect(() => {
    setMessages([{
      role: 'coach',
      text: `Hi! I'm your AI coach. Ask me anything about ${exercise?.name || 'this exercise'} - form tips, equipment alternatives, common mistakes, or anything else!`
    }]);
  }, [exercise?.name]);

  // Categorize exercise by movement pattern for smarter responses
  const getExerciseCategory = (name) => {
    const n = name.toLowerCase();
    // Order matters - check more specific patterns first
    if (n.includes('hack') || n.includes('leg press') || n.includes('smith') && n.includes('squat')) return 'machine-squat';
    if (n.includes('squat') || n.includes('goblet')) return 'squat';
    if (n.includes('deadlift') || n.includes('rdl') || n.includes('romanian') || n.includes('good morning')) return 'hinge';
    if (n.includes('row') || n.includes('pull')) return 'pull-horizontal';
    if (n.includes('pulldown') || n.includes('pull up') || n.includes('pullup') || n.includes('chin up') || n.includes('chinup') || n.includes('lat')) return 'pull-vertical';
    if (n.includes('press') || n.includes('push up') || n.includes('pushup') || n.includes('bench') || n.includes('fly') || n.includes('pec')) return 'push';
    if (n.includes('curl')) return 'curl';
    if (n.includes('extension') || n.includes('pushdown') || n.includes('skull') || n.includes('tricep')) return 'tricep';
    if (n.includes('raise') || n.includes('lateral') || n.includes('front') || n.includes('rear delt')) return 'raise';
    if (n.includes('lunge') || n.includes('split') || n.includes('step up') || n.includes('bulgarian')) return 'lunge';
    if (n.includes('leg curl') || n.includes('hamstring')) return 'leg-curl';
    if (n.includes('leg extension') || n.includes('quad')) return 'leg-extension';
    if (n.includes('calf') || n.includes('calve')) return 'calf';
    if (n.includes('hip thrust') || n.includes('glute bridge') || n.includes('glute')) return 'glute';
    if (n.includes('plank') || n.includes('crunch') || n.includes('ab') || n.includes('core') || n.includes('twist')) return 'core';
    if (n.includes('shrug')) return 'shrug';
    return 'general';
  };

  // Generate a helpful fallback response based on the question
  const getFallbackResponse = (question, exerciseName, muscleGroup) => {
    const q = question.toLowerCase();
    const muscle = muscleGroup || 'target muscles';
    const nameLower = exerciseName.toLowerCase();
    const category = getExerciseCategory(exerciseName);

    // FOOT/HAND PLACEMENT questions - very specific, check first
    if (q.includes('foot') || q.includes('feet') || q.includes('stance') ||
        (q.includes('high') && (q.includes('up') || q.includes('low'))) ||
        (q.includes('where') && (q.includes('place') || q.includes('put')))) {

      // Machine leg exercises with platforms
      if (category === 'machine-squat') {
        return `Foot placement on ${exerciseName}:\n\n**Foot Position Height:**\n• HIGHER on platform = more glutes & hamstrings, less knee stress\n• LOWER on platform = more quads, but more knee strain\n• MIDDLE = balanced quad/glute activation (start here)\n\n**How to know if feet are too HIGH:**\n• You feel it mostly in glutes, not quads\n• Heels want to lift off the platform\n• Lower back rounds at the bottom\n\n**How to know if feet are too LOW:**\n• Heels lift off the platform\n• Knees travel way past toes\n• You feel knee discomfort\n\n**Stance Width:**\n• Shoulder-width = standard quad focus\n• Wider stance = more inner thigh (adductors)\n• Toes pointed slightly out (15-30°) is normal\n\n**Key rule:** Your whole foot should stay flat throughout. If heels lift, move feet higher.`;
      }

      // Free weight squats
      if (category === 'squat') {
        return `Foot placement for ${exerciseName}:\n\n**Stance Width:**\n• Start shoulder-width apart\n• Wider = more glutes/adductors\n• Narrower = more quads (harder on knees)\n\n**Toe Angle:**\n• Point toes out 15-30 degrees\n• Knees should track over toes throughout\n\n**Weight Distribution:**\n• Weight through WHOLE foot - heels, balls, and toes\n• If heels lift, work on ankle mobility or elevate heels\n• "Grip the floor" with your feet`;
      }

      // Lunges/split squats
      if (category === 'lunge') {
        return `Foot placement for ${exerciseName}:\n\n**Front Foot:**\n• Far enough forward that knee stays over ankle at bottom\n• Whole foot stays flat, push through heel\n• Toes can point slightly out\n\n**Back Foot:**\n• On ball of foot (or elevated on bench for Bulgarian)\n• Far enough back to allow full depth\n\n**Stance Width:**\n• Feet hip-width apart (not on a tightrope)\n• This helps with balance`;
      }

      // Hinge movements
      if (category === 'hinge') {
        return `Foot placement for ${exerciseName}:\n\n• Feet hip to shoulder-width apart\n• Toes pointing forward or slightly out\n• Weight in heels/mid-foot, NOT toes\n• "Grip the floor" - feel pressure through whole foot`;
      }

      return `For foot placement on ${exerciseName}:\n\n• Start with feet shoulder-width apart\n• Toes pointed slightly outward (15-30°)\n• Weight distributed evenly across entire foot\n• Adjust based on what muscles you want to emphasize`;
    }

    // HEAD/NECK/CHIN position questions
    if (q.includes('head') || q.includes('neck') || q.includes('chin') || q.includes('look') || q.includes('eyes') ||
        (q.includes('up') && q.includes('down') && !q.includes('weight'))) {

      if (category === 'hinge') {
        return `Head position for ${exerciseName}:\n\n**The answer: NEUTRAL (not up, not down)**\n\n• Look at the floor about 6-10 feet in front of you\n• Chin slightly tucked - like holding a tennis ball under your chin\n• Your head should be in line with your spine\n• As you hinge, your gaze naturally shifts (still looking at that same floor spot)\n\n**Why NOT look up:**\n• Cranking your neck up puts stress on cervical spine\n• Can cause neck strain, especially with heavy weight\n• Throws off spinal alignment\n\n**Why NOT look down at your feet:**\n• Can cause upper back to round\n• Shifts weight forward onto toes\n\n**Cue that helps:** "Pack your neck" - make a double chin, then relax slightly.`;
      }

      if (category === 'squat' || category === 'machine-squat') {
        return `Head position for ${exerciseName}:\n\n**The answer: NEUTRAL, eyes forward**\n\n• Pick a spot on the wall at eye level or slightly below\n• Keep looking at that spot throughout the rep\n• Head stays in line with spine - don't crane neck up or tuck chin to chest\n\n**Why this matters:**\n• Looking up can cause you to lean forward\n• Looking down can cause upper back rounding\n• Neutral head = neutral spine = safer lifting\n\n**Cue:** Imagine a broomstick along your spine touching your head, upper back, and tailbone. All three should stay in contact.`;
      }

      if (category === 'pull-horizontal') {
        return `Head position for ${exerciseName}:\n\n**The answer: NEUTRAL**\n\n• Look at the floor a few feet in front of you\n• Head in line with spine (not looking up at ceiling or down at feet)\n• Chin slightly tucked\n\n**During the movement:**\n• Head position stays the same - don't bob up and down\n• If you're looking up, you're probably using too much momentum\n\n**Cue:** If someone put a dowel along your spine, it should touch your head, upper back, and hips throughout the row.`;
      }

      if (category === 'push') {
        return `Head position for ${exerciseName}:\n\n**For bench press/floor press:**\n• Head stays flat on the bench - don't lift it\n• Eyes should be roughly under the bar at start\n• Look at the ceiling or the bar - not at your chest\n\n**For overhead press:**\n• Head neutral, looking straight ahead\n• Move your head BACK slightly as bar passes face\n• Once bar is overhead, head can come forward to neutral\n\n**For push-ups:**\n• Head neutral, look at floor slightly ahead\n• Don't crane neck up or tuck chin to chest`;
      }

      if (category === 'curl' || category === 'tricep') {
        return `Head position for ${exerciseName}:\n\n**Keep it neutral and still:**\n• Look straight ahead, not up or down\n• Head shouldn't move during the rep\n• If your head is bobbing, you're using momentum\n\n**Common mistake:** Looking up/jerking head back to help lift the weight. This means the weight is too heavy.`;
      }

      return `Head position for ${exerciseName}:\n\n**General rule: NEUTRAL**\n\n• Head in line with spine\n• Pick a spot to focus on and keep looking there\n• Don't crane neck up or tuck chin down\n• If your head is moving during the rep, you may be using momentum\n\n**"Neutral" means:**\n• Slight natural curve in neck\n• Chin not jutting forward or tucked to chest\n• Like your normal standing posture`;
    }

    // GRIP/HAND placement questions
    if (q.includes('grip') || q.includes('hand') || (q.includes('wide') || q.includes('narrow')) && !q.includes('stance')) {
      if (category === 'push') {
        return `Grip for ${exerciseName}:\n\n**Width:**\n• Shoulder-width to 1.5x shoulder-width is standard\n• Wider grip = more chest emphasis, but more shoulder stress\n• Narrower grip = more tricep involvement\n\n**Wrist Position:**\n• Wrists straight, not bent back\n• Bar/dumbbells over forearms\n\n**If using bar:** Thumbs wrapped around (not thumbless)`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Grip for ${exerciseName}:\n\n**Width:**\n• Wider grip = more lat width emphasis\n• Narrower grip = more lat thickness, more bicep\n\n**Grip Type:**\n• Overhand (pronated) = more back\n• Underhand (supinated) = more bicep involvement\n• Neutral = balanced, often easiest on shoulders\n\n**Tip:** Let your lats stretch fully at the bottom, don't cut the range short.`;
      }
      return `For grip width on ${exerciseName}:\n\n• Shoulder-width is a good starting point\n• Wider grips typically emphasize outer muscles more\n• Narrower grips target inner portions\n• Experiment to find what feels strongest for your body structure`;
    }

    // Body positioning questions - MUST come before weight questions
    if (q.includes('bend') || q.includes('lean') || q.includes('angle') || q.includes('far') ||
        q.includes('position') || q.includes('degree') || q.includes('torso') || q.includes('back angle') ||
        (q.includes('how') && (q.includes('down') || q.includes('over')))) {

      if (category === 'pull-horizontal') {
        return `For body position on ${exerciseName}:\n\n• Hinge at hips until torso is roughly 45-60 degrees to the floor\n• More horizontal = more lat emphasis\n• More upright = more upper back/traps\n• Keep your back FLAT - no rounding\n• Slight bend in knees, weight in heels\n• Torso should stay STILL throughout the rep\n\n**Key:** If you're bobbing up and down, the weight is too heavy.`;
      }
      if (category === 'hinge') {
        return `For body position on ${exerciseName}:\n\n• Push hips BACK (not down) - like closing a car door with your butt\n• Keep the bar/weight close to your legs throughout\n• Back stays flat/neutral - NEVER rounded\n• Slight knee bend, but this is a HIP movement\n• Lower until you feel a hamstring stretch\n• Keep chest up and shoulder blades engaged`;
      }
      if (category === 'squat' || category === 'machine-squat') {
        return `For body position on ${exerciseName}:\n\n• Feet shoulder-width or slightly wider, toes pointed out 15-30°\n• Break at hips AND knees together\n• Keep chest up - imagine someone's pulling you up by your shirt\n• Knees track over (or slightly outside) toes\n• Go as deep as you can while keeping back flat\n• For machines: keep back pressed firmly against the pad`;
      }
      if (category === 'push') {
        return `For body position on ${exerciseName}:\n\n• Shoulder blades retracted (pulled back and down)\n• Slight arch in upper back, lower back neutral\n• For bench: feet flat on floor, drive through heels\n• Elbows at 45-75 degrees (not flared to 90)\n• Full range of motion - touch chest on presses`;
      }
      return `For body position on ${exerciseName}:\n\n• Keep your core braced and spine neutral\n• Maintain proper alignment throughout the movement\n• Start conservative with range of motion\n• Film yourself from the side to check form`;
    }

    if (q.includes('grip') || q.includes('wide') || q.includes('narrow') || q.includes('hand')) {
      return `For grip width on ${exerciseName}: A shoulder-width grip is a good starting point. Wider grips typically emphasize outer muscles more, while narrower grips target inner portions and often increase tricep involvement. Experiment to find what feels strongest and most comfortable for your body structure.`;
    } else if (q.includes('form') || q.includes('proper') || q.includes('technique') || q.includes('how do i')) {
      return `For ${exerciseName}:\n\n1. Set up with proper positioning - feet planted, core braced\n2. Control the weight through the full range of motion\n3. Focus on squeezing the ${muscle} at the peak contraction\n4. Lower under control (2-3 seconds)\n5. Breathe out on the exertion phase\n\nStart lighter to master the movement before adding weight.`;
    } else if ((q.includes('weight') || q.includes('heavy')) && !q.includes('body')) {
      // Only match weight questions if NOT asking about body position
      return `For weight selection on ${exerciseName}:\n\n• Hypertrophy (muscle growth): Choose a weight where 8-12 reps is challenging\n• Strength: Heavier weight, 4-6 reps\n• Endurance: Lighter weight, 15-20 reps\n\nYou should be able to complete your target reps with good form, but the last 2-3 reps should feel difficult.`;
    } else if (q.includes('mistake') || q.includes('wrong') || q.includes('avoid')) {
      return `Common mistakes on ${exerciseName}:\n\n• Using momentum/swinging to lift the weight\n• Not using full range of motion\n• Going too heavy too soon\n• Rushing through reps\n• Holding your breath\n\nFocus on mind-muscle connection and controlled movement.`;
    } else if (q.includes('home') || q.includes('alternative') || q.includes('substitute') || q.includes('replace')) {
      return `Alternatives to ${exerciseName}:\n\nLook for exercises that target the same muscle (${muscle}) with equipment you have. Resistance bands, dumbbells, or bodyweight variations often work well. The key is matching the movement pattern and muscle activation.`;
    } else if (q.includes('muscle') || q.includes('work') || q.includes('target')) {
      return `${exerciseName} primarily targets your ${muscle}. Secondary muscles involved typically include stabilizers and synergists that assist the movement. Focus on feeling the ${muscle} working throughout each rep for best results.`;
    } else if (q.includes('set') || q.includes('rep') || q.includes('how many')) {
      return `Rep and set recommendations for ${exerciseName}:\n\n• Muscle growth: 3-4 sets of 8-12 reps\n• Strength: 4-5 sets of 4-6 reps\n• Endurance: 2-3 sets of 15-20 reps\n\nRest 60-90 seconds between sets for hypertrophy, 2-3 minutes for strength work.`;
    } else if (q.includes('breathe') || q.includes('breathing')) {
      return `Breathing for ${exerciseName}:\n\n• Exhale during the exertion (lifting/pushing phase)\n• Inhale during the lowering phase\n• For heavy lifts, take a breath and brace your core before the rep\n• Never hold your breath for extended periods`;
    } else if (q.includes('how low') || q.includes('how deep') || q.includes('depth') || q.includes('range of motion') || q.includes('full range')) {
      // Depth/range of motion questions
      if (nameLower.includes('squat')) {
        return `For squat depth:\n\n• Ideal: Hip crease drops below the top of your knee ("parallel" or deeper)\n• At minimum: Thighs parallel to the floor\n• If you can't hit depth: work on ankle/hip mobility, or elevate heels slightly\n• Going deeper is fine IF you can keep your lower back from rounding\n\nDepth > weight. A deep squat with less weight beats a shallow squat with more.`;
      } else if (nameLower.includes('bench') || nameLower.includes('press')) {
        return `For range of motion on ${exerciseName}:\n\n• Lower the bar/dumbbells until they touch your chest (or come close)\n• Don't bounce off your chest - brief pause is good\n• Full lockout at top, but don't slam your elbows\n• If shoulder pain limits depth, try a slight decline or neutral grip`;
      } else if (nameLower.includes('curl')) {
        return `For range of motion on ${exerciseName}:\n\n• Start with arms fully extended (slight bend in elbows is OK)\n• Curl all the way up until you can't go higher\n• Squeeze the bicep hard at the top\n• Lower under control to full extension - this is where growth happens`;
      }
      return `For range of motion on ${exerciseName}:\n\n• Use the fullest range of motion you can control\n• Partial reps = partial results for most exercises\n• If limited by mobility, work on flexibility separately\n• Full ROM builds more muscle and keeps joints healthy`;
    } else if (q.includes('fast') || q.includes('slow') || q.includes('tempo') || q.includes('speed') || q.includes('pace') || q.includes('how long')) {
      // Tempo questions
      return `Tempo for ${exerciseName}:\n\n• Lowering phase (eccentric): 2-3 seconds - this is where muscle damage/growth happens\n• Brief pause at the bottom (0-1 sec)\n• Lifting phase (concentric): 1-2 seconds, controlled but powerful\n• Pause at top to squeeze (0-1 sec)\n\nSlower tempos = more time under tension = more muscle growth. If you're swinging or using momentum, slow down.`;
    } else if (q.includes('hurt') || q.includes('pain') || q.includes('injury') || q.includes('sore') || q.includes('sharp')) {
      // Pain/injury questions - be careful here
      return `⚠️ About pain during ${exerciseName}:\n\n• Muscle "burn" during a set = normal, that's the work\n• Muscle soreness 24-48 hours later (DOMS) = normal\n• Sharp pain, joint pain, or pain that gets worse = STOP\n\nIf you're experiencing joint pain or sharp discomfort:\n1. Stop the exercise immediately\n2. Check your form (film yourself)\n3. Try reducing weight significantly\n4. If pain persists, see a physical therapist\n\nNever push through sharp or joint pain.`;
    } else if (q.includes('progress') || q.includes('increase weight') || q.includes('add weight') || q.includes('getting stronger') || q.includes('plateau')) {
      // Progression questions
      return `Progression for ${exerciseName}:\n\n• Add weight when you can complete all sets/reps with good form\n• Typical increase: 5 lbs for upper body, 10 lbs for lower body\n• If you can't add weight, add 1 rep per set instead\n• Progression isn't always linear - some weeks you maintain\n\nDouble progression method:\n1. Pick a rep range (e.g., 8-12)\n2. Start at the low end with a challenging weight\n3. Add reps each session until you hit the top\n4. Then add weight and drop back to low reps`;
    } else if (q.includes('feel') || q.includes('activate') || q.includes('engage') || q.includes('connection') || q.includes("can't feel") || q.includes('dont feel')) {
      // Mind-muscle connection questions
      return `Improving mind-muscle connection for ${exerciseName}:\n\n• Slow down the rep - especially the lowering phase\n• Use lighter weight and focus on squeezing the ${muscle}\n• Pause at peak contraction and hold for 1-2 seconds\n• Touch the muscle you're trying to work (or have someone tap it)\n• Do a few "practice" reps with no weight before your set\n\nIf you still can't feel the ${muscle}:\n• Your form might be off - other muscles are taking over\n• Try a different variation of the exercise\n• Pre-exhaust with an isolation move first`;
    } else if (q.includes('lock') || q.includes('lockout') || q.includes('full extension') || q.includes('straighten')) {
      // Lockout questions
      return `Lockout/full extension on ${exerciseName}:\n\n• Generally: Yes, go to full extension, but don't SLAM into lockout\n• Control the end range - don't hyperextend joints\n• "Soft lockout" means straightening the joint but keeping slight muscle tension\n\nExceptions:\n• Leg press: Don't fully lock knees (risk of hyperextension)\n• Heavy pressing: Lockout is fine, just control it\n• Isolation moves: Full squeeze at contraction is key`;
    } else if (q.includes('often') || q.includes('every day') || q.includes('frequency') || q.includes('how many times') || q.includes('rest day') || q.includes('recover')) {
      // Frequency questions
      return `Training frequency for ${muscle}:\n\n• Most muscles: 2x per week is optimal for growth\n• Can train a muscle again when it's no longer sore\n• Direct work + indirect work both count\n• More frequency = less volume per session needed\n\nExample splits:\n• Full body 3x/week: Each muscle 3x\n• Upper/Lower 4x/week: Each muscle 2x\n• Push/Pull/Legs 6x/week: Each muscle 2x\n\nRest at least 48 hours between training the same muscle directly.`;
    } else if (q.includes('warm up') || q.includes('warmup') || q.includes('before')) {
      // Warm up questions
      return `Warming up for ${exerciseName}:\n\n1. General warm-up (5 min): Light cardio to raise body temp\n2. Dynamic stretches for the muscles you'll use\n3. Warm-up sets:\n   • Set 1: Empty bar or very light, 10-15 reps\n   • Set 2: ~50% working weight, 8 reps\n   • Set 3: ~75% working weight, 5 reps\n   • Then start your working sets\n\nDon't static stretch before lifting - save that for after.`;
    } else if (q.includes('back') && (q.includes('arch') || q.includes('flat') || q.includes('round') || q.includes('straight') || q.includes('neutral'))) {
      // Back position questions
      if (category === 'push') {
        return `Back position for ${exerciseName}:\n\n**For bench press:**\n• SLIGHT arch in upper back is good - creates stable base\n• Shoulder blades squeezed together and DOWN\n• Lower back can have natural curve, but butt stays on bench\n• "Arch" doesn't mean extreme - just engaged upper back\n\n**For overhead press:**\n• Keep back NEUTRAL - no excessive arch\n• Brace core tight to protect lower back\n• If you're arching a lot, weight is too heavy`;
      }
      if (category === 'hinge') {
        return `Back position for ${exerciseName}:\n\n**FLAT/NEUTRAL - this is critical**\n\n• Back should stay flat throughout the entire movement\n• If your back rounds, the weight is TOO HEAVY\n• Slight natural curve in lower back is fine\n• Think "proud chest" - this helps keep back flat\n\n**Signs your back is rounding:**\n• Upper back curves forward\n• Shoulders roll forward\n• You feel it in your lower back instead of hamstrings/glutes\n\n**Fix:** Reduce weight, focus on hip hinge pattern, strengthen core.`;
      }
      if (category === 'squat') {
        return `Back position for ${exerciseName}:\n\n• Keep back FLAT/NEUTRAL throughout\n• Slight forward lean is normal (more lean = more glute/hamstring)\n• "Butt wink" at bottom (lower back rounding) = go less deep or work mobility\n• Chest stays "proud" - imagine someone pulling you up by your shirt\n\n**If back rounds:**\n• Reduce depth until you can maintain flat back\n• Work on ankle and hip mobility\n• Strengthen core`;
      }
      return `Back position for ${exerciseName}:\n\n• Generally: Keep a neutral spine (natural curves intact)\n• Avoid rounding (flexion) under load\n• Avoid excessive arching (hyperextension)\n• Brace your core to stabilize your spine\n\n**Cue:** If you had a broomstick on your back, it should touch your head, upper back, and tailbone.`;
    } else if (q.includes('elbow') && (q.includes('in') || q.includes('out') || q.includes('flare') || q.includes('tuck') || q.includes('angle') || q.includes('position'))) {
      // Elbow position questions
      if (category === 'push') {
        return `Elbow position for ${exerciseName}:\n\n**The sweet spot: 45-75 degrees from your body**\n\n• Elbows at 90° (flared out) = more shoulder stress, injury risk\n• Elbows tight to sides = more tricep, less chest\n• 45° angle = good balance of chest activation and shoulder safety\n\n**Cue:** Think "arrow, not T" - your body and arms should look like an arrow (→) from above, not a T.\n\n**For dips:** Lean forward = more chest. Upright = more tricep. Elbows track back, not out.`;
      }
      if (category === 'pull-horizontal') {
        return `Elbow position for ${exerciseName}:\n\n• Pull elbows BACK, not out to the sides\n• Elbows close to body = more lats\n• Elbows flared out = more upper back/rear delts\n• At the top, elbows should be behind your torso\n\n**Cue:** Imagine you're elbowing someone behind you.`;
      }
      if (category === 'curl' || category === 'tricep') {
        return `Elbow position for ${exerciseName}:\n\n**Keep elbows STATIONARY**\n\n• Elbows pinned at your sides (for curls)\n• Elbows pointing straight ahead or up (for tricep work)\n• If elbows drift forward during curls = weight too heavy\n• If elbows flare during pushdowns = weight too heavy\n\n**The elbow is the hinge - nothing else should move.**`;
      }
      return `Elbow position for ${exerciseName}:\n\n• Keep elbows in a fixed position throughout the movement\n• Avoid flaring elbows out unless the exercise calls for it\n• Elbow movement usually means you're compensating - reduce weight\n• Think of your elbow as a hinge that doesn't move side to side`;
    } else if (q.includes('shoulder') && (q.includes('blade') || q.includes('retract') || q.includes('squeeze') || q.includes('back') || q.includes('position') || q.includes('shrug'))) {
      // Shoulder/scapula position questions
      if (category === 'push') {
        return `Shoulder position for ${exerciseName}:\n\n**RETRACT AND DEPRESS (pull back and down)**\n\n• Squeeze shoulder blades together like you're pinching a pencil\n• Pull them DOWN away from your ears\n• This creates a stable "shelf" to press from\n• Shoulders should NOT roll forward at the top\n\n**Why this matters:**\n• Protects your shoulder joint\n• Creates a stable base for more strength\n• Keeps tension on chest, not front delts`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Shoulder position for ${exerciseName}:\n\n**INITIATE with shoulder blades**\n\n• Before you pull with your arms, squeeze shoulder blades together\n• Think "chest to the bar" not "arms pulling"\n• At full contraction: shoulder blades fully squeezed\n• At the stretch: let shoulders protract (reach forward) to fully stretch lats\n\n**Cue:** "Shoulders in your back pockets" - pull them down and back.`;
      }
      return `Shoulder position for ${exerciseName}:\n\n• Keep shoulders "packed" - down and back\n• Don't let shoulders shrug up toward ears\n• Don't let them roll forward\n• Engage your lats to stabilize (imagine squeezing oranges in your armpits)`;
    } else if (q.includes('core') || q.includes('brace') || q.includes('tight') || q.includes('abs') && (q.includes('engage') || q.includes('flex') || q.includes('squeeze'))) {
      // Core bracing questions
      return `How to brace your core for ${exerciseName}:\n\n**The Valsalva Maneuver (for heavy lifts):**\n1. Take a deep breath into your belly (not chest)\n2. Brace like someone's about to punch you in the gut\n3. Hold that brace throughout the rep\n4. Exhale after completing the rep\n\n**For lighter weights:**\n• Keep abs engaged (not sucked in, just tight)\n• Breathe normally but maintain tension\n• Think "stiff torso"\n\n**Why it matters:**\n• Protects your spine\n• Creates stability for more force production\n• Prevents energy leaks\n\n**Practice:** Try to brace and have someone push your stomach - you shouldn't fold.`;
    } else if (q.includes('knee') && (q.includes('over') || q.includes('past') || q.includes('toes') || q.includes('track') || q.includes('cave') || q.includes('in') || q.includes('out'))) {
      // Knee position questions
      if (category === 'squat' || category === 'machine-squat' || category === 'lunge') {
        return `Knee position for ${exerciseName}:\n\n**Knees CAN go past toes - that's okay!**\n\nThe old "knees behind toes" rule is outdated. What matters:\n\n**DO:**\n• Knees track over your toes (same direction toes point)\n• Push knees OUT slightly - they shouldn't cave inward\n• Keep weight in whole foot, not just toes\n\n**DON'T:**\n• Let knees collapse inward ("knee valgus") - this is the real injury risk\n• Shift all weight to toes\n• Bounce at the bottom\n\n**If knees cave in:**\n• Reduce weight\n• Focus on "spreading the floor" with your feet\n• Strengthen glutes with banded work`;
      }
      return `Knee position for ${exerciseName}:\n\n• Knees should track in line with your toes\n• Slight outward pressure is good (don't let them cave in)\n• A slight bend protects the joint - don't hyperextend\n• If you feel knee pain, check your form and reduce weight`;
    } else if (q.includes('bar') && (q.includes('path') || q.includes('touch') || q.includes('where') || q.includes('chest') || q.includes('close'))) {
      // Bar path / touch point questions
      if (nameLower.includes('bench') || (category === 'push' && nameLower.includes('press'))) {
        return `Bar path for ${exerciseName}:\n\n**Touch point:** Lower chest / nipple line\n• NOT your neck (dangerous)\n• NOT your belly (inefficient)\n\n**Bar path is NOT straight up and down:**\n• Lower the bar in a slight arc toward your lower chest\n• Press back up toward your face/over shoulders\n• The bar travels in a slight "J" curve\n\n**Cue:** Bar starts over shoulders at lockout, touches lower chest, presses back to over shoulders.`;
      }
      if (category === 'hinge') {
        return `Bar path for ${exerciseName}:\n\n**Keep the bar CLOSE to your body**\n\n• The bar should drag up your shins/thighs\n• If the bar drifts forward, it puts more stress on your lower back\n• At lockout, bar is at hip crease\n\n**Cue:** "Paint your legs with the bar" - it should stay in contact or very close throughout.`;
      }
      return `Bar path for ${exerciseName}:\n\n• Generally keep the bar/weight close to your body\n• Straighter bar path = more efficient lift\n• If the weight drifts away from you, your leverage gets worse`;
    } else if (q.includes('rest') && (q.includes('between') || q.includes('long') || q.includes('set') || q.includes('minute') || q.includes('second'))) {
      // Rest between sets
      return `Rest periods for ${exerciseName}:\n\n**By goal:**\n• Strength (1-5 reps): 2-5 minutes\n• Hypertrophy (6-12 reps): 60-90 seconds\n• Endurance (15+ reps): 30-60 seconds\n\n**Why it matters:**\n• Shorter rest = more metabolic stress (pump, burn)\n• Longer rest = full ATP recovery = more strength\n\n**Practical tips:**\n• If you can't hit your target reps, rest longer\n• Compound lifts (squat, deadlift, bench) need more rest\n• Isolation moves can use shorter rest\n• Don't rush - quality reps > fast workout`;
    } else if (q.includes('easier') || q.includes('modify') || q.includes('beginner') || q.includes('can\'t do') || q.includes('too hard') || q.includes('regression')) {
      // Easier modifications
      if (category === 'push' && nameLower.includes('push up')) {
        return `Easier modifications for push-ups:\n\n**Progression (easiest to hardest):**\n1. Wall push-ups (standing, hands on wall)\n2. Incline push-ups (hands on bench/stairs)\n3. Knee push-ups (on knees, not toes)\n4. Negative push-ups (lower slowly, reset at bottom)\n5. Full push-ups\n\n**Key:** Don't let form break down. Better to do 10 good incline push-ups than 3 ugly floor ones.`;
      }
      if (category === 'pull-vertical' && (nameLower.includes('pull up') || nameLower.includes('chin up'))) {
        return `Easier modifications for ${exerciseName}:\n\n**Progression (easiest to hardest):**\n1. Lat pulldowns (machine, similar movement)\n2. Band-assisted pull-ups (band under knees/feet)\n3. Negative pull-ups (jump up, lower slowly)\n4. Jumping pull-ups (jump to assist, control down)\n5. Full pull-ups\n\n**Other options:**\n• Use an assisted pull-up machine\n• Do inverted rows instead (similar muscles, easier)`;
      }
      return `Making ${exerciseName} easier:\n\n• Reduce the weight/resistance\n• Reduce range of motion (temporarily)\n• Use a machine version if available\n• Use bands for assistance\n• Do the eccentric (lowering) only\n• Break it into partial movements\n\nStart where you can do 8-12 reps with good form, then progress from there.`;
    } else if (q.includes('harder') || q.includes('advanced') || q.includes('progress') || q.includes('too easy') || q.includes('challenge') || q.includes('variation')) {
      // Harder variations
      return `Making ${exerciseName} harder:\n\n**Load progression:**\n• Add more weight\n• Add more reps\n• Add more sets\n• Reduce rest time\n\n**Technique progression:**\n• Slow down the tempo (4 sec negative)\n• Add a pause at the hardest point\n• Increase range of motion\n• Use unilateral (single arm/leg) version\n\n**Advanced techniques:**\n• Drop sets (reduce weight, keep going)\n• Rest-pause (short rest, more reps)\n• Pre-exhaust (isolation before compound)\n• 1.5 reps (full rep + half rep = 1)`;
    } else if (q.includes('belt') || q.includes('strap') || q.includes('wrap') || q.includes('gear') || q.includes('equipment')) {
      // Equipment questions
      return `Using belts, straps, and wraps:\n\n**Lifting Belt:**\n• Helps brace core on heavy compounds (squat, deadlift, OHP)\n• Use for sets above 80-85% of max\n• Don't rely on it for every set - train without it too\n• Belt doesn't replace proper bracing - it enhances it\n\n**Lifting Straps:**\n• For pulling exercises when grip gives out before target muscles\n• Use sparingly - train grip strength too\n• Good for high-rep back work, heavy deadlifts/rows\n\n**Wrist Wraps:**\n• Support for heavy pressing\n• If wrists bend back under load, wraps can help\n• Don't wrap so tight you cut circulation\n\n**Knee Wraps/Sleeves:**\n• Sleeves: warmth and mild support (fine for regular training)\n• Wraps: significant support, usually for heavy squats`;
    } else if (q.includes('one side') || q.includes('imbalance') || q.includes('weaker') || q.includes('stronger') || q.includes('uneven') || q.includes('asymmetr')) {
      // Muscle imbalance questions
      return `Fixing muscle imbalances:\n\n**If one side is weaker:**\n\n1. **Start with your weak side** on unilateral exercises\n2. **Match reps** - don't do more on the strong side\n3. **Add extra volume** for the weak side (1-2 extra sets)\n4. **Use dumbbells/cables** instead of barbells (barbells let the strong side compensate)\n5. **Be patient** - imbalances take weeks/months to fix\n\n**Common causes:**\n• Dominant hand/leg doing more work\n• Previous injury\n• Poor form letting one side take over\n\n**Don't stress too much:** Minor imbalances are normal and often invisible.`;
    } else if (q.includes('stuck') || q.includes('sticking point') || q.includes('hardest') || q.includes('fail') || q.includes('can\'t finish') || q.includes('weak point')) {
      // Sticking point / failure questions
      return `Dealing with sticking points:\n\n**Where you get stuck tells you what's weak:**\n\n• **Stuck at the bottom** = need more strength out of the hole (pause reps, tempo work)\n• **Stuck in the middle** = weak point in the primary muscles (target that range)\n• **Stuck at lockout** = triceps/quads weak (add isolation work)\n\n**Techniques to strengthen weak points:**\n• Pause reps at your sticking point\n• Pin presses/squats from the sticking point\n• Chains or bands (accommodate resistance)\n• More volume for lagging muscles\n\n**If you fail a rep:**\n• Learn to bail safely (squat: dump the bar back; bench: roll of shame or use safeties)\n• Don't train to failure every set - leave 1-2 reps in reserve\n• Get a spotter for heavy work`;
    } else if (q.includes('spotter') || q.includes('alone') || q.includes('by myself') || q.includes('solo') || q.includes('no partner')) {
      // Training alone / spotter questions
      return `Training without a spotter:\n\n**Safer alternatives:**\n• Use a power rack with safety pins/arms\n• Use machines instead of free weights for heavy work\n• Don't train to absolute failure\n• Learn to bail/dump the weight safely\n• Use dumbbells (easier to drop safely than barbell)\n\n**For bench press specifically:**\n• Use a power rack with safeties just above chest\n• Don't use clips (can dump plates if stuck)\n• Learn the "roll of shame"\n• Do dumbbell press instead\n\n**When you NEED a spotter:**\n• Testing true 1 rep max\n• Any heavy set where failure is likely\n• New exercises where you're unsure of your limits`;
    } else if (q.includes('superset') || q.includes('circuit') || q.includes('pair') || q.includes('back to back') || q.includes('combine')) {
      // Superset questions
      return `Supersets with ${exerciseName}:\n\n**Good superset pairings:**\n\n• **Antagonist pairs** (opposite muscles): Bicep curl + tricep pushdown, chest press + row\n• **Same muscle** (for intensity): Two exercises for the same muscle, no rest\n• **Upper/Lower**: Alternate to keep heart rate up\n\n**Benefits:**\n• Save time\n• Increase workout density\n• Great for hypertrophy\n\n**When to avoid:**\n• Heavy strength work (need full recovery)\n• If form breaks down due to fatigue\n• If both exercises use the same stabilizers (both might suffer)`;
    } else if (q.includes('squeeze') || q.includes('contract') || q.includes('flex') || q.includes('peak') || q.includes('top')) {
      // Squeezing/contraction questions
      return `The squeeze/contraction on ${exerciseName}:\n\n**When to squeeze:**\n• At the "peak" of the movement where the ${muscle} is shortest\n• Hold for 1-2 seconds while actively flexing the muscle\n\n**Why it matters:**\n• Ensures you're actually using the target muscle\n• Increases time under tension\n• Improves mind-muscle connection\n\n**Cue:** At the top of the rep, try to make the ${muscle} cramp. If you can't feel a squeeze, the weight might be too heavy or form is off.\n\n**Common mistake:** Just moving the weight without actually contracting the muscle.`;
    } else if ((q.includes('feel') && q.includes('where')) || (q.includes('supposed') && q.includes('feel')) || q.includes('wrong muscle') || q.includes('feeling it in') || q.includes('should i feel')) {
      // "Where should I feel this?" questions
      if (category === 'push') {
        return `Where you should feel ${exerciseName}:\n\n**Target:** Chest, front delts, triceps\n\n**If you feel it mostly in shoulders:**\n• Elbows may be too flared (bring to 45°)\n• Bar touching too high (should be lower chest)\n• Shoulder blades not retracted\n\n**If you feel it mostly in triceps:**\n• Grip may be too narrow\n• Not getting full stretch at bottom\n\n**If you DON'T feel your chest:**\n• Slow down, focus on the squeeze\n• Try pre-exhausting with flyes first\n• Reduce weight and focus on form`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Where you should feel ${exerciseName}:\n\n**Target:** Lats (sides of back), upper back, biceps\n\n**If you feel it mostly in biceps:**\n• You're pulling with arms, not back\n• Focus on "elbows back" not "hands to chest"\n• Initiate by squeezing shoulder blades first\n\n**If you feel it in lower back:**\n• You're using momentum/swinging\n• Core isn't braced\n• Weight is too heavy\n\n**Cue to feel lats:** Imagine pulling your elbows into your back pockets.`;
      }
      if (category === 'hinge') {
        return `Where you should feel ${exerciseName}:\n\n**Target:** Hamstrings, glutes, lower back (as stabilizer)\n\n**If you feel it mostly in lower back:**\n• Back is rounding - reduce weight\n• Not hinging at hips enough\n• Core isn't braced properly\n\n**If you DON'T feel hamstrings:**\n• Push hips BACK more\n• Keep slight knee bend (not too much)\n• Think "butt to the wall behind you"\n\n**Good sign:** Hamstrings should feel stretched at the bottom, glutes should fire hard at the top.`;
      }
      if (category === 'squat' || category === 'machine-squat') {
        return `Where you should feel ${exerciseName}:\n\n**Target:** Quads, glutes, some hamstrings\n\n**If you feel it mostly in lower back:**\n• You're leaning too far forward\n• Core isn't braced\n• "Butt wink" at bottom - don't go as deep\n\n**More quad focus:** Narrower stance, toes forward, stay upright\n**More glute focus:** Wider stance, toes out, sit back more\n\n**Knee pain?** Check that knees track over toes, not caving in.`;
      }
      if (category === 'curl') {
        return `Where you should feel ${exerciseName}:\n\n**Target:** Biceps (front of upper arm)\n\n**If you feel it in forearms only:**\n• Grip might be too tight\n• Wrists are bending too much\n• Try a slightly looser grip\n\n**If you feel it in shoulders:**\n• Elbows are drifting forward\n• You're swinging/using momentum\n• Keep upper arms pinned at sides\n\n**If you DON'T feel biceps:**\n• Slow way down\n• Squeeze hard at the top\n• Reduce weight`;
      }
      return `Where you should feel ${exerciseName}:\n\n**Primary target:** ${muscle}\n\n**If you're feeling it in the wrong place:**\n• Slow down the movement\n• Reduce the weight\n• Check your form matches the cues\n• Focus on squeezing the target muscle\n\n**If you don't feel the target muscle:**\n• Try a lighter weight with slower tempo\n• Pre-exhaust with an isolation exercise first\n• Make sure the target muscle is actually stretched and contracted`;
    } else if (q.includes('touch and go') || q.includes('dead stop') || q.includes('pause at') || q.includes('bounce') || (q.includes('reset') && q.includes('bottom'))) {
      // Touch and go vs pause/dead stop questions
      if (category === 'hinge') {
        return `Touch and go vs dead stop for ${exerciseName}:\n\n**Dead stop (reset each rep):**\n• Better for building strength off the floor\n• Forces you to generate force from zero\n• Reduces injury risk (no bouncing)\n• Best for: strength training, technique work\n\n**Touch and go:**\n• Keeps muscles under constant tension\n• Better for hypertrophy (more time under tension)\n• Uses stretch reflex for extra power\n• Best for: muscle building, conditioning\n\n**Recommendation:** Learn with dead stop first. Add touch-and-go later for variety.`;
      }
      if (category === 'push' && (nameLower.includes('bench') || nameLower.includes('press'))) {
        return `Pause vs touch-and-go for ${exerciseName}:\n\n**Paused reps:**\n• Bar touches chest, pause 1-2 sec, then press\n• Eliminates bounce/momentum\n• Builds strength out of the bottom\n• Required in powerlifting competitions\n\n**Touch and go:**\n• Bar touches chest briefly, immediately press\n• More time under tension\n• Can handle slightly more weight\n• Good for hypertrophy\n\n**DON'T bounce:** Either way, no bouncing the bar off your chest!\n\n**Recommendation:** Use paused reps for strength, touch-and-go for volume work.`;
      }
      return `Pausing vs continuous reps for ${exerciseName}:\n\n**Adding a pause:**\n• Eliminates momentum\n• Builds strength at the hardest point\n• Increases time under tension\n• Great for breaking through plateaus\n\n**Continuous (no pause):**\n• Uses stretch reflex\n• More reps in less time\n• Better for conditioning/endurance\n\n**Never bounce** at the bottom of any lift - that's injury waiting to happen.`;
    } else if ((q.includes('high') && q.includes('bar')) || (q.includes('low') && q.includes('bar')) || (q.includes('sumo') && q.includes('conventional')) || q.includes('vs') || q.includes('versus') || q.includes('difference between') || q.includes('which is better')) {
      // Comparison questions
      if (nameLower.includes('squat') && (q.includes('high') || q.includes('low'))) {
        return `High bar vs low bar squat:\n\n**High bar (on traps):**\n• More upright torso\n• More quad dominant\n• Requires good ankle mobility\n• Deeper squat possible\n• Common in Olympic lifting, bodybuilding\n\n**Low bar (on rear delts):**\n• More forward lean\n• More hip/glute dominant\n• Can usually lift more weight\n• Less depth required\n• Common in powerlifting\n\n**Which to choose:**\n• Quad focus? High bar\n• Max strength? Low bar\n• Shoulder issues? High bar\n• Just pick one and get strong at it`;
      }
      if (nameLower.includes('deadlift') && (q.includes('sumo') || q.includes('conventional'))) {
        return `Sumo vs conventional deadlift:\n\n**Conventional (narrow stance):**\n• More lower back and hamstring\n• Longer range of motion\n• Better for most beginners\n• "Harder off the floor, easier at lockout"\n\n**Sumo (wide stance):**\n• More quads and hips\n• Shorter range of motion\n• Better if you have long torso, short arms\n• "Easier off the floor, harder at lockout"\n\n**Which to choose:**\n• Try both, see what feels stronger\n• Long arms/short torso = conventional usually\n• Short arms/long torso = sumo might help\n• Hip mobility issues? Conventional\n• Lower back issues? Sumo might help`;
      }
      if (q.includes('dumbbell') || q.includes('barbell') || q.includes('machine') || q.includes('cable')) {
        return `Dumbbells vs barbells vs machines:\n\n**Barbells:**\n• Can lift heaviest weights\n• Best for strength and progressive overload\n• Requires more skill/stability\n• Fixed path can hide imbalances\n\n**Dumbbells:**\n• Greater range of motion\n• Each side works independently (fixes imbalances)\n• More stabilizer activation\n• Can't go as heavy\n\n**Machines:**\n• Safest, easiest to learn\n• Good for isolation and beginners\n• Can train to failure safely\n• Less stabilizer activation\n\n**Cables:**\n• Constant tension throughout range\n• Great for isolation work\n• Very joint-friendly\n• Versatile angles\n\n**Best approach:** Use all of them for different purposes!`;
      }
      return `For comparing exercise variations:\n\n**General principles:**\n• More stability required = more muscle activation but less weight\n• Free weights > machines for overall development\n• Machines are great for isolation and safety\n• The "best" exercise is the one you'll do consistently with good form\n\n**For ${exerciseName}:** Try different variations and see what you feel most in the target muscle.`;
    } else if (q.includes('set up') || q.includes('setup') || q.includes('adjust') || q.includes('settings') || (q.includes('how') && q.includes('machine'))) {
      // Machine setup questions
      if (category === 'machine-squat' || nameLower.includes('leg press') || nameLower.includes('hack')) {
        return `Setting up ${exerciseName}:\n\n**Foot platform:**\n• Middle = balanced quad/glute\n• Higher = more glutes, hamstrings\n• Lower = more quads (but more knee stress)\n\n**Stance width:**\n• Shoulder width = standard\n• Wider = more inner thigh\n• Toes out 15-30° is normal\n\n**Back pad:**\n• Stay pressed firmly against it\n• If lower back lifts, you're going too deep\n\n**Safety stops:**\n• Set them so you can bail safely\n• Test with light weight first`;
      }
      if (nameLower.includes('lat pulldown') || nameLower.includes('cable row')) {
        return `Setting up ${exerciseName}:\n\n**Seat height:**\n• Thigh pad should pin your legs down firmly\n• You shouldn't be lifting off the seat when pulling\n\n**Cable/bar height:**\n• Pulldowns: High attachment, pull to upper chest\n• Rows: Mid-height, pull to lower chest/upper abs\n\n**Grip attachment:**\n• Wide bar = more lat width\n• Close grip/V-bar = more thickness\n• Single handle = unilateral work\n\n**Weight:**\n• Start lighter than you think\n• You should be able to control the weight up AND down`;
      }
      return `Setting up machines for ${exerciseName}:\n\n**General principles:**\n1. Adjust seat/pad height so the pivot point matches your joint\n2. Your working muscles should feel the stretch and contraction\n3. Test with light weight before going heavy\n4. Set safety stops appropriately\n\n**If something feels "off":**\n• Try different seat/pad positions\n• Make sure you're not too far or too close\n• The movement should feel smooth, not awkward`;
    } else if (q.includes('safe') || q.includes('bad knee') || q.includes('bad back') || q.includes('bad shoulder') || q.includes('injury') || q.includes('hurt') || q.includes('avoid') || q.includes('replace')) {
      // Safety / injury modification questions
      if (q.includes('knee')) {
        return `${exerciseName} with knee issues:\n\n**Generally safer:**\n• Partial range of motion (don't go as deep)\n• Box squats (control depth)\n• Leg press (more controlled)\n• Hip hinge movements (less knee stress)\n• Slow, controlled tempo\n\n**Generally harder on knees:**\n• Deep squats/lunges\n• Jumping/plyometrics\n• Full leg extensions (controversial)\n• Sissy squats\n\n**Key principles:**\n• Pain is a signal - don't push through it\n• Strengthen muscles around the knee (quads, hamstrings)\n• Work on mobility\n• See a physical therapist for specific issues\n\n**Warm up thoroughly** - never skip this with joint issues.`;
      }
      if (q.includes('back') || q.includes('spine')) {
        return `${exerciseName} with back issues:\n\n**Generally safer:**\n• Machine exercises (supported)\n• Neutral spine movements\n• Core bracing on everything\n• Lighter weights, higher reps\n• Avoid spinal flexion under load\n\n**Be careful with:**\n• Deadlifts (but CAN be therapeutic if done right)\n• Good mornings\n• Bent over rows (unsupported)\n• Sit-ups/crunches\n\n**Key principles:**\n• ALWAYS brace your core\n• Never round your lower back under load\n• Build core strength (planks, dead bugs)\n• See a PT before heavy lifting\n\n**Pain free > heavy.** You can build muscle with lighter weights.`;
      }
      if (q.includes('shoulder')) {
        return `${exerciseName} with shoulder issues:\n\n**Generally safer:**\n• Neutral grip (palms facing each other)\n• Dumbbells (free movement path)\n• Landmine pressing\n• Cable work (adjustable angles)\n• Keeping elbows at 45°, not flared\n\n**Often problematic:**\n• Behind-neck presses (AVOID)\n• Upright rows (if narrow grip)\n• Dips (if you go too deep)\n• Wide grip bench\n• Overhead work (depends on issue)\n\n**Key principles:**\n• Pain is a red flag - don't push through\n• Strengthen rotator cuff\n• Work on thoracic mobility\n• Retract shoulder blades on pressing\n• See a PT for specific rehab`;
      }
      return `Exercise safety considerations:\n\n**General principles:**\n• Pain is information - don't ignore it\n• "No pain, no gain" is WRONG for joint pain\n• Muscle burn during exercise = normal\n• Sharp/joint pain = stop immediately\n\n**When to modify:**\n• Reduce weight\n• Reduce range of motion\n• Try a different variation\n• Use machines for more control\n\n**When to skip:**\n• Sharp pain during the movement\n• Pain that gets worse as you continue\n• Recommended by a medical professional\n\n**Always:** Warm up, use good form, progress gradually.`;
    } else if (q.includes('overhand') || q.includes('underhand') || q.includes('supinate') || q.includes('pronate') || q.includes('neutral grip') || q.includes('mixed grip') || q.includes('hook grip')) {
      // Grip orientation questions
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Grip types for ${exerciseName}:\n\n**Overhand (pronated, palms away):**\n• More back emphasis\n• Harder on grip strength\n• Standard for most rowing/pulling\n\n**Underhand (supinated, palms toward you):**\n• More bicep involvement\n• Often stronger grip\n• Great for chin-ups, underhand rows\n\n**Neutral (palms facing each other):**\n• Most shoulder-friendly\n• Balanced back/bicep\n• Often feels strongest\n\n**For deadlifts specifically:**\n• Double overhand: safest, grip limited\n• Mixed (one over, one under): stronger but can cause imbalances\n• Hook grip: strong AND safe, but hurts at first`;
      }
      return `Grip orientation for ${exerciseName}:\n\n**Overhand (pronated):** Palms face away/down\n**Underhand (supinated):** Palms face you/up\n**Neutral:** Palms face each other\n\n**General rules:**\n• Neutral grip is usually easiest on joints\n• Underhand = more bicep involvement\n• Overhand = more forearm/back involvement\n• Mixed grip = only for max deadlifts\n\n**Experiment** to see what lets you feel the target muscle best.`;
    } else if (q.includes('film') || q.includes('record') || q.includes('video') || q.includes('check my form') || q.includes('mirror')) {
      // Self-assessment questions
      return `Checking your form:\n\n**Filming yourself:**\n• HIGHLY recommended - you can't feel what you look like\n• Film from the side for squat/deadlift/row\n• Film from behind for squat (knee tracking)\n• Film from front for pressing\n• Compare to good technique examples\n\n**Using a mirror:**\n• Good for some exercises (curls, lateral raises)\n• Can mess up neck position on squats/deadlifts\n• Don't turn your head to look during heavy lifts\n\n**Form check tips:**\n• Post videos to r/formcheck or fitness forums\n• Watch in slow motion\n• Compare rep 1 to rep 8 (fatigue shows issues)\n\n**Signs your form is breaking down:**\n• Rep speed slows dramatically\n• You're making faces/grinding\n• Range of motion decreases\n• Bar path changes\n\n**When in doubt:** Hire a coach for a session or two.`;
    } else if (q.includes('cue') || q.includes('think about') || q.includes('focus on') || q.includes('mental') || q.includes('visualize')) {
      // Mental cues questions
      if (category === 'push') {
        return `Mental cues for ${exerciseName}:\n\n**Setup:**\n• "Shoulder blades in your back pockets"\n• "Bend the bar" (creates external rotation)\n• "Screw your hands into the floor" (push-ups)\n\n**During the lift:**\n• "Push yourself away from the bar/floor"\n• "Spread the floor with your feet"\n• "Arrow, not T" (elbow position)\n\n**The squeeze:**\n• "Try to touch your elbows together"\n• "Hug a big tree" (for flyes)`;
      }
      if (category === 'hinge') {
        return `Mental cues for ${exerciseName}:\n\n**Setup:**\n• "Proud chest, long spine"\n• "Shoulders in your back pockets"\n• "Grip the floor with your feet"\n\n**During the lift:**\n• "Push the floor away" (not pull the bar up)\n• "Paint your legs with the bar"\n• "Butt to the wall behind you"\n• "Lead with your chest"\n\n**Lockout:**\n• "Squeeze your glutes like you're cracking a walnut"\n• "Stand tall, don't lean back"`;
      }
      if (category === 'squat') {
        return `Mental cues for ${exerciseName}:\n\n**Setup:**\n• "Grip the floor with your feet"\n• "Create a tripod" (heel, big toe, little toe)\n• "Get your air" (belly breath and brace)\n\n**Going down:**\n• "Sit back and down"\n• "Spread the floor with your feet"\n• "Knees out over toes"\n\n**Coming up:**\n• "Drive your back into the bar"\n• "Stand up, don't good-morning it"\n• "Lead with your chest"`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Mental cues for ${exerciseName}:\n\n**Setup:**\n• "Chest up, shoulders down"\n• "Long arms" (full stretch at start)\n\n**The pull:**\n• "Pull with your elbows, not your hands"\n• "Elbows to your back pockets"\n• "Lead with the elbows"\n• "Chest to the bar"\n\n**The squeeze:**\n• "Pinch a pencil between your shoulder blades"\n• "Crush an orange in your armpit"`;
      }
      return `Mental cues for ${exerciseName}:\n\n**General cues that work for most exercises:**\n• "Own the weight" - be in control, don't let it control you\n• "Smooth is fast" - controlled beats rushed\n• "Squeeze the target" - focus on contracting the muscle\n• "One more" - when it gets hard, commit to one more good rep\n\n**Before heavy lifts:**\n• Visualize a successful rep\n• "I've done this before, I can do it again"\n• Take your time setting up\n\n**During the rep:**\n• Focus on the muscle working\n• Think about the cues, not the weight`;
    }
    return `For ${exerciseName}, focus on controlled movement through full range of motion. Keep the ${muscle} under tension throughout, and prioritize form over weight. If you have a specific question about grip, form, weight selection, or alternatives, I'm happy to help with more detail!`;
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      // Build conversation history for context (excluding welcome message)
      const conversationHistory = messages
        .filter(msg => msg.role !== 'coach' || !msg.text.includes("I'm your AI coach"))
        .map(msg => ({
          role: msg.role === 'coach' ? 'assistant' : 'user',
          content: msg.text
        }));

      const response = await apiPost('/.netlify/functions/exercise-coach', {
        mode: 'ask',
        exercise: {
          name: exercise?.name,
          muscle_group: exercise?.muscle_group || exercise?.muscleGroup,
          equipment: exercise?.equipment,
          instructions: exercise?.instructions
        },
        question,
        conversationHistory
      });

      if (response?.success && response?.answer) {
        setMessages(prev => [...prev, { role: 'coach', text: response.answer }]);
      } else {
        // Log any error info for debugging
        if (response?.error) {
          console.error('Coach API error:', response.error, response.debugInfo);
        }
        // Use fallback response if API didn't return valid answer
        const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup;
        setMessages(prev => [...prev, {
          role: 'coach',
          text: getFallbackResponse(question, exercise?.name || 'this exercise', muscleGroup)
        }]);
      }
    } catch (error) {
      console.error('Ask coach error:', error);
      // Use fallback response on error
      const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup;
      setMessages(prev => [...prev, {
        role: 'coach',
        text: getFallbackResponse(question, exercise?.name || 'this exercise', muscleGroup)
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, exercise]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick question suggestions
  const quickQuestions = [
    "What's the proper form?",
    "Common mistakes to avoid?",
    "Can I do this at home?",
    "What muscles does this work?"
  ];

  const handleQuickQuestion = (q) => {
    setInput(q);
    // Focus the input after setting
    inputRef.current?.focus();
  };

  // Handle overlay click - close the modal
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      forceClose();
    }
  }, [forceClose]);

  return (
    <div className="ask-coach-overlay" onClick={handleOverlayClick}>
      <div className="ask-coach-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ask-coach-header">
          <button className="back-btn" onClick={forceClose} type="button" aria-label="Go back">
            <ChevronLeft size={24} />
          </button>
          <div className="coach-title">
            <Bot size={20} />
            <span>Ask Coach</span>
          </div>
          <button className="close-btn" onClick={forceClose} type="button" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="ask-coach-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`coach-message ${msg.role}`}>
              {msg.role === 'coach' && (
                <div className="coach-avatar">
                  <Bot size={16} />
                </div>
              )}
              <div className="message-bubble">
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="coach-message coach">
              <div className="coach-avatar">
                <Bot size={16} />
              </div>
              <div className="message-bubble typing">
                <Loader2 size={16} className="spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions - only show if no user messages yet */}
        {messages.length <= 1 && (
          <div className="quick-questions">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                className="quick-question-btn"
                onClick={() => handleQuickQuestion(q)}
                type="button"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ask-coach-input">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask about form, alternatives, tips..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            type="button"
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AskCoachChat;
