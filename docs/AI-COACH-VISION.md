# AI Coach Vision — Hundreds of Ideas

> Written overnight against branch `claude/ai-coaching-enhancements-04nOu`.
> Goal: ship the platform that makes Zique the #1 fitness coaching software.
> Theme: AI is the **manager**; the coach is the **boss**.

This document is a deliberately oversized brain-dump. Not everything here
should be built — but every entry represents a real lever for making the
coach's life smaller, more profitable, and more effective. Use it to pick
your next quarter, not to schedule a sprint.

Feature numbering is for reference only — order does not imply priority.

---

## 0. What just shipped tonight (companion to this doc)

These are the working changes on this branch — not just ideas:

- **AI Coach Command Center** (`coach-command-center.html`) — single-screen
  morning triage anchored by an AI-written "today's briefing", priorities,
  plateau list, wins, and notification-health widget.
- **AI Daily Briefing** (`netlify/functions/ai-daily-briefing.js`) — Claude
  Sonnet writes a 1-line headline, 1-2 sentence summary, and 1-2 sentence
  coach advice each morning. Cached per coach per day.
- **AI Plateau Detector** (`netlify/functions/ai-plateau-detector.js`) —
  scans every active client for strength/weight/adherence stagnation and
  asks Claude for a specific recommendation + ready-to-send draft message.
- **AI Message Drafter** (`netlify/functions/ai-message-drafter.js`) — for
  any client, generates 3 review-and-send drafts (check-in, nudge, recap)
  grounded in the client's last 14 days of real activity.
- **AI Workout Variation** (`netlify/functions/ai-workout-variation.js`) —
  takes any workout JSON and returns easier / harder / equipment-swap
  variations preserving the existing workout schema.
- **Notification Health Monitor** (`netlify/functions/notification-health.js`)
  — answers "did my notifications go through?" with hard data; tracks stale
  alerts and supports a real delivery-confirmation receipt channel.
- **Cmd+K Quick Client Switcher** (`js/client-switcher.js`) — auto-loaded on
  every coach page; fuzzy search by name/email; verb prefixes ("msg fern",
  "stats john") jump straight to the right page.
- **Sidebar nav injection** — coach-layout.js now adds a "Command Center"
  sidebar item to all 13 coach pages without per-page edits.
- **Master Account Protector** (`js/master-account-protector.js` +
  `netlify/functions/master-account-guard.js`) — for
  `contact@ziquefitness.com`, blocks destructive UI clicks, audits every
  attempt, mounts a "Master · Protected" badge, and fires a once-per-day
  server-side snapshot of all critical data. Backed by a permanent
  `master_account_audit` table that the application cannot delete from.
- **Migration**
  (`supabase-migrations/add-ai-coaching-enhancements.sql`) creates 6 new
  tables: `coach_daily_briefings`, `notification_delivery_log`,
  `master_account_audit`, `coach_command_center_pins`, `ai_message_drafts`,
  `ai_plateau_acknowledgements`. All RLS-enabled.

The rest of this doc is the menu for what to build next.

---

## 1. AI Coach Command Center & Triage

1. **AI weekly priorities digest** — Sunday-night email with the top 5
   things to handle Monday morning. Generated, not curated.
2. **"What changed since last login" feed** — when a coach logs in, show
   only diffs since their last session. Reduces overwhelm.
3. **Coach attention budget** — track total minutes the coach spends per
   client in-app per week and warn when one client is consuming >25% of
   total bandwidth.
4. **Burnout detector for the coach** — based on response latency and
   late-night activity, suggest a forced day off.
5. **Client-of-the-day spotlight** — AI picks one client to over-deliver
   for today (PR coming, struggling silently, etc.).
6. **Reply-by-time SLA** — set per-tier message reply targets and track
   adherence on the coach's behalf.
7. **Drag-to-snooze priorities** — swipe a card to snooze 1d/1w on the
   command center.
8. **Pin to top** — wired via `coach_command_center_pins`; surface
   pinned items above AI-ranked priorities.
9. **Smart batch actions** — "send a check-in to everyone whose adherence
   dipped under 70% this week" with one confirmation.
10. **Calendar overlay** — drop the command center over a 7-day calendar
    so the coach sees who is due for what.
11. **Tag clients** (`needs-cardio`, `prefers-mornings`) — AI suggests
    tags from past behavior, coach approves.
12. **Saved views** — coach saves a filter ("Last week's check-in left
    unanswered + adherence <70%") and one click reproduces it.
13. **Cross-client patterns panel** — "5 of your clients hit a plateau on
    bench this month — consider a programming change."
14. **Inactivity heatmap** — single calendar view across all clients
    showing inactivity streaks.
15. **One-click "back from holiday" mode** — generates the catch-up
    queue: who needs response, who needs a new program, who hit PRs.
16. **AI auto-archive suggestions** — flag clients who quietly stopped
    using the app (3 weeks no activity, no payments).
17. **Daily focus banner** — "Today: 3 priorities, 2 wins, 1 plateau."
18. **AM / PM snapshot diff** — show what flipped between morning and
    afternoon scans (great for quick re-check before bed).
19. **Coach handoff mode** — generate a complete client briefing PDF when
    handing a client to another coach.
20. **Voice command "Brief me"** — extends the existing voice commander
    to read the daily briefing aloud while driving.

## 2. Workout Programming

21. **AI-from-template** — pick a template, name a client, click Apply,
    AI personalizes (volume, equipment, restrictions) automatically.
22. **Variation library on every workout** — already shipped easier /
    harder / equipment-swap; surface them inline in the builder.
23. **Plateau-aware swap suggestions** — when the plateau detector flags
    bench, the workout builder pre-loads 3 swap candidates next time the
    coach opens that day.
24. **Hotel/travel workout button** — generates a no-equipment version
    of any program day for travel weeks.
25. **Period of injury mode** — coach toggles "left shoulder 4 weeks";
    AI suppresses contraindicated exercises and substitutes pain-free
    patterns.
26. **Exercise effectiveness scoring** — AI annotates each exercise with
    why it's there (movement pattern, target muscle, alternative) so the
    coach can teach as they program.
27. **Volume balance audit** — given a program, show push/pull, knee/hip,
    isolation/compound balance and warn on imbalances.
28. **Progressive overload auto-suggest** — based on last session's logs,
    pre-fill next session's reps/weight in the builder.
29. **Deload week scheduler** — AI suggests where to drop in deloads
    based on volume curves.
30. **Program drift detector** — across 4+ weeks, alert when program
    actually executed differs from program prescribed.
31. **"Fix this exercise" cue generator** — paste a video link, get
    bullet-point coaching cues to send the client.
32. **Form-check video review (async)** — client uploads a set, AI
    annotates joint angles and tempo; coach reviews and signs off.
33. **Rep-cadence checker** — listen to a barbell session via mic, count
    reps, flag fast eccentrics.
34. **Music-tempo BPM matcher** — generate Spotify playlists matched to
    target rep tempo per exercise.
35. **Workout timer with rest skip detection** — AI detects when the
    client skipped rest based on accelerometer/timing, asks why.
36. **Group-class generator** — for in-person trainers, generate a
    same-equipment workout that fits N clients of varying levels.
37. **Equipment-aware home transition** — when a client switches gyms,
    AI rebuilds the program around the new equipment list in 30 seconds.
38. **Strength curve plotter** — auto-plot 1RM trend per lift, surface in
    client profile.
39. **Volume-based fatigue meter** — running 7-day volume vs. baseline
    per movement pattern; warn if 30%+ jump.
40. **Mesocycle planner** — drag-and-drop 12-week macro view; AI fills in
    weekly variations.
41. **Smart warm-up generator** — pre-pends sport- and movement-specific
    warm-ups based on the day's main lifts.
42. **Auto cool-down generator** — same idea, ending with the right
    static stretches per session.
43. **"Why this rep range?" educator** — taps an exercise and shows the
    rationale to send to the client.
44. **PR prediction** — based on RPE trend, predict when each client is
    likely to hit a PR; pre-stage the celebration.
45. **Exercise rotation reminder** — 6+ weeks on same lift triggers a
    "consider a variant" prompt.
46. **Library import from PDF** — drop a PDF program (very common in
    industry) and AI converts it to the platform's workout JSON.
47. **YouTube → exercise library** — paste a YouTube URL, AI extracts
    name, demo, and adds it to the exercise table.
48. **Coach exercise notes templates** — common cues per exercise that
    auto-attach to any program using that exercise.
49. **Auto-difficulty per client** — apply the same template to 5
    clients and AI tunes intensity/volume per client's history.
50. **"Make this beginner-friendly"** — one-click modifier that
    regresses every exercise in a program.
51. **Bench-press personality** — recognize when a client thrives on
    higher reps vs. lower reps; bias future programming.
52. **Travel-week mode** — flip a client to a 3-day no-equipment
    program for the dates they're away; auto-revert on return.
53. **Compete-prep tracker** — countdown to comp day; AI surfaces
    peaking checklist tailored to bodybuilding/powerlifting/CrossFit.

## 3. Meal Planning, Recipes & Nutrition

54. **Photo-to-recipe** — client photos a homemade meal and the AI
    generates a recipe entry both can share.
55. **Recipe variation engine** — every recipe gets 3 macro-variants
    (higher protein, lower carb, vegan) generated on demand.
56. **Pantry-aware meal plan** — client logs what they bought; AI builds
    the week from those ingredients.
57. **Macro deficit/surplus auto-adjust** — when client weight is
    plateauing in a deficit, AI suggests the +/- 150 kcal change.
58. **Diet-style detector** — read the client's diet entries and label
    their actual eating pattern (Mediterranean / IIFYM / mostly takeout).
59. **AI grocery list** — every Sunday, generate a per-client grocery
    list from the upcoming week's meals.
60. **Local-grocery price-aware** — pull avg local prices and tag the
    cheapest substitutions.
61. **Restaurant macro estimator** — paste a menu URL or photo of menu;
    rank options by goal-fit.
62. **Eating-out check-in** — single button "I'm at a restaurant"
    surfaces 5 macro-friendly orderable options.
63. **Mood-and-meal log** — after each meal, single tap mood; surface
    correlations to coach.
64. **Sleep-and-meal correlation** — show how late eating impacts the
    client's sleep score.
65. **Hydration nudges with weather context** — hot day → bigger
    reminder with adjusted target.
66. **AI meal swap from any meal** — "I don't like salmon" → swaps to
    same-macro alternative inline.
67. **Recipe library auto-fill** — when the recipe library is sparse,
    AI proactively generates 30 recipes per coach to bootstrap it.
68. **Recipe community pool** — coaches share recipes (opt-in), AI
    ranks them by coach success metrics.
69. **Allergy-safe meal generator** — never proposes nuts when allergy
    is set; visible "safe-for-X" badge.
70. **Diet preference memory** — over time AI learns this client hates
    cilantro and avoids it without being told again.
71. **Macro-budget for the week** — show the client a flexible "macro
    budget" remaining for the week, like a checking account.
72. **Calorie creep detector** — small nightly snacks that add up to a
    blown deficit get flagged with the actual culprits.
73. **Water + caffeine integration** — pulls from Apple Health / Fitbit
    where available.
74. **Pre/post workout meal templates** — auto-suggest based on the
    next workout's intensity and time of day.
75. **Refeed scheduler** — based on dieting fatigue signals, schedule
    a refeed day automatically.
76. **Menstrual-cycle aware nutrition** — for clients who opt in,
    adjust calorie targets across cycle phases.
77. **Travel-day meal plan** — airport-friendly options, hotel-room
    options, generated for the dates a client is travelling.
78. **Voice food logging** — already partly there with voice-to-text;
    extend to full natural language ("two eggs, half avocado, coffee").
79. **AI calorie-label scanner improvements** — confidence score and
    "low-confidence — confirm?" UX.
80. **Cooking time filter** — "I have 15 minutes" → only recipes
    matching the time budget surface.
81. **Skill-level filter** — beginner cooks see only 5-step recipes.
82. **Meal-plan adherence streaks** — gamified streaks (with a forgive-a-
    day token) to beat current adherence drop-offs.
83. **Photo lookalike** — when a client's photo doesn't match a known
    food, AI says "this looks like X — confirm?" instead of guessing.
84. **AI shopping list dedupe** — 3 recipes use chickpeas → one entry.
85. **Smart leftovers** — recipe planner reuses today's leftovers in
    tomorrow's lunch.
86. **Macros visualised as plate** — show the daily plate as a
    composition visual instead of bar charts.
87. **AI portion calibration** — guidance using common references
    (palm = 4oz protein) per client's hand size if photo is given.

## 4. Messaging & Engagement

88. **Auto-draft replies in the inbox** — every unread message arrives
    pre-drafted; coach edits and sends.
89. **Tone slider** — friendly / firm / celebratory; same draft, three
    knobs.
90. **Thread summarisation** — long client conversation? AI summarises
    in 3 bullets at the top of the thread.
91. **Sentiment dashboard** — see which clients are trending negative
    in messages; reach out before they churn.
92. **AI follow-up reminders** — coach replies "let's talk Sunday"; AI
    sets the reminder.
93. **Message templates with merge tags** — "Hey {first}, your {streak}
    streak is wild" with auto-fill.
94. **Translation** — bilingual coaches/clients get auto-translated
    messages with original visible.
95. **Voice-note transcription** — already exists for clients; surface
    AI-tagged "key moments" so the coach can scan a 4-minute voice
    note in 10 seconds.
96. **Drafted bulk announcement** — paste a topic, AI writes the post,
    coach reviews and broadcasts.
97. **AI-generated check-in form per client** — different clients get
    different questions based on their profile.
98. **Client-initiated check-ins** — client taps "I want to check in"
    and AI guides a structured 90-second mobile flow.
99. **Auto-celebrate** — PR detected → AI auto-drafts congrats with
    photo overlay; coach approves and sends.
100. **Empathy amplifier** — when client mentions a hard week, AI
     drafts an empathetic reply rather than a coaching one.
101. **No-judgement nudges** — replace generic guilt nudges with
     specific, friendly prompts (already partly built into drafter).
102. **Smart digest of unread** — instead of 18 alerts, surface "Sarah
     missed 3 workouts; Mark wants a new plan; Lisa hit 2 PRs."
103. **AI question router** — "should I message you or wait for our
     check-in?" predictor for the client.
104. **Conversation tags** — auto-tag threads as billing, programming,
     mindset, life-event so the coach can switch contexts.
105. **Client wellness pulse** — daily 1-tap mood (3 emoji); 30-day
     trend visible to coach.
106. **Re-engagement campaign** — for inactive clients, AI runs a 7-day
     gentle re-engagement sequence; coach approves the first message.
107. **Coach "vacation mode"** — auto-reply "I'm off Aug 1–8" and
     queues messages for return.
108. **Client journaling prompt of the day** — short reflection prompt
     in the client app; coach sees responses.
109. **Birthday and milestone messages** — auto-draft celebrations on
     anniversaries (joined Zique 1y ago today).
110. **Shared note pad per client** — a coach-only Markdown notebook
     that AI writes the first draft of after each check-in.

## 5. Adherence & Behavior

111. **Adherence model per client** — predict tomorrow's adherence;
     pre-emptively suggest a smaller workout if probability is low.
112. **Habit stack suggestions** — AI proposes "log breakfast right
     after coffee" tied to existing client habits.
113. **Deferred check-in** — client taps "skip today" and the system
     follows up with a 2-question micro-check-in tomorrow.
114. **Streak rescue tokens** — earn 1 forgive-a-day per 14 days of
     adherence; AI auto-applies them.
115. **Smart goal renegotiation** — when a goal is impossible given
     the data, AI proactively suggests a softer target the coach can
     approve.
116. **Habit-of-the-week** — coach picks one habit; AI tracks daily
     compliance with no extra logging.
117. **Pre-workout 60-second prep flow** — water, snack, mobility tip
     based on the workout coming up.
118. **Post-workout 60-second debrief** — RPE, sleep last night, energy,
     pain — fast tap UX.
119. **Reasons for skipping** — instead of guilt, ask why (busy /
     injured / unmotivated). Pattern-find and surface.
120. **Adherence buddy** — opt-in, pair two clients (privacy-respecting)
     for accountability.
121. **Negative spiral interrupt** — 3 missed workouts in a row → AI
     drafts a 2-line message that breaks the spiral.
122. **Mood-energy heat map** — per client, visualise across weeks.
123. **Sleep linkage** — Apple Health/Fitbit pull; show how sleep
     correlates with workout completion.
124. **Stress event tagging** — quick "I'm stressed today" button; AI
     adapts the workout intensity automatically.
125. **Mindfulness pause** — under 3-minute on-demand session before a
     hard workout if stress is high.
126. **Streak reset rituals** — when a streak breaks, AI offers a "reset
     ritual" to make the next day frictionless.
127. **AI accountability witness** — opt-in voice check-in at 7am that
     just asks "what's your one move today?"
128. **Compliance "tax"** — opt-in: the client donates $1 to a charity
     of their choice each missed day.
129. **Behavioral prescription library** — small interventions
     (pre-meal water, lay clothes out night before) AI-prescribed in
     response to specific signals.

## 6. Revenue & Business

130. **Churn risk score** — per client, weekly. Surface red clients
     before they cancel.
131. **Auto-generated upsell prompts** — client crushed last 8 weeks?
     AI drafts a "ready for the elite tier?" message.
132. **Stripe insight panel** — net new revenue, churned $, MRR delta
     this month, computed from existing Stripe data.
133. **Promo code A/B** — recommends discount levels with predicted
     conversion lift based on past coupon redemptions.
134. **Trial-to-paid optimizer** — AI watches new trial behavior and
     suggests the right moment to send the upgrade message.
135. **Refund risk scoring** — surface refund-risk clients post-charge.
136. **Repeat-customer winback** — past clients re-engagement campaigns
     with personalized "what changed since you left" message.
137. **Revenue-per-hour metric** — total revenue / total time logged
     in the app per coach. Brutal honesty, with celebrations.
138. **Pricing audit** — AI compares the coach's pricing to market and
     suggests adjustments quarterly.
139. **Package builder** — coach types desired outcome and budget; AI
     proposes a 3-tier package structure with margin math.
140. **Client lifetime value** — current CLV per cohort with the
     drivers (referrals, retention, upsell).
141. **Tax-time export** — one click "give my accountant the year".
142. **Cash-flow forecast** — based on subscriptions, predicted
     monthly cash-in for the next 90 days.
143. **Refer-a-friend ladder** — clients earn levels of perks for
     referrals; coach sees pipeline.
144. **Affiliate program** — coaches refer coaches; revenue share auto-
     tracked.
145. **Stripe Connect onboarding nudges** — AI knows where each coach
     is in onboarding and prompts the right next step.
146. **Subscription pause vs. cancel** — present pause as the default
     when client clicks cancel.
147. **AI "save offer" generator** — when a client clicks cancel, AI
     drafts a personalized save offer and asks coach to approve.
148. **Churn root-cause survey** — 1 question on cancel. AI clusters
     reasons across cohort.
149. **Pricing experiments** — built-in A/B for landing page price.
150. **Coach scorecard** — internal benchmark: avg adherence, avg
     retention, NPS. Improves transparency.

## 7. Marketing & Client Acquisition

151. **Content calendar generator** — AI builds a weekly social plan
     pulled from client wins, recipes, before/afters.
152. **Auto-blurred before/after generator** — client opts in once;
     system auto-creates an Instagram-ready visual after each major
     milestone.
153. **Hashtag research** — AI tells the coach which hashtags work in
     their niche this week.
154. **Reels script writer** — script + caption + hook + CTA for each
     content idea.
155. **Voice clone for narration** — coach records 60 seconds; AI
     narrates short clips in their voice for content.
156. **Lead-magnet generator** — AI builds a polished "5-day kickstart"
     PDF from the coach's existing programs.
157. **Quiz funnel** — typeform-style intake quiz that scores leads
     and recommends a tier.
158. **Social proof library** — AI extracts wins from check-ins (with
     consent) into shareable testimonials.
159. **AI cold-email composer** — small ethical prospecting tool, built
     around personalization not blast.
160. **Local SEO assist** — generate location-targeted blog posts for
     in-person coaches.
161. **DM auto-responder** — Instagram DM "interested" → AI responds
     with calendar link. Routed back to coach for sensitive intent.
162. **Competition radar** — surface what other coaches in the same
     niche are posting weekly. Inspiration, not copying.
163. **Press-kit generator** — one-page coach brief with stats and
     credentials, generated automatically.
164. **Brand voice profile** — the coach uploads 5 examples; AI keeps
     all generated copy in their voice.
165. **AI 30-day content sprint** — month of daily posts pre-drafted in
     1 click; coach approves with edits.
166. **Story idea engine** — daily one-line story prompt grounded in
     today's data.
167. **Carousel post builder** — generate 5-slide IG carousels from a
     blog post or topic.
168. **Webinar prep** — given a topic, AI builds outline, slides, and
     a Q&A practice deck.
169. **Email newsletter generator** — weekly newsletter from this
     week's recipes, wins, and coach notes.
170. **Lead-source tracking** — UTM-aware signups; AI tells the coach
     which channel is converting.

## 8. Coach Education & Confidence

171. **"Why I made this recommendation"** — every AI suggestion ships
     with a 2-sentence rationale, so the coach learns and stays in
     control.
172. **Coach-of-the-month best practices** — anonymized aggregate
     learnings from top performers.
173. **Inline study cards** — exercises link to short coaching tips.
174. **Cert tracking** — coaches log their certifications; AI nudges
     CEU renewals.
175. **Ask-the-AI mentor** — coach types "client says they hate cardio
     — what's a good response?" → AI mentor answer.
176. **Common-mistake detector** — AI watches the coach's own
     programming and gently flags bad habits over time.
177. **Sport-specific knowledge packs** — opt in to hypertrophy /
     powerlifting / endurance / general — AI tunes its suggestions.
178. **Coach growth report** — monthly: response time, adherence,
     retention, vs. coach's own past months.
179. **Client-friendly explainers** — AI translates jargon ("RPE 8",
     "AMRAP") into plain language for the client.
180. **Reading list per topic** — AI curates 3 evidence-based reads
     (peer-reviewed where possible) per coaching question asked.
181. **Annotated workout videos** — coach uploads a demo; AI suggests
     2-3 cue overlays.
182. **In-app code-of-conduct nudges** — flag off-brand or
     potentially-harmful messages before they're sent.
183. **Live A/B for client comms** — try two phrasings; AI tells you
     which one drove better adherence.
184. **Library of coach scripts** — annotated examples of the highest-
     performing messages on the platform.

## 9. Form Check, Video, Vision

185. **Async form review** — client uploads a 30-sec set; AI segments
     the rep, measures depth/bar path, surfaces 3 cues for the coach.
186. **Live form check (mobile)** — record-while-doing, AI highlights
     joints in real time.
187. **Bar speed tracker** — using the phone's accelerometer / video,
     compute bar speed per rep.
188. **Posture analyzer** — daily 30-sec posture photo; trend lines.
189. **Side-by-side comparison** — week 1 vs. week 12 squat overlay
     auto-generated.
190. **Body composition from photo** — opt-in body-fat estimate from
     photos (with privacy-first storage).
191. **Squat depth scorer** — strict / parallel / above-parallel rep
     classification.
192. **Bench arch measurement** — set up rep, AI measures arch and
     gives technique cues.
193. **Cardio gait analysis** — running form analysis from a 10-sec
     video. Cadence, ground contact, landing.
194. **Movement quality screen** — FMS-style 7-test screen done from
     phone; AI scores; surfaces to coach.

## 10. Plateau Handling (deeper)

195. **Multi-signal plateau** — combine strength + body weight + sleep
     + mood; only fire when 2+ aligned signals.
196. **Plateau-acknowledgment workflow** — coach can resolve / snooze
     / dismiss; backed by `ai_plateau_acknowledgements` table shipped
     tonight.
197. **Plateau cohort comparison** — "of clients on this program in
     week 8, 60% plateau on bench" — surface programmatic risks.
198. **AI plateau questionnaire** — when a plateau is detected, AI
     drafts 3 questions for the client to find the cause (sleep,
     stress, undereating).
199. **Programmed deload trigger** — auto-draft a deload week when a
     plateau lasts 3+ weeks.
200. **Cross-lift transfer** — plateau on bench → suggest accessories
     that historically have unstuck this lift.

## 11. Notifications, Reliability & Trust

201. **Push delivery confirmations** — already wired via the
     `notification_delivery_log` table; build the SW push handler to
     post deliveries to `notification-health`.
202. **Multi-channel fallback** — if push not confirmed in 30 minutes,
     fall back to email; if email not opened in 24h, fall back to SMS.
203. **Quiet hours per client** — system-wide; AI auto-deduces if
     client never opens 11pm pushes.
204. **Coach delivery audit** — show the coach which clients have
     consistently low delivery rates so they can fix device settings
     together.
205. **Notification batching** — instead of 6 pings, one digest at the
     client's actual peak engagement hour.
206. **Smart push timing** — predict the highest-engagement hour per
     client and send then.
207. **Delivery health page in client app** — shows the client which
     channels are receiving notifications. Empowers them to fix.
208. **PWA→native handoff** — when a client installs the native app,
     auto-route notifications there; cleanly retire PWA push.
209. **Test-fire feature** — coach can fire a "ping" to a specific
     client to confirm the notification chain end-to-end in <15s.
210. **Incident banner** — if delivery drops platform-wide, show
     visible status banner so coaches know to follow up manually.

## 12. Client Mobile Experience

211. **One-tap log** — "I did the workout as written" single tap.
212. **Pre-loaded morning ritual** — water, weight, HRV, mood, all in
     a 30-second flow.
213. **Always-on quick-add** — long-press app icon → "log meal",
     "log weight", "send voice note to coach".
214. **AI rest-day generator** — on rest days the app suggests a
     mobility / walking / breathing flow.
215. **Speech-first food logging** — full-utterance NLP intent parser
     for food entries.
216. **Calendar integration** — workouts auto-block in client's
     calendar with travel-time and gear list.
217. **Wearable integration** — Apple Watch / Fitbit / WHOOP / Garmin.
218. **Apple Watch complication** — next workout / next meal / streak
     on the wrist.
219. **Live-activity** — iOS Live Activity for the active workout
     timer / rest timer.
220. **Widget for client home screen** — today's plan + next action.
221. **Lock-screen reminders** — interactive lock-screen "log it"
     buttons.
222. **Offline mode** — critical flows work without internet; sync on
     reconnect.
223. **Biometric privacy lock** — Face ID lock for client app.
224. **Apple Health write-back** — workouts log into Apple Health
     automatically.
225. **Travel mode** — flight tracker, hotel gym lookup, jet-lag
     workout suggestion.
226. **Habit-stacked reminders** — "after morning coffee, take
     supplements" instead of arbitrary times.
227. **Voice journaling** — 60-second voice journal at end of day; AI
     summarizes for coach.
228. **Mood emoji shortcut** — single tap on home → log a mood.
229. **AR meal portion** — camera overlays a fork-sized reference;
     calibrates portion estimate.
230. **Voice "what should I eat?"** — answers from the client's macro
     budget left.

## 13. Voice & Hands-Free

231. **Extend voice commander** — 50+ new intents (already chained
     commands, add "what's Mark's adherence?", "draft a message to
     Lisa", "open today's plan").
232. **Always-listening trigger word** — opt-in, on-device "Hey
     Zique" activation.
233. **Voice clone library** — coach's own voice for recordings.
234. **Hands-free workout coaching** — voice tells the next exercise
     while client's hands are full of dumbbells.
235. **Voice form-cue** — "stop arching" voice prompt mid-set when AI
     vision detects fault.
236. **Voice-first onboarding for new coaches** — let the AI ask
     questions and fill the profile.
237. **Voice-driven check-in for clients** — full check-in by talking
     for 90 seconds.

## 14. Analytics & Reporting

238. **Per-client report card** — auto monthly PDF for client.
239. **Per-coach report card** — auto monthly internal report.
240. **Cohort retention curves** — clients started Jan vs Apr.
241. **Funnel from intake → first PR** — find drop-off steps.
242. **Per-program ROI** — which templates produce best outcomes.
243. **Goal completion rate** — across all clients ever, by goal type.
244. **Engagement score** — composite per client; trend.
245. **Top exercise effectiveness** — which exercises produce the most
     PRs across the platform.
246. **Macro target hit-rate** — average % of days within target macros
     per client.
247. **Adherence heatmap** — color-coded grid of every client × day.
248. **Weekly business digest email** — auto every Sunday.
249. **Annual review** — Spotify-Wrapped style year-end summary for
     each coach and each client.
250. **Programmatic NPS** — automatic 1-question surveys at
     pre-determined moments.

## 15. Coach Productivity

251. **Daily focus mode** — full-screen card hides everything but
     today's top 3.
252. **Inbox zero workflow** — bulk-archive, snooze, AI-respond all
     visible from one view.
253. **Templates everywhere** — every text input gets a "/template"
     trigger to insert a stored snippet.
254. **Macros (text-expander) for the coach** — type ":pr" and get
     "Massive PR! Tell me how it felt — that grind was real."
255. **Clipboard memory** — recently copied client info available with
     one keystroke.
256. **Multi-cursor edit** — "edit this in 5 programs at once" for
     bulk template tweaks.
257. **AI "what changed?"** — diff view between two versions of a
     program.
258. **Saved searches** — pin filters across the app.
259. **Quick capture** — global hotkey to write a note about a client
     without leaving the current screen.
260. **Command palette parity** — every menu item callable from Cmd+K.
261. **Keyboard shortcuts everywhere** — `g + d` dashboard, `g + c`
     clients, `g + m` messages — discoverable on `?`.
262. **Bulk client import** — CSV → coach roster with column mapping.
263. **Scheduled export** — weekly auto-export of progress photos to
     Google Drive.
264. **Calendly-style scheduler** — built-in for in-person trainers.
265. **Mobile coach mode** — tablet-optimised side-by-side coaching
     view (client list + active session).
266. **Client search ranking** — recently-active clients first by
     default; surfaces who you most likely want.
267. **"Last touched" indicator** — when did I last engage with this
     client (any channel).
268. **Reminder me about X** — natural language reminders for the
     coach; AI parses time and content.
269. **Read-it-later** — flag a client thread to review on Sunday.
270. **AI "5 things to do today"** — prescriptive daily list, not just
     descriptive.

## 16. Multi-Coach / Team Features

271. **Coach-of-coaches view** — head trainer sees junior coaches'
     dashboards.
272. **Roster permissions** — granular: read-only, message-only, full.
273. **Internal coach chat** — Slack-style channel scoped to the
     business.
274. **Shared template library** — team-level workouts and recipes.
275. **Brand-level analytics** — aggregate across all coaches in the
     gym.
276. **Coach handoff workflow** — transfer a client between coaches
     with zero data loss; full audit trail.
277. **Onboarding playbook for new coaches** — checklist + AI nudges.
278. **Team performance tournament** — friendly internal comp on
     adherence/retention metrics.
279. **Multi-tenant white-label** — full white-label for franchise
     gyms, including iOS/Android wrappers.
280. **Per-tenant billing** — gym pays once, coaches sub-licensed.

## 17. Master Coach Account & Data Sovereignty

281. **Daily snapshot** — already wired tonight; daily JSON archive of
     all critical tables.
282. **Off-platform export** — coach can export their entire dataset
     (CSV + JSON + photos) at any time.
283. **Two-person rule** — destructive actions on master account
     require a second admin's confirmation in-app.
284. **Audit log viewer** — UI for `master_account_audit` accessible
     only to the master account.
285. **Read-only mode** — flip a toggle to make the entire master
     account read-only for the day.
286. **Tamper-evident hash chain** — each audit row includes a hash of
     the prior, so deletion is detectable.
287. **Snapshot to S3** — encrypted backup to user-owned S3 bucket.
288. **Encrypted at rest with user key** — opt-in, master coach
     supplies encryption key.
289. **Data residency** — region-pinned data option.
290. **Data retention policy controls** — explicit per-table retention
     configurable per coach.

## 18. Pro Coach Compliance & Safety

291. **Health-history red flags** — AI scans intake forms for
     contraindications and warns coach before assigning.
292. **Injury-aware programming** — never re-introduces the
     contraindicated exercise after an injury is logged.
293. **Eating-disorder warning signs** — AI flags concerning patterns
     and recommends professional referral resources to the coach
     (always with sensitivity).
294. **Pregnancy-mode safety** — programs auto-modify when client
     marks pregnant; flagged for explicit coach review.
295. **Allergy interaction matrix** — supplement recommendations
     cross-checked against allergies.
296. **Liability waiver tracking** — signed waiver per client visible.
297. **Mandatory rest enforcement** — block 7-day-no-rest programs
     unless coach confirms.
298. **Dehydration warning** — sustained low water intake → coach
     alert.
299. **Heart-rate red flags** — wearable HR anomalies → alert with
     "advise medical attention" cue.
300. **Privacy controls** — per-data-type sharing toggles for the
     client.

## 19. Client Fun, Community & Social

301. **Friendly leaderboards** — opt-in, scoped to a coach's clients.
302. **Challenges 2.0** — weekly micro-challenges generated per
     cohort.
303. **PR celebrations** — auto-generated share cards (already
     foundationed in workout-cover-image work).
304. **Anniversaries** — 30/90/365 day milestone messages.
305. **Group classes via video** — Zoom-like live group session.
306. **Workout buddies** — opt-in pairing for accountability.
307. **Public profile** — clients opt-in show streak, total weight
     lifted, etc., on a brag-worthy page.
308. **Confetti** — bigger celebrations for big PRs (already in spirit
     in v1).

## 20. Onboarding & New-Client Magic

309. **AI intake summarizer** — coach gets a 1-paragraph synthesis
     of every new intake, not 40 fields.
310. **Auto-prepared first program** — by the time the new client
     opens the app, AI already has their first program assembled
     for coach review.
311. **First-week journey** — orchestrated 7-day onboarding with
     daily micro-wins.
312. **Welcome video personalisation** — AI uses coach's pre-recorded
     greeting + per-client merge tags.
313. **Adaptive intake form** — branching questions; ends faster.
314. **Chatbot intake** — for clients who hate forms; AI conducts the
     intake conversationally.
315. **Goal alignment check-in** — at day 30, AI prompts the client
     to verify the original goal still stands.

## 21. Integrations

316. **Apple Health / HealthKit** — read sleep, HRV, HR, steps,
     workouts. Write logged workouts back.
317. **Google Fit / Health Connect** — same on Android.
318. **Fitbit** — official OAuth + sync.
319. **WHOOP** — recovery data into the coach's view.
320. **Garmin** — Garmin Connect sync.
321. **Strava** — runs / rides into the platform.
322. **MyFitnessPal one-time importer** — for migrating clients.
323. **Spotify** — workout-tempo playlists.
324. **Calendly / Google Calendar** — sessions on the calendar.
325. **Zapier** — webhooks for any unsupported integration.
326. **Stripe Tax** — automatic tax handling.
327. **QuickBooks export** — accounting hand-off.
328. **Zoom** — embedded coach calls.
329. **Telegram / WhatsApp Business** — alternate messaging channels.
330. **Apple Sign-In + Google Sign-In** — frictionless auth.
331. **HubSpot CRM export** — for coaches running B2B.
332. **DocuSign** — waiver signatures.
333. **Gusto / payroll** — for gyms employing coaches.
334. **DEXA / InBody** — manual upload + AI parses key numbers.

## 22. AI Quality, Trust, Safety

335. **Source-of-truth grounding** — every AI suggestion shows the
     data points it was based on.
336. **Confidence scores** — "I'm 70% sure — review before sending".
337. **Coach-overrideable defaults** — every AI default has a "use my
     style instead" toggle.
338. **Citation-backed advice** — when AI makes a claim ("eccentric
     tempo improves hypertrophy"), it cites a study.
339. **Hallucination detector** — second-pass model verifies the
     first response before it ships to the coach.
340. **PII protection** — AI never sends a client's name to third
     parties without consent.
341. **Coach approval queue** — high-impact AI actions go to a
     "coach approves first" queue rather than firing automatically.
342. **AI explainability page** — global page in settings explains
     which models are used where and why.
343. **Pause AI** — global kill switch per coach if they want a
     manual day.
344. **Per-feature AI on/off** — fine-grained control.
345. **Model selection** — coaches can choose Claude vs. Gemini per
     feature.
346. **Cost dashboard** — coach sees their AI usage in $ for the
     month.
347. **Privacy policy linter** — AI scans the coach's own brand site
     and flags privacy issues.

## 23. Future-Looking / Big Bets

348. **AI co-coach for the client** — a friendly "ask anything" assistant
     in the client app that consults coach's notes first.
349. **AR mirror in-gym** — countertop mirror with AR overlays, runs
     the platform's session UI.
350. **Wearable patch** — partnership with sweat-sensor maker.
351. **DNA-aware nutrition (with consent)** — pull genetic data with
     consent and tune macros.
352. **Glucose monitor integration** — for clients with CGMs, plot
     real-time response to meals.
353. **AI agent that messages clients on coach's behalf with explicit
     consent** — strict guardrails, coach-style impersonation only
     in approved cases.
354. **Voice-clone audio messages** — coach uploads a few minutes;
     AI produces personalised audio messages in coach's voice.
355. **Continuous video coaching** — opt-in webcam mid-workout with
     real-time form cues.
356. **VR / Apple Vision Pro experience** — hands-free workout view.
357. **Robot personal trainer integration** — when in-gym smart
     equipment exposes APIs.
358. **AI meal-prep delivery partner** — plug into a real food
     delivery service.
359. **In-gym kiosk** — public-facing kiosk for sign-up / check-in.
360. **Voice-first new-coach onboarding** — entirely talking through
     setup.
361. **AI compliance officer** — agent that monitors and reports on
     all your platform metrics weekly.
362. **AI brand designer** — personalises the coach's portal based on
     their style.
363. **AI brand voice guard** — protects against off-brand outputs in
     all content.
364. **Federated benchmark** — aggregate (anonymised) cross-platform
     metrics so coaches see how they stack up.

## 24. Tiny QoL / Speed Wins (the kind users notice instantly)

365. **Copy any list as Markdown** — for use in Notion, ClickUp, etc.
366. **CSV export from any table view**.
367. **Default sort = "needs your attention first"** on every list.
368. **Sticky filters** — filter persists across sessions.
369. **Recent search history** — last 10 client searches accessible.
370. **Floating "Resume where I left off" pill**.
371. **Inline editing** — never open a modal just to fix a typo.
372. **Optimistic UI** — actions feel instant.
373. **Undo for everything** — toast with "Undo" for every destructive
     action.
374. **Dark-mode parity** — dark mode every page.
375. **A11y pass** — keyboard nav everywhere; screen-reader labels.
376. **Mobile bottom-nav muscle memory** — same icons in same places.
377. **System theme follow** — auto-switch dark/light by OS.
378. **Reduced-motion mode** — respects prefers-reduced-motion.
379. **Print-friendly views** — for older clients who like paper.
380. **Tablet split view** — coach sees client list + thread side by
     side.
381. **Pull-to-refresh** on every mobile list.
382. **Haptic feedback** for important actions on mobile.
383. **Apple Pencil support** for handwritten coach notes on iPad.
384. **Quick photo annotation** — circle/arrow tools when reviewing
     progress photos.
385. **One-tap call client** — Zoom/FaceTime button on every client
     row.
386. **Client favicon** — assign each client a tiny color to recognise
     them at a glance in long lists.
387. **Recent activity ticker** — bottom-of-page live ticker (opt-out)
     of platform-wide milestones.
388. **Inline AI rephrase** — select any text the coach is writing,
     right-click → "rephrase friendlier / firmer / shorter".
389. **Built-in screenshot redactor** — auto-blurs PII before share.
390. **Workout countdown widget** — visible from anywhere on the page
     during an active session.

## 25. Ship-by-tomorrow micro-projects (for whoever picks this up)

(In rough effort order; each <1 day.)

391. Wire `notification-health` POST into the SW push handler so
     real delivery events start landing in the new
     `notification_delivery_log` table.
392. Add a "Plateau detected" badge to the existing dashboard
     "Needs You" card that links to Command Center filtered to
     plateaus.
393. Add a `?prefill=` parameter handler to `coach-messages.html` so
     drafted messages from Command Center auto-populate the input.
394. Add a "View briefing" CTA to the existing dashboard greeting so
     existing-flow users discover Command Center.
395. Run the new SQL migration on production: `add-ai-coaching-
     enhancements.sql`.
396. Add a Cmd+K hint to the coach onboarding tour ("press ⌘K to
     jump to any client").
397. Add a "Pin to Command Center" button on the client profile.
398. Wire the AI Workout Variation function into the Workout Builder's
     menu (3 buttons: Easier / Harder / Equipment swap).
399. Surface "Master · Protected" badge styling in dark mode (already
     theme-aware).
400. Add tests around the plateau-detection thresholds (currently
     constants; later move to coach-tunable settings).

---

## How to think about this list

- **The user is the boss; AI is the manager.** Every AI feature should
  default to "draft and ask" rather than "do." That's why the
  drafter / variation generator / plateau detector all return content
  the coach can review and edit, never auto-fire.
- **Time saved beats time spent.** Most ideas above measure success in
  minutes saved per coach per week. A 90-second daily briefing that
  removes 30 minutes of dashboard hunting earns its keep on day one.
- **Trust comes from receipts.** Notification health, audit logs,
  source-of-truth grounding, and the master account safeguard exist
  because anxiety eats brand equity. Every "did that go through?"
  question should have an instant, true answer.
- **Coach voice over AI voice.** The platform should sound like the
  coach, never like the AI. Brand-voice profiles, drafter "edit before
  send", and tone sliders all serve this principle.
- **Beat the chore, not the muscle.** The coach loves coaching. They
  hate friction. Cmd+K, command center, drafter, voice — every one
  removes a chore so they can do more of what they love.

That's the bar: be #1 by being the platform that respects the coach's
time, voice, and trust more than anyone else.
