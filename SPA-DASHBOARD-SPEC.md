# Dashboard SPA Specification
## client-dashboard.html Analysis (9853 lines)

This document contains a complete analysis for pixel-perfect SPA rebuild.

---

## 1. CSS Variables (Theme System)

```css
:root {
  --brand-primary: #0d9488;
  --brand-primary-light: #14b8a6;
  --brand-primary-dark: #0f766e;
  --brand-gradient: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-200: #e2e8f0;
  --gray-300: #cbd5e1;
  --gray-400: #94a3b8;
  --gray-500: #64748b;
  --gray-600: #475569;
  --gray-700: #334155;
  --gray-800: #1e293b;
  --gray-900: #0f172a;
}

[data-theme="dark"] {
  --gray-50: #1e293b;
  --gray-100: #334155;
  --gray-200: #475569;
  --gray-300: #64748b;
  --gray-400: #94a3b8;
  --gray-500: #cbd5e1;
  --gray-600: #e2e8f0;
  --gray-700: #f1f5f9;
  --gray-800: #f8fafc;
  --gray-900: #ffffff;
}
```

---

## 2. API Endpoints Used

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/.netlify/functions/upload-progress-photo` | POST | Upload progress photos |
| `/.netlify/functions/get-progress-photos` | GET | Get client's progress photos |
| `/.netlify/functions/delete-progress-photo` | DELETE | Delete a progress photo |
| `/.netlify/functions/save-measurement` | POST | Save body measurements |
| `/.netlify/functions/get-measurements` | GET | Get measurement history |
| `/.netlify/functions/save-checkin` | GET, POST | Save/get check-ins |
| `/.netlify/functions/client-protocols` | GET | Get supplement protocols |
| `/.netlify/functions/supplement-intake` | GET, POST, PUT, DELETE | Supplement tracking |
| `/.netlify/functions/notifications` | GET, POST | Get/mark notifications |
| `/.netlify/functions/reminder-settings` | GET | Get notification preferences |
| `/.netlify/functions/reminder-settings/client` | POST | Save notification preferences |
| `/.netlify/functions/food-diary` | GET, POST | Food diary entries |
| `/.netlify/functions/client-diary-ai` | POST | AI food parsing |
| `/.netlify/functions/get-coach-stories` | GET | Get coach stories |
| `/.netlify/functions/view-story` | POST | Mark story as viewed |
| `/.netlify/functions/react-to-story` | POST | React to a story |
| `/.netlify/functions/reply-to-story` | POST | Reply to a story |
| `/.netlify/functions/analyze-food-photo` | POST | AI photo analysis (Haiku) |
| `/.netlify/functions/analyze-food-photo-smart` | POST | AI photo analysis (Sonnet) |
| `/.netlify/functions/analyze-nutrition-label` | POST | Scan nutrition labels |
| `/.netlify/functions/food-search` | GET | Search food database |
| `/.netlify/functions/toggle-favorite` | GET | Get favorites list |
| `/.netlify/functions/track-client-activity` | POST | Track client activity |

---

## 3. UI Components

### 3.1 Top Navigation
- Logo (links to client-dashboard.html)
- Favorites link (❤️ icon, links to client-plans.html#favorites)
- Notification bell with badge counter
- Notification dropdown with mark all read
- Logout button (with SVG icon)

### 3.2 Desktop Sidebar (hidden on mobile)
- User profile section (avatar, name, email, logout)
- Navigation items: Home, Diary, Meal Plans, Workouts (conditional), Profile

### 3.3 Greeting Section
- Client name display (`#clientName`)
- Time-based greeting subtext (`#greetingSubtext`)
- Streak badge (`#streakBadge`, `#streakText`)

### 3.4 Coach Stories Section (Instagram-like)
- Story bubble with coach avatar (`#storyBubbleWrapper`)
- Ring indicator for unseen stories (`.story-ring.unseen`)
- Highlights container (`#highlightsContainer`)
- Full-screen story viewer overlay (`#storyViewerOverlay`)
  - Progress bars for multiple stories
  - Header with avatar, name, time
  - Content area (image/quote/link types)
  - Navigation (prev/next by tap areas)
  - Reply input and reaction buttons
  - Keyboard navigation (arrow keys, escape)

### 3.5 AI Hero Input Section
- Text input for food logging (`#aiHeroInput`)
- Meal type selector buttons (breakfast, lunch, dinner, snack)
- Voice input button (`#aiHeroVoiceBtn`)
- Send button (`#aiHeroSendBtn`)
- Loading indicator (`#aiHeroLoading`)
- Parse result display (`#aiHeroParseResult`)
- Auto-selects meal type based on time of day

### 3.6 Today's Progress Card
- Four macro rings (SVG circles):
  - Calories (`#ringCalories`, `#currentCalories`, `#targetCalories`)
  - Protein (`#ringProtein`, `#currentProtein`, `#targetProtein`)
  - Carbs (`#ringCarbs`, `#currentCarbs`, `#targetCarbs`)
  - Fat (`#ringFat`, `#currentFat`, `#targetFat`)
- Overall progress bar (`#overallProgressBar`, `#overallPercent`)
- "View Full Diary" button

### 3.7 Quick Actions Grid
- 4 action buttons in 2x2 grid:
  - 📸 Photo Log → opens `dashPhotoModal`
  - 🔍 Search → opens `dashSearchModal`
  - 📋 Scan Label → opens `dashScanLabelModal`
  - ❤️ Favorites → opens `dashFavoritesModal`

### 3.8 Supplement Checklist
- Checklist container (`#supplementChecklist`)
- Accordion items with expand/collapse
- Toggle buttons for supplement intake
- Restart buttons for protocols

### 3.9 Meal Plans Section
- Plan cards carousel (`#planCardsContainer`)
- Navigation buttons (prev/next)
- Plan details with meals list
- "View All" button

### 3.10 Progress Tracking Tabs
- Tab navigation: Check-In, Photos, Measurements
- Check-In Tab:
  - Streak display (`#checkinStreak`)
  - Rating groups (energy, sleep, hunger, stress)
  - Adherence slider
  - Text areas (wins, challenges, questions)
  - Diet request checkbox (conditional)
  - Submit button
  - Check-in history with date grouping
- Photos Tab:
  - Photo grid display
  - Upload button
  - Lightbox viewer
- Measurements Tab:
  - Chart tabs (Weight, Body Fat, Chest, Waist, etc.)
  - Canvas charts for each measurement type
  - Measurement history table
  - Add measurement button

### 3.11 Bottom Navigation
- 5 nav items:
  - Home (active) → client-dashboard.html
  - Diary → client-diary.html
  - Meal Plans → client-plans.html
  - Workouts → client-workouts.html (conditional, `data-gym-feature`)
  - Profile → client-settings.html
- Uses Lucide icons

### 3.12 Modals
1. **Photo Upload Modal** (`#uploadModal`)
2. **Measurement Modal** (`#measurementModal`)
3. **AI Photo Modal** (`#dashPhotoModal`)
   - Camera/upload buttons
   - Preview image
   - Optional details input
   - Analyzing spinner
   - Results with detected items
   - Servings adjustment
   - Reanalyze with smarter AI button
4. **Food Search Modal** (`#dashSearchModal`)
   - Search input with debounce
   - Results list
5. **Scan Label Modal** (`#dashScanLabelModal`)
   - Camera/upload for nutrition labels
   - Preview and analysis
   - Extracted nutrition facts
6. **Favorites Modal** (`#dashFavoritesModal`)
   - List of favorited meals
7. **Food Select Modal** (`#dashFoodSelectModal`)
   - Selected food details
   - Servings input
   - Add/cancel buttons

### 3.13 Toast Notification
- Fixed position bottom center
- Icon, message, optional action button
- Auto-hide after 5 seconds

### 3.14 Lightbox
- Full-screen photo viewer
- Navigation arrows
- Close button

---

## 4. JavaScript Functions

### 4.1 Initialization
```javascript
init()                    // Main init - auth, load client data, load all sections
initDashboardExtras()     // Load dashboard components after client ID is set
showDashboardContent()    // Hide skeleton, reveal content
initAIHeroSection()       // Auto-select meal type based on time
```

### 4.2 Authentication
```javascript
// Uses Supabase auth
supabaseClient.auth.getSession()
supabaseClient.auth.onAuthStateChange()
logout()
```

### 4.3 Data Loading
```javascript
loadMealPlans()
loadProtocols()
loadSupplementChecklist()
loadNotifications()
loadNotificationPreferences()
loadPhotos()
loadMeasurements()
loadCheckins(loadMore = false)
loadTodayProgress()
loadStreak()
loadCoachStories()
```

### 4.4 Coach Stories
```javascript
loadCoachStories()
displayStoryBubble(coachName, coachAvatar, hasUnseen)
displayHighlights(highlights)
openStoryViewer()
closeStoryViewer()
buildProgressBars()
showStory(index)
resetProgressBars()
startStoryTimer(index, duration)
pauseStoryTimer()
resumeStoryTimer()
nextStory()
prevStory()
markStoryViewed(storyId)
reactToStory(emoji)
sendStoryReply()
```

### 4.5 AI Food Logging
```javascript
autoSelectMealType()
selectMealType(mealType)
handleHeroKeydown(event)
sendHeroAIMessage()
showHeroParseResult(foodData)
recalculateHeroFoodMacros()
confirmHeroFoodLog()
cancelHeroFoodLog()
```

### 4.6 Voice Input
```javascript
toggleVoiceInput()
startVoiceInput()
stopVoiceInput()
resetVoiceUI()
// Uses Web Speech API (SpeechRecognition)
```

### 4.7 Photo Analysis
```javascript
openDashPhotoModal()
closeDashPhotoModal()
resetDashPhoto()
handleDashPhotoSelect(event)
compressImage(file, maxWidth, quality)
analyzeDashPhoto()
renderDashPhotoResults()
recalculateDashPhotoMacros(idx, servings)
dashReanalyzeWithSmartAI()
removeDashPhotoFood(idx)
addDashPhotoFoods()
```

### 4.8 Food Search
```javascript
openDashSearch()
closeDashSearch()
debounceDashSearch()
performDashSearch()
selectDashSearchFood(idx)
showDashFoodSelect()
closeDashFoodSelect()
addDashSelectedFood()
```

### 4.9 Nutrition Label Scan
```javascript
openScanLabelModal()
closeScanLabelModal()
resetScanLabel()
handleScanLabelSelect(event)
analyzeScanLabel()
recalculateScanLabelMacros()
addScanLabelFood()
```

### 4.10 Favorites
```javascript
openDashFavorites()
closeDashFavorites()
loadDashFavorites()
addDashFavorite(idx)
```

### 4.11 Supplement Checklist
```javascript
renderSupplementChecklist()
toggleSupplementIntake(protocolId, supplementId, intake)
restartSupplementSchedule(protocolId, supplementId)
isSupplementDueToday(frequency, startDate, intakeHistory)
getFrequencyText(frequency)
```

### 4.12 Measurements
```javascript
loadMeasurements()
displayMeasurements()
renderAllCharts()
renderMeasurementChart(canvasId, field, unitField, defaultUnit, color)
openMeasurementModal()
closeMeasurementModal()
saveMeasurement(event)
switchMeasurementTab(tab)
```

### 4.13 Photos
```javascript
loadPhotos()
displayPhotos()
openUploadModal()
closeUploadModal()
handlePhotoSelect(event)
uploadPhoto()
deletePhoto(photoId)
openLightbox(photoIndex)
closeLightbox()
showLightboxPhoto(index)
prevPhoto()
nextPhoto()
```

### 4.14 Check-Ins
```javascript
loadCheckins(loadMore)
displayCheckins(stats)
groupCheckinsByDate(checkins)
formatCheckinDate(dateStr)
loadMoreCheckins()
setRating(type, value)
updateAdherence(value)
toggleDietRequestReason()
submitCheckin()
```

### 4.15 Progress Display
```javascript
setTodayDate()
formatLocalDate(date)
loadTodayProgress()
updateMacroRings(current, targets)
loadStreak()
checkCheckinStatus()
updateGreeting()
```

### 4.16 Caching
```javascript
getDashboardCache(key)
setDashboardCache(key, data, ttlMinutes)
invalidateDashboardCache(key)
```

### 4.17 Utilities
```javascript
showToast(message, actionText, actionCallback)
formatTimeAgo(dateString)
getTimeAgo(dateString)
trackClientActivity()
goToMealPlan()
```

---

## 5. Global Variables

```javascript
// Client/Coach IDs
let currentClientId = null;
let currentCoachId = null;
let clientMealPlans = [];
let clientMeasurements = [];
let clientCheckins = [];
let clientPhotos = [];
let coachStories = [];

// Pagination
let checkinPagination = { total: 0, offset: 0, limit: 3, hasMore: false };
const INITIAL_CHECKINS_LIMIT = 3;
const LOAD_MORE_LIMIT = 5;

// Story viewer state
let currentStoryIndex = 0;
let storyTimer = null;
let storyTimerPaused = false;
let storyTimerRemaining = 0;
let storyTimerStart = 0;
const STORY_DURATION = 10000;

// AI food logging
let selectedMealType = null;
let pendingHeroFoodLog = null;
let heroFoodBaseValues = null;

// Voice input
let isRecording = false;
let recognition = null;

// Photo modal
let dashPhotoBase64 = null;
let dashDetectedFoods = [];
let dashSelectedFood = null;
let dashSearchTimeout = null;
let dashPhotoBaseValues = [];

// Scan label
let scanLabelBase64 = null;
let scanLabelBaseValues = null;

// Check-in form
let checkinFormData = {
  energyLevel: null,
  sleepQuality: null,
  hungerLevel: null,
  stressLevel: null,
  mealPlanAdherence: 80
};

// Feature flags
let canRequestNewPlan = false;
```

---

## 6. External Dependencies

- **Supabase JS SDK** (`@supabase/supabase-js`)
- **Lucide Icons** (lucide.createIcons())
- **Web Speech API** (for voice input)
- **Canvas API** (for measurement charts)
- **Service Worker** (`/sw.js` for PWA)
- **PWA Install Prompt** (`/js/pwa-install-prompt.js`)

---

## 7. Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* Tablet */ }
@media (min-width: 768px) { /* Tablet landscape */ }
@media (min-width: 1024px) { /* Desktop - shows sidebar */ }
@media (min-width: 1280px) { /* Large desktop */ }
@media (max-width: 767px) { /* Mobile specific */ }
```

---

## 8. Key CSS Classes

### Layout
- `.top-nav` - Fixed top navigation
- `.desktop-nav` - Sidebar (desktop only)
- `.main-wrapper` - Main content area
- `.bottom-nav` - Fixed bottom navigation (mobile)

### Cards
- `.card` - Base card style
- `.progress-card` - Today's progress card
- `.plan-card` - Meal plan card

### Modals
- `.modal-overlay` - Full screen overlay
- `.modal-content` - Modal box
- `.modal-header` - Modal header with close button
- `.modal-body` - Modal content area

### Components
- `.meal-type-btn` - Meal type selector buttons
- `.rating-btn` - Check-in rating buttons
- `.macro-ring` - SVG progress rings
- `.story-ring` - Coach story indicator
- `.supplement-item` - Supplement checklist item
- `.quick-action-btn` - Quick action buttons

### States
- `.active` - Active state
- `.selected` - Selected state
- `.recording` - Voice recording state
- `.visible` - Visible state
- `.show` - Show state (toast)

---

## 9. Data Flow

1. **Page Load:**
   - Check auth session
   - Load client data from Supabase
   - Show skeleton loading
   - Load all sections in parallel
   - Hide skeleton, reveal content

2. **Food Logging:**
   - User types/speaks food description
   - AI parses food → shows confirmation
   - User adjusts servings → confirms
   - Entry saved to food diary
   - Progress rings update

3. **Photo Analysis:**
   - User takes/uploads photo
   - Image compressed client-side
   - Sent to AI for analysis
   - Results shown with edit option
   - User confirms → saved to diary

4. **Check-In:**
   - User fills ratings/text
   - Submitted to server
   - History updated
   - Streak recalculated

---

## 10. Realtime Subscriptions

```javascript
// Subscribes to meal_plans table changes
supabaseClient
  .channel('meal-plans')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'meal_plans',
    filter: `client_id=eq.${currentClientId}`
  }, handleRealtimeUpdate)
  .subscribe()
```

---

## 11. Important Notes for SPA Implementation

1. **Authentication**: Must maintain Supabase session across routes
2. **Caching**: Implement same cache strategy with localStorage
3. **Theme**: Must persist theme preference
4. **Realtime**: Set up Supabase realtime subscriptions
5. **PWA**: Register service worker, handle install prompt
6. **Voice**: Implement Web Speech API with proper cleanup
7. **Charts**: Use Canvas API for measurement charts
8. **Image Compression**: Compress before upload to reduce payload
9. **Skeleton Loading**: Show skeletons while loading data
10. **Toast System**: Global toast notification system
11. **Bottom Nav**: Must have proper z-index and touch handling
12. **Modal System**: Stack modals properly, handle escape key
13. **Activity Tracking**: Track client activity for coach visibility
