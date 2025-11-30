# Claude Code Implementation Prompt - 5 Feature Sprint

## Project Context

You are working on a **meal-planner-saas** application with:
- **Frontend**: Vanilla JavaScript + HTML (no framework)
- **Backend**: Netlify Functions (serverless)
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (for photos)
- **AI**: Anthropic Claude API (meal generation)

**Key Files Reference:**
- Coach dashboard: `dashboard.html`
- Client dashboard: `client-dashboard.html`
- Client profile (coach view): `client-profile.html`
- Check-in system: `netlify/functions/save-checkin.js`
- Notifications table exists: `notifications` (types: checkin_submitted, coach_responded, diet_request)
- Progress photos: `progress_photos` table + `netlify/functions/upload-progress-photo.js`
- Measurements: `client_measurements` table + `netlify/functions/save-measurement.js`

**Supabase Connection (use in all functions):**
```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
```

**Standard CORS Headers (use in all functions):**
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
```

---

## FEATURE 1: Automated Check-in Reminders (HIGHEST PRIORITY)

### Goal
Automatically remind clients to submit weekly check-ins. Reduce coach admin burden.

### Database Changes

Create migration file: `supabase-migrations/checkin_reminders.sql`

```sql
-- Check-in reminder settings per client
CREATE TABLE IF NOT EXISTS checkin_reminder_settings (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  reminder_day VARCHAR(20) DEFAULT 'sunday', -- day of week
  reminder_time TIME DEFAULT '09:00:00',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  last_reminder_sent TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id)
);

-- Track sent reminders
CREATE TABLE IF NOT EXISTS checkin_reminders_log (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL, -- 'scheduled', 'missed_followup'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivery_method VARCHAR(20) DEFAULT 'in_app', -- 'in_app', 'email'
  status VARCHAR(20) DEFAULT 'sent' -- 'sent', 'failed'
);

-- RLS Policies
ALTER TABLE checkin_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_reminders_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own client reminders" ON checkin_reminder_settings
  FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Coaches view own reminder logs" ON checkin_reminders_log
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE coach_id = auth.uid())
  );
```

### Backend Functions to Create

#### 1. `netlify/functions/checkin-reminder-settings.js`
- **GET**: Fetch reminder settings for a client
- **POST/PUT**: Create or update reminder settings
- **Request**: `{ clientId, coachId, isEnabled, reminderDay, reminderTime, timezone }`
- **Response**: `{ success: true, settings: {...} }`

#### 2. `netlify/functions/send-checkin-reminders.js` (Scheduled function)
- Runs on schedule (configure in `netlify.toml`)
- Query all clients where:
  - `is_enabled = true`
  - `reminder_day` matches current day
  - `reminder_time` has passed
  - No check-in submitted in last 7 days
  - `last_reminder_sent` is NULL or > 7 days ago
- For each client:
  - Create notification: `{ type: 'checkin_reminder', title: 'Weekly Check-in Reminder', message: 'Time to submit your weekly check-in!' }`
  - Update `last_reminder_sent`
  - Log to `checkin_reminders_log`

Add to `netlify.toml`:
```toml
[functions."send-checkin-reminders"]
  schedule = "0 * * * *"  # Run every hour
```

#### 3. `netlify/functions/check-missed-checkins.js` (Scheduled function)
- Runs daily
- Find clients who haven't checked in for 7+ days
- Send follow-up notification to coach: `{ type: 'missed_checkin', message: '{clientName} hasn't checked in for X days' }`

### Frontend Changes

#### In `client-profile.html` - Add Reminder Settings Section
After the supplements section, add a "Check-in Reminders" card:
- Toggle switch: Enable/Disable reminders
- Day selector: Dropdown for day of week
- Time picker: Input for reminder time
- Timezone selector: Common US timezones
- "Save Settings" button
- Display last reminder sent date

**UI Pattern (match existing style):**
```html
<div class="profile-section">
  <h2>Check-in Reminders</h2>
  <div class="reminder-settings-form">
    <label class="toggle-switch">
      <input type="checkbox" id="reminder-enabled">
      <span class="slider"></span>
      Enable weekly reminders
    </label>
    <!-- Day, time, timezone selectors -->
    <button onclick="saveReminderSettings()">Save Settings</button>
  </div>
</div>
```

#### In `client-dashboard.html` - Show Reminder Notifications
The notification bell already exists. Ensure `checkin_reminder` type notifications display properly with a distinct icon/color.

---

## FEATURE 2: Achievement Badges (Quick Win)

### Goal
Gamify client engagement with achievement badges for milestones.

### Database Changes

Create migration: `supabase-migrations/achievement_badges.sql`

```sql
-- Badge definitions
CREATE TABLE IF NOT EXISTS badge_definitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50), -- emoji or icon class
  category VARCHAR(50), -- 'consistency', 'progress', 'engagement', 'milestone'
  criteria_type VARCHAR(50), -- 'checkin_streak', 'weight_loss', 'photos_uploaded', etc.
  criteria_value INTEGER, -- threshold value
  tier VARCHAR(20) DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client earned badges
CREATE TABLE IF NOT EXISTS client_badges (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES badge_definitions(id),
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_new BOOLEAN DEFAULT true, -- for "new badge" animation
  UNIQUE(client_id, badge_id)
);

-- RLS
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badge definitions" ON badge_definitions
  FOR SELECT USING (true);

CREATE POLICY "Coaches view client badges" ON client_badges
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE coach_id = auth.uid())
  );

CREATE POLICY "Clients view own badges" ON client_badges
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE email = auth.email())
  );

-- Insert default badges
INSERT INTO badge_definitions (name, description, icon, category, criteria_type, criteria_value, tier) VALUES
  ('First Check-in', 'Completed your first weekly check-in', '🎯', 'engagement', 'checkin_count', 1, 'bronze'),
  ('Streak Starter', '3 consecutive weekly check-ins', '🔥', 'consistency', 'checkin_streak', 3, 'bronze'),
  ('Consistent Client', '8 consecutive weekly check-ins', '⚡', 'consistency', 'checkin_streak', 8, 'silver'),
  ('Check-in Champion', '12 consecutive weekly check-ins', '🏆', 'consistency', 'checkin_streak', 12, 'gold'),
  ('Photo Pro', 'Uploaded 5 progress photos', '📸', 'engagement', 'photos_uploaded', 5, 'bronze'),
  ('Progress Tracker', 'Logged 10 measurements', '📊', 'engagement', 'measurements_logged', 10, 'bronze'),
  ('5lb Down', 'Lost 5 pounds from starting weight', '⬇️', 'progress', 'weight_lost', 5, 'bronze'),
  ('10lb Down', 'Lost 10 pounds from starting weight', '🎉', 'progress', 'weight_lost', 10, 'silver'),
  ('25lb Down', 'Lost 25 pounds from starting weight', '🌟', 'progress', 'weight_lost', 25, 'gold'),
  ('Meal Master', 'Followed meal plan at 90%+ adherence for 4 weeks', '🍽️', 'consistency', 'high_adherence_weeks', 4, 'silver'),
  ('Hydration Hero', 'Met water intake goal for 7 days straight', '💧', 'consistency', 'water_streak', 7, 'bronze'),
  ('Feedback Friend', 'Provided detailed check-in feedback 5 times', '💬', 'engagement', 'detailed_checkins', 5, 'bronze');
```

### Backend Functions

#### 1. `netlify/functions/badges.js`
- **GET** `?clientId=X`: Return all earned badges for client
- **GET** `?all=true`: Return all badge definitions
- Response: `{ badges: [...], newBadges: [...] }`

#### 2. `netlify/functions/check-badges.js`
Called after check-in submission, photo upload, or measurement save:
- Input: `{ clientId, triggerType: 'checkin' | 'photo' | 'measurement' }`
- Logic:
  - Query current stats for client
  - Compare against badge criteria
  - Award any newly earned badges
  - Return newly earned badges for celebration UI

#### 3. Update `save-checkin.js`
After successful check-in save, call badge check logic:
```javascript
// At end of successful POST handler:
const newBadges = await checkAndAwardBadges(clientId, 'checkin');
// Include in response: { success: true, checkinId, newBadges }
```

Similarly update `upload-progress-photo.js` and `save-measurement.js`.

### Frontend Changes

#### In `client-dashboard.html` - Add Badges Section
After the welcome section, add badges display:
```html
<div class="badges-section">
  <h2>Your Achievements</h2>
  <div class="badges-grid" id="badges-container">
    <!-- Dynamically populated -->
  </div>
</div>
```

**Badge Card Style:**
```css
.badge-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  text-align: center;
}
.badge-icon { font-size: 48px; }
.badge-name { font-weight: 600; color: #1e293b; }
.badge-description { font-size: 12px; color: #64748b; }
.badge-tier-gold { border: 2px solid #f59e0b; }
.badge-tier-silver { border: 2px solid #94a3b8; }
.badge-tier-bronze { border: 2px solid #d97706; }
.badge-new { animation: pulse 2s infinite; }
```

#### New Badge Celebration Modal
When client earns a new badge, show celebration:
```javascript
function showBadgeCelebration(badge) {
  const modal = document.createElement('div');
  modal.className = 'badge-celebration-modal';
  modal.innerHTML = `
    <div class="celebration-content">
      <div class="confetti">🎉</div>
      <div class="badge-icon">${badge.icon}</div>
      <h2>Achievement Unlocked!</h2>
      <h3>${badge.name}</h3>
      <p>${badge.description}</p>
      <button onclick="this.closest('.badge-celebration-modal').remove()">Awesome!</button>
    </div>
  `;
  document.body.appendChild(modal);
}
```

#### In `client-profile.html` (Coach View)
Show client's earned badges in a compact view under their profile info.

---

## FEATURE 3: Stripe Integration (Revenue Enabler)

### Goal
Enable subscription payments for coaches with tiered pricing.

### Environment Variables Needed
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

### Database Changes

Create migration: `supabase-migrations/subscriptions.sql`

```sql
-- Coach subscription info
CREATE TABLE IF NOT EXISTS coach_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_tier VARCHAR(50) DEFAULT 'free', -- 'free', 'basic', 'pro', 'enterprise'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'canceled', 'past_due', 'trialing'
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  client_limit INTEGER DEFAULT 3, -- free tier limit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment history
CREATE TABLE IF NOT EXISTS payment_history (
  id BIGSERIAL PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(255),
  amount_cents INTEGER,
  currency VARCHAR(10) DEFAULT 'usd',
  status VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE coach_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches view own subscription" ON coach_subscriptions
  FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "Coaches view own payments" ON payment_history
  FOR SELECT USING (coach_id = auth.uid());

-- Tier limits
-- Free: 3 clients, basic features
-- Basic ($29/mo): 15 clients, all features
-- Pro ($79/mo): 50 clients, all features, priority support
-- Enterprise ($199/mo): Unlimited clients, white-label, API access
```

### Backend Functions

#### 1. `netlify/functions/create-checkout-session.js`
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const { coachId, priceId, successUrl, cancelUrl } = JSON.parse(event.body);

  // Get or create Stripe customer
  let { data: subscription } = await supabase
    .from('coach_subscriptions')
    .select('stripe_customer_id')
    .eq('coach_id', coachId)
    .single();

  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    const { data: user } = await supabase.auth.admin.getUserById(coachId);
    const customer = await stripe.customers.create({
      email: user.user.email,
      metadata: { coach_id: coachId }
    });
    customerId = customer.id;

    await supabase.from('coach_subscriptions').upsert({
      coach_id: coachId,
      stripe_customer_id: customerId
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { coach_id: coachId }
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ sessionId: session.id, url: session.url })
  };
};
```

#### 2. `netlify/functions/stripe-webhook.js`
Handle Stripe webhooks for subscription events:
- `checkout.session.completed`: Create/update subscription
- `invoice.paid`: Log payment, update status
- `invoice.payment_failed`: Update status to past_due
- `customer.subscription.updated`: Sync plan changes
- `customer.subscription.deleted`: Mark as canceled

#### 3. `netlify/functions/get-subscription.js`
- **GET**: Return coach's current subscription status and limits
- Response: `{ plan: 'basic', status: 'active', clientLimit: 15, clientCount: 8, ... }`

#### 4. `netlify/functions/cancel-subscription.js`
- **POST**: Cancel subscription at period end
- Uses `stripe.subscriptions.update({ cancel_at_period_end: true })`

#### 5. `netlify/functions/customer-portal.js`
- **POST**: Create Stripe Customer Portal session for self-service billing management

### Frontend Changes

#### New Page: `pricing.html`
Create pricing page with 3-4 tier cards:
- Free tier (current)
- Basic ($29/mo)
- Pro ($79/mo)
- Enterprise ($199/mo)

Each card shows:
- Price
- Client limit
- Feature list
- CTA button (Subscribe/Current Plan/Contact Sales)

#### In `dashboard.html` - Add Subscription Status
In the header or sidebar, show:
- Current plan badge
- Client count / limit
- "Upgrade" button if on free/basic
- Days remaining in trial (if applicable)

#### Upgrade Modal/Flow
When coach hits client limit:
```javascript
function showUpgradeModal() {
  // Show modal explaining limits
  // "You've reached your 3 client limit on the Free plan"
  // CTA: "Upgrade to Basic for $29/mo"
  // Button calls createCheckoutSession()
}
```

#### In `manage-clients.html`
Before allowing "Add Client", check subscription limits:
```javascript
async function canAddClient() {
  const sub = await getSubscription();
  if (sub.clientCount >= sub.clientLimit) {
    showUpgradeModal();
    return false;
  }
  return true;
}
```

---

## FEATURE 4: Progress Reports (PDF)

### Goal
Generate professional PDF progress reports for clients.

### Dependencies
Install in `package.json`:
```json
{
  "dependencies": {
    "pdfkit": "^0.14.0"
  }
}
```

Or use a client-side library like jsPDF in the HTML files.

### Backend Function

#### `netlify/functions/generate-progress-report.js`
```javascript
const PDFDocument = require('pdfkit');

exports.handler = async (event) => {
  const { clientId, coachId, dateRange } = JSON.parse(event.body);

  // Fetch all client data
  const [client, checkins, measurements, photos] = await Promise.all([
    getClient(clientId, coachId),
    getCheckins(clientId, dateRange),
    getMeasurements(clientId, dateRange),
    getProgressPhotos(clientId, dateRange)
  ]);

  // Calculate stats
  const stats = calculateProgressStats(checkins, measurements);

  // Generate PDF
  const doc = new PDFDocument();
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {});

  // Header
  doc.fontSize(24).text('Progress Report', { align: 'center' });
  doc.fontSize(14).text(`${client.client_name}`, { align: 'center' });
  doc.fontSize(10).text(`${dateRange.start} - ${dateRange.end}`, { align: 'center' });
  doc.moveDown();

  // Summary Stats
  doc.fontSize(16).text('Summary');
  doc.fontSize(12);
  doc.text(`Starting Weight: ${stats.startWeight} lbs`);
  doc.text(`Current Weight: ${stats.endWeight} lbs`);
  doc.text(`Total Change: ${stats.weightChange} lbs`);
  doc.text(`Check-ins Completed: ${stats.checkinCount}`);
  doc.text(`Average Adherence: ${stats.avgAdherence}%`);
  doc.moveDown();

  // Weekly Breakdown
  doc.fontSize(16).text('Weekly Progress');
  checkins.forEach(checkin => {
    doc.fontSize(10);
    doc.text(`Week of ${checkin.created_at}: ${checkin.weight} lbs, ${checkin.meal_plan_adherence}% adherence`);
  });
  doc.moveDown();

  // Measurements Table
  if (measurements.length > 0) {
    doc.fontSize(16).text('Body Measurements');
    // Add measurement data...
  }

  doc.end();

  const pdfBuffer = Buffer.concat(chunks);

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${client.client_name}-progress-report.pdf"`
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true
  };
};
```

### Frontend Changes

#### In `client-profile.html` (Coach View)
Add "Generate Report" button:
```html
<div class="profile-actions">
  <button onclick="generateProgressReport()" class="btn-secondary">
    📄 Generate Progress Report
  </button>
</div>
```

#### Report Generation Modal
```javascript
async function generateProgressReport() {
  const modal = showModal({
    title: 'Generate Progress Report',
    content: `
      <div class="form-group">
        <label>Date Range</label>
        <select id="report-range">
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div class="form-group">
        <label>Include</label>
        <label><input type="checkbox" checked id="inc-checkins"> Check-ins</label>
        <label><input type="checkbox" checked id="inc-measurements"> Measurements</label>
        <label><input type="checkbox" id="inc-photos"> Progress Photos</label>
      </div>
    `,
    actions: [
      { text: 'Cancel', onClick: 'closeModal()' },
      { text: 'Generate PDF', onClick: 'downloadReport()', primary: true }
    ]
  });
}

async function downloadReport() {
  showLoading('Generating report...');

  const response = await fetch('/.netlify/functions/generate-progress-report', {
    method: 'POST',
    body: JSON.stringify({
      clientId,
      coachId,
      dateRange: getSelectedDateRange(),
      include: getSelectedIncludes()
    })
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clientName}-progress-report.pdf`;
  a.click();

  hideLoading();
  showToast('Report downloaded!');
}
```

---

## FEATURE 5: Photo Comparison View

### Goal
Side-by-side photo comparison with slider for visual progress tracking.

### No Database Changes Required
Uses existing `progress_photos` table.

### Frontend Implementation

#### In `client-profile.html` - Photo Section Enhancement

Add comparison view button and modal:
```html
<div class="photos-section">
  <div class="section-header">
    <h2>Progress Photos</h2>
    <button onclick="openPhotoComparison()" class="btn-secondary">
      Compare Photos
    </button>
  </div>
  <div class="photos-grid" id="photos-container">
    <!-- Existing photo grid -->
  </div>
</div>

<!-- Photo Comparison Modal -->
<div id="photo-comparison-modal" class="modal" style="display:none;">
  <div class="modal-content comparison-modal">
    <div class="modal-header">
      <h2>Photo Comparison</h2>
      <button onclick="closePhotoComparison()" class="close-btn">&times;</button>
    </div>
    <div class="comparison-controls">
      <div class="photo-selector">
        <label>Before Photo</label>
        <select id="before-photo-select"></select>
      </div>
      <div class="photo-selector">
        <label>After Photo</label>
        <select id="after-photo-select"></select>
      </div>
      <div class="view-mode-toggle">
        <button onclick="setViewMode('side-by-side')" class="active">Side by Side</button>
        <button onclick="setViewMode('slider')">Slider</button>
        <button onclick="setViewMode('overlay')">Overlay</button>
      </div>
    </div>
    <div class="comparison-view" id="comparison-container">
      <!-- Dynamic content based on view mode -->
    </div>
  </div>
</div>
```

#### Comparison View CSS
```css
.comparison-modal {
  max-width: 1200px;
  width: 95vw;
}

.comparison-view {
  display: flex;
  gap: 20px;
  justify-content: center;
  min-height: 500px;
}

.comparison-view.side-by-side {
  display: flex;
  gap: 20px;
}

.comparison-view.side-by-side img {
  max-width: 48%;
  max-height: 600px;
  object-fit: contain;
}

/* Slider comparison */
.comparison-slider-container {
  position: relative;
  width: 100%;
  max-width: 600px;
  overflow: hidden;
}

.comparison-slider-container img {
  width: 100%;
  display: block;
}

.comparison-slider-container .after-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 50%;
  overflow: hidden;
}

.comparison-slider-container .slider-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: white;
  cursor: ew-resize;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.comparison-slider-container .slider-handle::after {
  content: '↔';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}

/* Overlay mode */
.comparison-view.overlay {
  position: relative;
}

.comparison-view.overlay .overlay-image {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0.5;
}

.opacity-slider {
  width: 100%;
  margin-top: 20px;
}

/* Photo labels */
.photo-label {
  text-align: center;
  padding: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  margin-top: 8px;
  font-size: 14px;
  color: #475569;
}
```

#### Comparison JavaScript
```javascript
let currentPhotos = [];
let viewMode = 'side-by-side';

function openPhotoComparison() {
  // Populate photo selectors
  const beforeSelect = document.getElementById('before-photo-select');
  const afterSelect = document.getElementById('after-photo-select');

  beforeSelect.innerHTML = currentPhotos.map((p, i) =>
    `<option value="${i}">${formatDate(p.taken_date)} - ${p.photo_type}</option>`
  ).join('');

  afterSelect.innerHTML = currentPhotos.map((p, i) =>
    `<option value="${i}">${formatDate(p.taken_date)} - ${p.photo_type}</option>`
  ).join('');

  // Default: oldest as before, newest as after
  beforeSelect.value = currentPhotos.length - 1;
  afterSelect.value = 0;

  document.getElementById('photo-comparison-modal').style.display = 'flex';
  updateComparison();
}

function updateComparison() {
  const beforeIdx = document.getElementById('before-photo-select').value;
  const afterIdx = document.getElementById('after-photo-select').value;
  const beforePhoto = currentPhotos[beforeIdx];
  const afterPhoto = currentPhotos[afterIdx];
  const container = document.getElementById('comparison-container');

  if (viewMode === 'side-by-side') {
    container.innerHTML = `
      <div class="photo-column">
        <img src="${beforePhoto.photo_url}" alt="Before">
        <div class="photo-label">Before: ${formatDate(beforePhoto.taken_date)}</div>
      </div>
      <div class="photo-column">
        <img src="${afterPhoto.photo_url}" alt="After">
        <div class="photo-label">After: ${formatDate(afterPhoto.taken_date)}</div>
      </div>
    `;
  } else if (viewMode === 'slider') {
    container.innerHTML = `
      <div class="comparison-slider-container" id="slider-container">
        <img src="${beforePhoto.photo_url}" class="before-image" alt="Before">
        <div class="after-image" style="width: 50%;">
          <img src="${afterPhoto.photo_url}" alt="After">
        </div>
        <div class="slider-handle" style="left: 50%;"></div>
      </div>
    `;
    initSlider();
  } else if (viewMode === 'overlay') {
    container.innerHTML = `
      <div class="overlay-container">
        <img src="${beforePhoto.photo_url}" class="base-image" alt="Before">
        <img src="${afterPhoto.photo_url}" class="overlay-image" alt="After" style="opacity: 0.5;">
      </div>
      <div class="opacity-control">
        <label>After photo opacity:</label>
        <input type="range" min="0" max="100" value="50"
               oninput="updateOverlayOpacity(this.value)" class="opacity-slider">
      </div>
    `;
  }
}

function initSlider() {
  const container = document.getElementById('slider-container');
  const handle = container.querySelector('.slider-handle');
  const afterImage = container.querySelector('.after-image');

  let isDragging = false;

  handle.addEventListener('mousedown', () => isDragging = true);
  document.addEventListener('mouseup', () => isDragging = false);

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    handle.style.left = percent + '%';
    afterImage.style.width = percent + '%';
  });

  // Touch support
  container.addEventListener('touchmove', (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    handle.style.left = percent + '%';
    afterImage.style.width = percent + '%';
  });
}

function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-mode-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(mode.replace('-', ' ')));
  });
  updateComparison();
}

function updateOverlayOpacity(value) {
  document.querySelector('.overlay-image').style.opacity = value / 100;
}
```

#### Also add to `client-dashboard.html` (Client View)
Clients should also be able to compare their own progress photos with a similar UI.

---

## Implementation Order

1. **Automated Check-in Reminders** (Feature 1)
   - Create database migration
   - Create backend functions
   - Add UI to client-profile.html
   - Test scheduled function locally with `netlify dev`

2. **Achievement Badges** (Feature 2)
   - Create database migration with seed data
   - Create badges.js and check-badges.js functions
   - Update existing functions to trigger badge checks
   - Add badges UI to client-dashboard.html
   - Add celebration modal

3. **Stripe Integration** (Feature 3)
   - Set up Stripe account and get API keys
   - Create database migration
   - Implement all Stripe functions
   - Create pricing.html page
   - Add subscription UI to dashboard
   - Implement limit checks
   - Test with Stripe test mode

4. **Progress Reports PDF** (Feature 4)
   - Add pdfkit dependency
   - Create generate-progress-report.js function
   - Add report generation UI to client-profile.html
   - Test PDF generation and download

5. **Photo Comparison View** (Feature 5)
   - Add comparison modal HTML/CSS to client-profile.html
   - Implement JavaScript comparison logic
   - Add slider interaction
   - Add to client-dashboard.html for client view
   - Test all three view modes

---

## Testing Checklist

For each feature, verify:
- [ ] Database migration runs without errors
- [ ] RLS policies work correctly
- [ ] API endpoints return correct responses
- [ ] Error handling works (invalid inputs, unauthorized access)
- [ ] UI matches existing design patterns
- [ ] Mobile responsiveness
- [ ] Loading states shown during async operations
- [ ] Success/error toasts displayed appropriately

---

## Git Workflow

After completing each feature:
```bash
git add .
git commit -m "feat: Add [feature name]

- Created [migration/function/UI] for [purpose]
- [Additional details]"
git push -u origin claude/fix-supplement-protocol-01Br8o6RaYRdKoBzVXdL89e3
```

After all features complete, create summary commit:
```bash
git commit -m "feat: Complete 5-feature sprint

1. Automated check-in reminders with scheduling
2. Achievement badges gamification system
3. Stripe subscription integration
4. PDF progress reports generation
5. Photo comparison view with slider"
```
