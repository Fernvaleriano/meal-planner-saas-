import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, MessageCircle, Bot, ChevronLeft } from 'lucide-react';
import { apiPost } from '../../utils/api';

// Helper function to strip markdown formatting from text
const stripMarkdown = (text) => {
  if (!text) return text;
  return text
    // Remove bold: **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic: *text* or _text_ (but not if part of a word)
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Remove headers: # ## ### etc at start of lines
    .replace(/^#{1,6}\s+/gm, '')
    // Remove inline code: `text`
    .replace(/`([^`]+)`/g, '$1')
    // Remove strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, '$1');
};

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

  // Smart muscle group detection from exercise name
  const getMuscleFromName = (name) => {
    const n = name.toLowerCase();

    // Leg exercises
    if (n.includes('leg curl') || n.includes('hamstring')) return 'hamstrings';
    if (n.includes('leg extension') || n.includes('quad')) return 'quadriceps';
    if (n.includes('leg press') || n.includes('squat') || n.includes('lunge')) return 'quadriceps and glutes';
    if (n.includes('calf') || n.includes('calve')) return 'calves';
    if (n.includes('hip thrust') || n.includes('glute')) return 'glutes';
    if (n.includes('deadlift') || n.includes('rdl') || n.includes('romanian')) return 'hamstrings, glutes, and lower back';

    // Chest
    if (n.includes('bench') || n.includes('chest') || n.includes('pec') || n.includes('fly') || n.includes('push up') || n.includes('pushup')) return 'chest';

    // Back
    if (n.includes('row') || n.includes('pull up') || n.includes('pullup') || n.includes('chin up') || n.includes('pulldown') || n.includes('lat')) return 'back (lats)';

    // Shoulders
    if (n.includes('shoulder') || n.includes('overhead press') || n.includes('military') || n.includes('lateral raise') || n.includes('front raise') || n.includes('rear delt')) return 'shoulders';
    if (n.includes('shrug')) return 'traps';

    // Arms
    if (n.includes('curl') && !n.includes('leg')) return 'biceps';
    if (n.includes('tricep') || n.includes('pushdown') || n.includes('skull') || n.includes('dip')) return 'triceps';

    // Core
    if (n.includes('crunch') || n.includes('ab') || n.includes('plank') || n.includes('sit up') || n.includes('core')) return 'abs/core';

    return null;
  };

  // Generate a helpful fallback response based on the question
  const getFallbackResponse = (question, exerciseName, muscleGroup) => {
    const q = question.toLowerCase();
    // Use smart detection first, fall back to passed value, then generic
    const detectedMuscle = getMuscleFromName(exerciseName);
    const muscle = detectedMuscle || muscleGroup || 'target muscles';
    const nameLower = exerciseName.toLowerCase();
    const category = getExerciseCategory(exerciseName);

    // FOOT/FEET/STANCE placement questions - check BEFORE body positioning
    if ((q.includes('foot') || q.includes('feet') || q.includes('stance') || q.includes('apart') || q.includes('spacing')) &&
        !q.includes('hand')) {

      // Calf raises - specific foot position advice
      if (category === 'calf' || nameLower.includes('calf')) {
        return `Foot position for ${exerciseName}:\n\n**Stance Width:**\n• Hip-width apart is standard\n• Can vary for emphasis (see below)\n\n**Toe Direction (changes muscle emphasis):**\n• **Toes straight ahead** = overall calf development\n• **Toes pointed OUT** = more inner calf (medial head)\n• **Toes pointed IN** = more outer calf (lateral head)\n\n**On the platform:**\n• Balls of feet on edge, heels hanging off\n• Full range of motion: drop heels LOW, rise HIGH\n• Pause and squeeze at the top\n\n**Common mistake:** Not going through full range - partial reps = partial results for calves.`;
      }

      // Leg curl - foot position
      if (category === 'leg-curl' || nameLower.includes('leg curl') || nameLower.includes('hamstring curl')) {
        return `Foot position for ${exerciseName}:\n\n**Toes pointed UP or DOWN?**\n• **Toes pointed (plantarflexed):** More hamstring isolation - gastrocnemius (calf) is shortened so hamstrings do more work\n• **Toes neutral/up (dorsiflexed):** Calves assist more\n\n**Recommendation:** Point toes slightly DOWN for better hamstring activation.\n\n**Pad position:**\n• Pad should be just above your heels/Achilles\n• Not too high on your calves\n\n**During the curl:**\n• Don't let feet splay out to sides\n• Keep them aligned throughout the movement`;
      }

      // Sumo deadlift - specific stance
      if (nameLower.includes('sumo')) {
        return `Foot/stance position for ${exerciseName}:\n\n**Stance Width:**\n• 1.5-2x shoulder width\n• Wide enough that your arms hang straight down INSIDE your knees\n• Too wide = hips can't open properly, weaker off floor\n\n**Toe Angle:**\n• Point toes out 45° (or more based on hip anatomy)\n• Knees MUST track over toes\n\n**Weight Distribution:**\n• Weight in mid-foot to heels\n• "Spread the floor" with your feet\n• Push knees OUT hard throughout\n\n**How to find YOUR stance:**\n• Stand wide, point toes out, drop into a deep squat\n• Where you feel strongest/most open = your sumo stance`;
      }

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

      // Hinge movements (conventional deadlift, RDL)
      if (category === 'hinge') {
        return `Foot placement for ${exerciseName}:\n\n**Stance Width:**\n• Hip to shoulder-width apart (narrower than squat)\n• Conventional deadlift: feet under hips\n\n**Toe Angle:**\n• Toes pointing forward or slightly out (up to 15°)\n\n**Weight Distribution:**\n• Weight in mid-foot to heels, NOT toes\n• "Grip the floor" - feel pressure through whole foot\n• If you feel it in your toes, you're too far forward`;
      }

      return `For foot placement on ${exerciseName}:\n\n• Start with feet about shoulder-width apart\n• Toes pointed slightly outward (15-30°)\n• Weight distributed evenly across entire foot\n• Adjust based on what muscles you want to emphasize`;
    }

    // HAND/GRIP placement questions
    if (q.includes('hand') || q.includes('grip') || ((q.includes('wide') || q.includes('narrow')) && !q.includes('stance') && !q.includes('feet'))) {
      if (category === 'push') {
        return `Hand/grip position for ${exerciseName}:\n\n**Width:**\n• Shoulder-width to 1.5x shoulder-width is standard\n• Wider grip = more chest emphasis, but more shoulder stress\n• Narrower grip = more tricep involvement\n\n**For bench/floor press:**\n• Hands slightly wider than shoulder-width\n• Wrists straight (not bent back) - bar over forearms\n• Thumbs wrapped around the bar\n\n**For push-ups:**\n• Hands just outside shoulder-width\n• Fingers pointing forward or slightly out\n• Hands at chest level, not up by shoulders`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `Grip for ${exerciseName}:\n\n**Width:**\n• Wider grip = more lat width emphasis\n• Narrower grip = more lat thickness, more bicep\n\n**Grip Type:**\n• Overhand (pronated) = more back\n• Underhand (supinated) = more bicep involvement\n• Neutral = balanced, often easiest on shoulders\n\n**Tip:** Let your lats stretch fully at the bottom, don't cut the range short.`;
      }
      return `For grip/hand position on ${exerciseName}:\n\n• Shoulder-width is a good starting point\n• Wider grips typically emphasize outer muscles more\n• Narrower grips target inner portions\n• Keep wrists straight, not bent back\n• Experiment to find what feels strongest for your body`;
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

      return `Head position for ${exerciseName}:\n\n**General rule: NEUTRAL**\n\n• Head in line with spine\n• Pick a spot to focus on and keep looking there\n• Don't crane neck up or tuck chin down\n• If your head is moving during the rep, you may be using momentum`;
    }

    if (q.includes('form') || q.includes('proper') || q.includes('technique') || q.includes('how do i')) {
      return `For ${exerciseName}:\n\n1. Set up with proper positioning - feet planted, core braced\n2. Control the weight through the full range of motion\n3. Focus on squeezing the ${muscle} at the peak contraction\n4. Lower under control (2-3 seconds)\n5. Breathe out on the exertion phase\n\nStart lighter to master the movement before adding weight.`;
    } else if ((q.includes('weight') || q.includes('heavy')) && !q.includes('body')) {
      // Only match weight questions if NOT asking about body position
      return `For weight selection on ${exerciseName}:\n\n• Hypertrophy (muscle growth): Choose a weight where 8-12 reps is challenging\n• Strength: Heavier weight, 4-6 reps\n• Endurance: Lighter weight, 15-20 reps\n\nYou should be able to complete your target reps with good form, but the last 2-3 reps should feel difficult.`;
    } else if (q.includes('mistake') || q.includes('wrong') || q.includes('avoid')) {
      return `Common mistakes on ${exerciseName}:\n\n• Using momentum/swinging to lift the weight\n• Not using full range of motion\n• Going too heavy too soon\n• Rushing through reps\n• Holding your breath\n\nFocus on mind-muscle connection and controlled movement.`;
    } else if (q.includes('home') || q.includes('alternative') || q.includes('substitute') || q.includes('replace')) {
      return `Alternatives to ${exerciseName}:\n\nLook for exercises that target the same muscle (${muscle}) with equipment you have. Resistance bands, dumbbells, or bodyweight variations often work well. The key is matching the movement pattern and muscle activation.`;
    } else if (q.includes('muscle') || q.includes('work') || q.includes('target')) {
      // Give category-specific muscle info
      if (category === 'leg-curl') {
        return `${exerciseName} primarily targets your **hamstrings** (back of thigh).\n\n**Muscles worked:**\n• Primary: Biceps femoris, semitendinosus, semimembranosus (hamstrings)\n• Secondary: Gastrocnemius (calves assist slightly)\n\n**You should feel it:** In the back of your thighs, from just above the knee to your glutes.`;
      }
      if (category === 'leg-extension') {
        return `${exerciseName} primarily targets your **quadriceps** (front of thigh).\n\n**Muscles worked:**\n• Primary: Rectus femoris, vastus lateralis, vastus medialis, vastus intermedius (quads)\n\n**You should feel it:** In the front of your thighs, especially just above the knee.`;
      }
      if (category === 'calf') {
        return `${exerciseName} primarily targets your **calves**.\n\n**Muscles worked:**\n• Primary: Gastrocnemius (the bigger, visible calf muscle)\n• Secondary: Soleus (deeper calf muscle)\n\n**Standing vs seated:** Standing hits gastrocnemius more. Seated hits soleus more (knee bent shortens gastrocnemius).`;
      }
      if (category === 'hinge') {
        return `${exerciseName} primarily targets your **posterior chain** (back of body).\n\n**Muscles worked:**\n• Primary: Hamstrings, glutes\n• Secondary: Erector spinae (lower back), core\n\n**You should feel it:** Hamstring stretch on the way down, glute squeeze at the top. NOT in your lower back.`;
      }
      if (category === 'push') {
        return `${exerciseName} primarily targets your **chest, shoulders, and triceps**.\n\n**Muscles worked:**\n• Primary: Pectoralis major (chest)\n• Secondary: Anterior deltoid (front shoulder), triceps\n\n**Incline = more upper chest. Decline/flat = more mid/lower chest.**`;
      }
      if (category === 'pull-horizontal' || category === 'pull-vertical') {
        return `${exerciseName} primarily targets your **back and biceps**.\n\n**Muscles worked:**\n• Primary: Latissimus dorsi (lats), rhomboids, traps\n• Secondary: Biceps, rear delts, forearms\n\n**You should feel it:** In your lats (sides of back) and between your shoulder blades.`;
      }
      return `${exerciseName} primarily targets your ${muscle}. Focus on feeling the ${muscle} working throughout each rep - if you don't feel it there, check your form or reduce the weight.`;
    } else if (q.includes('set') || q.includes('rep') || q.includes('how many')) {
      return `Rep and set recommendations for ${exerciseName}:\n\n• Muscle growth: 3-4 sets of 8-12 reps\n• Strength: 4-5 sets of 4-6 reps\n• Endurance: 2-3 sets of 15-20 reps\n\nRest 60-90 seconds between sets for hypertrophy, 2-3 minutes for strength work.`;
    } else if (q.includes('breathe') || q.includes('breathing')) {
      return `Breathing for ${exerciseName}:\n\n• Exhale during the exertion (lifting/pushing phase)\n• Inhale during the lowering phase\n• For heavy lifts, take a breath and brace your core before the rep\n• Never hold your breath for extended periods`;
    } else if (q.includes('how low') || q.includes('how deep') || q.includes('depth') || q.includes('range of motion') || q.includes('full range') || q.includes('roll') || q.includes('all the way') || q.includes('how far')) {
      // Depth/range of motion questions

      // Ab wheel specific
      if (nameLower.includes('ab wheel') || nameLower.includes('ab roller') || nameLower.includes('rollout')) {
        return `Range of motion for ${exerciseName}:\n\n**Should you roll all the way out?**\n\n**Beginners:** NO - start with partial range\n• Roll out only as far as you can control\n• Stop before your lower back starts to sag/arch\n• Build up gradually over weeks\n\n**Advanced:** Yes, full extension is the goal\n• Arms fully extended overhead\n• Body in a straight line from hands to knees/feet\n• But ONLY if you can maintain a flat/slightly rounded back\n\n**Signs you're going too far:**\n• Lower back arches/sags toward floor\n• You can't pull yourself back up\n• You feel it in your lower back, not abs\n\n**Progression:**\n1. Wall rollouts (roll to wall to limit range)\n2. Partial rollouts\n3. Full rollouts from knees\n4. Full rollouts from toes (very advanced)`;
      }

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
    } else if (q.includes('failure') || q.includes('rpe') || q.includes('rir') || q.includes('how hard') || q.includes('all out') || q.includes('leave in the tank') || q.includes('max effort')) {
      // Failure / RPE / RIR questions
      return `Training intensity for ${exerciseName}:\n\n**Should you train to failure?**\n• Not every set - maybe 1-2 sets per workout\n• Failure = can't do another rep with good form\n• Going to failure increases fatigue significantly\n\n**RPE (Rate of Perceived Exertion) scale:**\n• RPE 7 = 3 reps left in the tank\n• RPE 8 = 2 reps left (good for most training)\n• RPE 9 = 1 rep left\n• RPE 10 = absolute failure\n\n**RIR (Reps in Reserve):**\n• Same concept as RPE, just counted differently\n• RIR 2 = could do 2 more reps\n\n**Recommendation:**\n• Most sets: RPE 7-8 (2-3 reps in reserve)\n• Last set of an exercise: RPE 9 (push harder)\n• Save true failure for isolation exercises, not heavy compounds`;
    } else if (q.includes('pump') || q.includes('blood') || q.includes('swole') || (q.includes('not') && q.includes('feeling')) || q.includes('flush')) {
      // Pump questions
      return `About the muscle pump:\n\n**What is the pump?**\n• Blood rushing into the working muscle\n• Makes muscles look bigger temporarily\n• That "tight" feeling during/after sets\n\n**Is the pump important for growth?**\n• Pump itself doesn't cause growth directly\n• BUT it's a sign you're working the target muscle\n• No pump might mean form is off or other muscles taking over\n\n**How to get a better pump:**\n• Higher rep ranges (12-20)\n• Shorter rest periods (30-60 sec)\n• Focus on the squeeze/contraction\n• Stay hydrated (dehydration kills the pump)\n• Slow down the tempo\n\n**Don't chase the pump on heavy compounds** - focus on strength for those.`;
    } else if ((q.includes('start') && q.includes('weight')) || q.includes('beginner') || (q.includes('first') && q.includes('time')) || q.includes('never done') || q.includes('new to')) {
      // Beginner / starting weight questions
      return `Starting weight for ${exerciseName}:\n\n**If you're new to this exercise:**\n1. Start with just the bar (or very light dumbbells)\n2. Do 10-15 reps focusing on form\n3. If that's easy with good form, add weight\n4. Keep adding until 10-12 reps is challenging\n\n**General starting points:**\n• Barbell movements: Just the bar (45 lbs/20 kg)\n• Dumbbell movements: 5-15 lbs each\n• Machines: Start at 1-2 plates, adjust\n\n**The right weight:**\n• Last 2-3 reps should be challenging\n• Form should stay perfect throughout\n• If you can't complete 8 reps with good form, it's too heavy\n\n**There's no shame in going light** - everyone starts somewhere. Master the movement first, then load it up.`;
    } else if (q.includes('shoe') || q.includes('barefoot') || q.includes('heel') && (q.includes('raise') || q.includes('elevate') || q.includes('lift')) || q.includes('squat shoe') || q.includes('flat') && q.includes('sole')) {
      // Footwear questions
      if (category === 'squat' || category === 'machine-squat') {
        return `Footwear for ${exerciseName}:\n\n**Best options for squats:**\n• Flat, hard-soled shoes (Converse, Vans, wrestling shoes)\n• Weightlifting shoes (raised heel) - great for limited ankle mobility\n• Barefoot/socks on appropriate surfaces\n\n**AVOID:**\n• Running shoes (squishy sole = unstable)\n• Any shoe with a soft/cushioned sole\n\n**Raised heel helps if:**\n• You can't hit depth without heels rising\n• You have poor ankle mobility\n• You want to stay more upright (quad focus)\n\n**Flat is fine if:**\n• You have good ankle mobility\n• You prefer more hip involvement\n• Low bar squatting`;
      }
      if (category === 'hinge') {
        return `Footwear for ${exerciseName}:\n\n**Best options for deadlifts:**\n• Flat, thin-soled shoes (Converse, deadlift slippers)\n• Barefoot (if gym allows)\n• Wrestling shoes\n\n**AVOID:**\n• Raised heel shoes (makes you start higher = harder lift)\n• Running shoes (unstable under heavy load)\n• Any thick, squishy sole\n\n**Why flat is best:**\n• Keeps you closer to the ground\n• More stable base\n• Better floor feel for driving through heels`;
      }
      return `General footwear advice for lifting:\n\n**For most exercises:**\n• Flat, stable sole (Converse, Vans, lifting shoes)\n• You want to feel connected to the floor\n• Avoid running shoes - too squishy\n\n**When heel elevation helps:**\n• Squats with limited ankle mobility\n• Staying more upright in movements\n\n**Barefoot training:**\n• Great for foot strength and proprioception\n• Check if your gym allows it\n• Not ideal for dropped weight scenarios`;
    } else if (q.includes('stretch') && (q.includes('after') || q.includes('before') || q.includes('should') || q.includes('when'))) {
      // Stretching questions
      return `Stretching and ${exerciseName}:\n\n**BEFORE lifting (warm-up):**\n• Dynamic stretches only (leg swings, arm circles)\n• Light cardio to raise body temp\n• Movement prep for what you're about to do\n• DON'T static stretch cold muscles before heavy lifts\n\n**AFTER lifting:**\n• Static stretching is fine now\n• Hold stretches 30-60 seconds\n• Focus on muscles you just worked\n• Great time to work on flexibility\n\n**Between sets:**\n• Light stretching of non-working muscles is fine\n• Don't deeply stretch the muscle you're training\n\n**Static stretching before lifting:**\n• Can temporarily reduce power output\n• Save it for after, or separate sessions`;
    } else if (q.includes('cramp') || q.includes('spasm') || q.includes('charley horse') || q.includes('muscle seize')) {
      // Cramping questions
      return `Muscle cramps during/after ${exerciseName}:\n\n**Common causes:**\n• Dehydration - drink more water\n• Electrolyte imbalance (sodium, potassium, magnesium)\n• Muscle fatigue - you pushed too hard\n• Lack of warm-up\n\n**Immediate fixes:**\n• Gently stretch the cramping muscle\n• Massage it lightly\n• Drink water with electrolytes\n• Walk it off\n\n**Prevention:**\n• Stay hydrated throughout the day\n• Eat potassium (bananas, potatoes)\n• Consider magnesium supplement\n• Warm up properly\n• Don't jump intensity too fast\n\n**If cramps are frequent:** Could be a sign of mineral deficiency - check with a doctor.`;
    } else if (q.includes('how many sets') && q.includes('week') || q.includes('volume') && (q.includes('per') || q.includes('week')) || q.includes('total sets') || q.includes('enough sets')) {
      // Weekly volume questions
      return `Weekly volume for ${muscle}:\n\n**Research-backed guidelines:**\n• Minimum for growth: 10 sets per muscle per week\n• Optimal for most: 15-20 sets per muscle per week\n• Maximum recoverable: ~25+ sets (advanced)\n\n**This includes:**\n• Direct work (e.g., bicep curls for biceps)\n• Indirect work (e.g., rows also hit biceps)\n\n**How to count:**\n• Chest: bench press = direct, push-ups = direct\n• Back: rows = direct, deadlifts = indirect\n• Biceps: curls = direct, rows = indirect\n\n**Quality > quantity:**\n• 10 hard sets beats 20 easy sets\n• Each set should be challenging (RPE 7-9)\n• If you can't recover, do less\n\n**Spread it out:** 2-3 sessions per muscle per week beats 1 massive session.`;
    } else if (q.includes('compound') || q.includes('isolation') || q.includes('order') || q.includes('first') && (q.includes('exercise') || q.includes('do')) || q.includes('which') && q.includes('first')) {
      // Exercise order / compound vs isolation
      return `Exercise order and ${exerciseName}:\n\n**General rule: Compounds before isolations**\n\n**Why compounds first:**\n• They require the most energy/focus\n• Use the most weight\n• Work multiple muscles\n• Examples: Squat, deadlift, bench, row, press\n\n**Isolations after:**\n• Finish off specific muscles\n• Less fatigue-dependent\n• Examples: Curls, extensions, raises, flyes\n\n**Full workout order:**\n1. Warm-up\n2. Heaviest/most technical lift\n3. Secondary compounds\n4. Isolation/accessory work\n5. Core/abs (optional at end)\n\n**Exception - Pre-exhaust:**\n• Sometimes you do an isolation FIRST to better feel a muscle\n• Example: Flyes before bench if you struggle to feel chest`;
    } else if (q.includes('deficit') || q.includes('elevated') || q.includes('raised') || q.includes('block') || q.includes('stand on') || q.includes('platform')) {
      // Deficit/elevated variations
      if (category === 'hinge') {
        return `Deficit deadlifts (standing on a platform):\n\n**What it does:**\n• Increases range of motion\n• Harder off the floor\n• Builds strength in the weakest position\n• Great for lifters who are weak off the ground\n\n**How to do it:**\n• Stand on 1-4 inch platform/plates\n• Same technique as regular deadlift\n• Use LESS weight (harder movement)\n\n**When to use:**\n• Weak off the floor\n• Want more hamstring/glute work\n• Building strength, not testing max\n\n**Caution:** Only if you have good mobility - don't round your back at the bottom!`;
      }
      if (category === 'push') {
        return `Elevated/deficit variations for ${exerciseName}:\n\n**Feet elevated (push-ups):**\n• Makes it harder\n• More emphasis on upper chest/shoulders\n• Higher = harder\n\n**Hands elevated (push-ups):**\n• Makes it easier\n• Good for beginners or more reps\n• Great for incline pressing pattern\n\n**Deficit push-ups (hands on blocks):**\n• Increases range of motion\n• More chest stretch at bottom\n• Builds strength through full ROM`;
      }
      return `Deficit/elevated variations:\n\n**Adding a deficit (more range of motion):**\n• Makes the exercise harder\n• Builds strength at your weakest point\n• Use less weight than normal\n• Only if mobility allows good form\n\n**Elevating (reducing range of motion):**\n• Makes the exercise easier\n• Good for beginners or working around injuries\n• Can help focus on specific portion of lift`;
    } else if (q.includes('chalk') || q.includes('glove') || q.includes('callus') || q.includes('grip') && (q.includes('slip') || q.includes('lose') || q.includes('fail'))) {
      // Chalk/gloves/grip equipment
      return `Chalk, gloves, and grip:\n\n**Chalk (magnesium carbonate):**\n• Absorbs sweat, prevents slipping\n• Best for deadlifts, pull-ups, rows\n• Use sparingly - a little goes a long way\n• Liquid chalk if your gym doesn't allow powder\n\n**Gloves:**\n• Protect hands from calluses\n• BUT reduce grip strength and feel\n• Can make bar thicker (harder to grip)\n• Most serious lifters skip them\n\n**Calluses:**\n• Normal! Sign you're lifting\n• File them down if they get too thick (prevents tearing)\n• Don't pick at them\n• Moisturize hands to prevent cracking\n\n**If grip is failing before target muscles:**\n• Train grip separately (farmer's walks, dead hangs)\n• Use straps for high-rep back work\n• Chalk helps a lot`;
    } else if (q.includes('sleep') || q.includes('recover') || q.includes('rest day') || q.includes('overtrain') || q.includes('tired')) {
      // Recovery/sleep questions
      return `Recovery and sleep for muscle building:\n\n**Sleep (crucial!):**\n• Aim for 7-9 hours\n• This is when muscles actually repair and grow\n• Poor sleep = poor recovery = poor gains\n• Growth hormone peaks during deep sleep\n\n**Signs you need more recovery:**\n• Strength going down, not up\n• Always feeling tired/sore\n• Getting sick more often\n• Losing motivation\n• Joint aches\n\n**Rest days:**\n• 1-2 full rest days per week minimum\n• Light activity is fine (walking, stretching)\n• Muscles grow during rest, not during workouts\n\n**Other recovery factors:**\n• Nutrition (especially protein)\n• Hydration\n• Stress management\n• Active recovery (light movement)\n\n**Overtraining is rare** but under-recovering is common.`;
    } else if (q.includes('deload') || q.includes('back off') || q.includes('lighter week') || q.includes('recovery week')) {
      // Deload questions
      return `Deload weeks explained:\n\n**What is a deload?**\n• A planned lighter week of training\n• Reduces fatigue, lets body recover\n• Comes back stronger after\n\n**When to deload:**\n• Every 4-8 weeks of hard training\n• When strength plateaus\n• When you feel beaten up\n• Before testing maxes\n\n**How to deload:**\n• Option 1: Same exercises, 50-60% of normal weight\n• Option 2: Same weight, half the sets\n• Option 3: Take the week off completely\n\n**Common mistake:** Skipping deloads and wondering why progress stalls.\n\n**You're not being lazy** - deloads are part of getting stronger.`;
    } else if (q.includes('negative') || q.includes('eccentric') || q.includes('lowering') || q.includes('slow down') || q.includes('control')) {
      // Eccentric/negative training
      return `Eccentric (negative) training for ${exerciseName}:\n\n**What is the eccentric?**\n• The lowering/lengthening phase\n• Example: Lowering the bar to your chest on bench\n• You're stronger eccentrically than concentrically\n\n**Why focus on eccentrics?**\n• Causes more muscle damage (in a good way)\n• Builds more muscle\n• Builds strength at longer muscle lengths\n• Improves control and technique\n\n**How to use eccentrics:**\n• Slow down the lowering: 3-5 seconds\n• Negative-only reps (lower heavy weight, use help to lift)\n• Control the weight - never just drop it\n\n**Caution:** Heavy negatives cause more soreness. Don't do them every session.`;
    } else if (q.includes('drop set') || q.includes('rest pause') || q.includes('cluster') || q.includes('giant set') || q.includes('intensity technique') || q.includes('21s')) {
      // Intensity techniques
      return `Intensity techniques for ${exerciseName}:\n\n**Drop sets:**\n• Do a set, immediately reduce weight 20-30%, keep going\n• Can drop 2-3 times\n• Great for pump and hypertrophy\n\n**Rest-pause:**\n• Do a set close to failure, rest 10-15 sec, do more reps\n• Repeat 2-3 times\n• Gets more reps with the same weight\n\n**Cluster sets:**\n• Break a set into mini-sets with 10-20 sec rest\n• Example: Instead of 10 reps, do 3-3-3-3 with short rest\n• Good for heavy weight with more total reps\n\n**When to use these:**\n• Last set of an exercise\n• For lagging body parts\n• When short on time\n• NOT for heavy compounds (save for isolation work)\n\n**Don't overuse** - these are fatiguing. 1-2 techniques per workout max.`;
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
    } else if (q.includes('butt wink') || q.includes('buttwink') || (q.includes('lower back') && q.includes('round')) || (q.includes('tuck') && q.includes('bottom'))) {
      // Butt wink questions (very common)
      return `Butt wink in squats:\n\n**What is it?**\n• Lower back rounding at the bottom of a squat\n• Pelvis tucks under ("winks")\n• Some is normal, excessive is a problem\n\n**Why does it happen?**\n• Lack of hip mobility\n• Tight hamstrings\n• Poor ankle mobility\n• Going deeper than your mobility allows\n• Stance too narrow/wide for your anatomy\n\n**Fixes:**\n1. Don't squat as deep (stop just before the tuck)\n2. Work on hip flexor and ankle mobility\n3. Widen your stance slightly\n4. Point toes out more\n5. Elevate heels (squat shoes or plates under heels)\n6. Brace core harder\n\n**Is it dangerous?**\n• Minor butt wink with light weight: not a big deal\n• Significant rounding with heavy weight: yes, reduce depth or weight`;
    } else if (q.includes('click') || q.includes('pop') || q.includes('crack') || q.includes('snap') || (q.includes('noise') && q.includes('joint'))) {
      // Joint clicking/popping questions
      return `Clicking/popping during ${exerciseName}:\n\n**Usually NOT a problem if:**\n• No pain with the click\n• It's occasional, not every rep\n• Range of motion is normal\n• No swelling\n\n**Might be a problem if:**\n• Pain accompanies the click\n• It's getting worse over time\n• Joint feels unstable\n• Swelling after workouts\n\n**Common causes (harmless):**\n• Gas bubbles in joint fluid\n• Tendons moving over bone\n• Tight muscles releasing\n\n**Reducing clicking:**\n• Warm up more thoroughly\n• Improve mobility work\n• Strengthen surrounding muscles\n• Try a slightly different angle/grip\n\n**When to see someone:**\n• Persistent pain with clicking\n• Joint feels like it "catches" or locks\n• Any grinding sensation`;
    } else if (q.includes('fasted') || q.includes('empty stomach') || q.includes('eat before') || q.includes('pre-workout meal') || (q.includes('before') && q.includes('workout') && q.includes('eat'))) {
      // Fasted training / pre-workout nutrition
      return `Eating before ${exerciseName}:\n\n**Training fasted:**\n• Some people perform fine fasted\n• Others need food for energy\n• Won't "burn more fat" despite the myth\n• Okay for light/moderate workouts\n\n**If you eat before:**\n• Large meal: 2-3 hours before\n• Small snack: 30-60 min before\n• Good pre-workout: carbs + some protein\n• Examples: banana, rice cakes, oatmeal, toast\n\n**Signs you need to eat first:**\n• Feeling weak/shaky during workout\n• Can't push as hard as usual\n• Dizzy or lightheaded\n• Workout is long (1+ hour)\n\n**Personal preference:**\n• Experiment with both\n• Morning lifters often train fasted\n• Heavy leg days usually benefit from food`;
    } else if (q.includes('after workout') || q.includes('post workout') || q.includes('post-workout') || q.includes('anabolic window') || (q.includes('eat') && q.includes('after'))) {
      // Post-workout nutrition
      return `Eating after workout:\n\n**The "anabolic window" myth:**\n• You DON'T need to eat within 30 minutes\n• As long as you eat within a few hours, you're fine\n• Total daily protein matters more than timing\n\n**Good post-workout:**\n• Protein (20-40g) to support muscle repair\n• Carbs to replenish glycogen\n• Examples: Protein shake + banana, chicken + rice, Greek yogurt + fruit\n\n**When timing matters more:**\n• If you trained fasted\n• If your next workout is within 8-12 hours\n• If you're a competitive athlete\n\n**For most people:**\n• Just eat your next regular meal\n• Get enough protein throughout the day (0.7-1g per lb bodyweight)\n• Don't stress about the exact minute`;
    } else if (q.includes('creatine') || q.includes('protein powder') || q.includes('supplement') || q.includes('pre workout') || q.includes('preworkout') || q.includes('bcaa')) {
      // Supplement questions
      return `Supplements for lifting:\n\n**Worth considering:**\n\n**Creatine monohydrate:**\n• Most studied, proven to work\n• 5g daily (no loading needed)\n• Helps strength, power, muscle\n• Cheap and effective\n\n**Protein powder:**\n• Convenient way to hit protein goals\n• Not magic - just food\n• Whey, casein, or plant-based\n• Only if you can't get enough from food\n\n**Usually not needed:**\n• BCAAs (waste if you eat enough protein)\n• Pre-workout (caffeine + marketing)\n• Testosterone boosters (don't work)\n• Most "muscle builders"\n\n**Caffeine:**\n• Does improve performance\n• Coffee works fine\n• Don't need expensive pre-workout\n\n**Focus on:** Sleep, nutrition, training hard. Supplements are 1-2% of results.`;
    } else if (q.includes('cardio') || q.includes('running') || q.includes('treadmill') || q.includes('hiit') || q.includes('conditioning')) {
      // Cardio and lifting
      return `Cardio and lifting:\n\n**Order:**\n• Lift first if strength/muscle is priority\n• Cardio first if endurance is priority\n• Or do them on separate days\n\n**Will cardio kill gains?**\n• No, unless it's excessive\n• 2-4 cardio sessions per week is fine\n• Separate by 6+ hours if possible\n• Keep intense cardio (HIIT) moderate\n\n**Best cardio for lifters:**\n• Walking (easy recovery, burns calories)\n• Cycling (less impact than running)\n• HIIT 1-2x week (time efficient)\n• Swimming (easy on joints)\n\n**How much is too much:**\n• If recovery suffers\n• If strength is declining\n• If you're always exhausted\n• If you're losing weight too fast\n\n**Bottom line:** Cardio is healthy. Just don't run a marathon and expect to squat heavy the next day.`;
    } else if (q.includes('bulky') || q.includes('too muscular') || q.includes('too big') || (q.includes('woman') || q.includes('women') || q.includes('female')) && q.includes('lift')) {
      // "Will I get bulky" myth
      return `About getting "too bulky":\n\n**Short answer:** No, you won't accidentally get huge.\n\n**Why you won't get bulky:**\n• Building significant muscle takes YEARS of hard work\n• It requires eating in a calorie surplus\n• Women have less testosterone = harder to build mass\n• Bodybuilders train for decades and eat specifically for size\n\n**What will happen:**\n• You'll get stronger\n• Muscle tone and definition\n• Improved body composition\n• Better metabolism\n• Increased confidence\n\n**The "toned" look IS muscle:**\n• "Toning" isn't real - it's building muscle and losing fat\n• Lifting creates the shape\n• Cardio alone = "skinny fat"\n\n**If you do gain more than you want:**\n• It takes months/years - you'll see it coming\n• Just reduce training volume\n• You're in complete control`;
    } else if ((q.includes('old') || q.includes('age') || q.includes('senior') || q.includes('50') || q.includes('60') || q.includes('70')) && (q.includes('safe') || q.includes('can i') || q.includes('start'))) {
      // Age-related questions
      return `Lifting at any age:\n\n**Good news:** It's never too late to start lifting!\n\n**Benefits for older lifters:**\n• Maintains/builds muscle mass (fights sarcopenia)\n• Improves bone density\n• Better balance and stability\n• Increased independence\n• Mental health benefits\n\n**Modifications:**\n• Start lighter, progress slower\n• Warm up longer (10-15 min)\n• Focus on form over weight\n• More recovery time between sessions\n• Machines can be safer to start\n• Listen to your body more\n\n**Exercises to prioritize:**\n• Squat patterns (for leg strength)\n• Pushing and pulling (upper body)\n• Core work (stability)\n• Balance exercises\n\n**Get cleared by a doctor if:**\n• Heart conditions\n• Joint replacements\n• Other serious health issues\n\n**You CAN build muscle at any age.** The body still responds to training.`;
    } else if (q.includes('muscle memory') || q.includes('took time off') || q.includes('break from') || q.includes('starting again') || q.includes('getting back') || q.includes('after a break')) {
      // Muscle memory / returning after break
      return `Getting back after a break:\n\n**Good news: Muscle memory is real!**\n• Previously trained muscles rebuild faster\n• Your nervous system remembers the movements\n• Strength comes back quicker than the first time\n\n**How to return:**\n1. Start at 50-60% of your previous weights\n2. Focus on form - your body forgot the details\n3. Expect more soreness at first\n4. Progress faster than a true beginner\n5. Don't rush back to old weights\n\n**Timeline:**\n• 1-2 weeks: Getting movement patterns back\n• 2-4 weeks: Strength returning noticeably\n• 4-8 weeks: Close to previous levels\n• Depends on how long you were off\n\n**Common mistake:** Going too hard too fast and getting injured. Your muscles might be ready before your tendons/joints. Be patient!`;
    } else if (q.includes('morning') || q.includes('evening') || q.includes('night') || q.includes('best time') || q.includes('time of day') || q.includes('when should i')) {
      // Best time to workout
      return `Best time to train:\n\n**Short answer:** Whenever you'll consistently do it.\n\n**Morning pros:**\n• Get it done before life gets busy\n• Gym is often less crowded\n• May improve focus for the day\n• Consistent schedule\n\n**Morning cons:**\n• May need longer warm-up (body is cold/stiff)\n• Strength typically peaks later in day\n• Might need to sleep earlier\n\n**Evening pros:**\n• Body is warmed up from daily activity\n• Typically stronger (1-2% more strength)\n• Can be stress relief after work\n\n**Evening cons:**\n• Easy to skip if tired or busy\n• Gym is often more crowded\n• Too late can affect sleep\n\n**The best workout time is the one you'll actually stick to.**`;
    } else if (q.includes('split') || q.includes('routine') || q.includes('program') || q.includes('how many days') || q.includes('schedule')) {
      // Training split questions
      return `Choosing a training split:\n\n**By days available:**\n\n**3 days/week:**\n• Full body 3x\n• Best for beginners\n• Hit each muscle 3x/week\n\n**4 days/week:**\n• Upper/Lower split (2x each)\n• Great balance of frequency and recovery\n\n**5 days/week:**\n• Upper/Lower + 1 extra day\n• Push/Pull/Legs + Upper/Lower\n\n**6 days/week:**\n• Push/Pull/Legs 2x\n• Good for intermediate/advanced\n\n**What matters most:**\n• Training each muscle 2x per week minimum\n• Enough recovery between sessions\n• Hitting 10-20 sets per muscle per week\n• A program you'll actually follow\n\n**For ${exerciseName}:** Make sure you're training the ${muscle} at least twice per week with adequate volume.`;
    } else if (q.includes('band') || q.includes('resistance band') || q.includes('add band') || q.includes('accommodate')) {
      // Resistance bands
      return `Using resistance bands with ${exerciseName}:\n\n**Adding bands to exercises:**\n• Increases resistance at the "easier" part of the lift\n• Makes lockout harder\n• Called "accommodating resistance"\n• Used in powerlifting for speed/power work\n\n**Benefits:**\n• Trains through sticking points\n• More constant tension\n• Helps with lockout strength\n• Good for speed work\n\n**How to set up:**\n• Anchor band securely (squat rack, heavy dumbbell)\n• Band goes from anchor to the bar/implement\n• Start with light band tension\n\n**Band-only exercises:**\n• Great for warm-ups\n• Good for travel/home\n• Constant tension throughout range\n• Easy on joints\n• Can replicate most exercises\n\n**Tip:** Loop bands have more resistance options than tube bands.`;
    } else if (q.includes('hypertrophy') || q.includes('strength training') || (q.includes('muscle') && q.includes('strong')) || q.includes('powerlifting') || q.includes('bodybuilding')) {
      // Strength vs hypertrophy
      return `Strength vs Hypertrophy training:\n\n**Strength training:**\n• Lower reps: 1-6\n• Heavier weight: 80-100% of max\n• Longer rest: 3-5 minutes\n• Fewer exercises, more sets\n• Focus: Move more weight\n\n**Hypertrophy (muscle size):**\n• Moderate reps: 6-15\n• Moderate weight: 65-85% of max\n• Shorter rest: 60-90 seconds\n• More exercises, moderate sets\n• Focus: Muscle tension and fatigue\n\n**Both build muscle and strength!**\n• Just different emphases\n• Most programs include both\n• Beginners: doesn't matter much, just train\n\n**For ${exerciseName}:**\n• Building muscle: 3-4 sets of 8-12 reps\n• Building strength: 4-5 sets of 4-6 reps\n• Do both: Alternate phases or combine in same workout`;
    } else if (q.includes('wrist') || q.includes('forearm pain') || (q.includes('arm') && q.includes('hurt'))) {
      // Wrist/forearm issues
      if (category === 'curl' || category === 'push' || category === 'pull-horizontal') {
        return `Wrist/forearm issues during ${exerciseName}:\n\n**Common causes:**\n• Wrist bent too far back under load\n• Grip too tight\n• Too much volume too fast\n• Weak wrist extensors\n\n**Fixes:**\n• Keep wrists STRAIGHT (neutral), not bent back\n• For bench: Bar should be over forearms, not in fingers\n• Try wrist wraps for support\n• Reduce weight temporarily\n• Use a neutral grip if possible\n\n**Strengthen wrists:**\n• Wrist curls and reverse wrist curls\n• Farmer's walks\n• Dead hangs\n\n**If it's tennis/golfer's elbow:**\n• Reduce volume\n• Warm up forearms before lifting\n• Eccentric wrist exercises\n• May need complete rest from aggravating movements\n• See a PT if persistent`;
      }
      return `Wrist issues during lifting:\n\n**General tips:**\n• Keep wrists neutral (straight), not bent\n• Don't grip too tight on isolation exercises\n• Wrist wraps can help on pressing movements\n• Warm up wrists before lifting (circles, stretches)\n\n**If pain persists:**\n• Reduce weight/volume\n• Avoid aggravating exercises\n• Ice after training\n• See a physical therapist\n\n**Strengthening wrists:**\n• Wrist curls and extensions\n• Farmer's walks\n• Dead hangs`;
    } else if (q.includes('hip shift') || q.includes('shifting') || (q.includes('lean') && q.includes('one side')) || q.includes('asymmetr') || q.includes('favoring')) {
      // Hip shift / asymmetry during lifts
      return `Hip shift or favoring one side:\n\n**Why it happens:**\n• One side is stronger/tighter\n• Previous injury compensation\n• Mobility difference (hips, ankles)\n• Poor awareness/habit\n\n**How to fix:**\n1. Film yourself - you can't feel what you look like\n2. Reduce weight until it's even\n3. Unilateral work (single leg squats, lunges)\n4. Stretch the tight side more\n5. Address any mobility differences\n6. Mental cue: "Stay centered"\n\n**Temporary fixes:**\n• Slightly different stance width\n• Toes pointed differently\n• Box squats (force you to stay centered)\n\n**If caused by pain:**\n• Don't just push through\n• Find and fix the root cause\n• See a PT if needed\n\n**Minor asymmetry is normal** - we're not robots. Major shifting with heavy weight is risky.`;
    } else if (q.includes('lower back') && (q.includes('pump') || q.includes('tight') || q.includes('fatigue'))) {
      // Lower back pump
      return `Lower back pump/tightness:\n\n**Common causes:**\n• Weak glutes (back takes over)\n• Core not bracing properly\n• Too much lower back work\n• Form breakdown on hinges\n\n**If it's just pump (no pain):**\n• Normal for deadlifts, rows, etc.\n• Stretch between sets\n• Reduce volume if excessive\n\n**If it's tightness/fatigue:**\n• Your lower back might be doing work your glutes should do\n• Focus on glute activation\n• Brace core harder\n• Check if back is rounding\n\n**How to reduce it:**\n• Hip thrusts to wake up glutes\n• Core strengthening (planks, dead bugs)\n• Rest longer between back-heavy exercises\n• Stretch hip flexors (tight hip flexors = tight lower back)\n\n**Red flags (see a doctor):**\n• Sharp pain\n• Numbness or tingling\n• Pain shooting down leg\n• Pain that doesn't go away`;
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
                {stripMarkdown(msg.text)}
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
