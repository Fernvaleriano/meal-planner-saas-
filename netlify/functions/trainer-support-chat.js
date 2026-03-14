const Anthropic = require('@anthropic-ai/sdk').default;
const { createClient } = require('@supabase/supabase-js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// ─── Comprehensive Knowledge Base ───────────────────────────────────────────
// This is the complete guide to every feature in the platform, written so the
// AI can answer ANY coach question accurately.
const PLATFORM_KNOWLEDGE_BASE = `
You are the built-in support assistant for a fitness & nutrition coaching platform. You help COACHES (trainers) use the platform effectively. You know every feature inside and out.

═══════════════════════════════════════════════
  COMPLETE PLATFORM GUIDE FOR COACHES
═══════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. GETTING STARTED & DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• When you first log in, you land on the DASHBOARD (Home tab).
• The dashboard shows an overview of your clients' recent activity:
  - Who logged meals today
  - Calorie/macro summaries for each client
  - Quick links to check on specific clients
• The navigation has 5 main tabs: Home, Diary, Messages, Workouts, Plans
• On desktop, there's a sidebar on the left with all navigation options
• On mobile, there's a bottom navigation bar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. ADDING & MANAGING CLIENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO ADD A CLIENT:
• Go to Settings → Scroll down to find your coach invite link/code
• Share your unique invite link with the client
• When they sign up using your link, they automatically appear in your client list
• You can also add clients manually by having them enter your coach code during registration

MANAGING CLIENTS:
• View all your clients from the Dashboard or any feature page (clients appear in dropdowns)
• Each client has their own profile with:
  - Personal details (name, age, weight, height)
  - Goals (calorie targets, macro targets)
  - Dietary preferences (diet type, allergies, disliked foods)
  - Activity level
• You can ARCHIVE clients you no longer work with (they won't show in your active list)
• Archived clients can be RESTORED at any time
• Client's "can_edit_goals" setting lets you control whether clients can modify their own macro targets

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. CLIENT ACTIVITY FEED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via the "Feed" tab (coach-only, appears in sidebar/nav)
• Shows a real-time feed of ALL client meal logs
• Meals are grouped by client, date, and meal type (breakfast, lunch, dinner, snacks)
• For each meal you can see:
  - Individual food items with calories and macros
  - Meal totals (total calories, protein, carbs, fat)
  - Photos if the client snapped their food
• REACTIONS: Click on any meal to react with emojis (👏 💪 🔥 ⭐ ❤️)
  - Clients see your reactions — great for positive reinforcement!
• COMMENTS: Leave text comments on meals for feedback
• FILTERS: Filter the feed by date range, specific clients, or meal types
• The feed updates automatically — you'll see new entries as clients log them

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. FOOD DIARY & NUTRITION TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via the "Diary" tab
• As a coach, you can view ANY client's food diary by selecting them
• The diary shows daily food logs organized by meal type
• Each entry shows: food name, portion, calories, protein, carbs, fat
• Daily totals and progress bars show how close clients are to their targets

HOW CLIENTS LOG FOOD (so you can help them):
  1. SNAP A PHOTO: Take a photo of food → AI analyzes and estimates macros
  2. TEXT SEARCH: Type a food name → search the nutrition database
  3. BARCODE SCAN: Scan a food label → pulls nutrition info automatically
  4. FAVORITES: Quick-add frequently eaten foods
  5. MANUAL ENTRY: Type in custom nutrition values

• Clients can also track WATER INTAKE with a daily water goal
• The diary supports COPYING meals from one day to another

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. MEAL PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO CREATE A MEAL PLAN:
  1. Go to the "Plans" tab
  2. Click "Create New Plan" or "Generate with AI"
  3. FOR AI-GENERATED PLANS:
     - Enter the client's calorie & macro targets
     - Specify any dietary preferences/restrictions
     - The AI creates a complete multi-day meal plan
     - You can regenerate or edit any part of it
  4. FOR MANUAL PLANS:
     - Build meals from scratch using the food database
     - Set specific foods, portions, and timing

ASSIGNING PLANS TO CLIENTS:
  • Open a meal plan → Click "Assign to Client"
  • Select which client(s) to assign it to
  • Clients see assigned plans in their Plans tab
  • You can assign one plan to multiple clients

MANAGING PLANS:
  • DUPLICATE: Copy an existing plan to modify for another client
  • EDIT: Modify any meal, swap foods, adjust portions
  • DELETE: Remove plans you no longer need
  • VIEW ADHERENCE: See how well clients are following their assigned plans

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. WORKOUTS & EXERCISE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKOUT BUILDER (Coach-Only):
  • Access via Workouts → "Create Workout" or the Workout Builder page
  • Build custom workout routines with:
    - Exercise selection from a library of 1500+ exercises
    - Sets, reps, weight, rest periods for each exercise
    - Exercise ordering and supersets
    - Notes/instructions per exercise
  • Each exercise has built-in FORM CUES (proper technique tips)
  • You can link CUSTOM VIDEO URLS to any exercise for demonstrations

WORKOUT PROGRAMS:
  • Create multi-week structured programs
  • Import pre-built program templates
  • Assign programs to clients with start dates

AI WORKOUT GENERATION:
  • Describe the workout you want (e.g., "upper body push/pull split for intermediate")
  • AI generates a complete workout with appropriate exercises, sets, and reps
  • Edit the generated workout to fit your coaching style

TRACKING CLIENT WORKOUTS:
  • See which workouts clients have completed
  • View their logged sets, reps, and weights
  • Track progress over time (strength gains, volume increases)
  • Clients get an AI exercise coach during workouts that helps with weight/rep suggestions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. MESSAGING & COMMUNICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via the "Messages" tab
• Direct 1-on-1 chat with each client
• FEATURES:
  - Text messages
  - Photo/video sharing (up to 250MB files)
  - Emoji reactions on messages (❤️ 💪 🔥 👏 😂 👍)
  - Unsend messages (delete for both sides)
  - Read receipts (see when messages are read)
  - Unread message badges on the Messages tab

BULK MESSAGING:
  • Send the same message to multiple clients at once
  • Great for announcements, motivation, program updates
  • Access via the bulk message icon in the Messages tab

NOTIFICATIONS:
  • You get notified when clients send you messages
  • Notification bell in the top navigation
  • Unread counts show on the Messages tab badge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. BRANDING & WHITE-LABELING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via "Branding" in the sidebar/settings (coach-only)
• Customize how the app looks for YOUR clients:

COLORS:
  - Choose from 8 preset color themes OR pick custom colors
  - Set primary color, secondary color, and accent color
  - Changes apply instantly for all your clients

LOGO & BRANDING:
  - Upload your own logo (shown in the top nav)
  - Upload a favicon (browser tab icon)
  - Set a custom app name (replaces the default name)

FONTS:
  - Choose from 10 Google Fonts (System, Inter, Poppins, Montserrat, etc.)
  - Font applies across the entire app for your clients

BUTTON STYLES:
  - Rounded (10px corners)
  - Sharp (4px corners)
  - Pill (fully rounded)

MODULE VISIBILITY:
  - Toggle which features your clients can see:
    ✓ Food Diary
    ✓ Meal Plans
    ✓ Workouts
    ✓ Messages
    ✓ Recipes
    ✓ Check-in
    ✓ Progress Photos
  - Hidden modules are completely invisible to clients
  - Great for phasing in features or running nutrition-only programs

TERMINOLOGY:
  - Rename any section (e.g., change "Diary" to "Food Log")
  - Customize labels to match your coaching brand language

WELCOME MESSAGE:
  - Set a custom welcome message that clients see when they first join
  - Great for onboarding instructions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. BILLING & PAYMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via "Billing" in the sidebar (coach-only)

STRIPE CONNECT SETUP:
  1. Click "Set Up Payments" on the Billing page
  2. You'll be redirected to Stripe to create/connect your account
  3. Once connected, you can start charging clients directly through the app
  4. Payments go to YOUR Stripe account (you own the customer relationship)

CREATING PAYMENT PLANS:
  • Click "Create Plan" on the Billing page
  • Plan types:
    - SUBSCRIPTION: Recurring monthly/weekly payments
    - ONE-TIME: Single payment for a program or package
    - TIERED: Multiple pricing levels with different features
  • Set the price, billing interval, and description
  • Add a feature list (what's included in the plan)
  • Set trial periods (e.g., 7-day free trial)

MANAGING SUBSCRIPTIONS:
  • View all active client subscriptions
  • See payment history and revenue reports
  • Cancel or modify client subscriptions
  • Revenue dashboard shows: total earned, monthly revenue, pending payouts

PROMO CODES & COUPONS:
  • Create discount codes for clients
  • Set percentage or fixed amount discounts
  • Set expiration dates on promos
  • Track which clients used which codes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. CLIENT PROGRESS & CHECK-INS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECK-INS:
  • Clients can submit periodic check-ins with:
    - Current weight
    - Progress photos (front, side, back)
    - How they're feeling / notes
  • You can review all check-ins in the Progress section

PROGRESS TRACKING:
  • Weight history charts
  • Photo comparisons (side-by-side before/after)
  • Adherence tracking (how well they stick to meal plans)
  • Workout volume trends

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. CHALLENGES & ENGAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via "Challenges" in the navigation
• Create group challenges for clients (e.g., "30-day consistency challenge")
• Track client participation and progress
• Great for building community and keeping clients engaged

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. COACH STORIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Similar to Instagram Stories
• Post photos/updates that all your clients see
• Appears at the top of the app for clients
• Great for daily motivation, tips, announcements
• Stories are temporary/ephemeral content

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. SETTINGS & PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Access via "Settings" in the navigation
• Update your profile information (name, photo, bio)
• Change password
• Toggle dark/light theme
• Manage notification preferences
• View your coach invite link/code for new clients
• Unit preferences (metric/imperial)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. RECIPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Browse and search healthy recipes
• Each recipe includes:
  - Ingredients with amounts
  - Step-by-step instructions
  - Full macro breakdown (calories, protein, carbs, fat)
  - Serving sizes
• Clients can add recipe items directly to their food diary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
15. MOBILE APP & PWA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The app works as a Progressive Web App (PWA) — clients can add it to their home screen
• Native iOS and Android apps are available via Capacitor
• All features work on both mobile and desktop
• The app is designed mobile-first with touch-friendly interfaces
• Offline support: recently viewed data is cached for offline access

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
16. TIPS & BEST PRACTICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• CHECK THE FEED DAILY — React to meals to keep clients motivated
• USE BULK MESSAGING for weekly check-in reminders
• SET UP BRANDING before onboarding clients — first impressions matter
• USE MODULE VISIBILITY to simplify the app for new clients (start with just Diary + Messages, add more later)
• CREATE TEMPLATE MEAL PLANS that you can duplicate and customize for new clients
• SET UP BILLING EARLY so the payment flow is ready when clients sign up
• USE AI MEAL PLAN GENERATION as a starting point, then customize to each client's needs
• ENCOURAGE PHOTO LOGGING — the AI food analysis makes it super fast for clients

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
17. COMMON TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Q: "My client can't see [feature]"
A: Check Branding → Module Visibility. The module might be toggled off.

Q: "Client's macros seem wrong"
A: Check their profile settings — calorie/macro goals might need updating. Go to their profile and verify the targets.

Q: "Messages aren't sending"
A: Check your internet connection. The app will retry automatically. If persistent, try refreshing the page.

Q: "I can't find a client"
A: They might be archived. Check your archived clients list and restore if needed.

Q: "Payment isn't working"
A: Verify your Stripe Connect account is fully set up on the Billing page. Both onboarding steps must be complete.

Q: "AI meal plan looks wrong"
A: Regenerate the plan with more specific instructions. You can also edit individual meals after generation.

Q: "Client can't log in"
A: Have them check their email for the signup confirmation. They can also use "Forgot Password" on the login page.

Q: "How do I remove a client?"
A: Archive them from your client list. This hides them but preserves their data in case they return.

Q: "How do I change a client's goals/macros?"
A: Go to the client's profile → edit their calorie and macro targets. If "can_edit_goals" is on, clients can also change their own.

Q: "The app looks different for my client"
A: Check your Branding settings. Colors, fonts, and module visibility all affect what clients see.
`;

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
    // Verify auth
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Verify the user is a coach
    const { data: coachData } = await supabase
      .from('coaches')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!coachData) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Only coaches can use the support assistant' })
      };
    }

    const { message, conversationHistory } = JSON.parse(event.body || '{}');

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    // If no API key, use smart fallback
    if (!ANTHROPIC_API_KEY) {
      const reply = getFallbackResponse(message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply })
      };
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Build messages array with conversation history
    const messages = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Include last 10 messages for context (keep token usage reasonable)
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    }
    messages.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `${PLATFORM_KNOWLEDGE_BASE}

RESPONSE GUIDELINES:
- Be helpful, friendly, and concise
- Answer in 2-4 short paragraphs max
- Use bullet points for step-by-step instructions
- If the question is about a specific feature, give the exact navigation path (e.g., "Go to Branding → Module Visibility")
- If you're not sure about something, say so honestly rather than making up information
- You're talking to a fitness/nutrition COACH who uses this platform to manage clients
- Don't use markdown headers or overly formatted responses — keep it conversational
- If the coach asks something unrelated to the platform, gently redirect them to platform-related questions
- Be encouraging — coaches are busy and you're here to save them time`,
      messages
    });

    const reply = response.content[0]?.text || "I'm sorry, I couldn't generate a response. Please try again.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };

  } catch (error) {
    console.error('Trainer Support Chat error:', error);

    // Fallback on any error
    try {
      const { message } = JSON.parse(event.body || '{}');
      const reply = getFallbackResponse(message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply })
      };
    } catch {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Internal server error' })
      };
    }
  }
};

// ─── Smart Fallback ─────────────────────────────────────────────────────────
// When the AI API is unavailable, match keywords to provide helpful answers.
function getFallbackResponse(message) {
  const msg = (message || '').toLowerCase();

  if (msg.includes('add') && msg.includes('client')) {
    return "To add a client, go to Settings and find your unique invite link/coach code. Share it with your client — when they sign up using your link, they'll automatically appear in your client list.";
  }
  if (msg.includes('meal plan') || msg.includes('create plan')) {
    return "To create a meal plan, go to the Plans tab and click 'Create New Plan'. You can generate one with AI (just enter targets and preferences) or build one manually. Once created, assign it to clients from the plan detail page.";
  }
  if (msg.includes('workout') && (msg.includes('create') || msg.includes('build') || msg.includes('make'))) {
    return "To create a workout, go to Workouts → Create Workout (or Workout Builder). You can pick exercises from the 1500+ exercise library, set sets/reps/weight, and add notes. You can also use AI to generate a workout — just describe what you want.";
  }
  if (msg.includes('brand') || msg.includes('logo') || msg.includes('color') || msg.includes('white label')) {
    return "To customize your branding, go to the Branding page (in the sidebar). You can change colors, upload your logo and favicon, set a custom app name, choose fonts, pick button styles, and control which modules your clients can see.";
  }
  if (msg.includes('billing') || msg.includes('payment') || msg.includes('stripe') || msg.includes('charge') || msg.includes('subscription')) {
    return "To set up payments, go to the Billing page and connect your Stripe account. Once connected, you can create payment plans (subscriptions, one-time, or tiered), set trial periods, create promo codes, and manage client subscriptions — all from the Billing page.";
  }
  if (msg.includes('message') || msg.includes('chat') || msg.includes('bulk')) {
    return "To message clients, go to the Messages tab and select a conversation. You can send text, photos, and videos (up to 250MB). For bulk messaging, use the bulk message icon to send the same message to multiple clients at once.";
  }
  if (msg.includes('feed') || msg.includes('activity')) {
    return "The Client Feed shows all your clients' meal logs in real-time. You can react with emojis (👏 💪 🔥 ⭐ ❤️) and leave comments. Access it from the Feed tab in the sidebar. Use it daily to keep clients engaged!";
  }
  if (msg.includes('module') || msg.includes('hide') || msg.includes('visibility') || msg.includes('toggle')) {
    return "To control which features your clients see, go to Branding → Module Visibility. Toggle modules on/off: Diary, Plans, Workouts, Messages, Recipes, Check-in, Progress. Hidden modules are completely invisible to clients.";
  }
  if (msg.includes('archive') || msg.includes('remove') && msg.includes('client')) {
    return "To archive a client, find them in your client list and use the archive option. Archived clients are hidden from your active list but their data is preserved. You can restore them anytime.";
  }
  if (msg.includes('macro') || msg.includes('calorie') || msg.includes('goal') || msg.includes('target')) {
    return "To update a client's goals, go to their profile and edit their calorie and macro targets (protein, carbs, fat). If 'can_edit_goals' is enabled, clients can also adjust their own targets.";
  }
  if (msg.includes('dark') || msg.includes('theme') || msg.includes('light mode')) {
    return "To toggle between dark and light mode, go to Settings and use the theme toggle. Each user (coach and client) can set their own theme preference.";
  }
  if (msg.includes('recipe')) {
    return "The Recipes section lets clients browse healthy recipes with full macro breakdowns. Each recipe has ingredients, instructions, and nutrition info. Clients can add recipe items directly to their food diary.";
  }
  if (msg.includes('check-in') || msg.includes('checkin') || msg.includes('progress photo')) {
    return "Clients can submit check-ins with their current weight, progress photos (front, side, back), and notes. Review check-ins in the Progress section to track their journey with photo comparisons and weight history charts.";
  }
  if (msg.includes('story') || msg.includes('stories')) {
    return "Coach Stories work like Instagram Stories — post photos and updates that all your clients see at the top of the app. Great for daily motivation, tips, or announcements. Stories are ephemeral content.";
  }
  if (msg.includes('challenge')) {
    return "Create group challenges from the Challenges section to boost engagement (e.g., '30-day consistency challenge'). Track client participation and progress. Challenges are great for building community among your clients.";
  }
  if (msg.includes('photo') && msg.includes('food')) {
    return "Clients can log food by snapping a photo — the AI analyzes the image and estimates calories and macros automatically. It's the fastest way for clients to log meals. They can also search by text, scan barcodes, or use favorites.";
  }
  if (msg.includes('invite') || msg.includes('link') || msg.includes('code') || msg.includes('signup') || msg.includes('sign up')) {
    return "Your unique invite link and coach code are in Settings. Share the link with new clients — when they sign up through it, they're automatically connected to your account. You can also have clients enter your code during registration.";
  }
  if (msg.includes('notification')) {
    return "Notifications appear via the bell icon in the top navigation bar. You'll get notified when clients send messages, complete check-ins, or perform other actions. Manage notification preferences in Settings.";
  }
  if (msg.includes('help') || msg.includes('what can') || msg.includes('how do')) {
    return "I can help you with anything on the platform! Ask me about: adding clients, creating meal plans, building workouts, branding & white-labeling, billing & payments, messaging, the activity feed, module visibility, check-ins, recipes, challenges, stories, and more. What would you like to know?";
  }

  // Default
  return "I'm your platform support assistant! I can help you with:\n\n• Adding & managing clients\n• Creating meal plans & workouts\n• Branding & white-labeling\n• Billing & payments (Stripe)\n• Messaging & bulk messaging\n• Client activity feed\n• Module visibility settings\n• Check-ins & progress tracking\n• And much more!\n\nWhat would you like help with?";
}
