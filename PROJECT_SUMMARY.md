# Zique Fitness Nutrition - Complete Project Summary

## Table of Contents

1. [What We Built](#what-we-built)
2. [Why We Built It](#why-we-built-it)
3. [Who It's For](#who-its-for)
4. [The Goal](#the-goal)
5. [How It Works](#how-it-works)
6. [Technology Stack](#technology-stack)
7. [Features - Coach Side](#features---coach-side)
8. [Features - Client Side](#features---client-side)
9. [AI Capabilities](#ai-capabilities)
10. [Pricing & Business Model](#pricing--business-model)
11. [Database Architecture](#database-architecture)
12. [API Surface](#api-surface)
13. [Security & Performance](#security--performance)
14. [Deployment & Infrastructure](#deployment--infrastructure)
15. [Mobile Strategy](#mobile-strategy)
16. [Metrics & Scale](#metrics--scale)

---

## What We Built

**Zique Fitness Nutrition** is a full-stack, AI-powered SaaS platform purpose-built for nutrition and fitness coaches to manage their entire coaching business from a single dashboard. It combines AI meal plan generation, client food diary tracking, workout programming, supplement protocols, progress monitoring, and subscription billing into one cohesive product.

The platform operates on a **two-sided model**:

- **Coaches** pay a monthly subscription to access the platform and manage their clients.
- **Clients** get free access to a polished mobile-first app where they log food, follow meal plans, track workouts, submit check-ins, and interact with their coach.

At its core, this is a tool that replaces the fragmented workflow most coaches endure today -- juggling spreadsheets, WhatsApp messages, Google Docs meal plans, and manual calorie calculations -- with a single intelligent platform.

---

## Why We Built It

### The Problem

Nutrition coaches face a painful operational reality:

1. **Time-intensive meal planning** - Creating personalized meal plans for 20-50+ clients manually takes hours per week. Each plan must respect dietary restrictions, caloric targets, macronutrient splits, food preferences, allergies, and variety.

2. **Scattered client communication** - Coaches track client progress through a mix of text messages, email threads, photo DMs, and spreadsheets. Nothing is centralized.

3. **No accountability infrastructure** - Clients fall off plans because there's no frictionless way to log meals, check in daily, or get real-time feedback.

4. **Zero automation** - Every aspect of the coaching workflow is manual: plan creation, progress tracking, check-in reminders, supplement scheduling.

5. **No professional presence** - Many coaches lack branded client-facing tools, relying instead on generic apps that don't represent their business.

### The Solution

Zique Fitness Nutrition eliminates these problems by:

- Using **AI (Claude, Gemini)** to generate personalized meal plans in seconds instead of hours
- Providing a **centralized client dashboard** where coaches see all activity, check-ins, and progress in one place
- Giving clients a **beautiful mobile app** that makes food logging, workout tracking, and check-ins effortless
- Automating **reminders, supplement protocols, and daily insights** so coaches scale without burning out
- Offering **custom branding** so coaches present a professional, white-labeled experience to their clients

---

## Who It's For

### Primary Audience: Fitness & Nutrition Coaches (B2B)

| Segment | Description |
|---------|-------------|
| **Personal Trainers** | In-person and online trainers who also provide nutrition guidance |
| **Nutrition Coaches** | Certified nutritionists running 1-on-1 or group coaching |
| **Fitness Influencers** | Creators monetizing their audience with coaching services |
| **Gym Owners** | Small gym operators offering nutrition coaching as an add-on |
| **Online Coaching Businesses** | Coaches running entirely remote practices with 10-300+ clients |

### Secondary Audience: Their Clients (B2C via Coach)

| Segment | Description |
|---------|-------------|
| **Weight Loss Seekers** | Individuals working with a coach to lose weight sustainably |
| **Fitness Enthusiasts** | People tracking macros and training for body composition goals |
| **Performance Athletes** | Athletes optimizing nutrition for competitive performance |
| **Health-Conscious Individuals** | People who want structure and accountability in their diet |

### Key Insight

Coaches are the **buyers**. Clients are the **users**. The product must sell to coaches (ROI, time savings, professionalism) while delighting clients (ease of use, AI features, beautiful UX) to reduce churn.

---

## The Goal

### Short-Term

- Become the go-to platform for independent nutrition coaches looking to scale their business without hiring assistants
- Reach **500+ active paying coaches** with high retention through product stickiness (once a coach migrates clients, switching costs are high)

### Long-Term

- Build the **operating system for the nutrition coaching industry** -- a platform so essential that coaches can't imagine running their business without it
- Expand into group coaching, community features, and coach marketplaces
- Become the data layer that connects coaches, clients, and health outcomes at scale

### Success Metrics

| Metric | Target |
|--------|--------|
| Monthly Recurring Revenue (MRR) | Grow through tiered pricing ($49-$199/mo per coach) |
| Coach Retention | >90% monthly retention |
| Client Engagement | Daily active usage for food logging |
| AI Usage | Meal plans generated, food photos analyzed per coach |
| NPS | >70 (currently claiming 98% satisfaction) |

---

## How It Works

### Coach Flow

```
1. Coach signs up --> 14-day free trial (no credit card required)
2. Coach creates client profiles (name, email, goals, dietary restrictions)
3. Coach generates AI meal plans personalized to each client
4. Coach publishes meal plans to client dashboards
5. Coach assigns workout programs and supplement protocols
6. Coach monitors activity feed: food logs, check-ins, workouts
7. Coach responds to check-ins, reacts to diary entries, posts stories
8. Coach upgrades to paid plan before trial ends
```

### Client Flow

```
1. Client receives email invitation from coach
2. Client creates account (email/password)
3. Client sees personalized dashboard: meal plan, macros, workouts
4. Client logs food via: photo AI, voice, manual entry, barcode scan, search
5. Client tracks workouts following coach's program
6. Client submits daily check-ins (energy, sleep, hunger, stress)
7. Client uploads progress photos and measurements
8. Client views coach stories, gets AI-powered daily insights
```

### Data Flow

```
Client Action --> Netlify Function (API) --> Supabase (PostgreSQL)
                       |
                       +--> AI Service (Claude/Gemini) for analysis
                       +--> Stripe for billing events
                       +--> Resend for email notifications
```

---

## Technology Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| **React 18.3** | UI component library |
| **React Router DOM 7.1** | Client-side routing (SPA) |
| **Vite 6.0** | Build tool, dev server, HMR |
| **Lucide React** | 470+ SVG icon library |
| **Custom CSS** | Hand-written styles with CSS custom properties, dark/light theme |
| **Canvas API** | Charts and progress visualizations |

### Backend

| Technology | Purpose |
|-----------|---------|
| **Netlify Functions** | 147+ serverless API endpoints (Node.js) |
| **Supabase** | PostgreSQL database, authentication, file storage |
| **Supabase Auth** | Email/password authentication with JWT tokens |
| **Supabase Storage** | Photos, videos, voice notes, brand assets |

### AI / Machine Learning

| Technology | Purpose |
|-----------|---------|
| **Anthropic Claude 3.5 Sonnet** | Meal plan generation, detailed food analysis, workout programming |
| **Anthropic Claude 3 Haiku** | Fast food photo analysis, quick categorization |
| **Google Gemini** | Food diary AI assistant, real-time meal suggestions |
| **OpenAI** | Fallback AI provider |

### Payments & Email

| Technology | Purpose |
|-----------|---------|
| **Stripe** | Subscription billing, checkout, webhooks, billing portal |
| **Resend** | Transactional email (invites, password resets, confirmations) |

### Mobile

| Technology | Purpose |
|-----------|---------|
| **Capacitor 7.4** | Cross-platform mobile framework (WebView) |
| **Android SDK** | Native Android app (Play Store) |
| **iOS SDK** | Native iOS app (App Store) |
| **PWA Manifest** | Progressive Web App for mobile browsers |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| **Netlify** | Hosting, CDN, serverless functions, scheduled jobs |
| **Git** | Version control |
| **npm** | Package management |

---

## Features - Coach Side

### Client Management

- **Create clients** with name, email, phone, dietary restrictions, goals, gender
- **Invite clients via email** with branded invitation links
- **Custom intake forms** with shareable links for onboarding
- **Archive/restore clients** for seasonal or inactive coaching relationships
- **Activity feed** showing all client actions in real-time (food logs, check-ins, workouts)
- **Client limits enforced by plan tier** (10 / 50 / 300)

### AI Meal Plan Generation

- **One-click AI meal plans** powered by Claude 3.5 Sonnet
- Respects: caloric targets, macronutrient splits, dietary restrictions, food preferences, allergies
- **7-day structured plans** with breakfast, lunch, dinner, snacks
- **Manual plan builder** for coaches who prefer hands-on creation
- **Plan templates** for reusable meal structures
- **Publish/unpublish** plans to client dashboards instantly
- **Shareable links** -- generate public URLs for plans (no login required)

### Workout Programming

- **AI workout generation** via Claude
- **Exercise library** with 1500+ exercises and video demonstrations
- **Custom workout builder** for manual programming
- **Workout templates and programs** for reusable training blocks
- **Club workouts** -- shared workout templates across the platform
- **Monitor client workout completion** through the activity feed

### Supplement Protocols

- **Create supplement schedules** with name, dosage, frequency, timing
- **Assign protocols to clients** with start dates
- **Track client compliance** through intake logging
- **Frequency options**: daily, 3x weekly, 5x weekly, as needed

### Coach Stories

- **Instagram-style stories** that appear on client dashboards
- **Content types**: quotes, images, links
- **24-hour auto-expiration** like social media stories
- **View analytics** -- see who viewed each story
- **Reactions and replies** from clients

### Branding & White Label (Professional Tier)

- **Custom logo upload** displayed across the client app
- **Branded email communications** with coach's logo and colors
- **White label client portal** -- clients see the coach's brand, not Zique
- **Custom email domain support** for verified domains

### Billing & Subscription Management

- **Self-serve billing portal** via Stripe
- **Plan upgrades/downgrades** at any time
- **Cancel and reactivate** subscriptions
- **View payment history and invoices**

---

## Features - Client Side

### Dashboard

- **At-a-glance view**: today's calories, macros (protein/carbs/fat), water, meal plan
- **SVG progress rings** for visual macro tracking
- **Coach stories** displayed at top of dashboard
- **Supplement reminders** with one-tap logging
- **Quick actions**: log food, start workout, check in

### Food Logging (5 Methods)

1. **AI Photo Analysis** -- Take or upload a food photo; Claude identifies foods and estimates calories/macros
2. **Voice Logging** -- Speak what you ate; AI transcribes and parses into structured nutrition data
3. **Nutrition Label Scan** -- Scan barcodes or nutrition labels with camera
4. **Food Search** -- Search a database of foods with adjustable serving sizes
5. **Manual Entry** -- Type food name and macros directly

### Food Diary

- **Meal-organized view**: breakfast, lunch, dinner, snacks
- **Swipe-to-delete** food entries with touch gestures
- **Copy previous day** -- replicate yesterday's meals with one tap
- **Favorites system** -- save frequently eaten meals for quick re-logging
- **AI nutrition assistant** -- chat-based meal advice and suggestions
- **Water tracking** -- glass counter with daily goal
- **Weight logging** -- track daily weight with trend charts
- **Coach interactions** -- coaches can react to and comment on diary entries

### Meal Plans

- **View assigned meal plans** from coach
- **7-day plan navigation** with day-by-day breakdown
- **Meal modification** -- request AI-powered changes to individual meals
- **Meal brainstorm** -- get AI suggestions for meals that fit remaining macros
- **Share plans** via unique public links

### Workouts

- **Follow coach-assigned programs** with exercise details
- **Guided workout mode** -- step-by-step modal walking through each exercise
- **Log sets/reps/weight** for every exercise
- **AI exercise substitutions** -- swap exercises based on available equipment
- **Exercise videos** -- watch demonstration videos for every exercise
- **Workout history** -- browse past completed workouts
- **Progressive overload tracking** -- see weight/volume progression over time

### Progress Tracking

- **Daily check-ins** with ratings for energy, sleep quality, hunger, stress
- **Meal plan adherence scoring** (0-100%)
- **Free-text fields** for wins, challenges, and questions to coach
- **Check-in streaks** for motivation
- **Progress photos** with gallery view
- **Body measurements** -- weight, body fat %, chest, waist, hips, arms, thighs
- **Measurement charts** -- canvas-based line graphs showing trends
- **AI daily insights** -- score-based summaries of adherence and habits
- **Weekly summaries** with bar charts and trend analysis

### Settings & Personalization

- **Profile management** -- update goals, dietary preferences, restrictions
- **Notification preferences** -- customize reminders for check-ins, meals, workouts
- **Dark/light theme toggle**
- **Password management**

---

## AI Capabilities

### Meal Plan Generation (Claude 3.5 Sonnet)

- Generates complete 7-day meal plans in seconds
- Inputs: calorie target, macro split, dietary restrictions, preferences, allergies, cuisine preferences
- Output: structured JSON with meal names, ingredients, portion sizes, calories, protein, carbs, fat per meal
- Coaches can regenerate or modify individual meals

### Food Photo Analysis (Claude 3 Haiku / Sonnet)

- **Haiku (fast mode)**: Identifies foods in photos, estimates portions and macros in <2 seconds
- **Sonnet (smart mode)**: More detailed analysis with higher accuracy for complex dishes
- Handles: single items, full plates, packaged foods, restaurant meals
- Returns: food name, estimated serving size, calories, protein, carbs, fat

### Voice Food Logging

- Accepts natural language audio transcriptions
- Parses: "I had two eggs, toast with butter, and a glass of orange juice"
- Returns structured nutrition data for each food item

### Nutrition Label Scanning

- Processes images of nutrition labels and barcodes
- Extracts: serving size, calories, macros, fiber, sugar, sodium
- Maps to standardized food entry format

### AI Nutrition Assistant

- Chat-based interface powered by Gemini
- Answers questions about nutrition, meal suggestions, macro optimization
- Context-aware: knows the client's goals, restrictions, and recent diary entries

### Workout Generation (Claude 3.5 Sonnet)

- Generates complete workout programs based on client goals
- Handles: strength training, hypertrophy, endurance, sport-specific
- Includes: exercise selection, sets, reps, rest periods, warm-ups, cool-downs

### Exercise Substitutions

- AI-powered exercise swaps when equipment isn't available
- Maintains: target muscle group, movement pattern, difficulty level
- Draws from 1500+ exercise library

### AI Daily Insights

- Generates personalized daily reports based on food diary data
- Scores adherence to calorie and macro targets
- Provides actionable recommendations

---

## Pricing & Business Model

### Revenue Model

**B2B SaaS subscription** -- coaches pay monthly, clients use the platform free.

This model works because:
- Coaches have a direct financial incentive (client retention = revenue for their business)
- Clients don't pay, reducing friction for onboarding
- Coaches are stickier customers (high switching costs once clients are migrated)
- Per-coach pricing scales with their business growth (more clients = higher tier needed)

### Pricing Tiers

#### Starter - $49/month

| | |
|---|---|
| **Target** | Coaches just getting started |
| **Client Limit** | 10 active clients |
| **AI Meal Planning** | Included |
| **Food Diary Tracking** | Included |
| **AI Nutrition Assistant** | Included |
| **Weekly Check-in Forms** | Included |
| **Recipe Management** | Included |
| **Supplement Protocols** | Included |
| **Workout Programming** | Included |
| **Support** | Email support |
| **Custom Branding** | Not included |

#### Growth - $99/month (Most Popular)

| | |
|---|---|
| **Target** | Growing coaching businesses |
| **Client Limit** | 50 active clients |
| **Everything in Starter** | Included |
| **Supplement Protocols** | Included (highlighted) |
| **Support** | Priority support |
| **Custom Branding** | Not included |

#### Professional - $199/month

| | |
|---|---|
| **Target** | Established coaches who want it all |
| **Client Limit** | 300 active clients |
| **Everything in Growth** | Included |
| **Custom Branding & Logo** | Included |
| **White Label Client Portal** | Included |
| **Branded Email Communications** | Included |
| **Custom Email Domain** | Included (if verified) |
| **Support** | Priority support |

### Revenue Projections

| Scenario | Coaches | Avg Revenue/Coach | MRR | ARR |
|----------|---------|-------------------|-----|-----|
| **Early Stage** | 50 | $75 | $3,750 | $45,000 |
| **Growth** | 200 | $85 | $17,000 | $204,000 |
| **Scale** | 500 | $99 | $49,500 | $594,000 |
| **Mature** | 1,000 | $110 | $110,000 | $1,320,000 |

*Avg revenue assumes a mix of tiers weighted toward Growth ($99).*

### Unit Economics

| Metric | Value |
|--------|-------|
| **Average Revenue Per Coach (ARPC)** | ~$99/mo (Growth tier most popular) |
| **Cost to Serve (Infrastructure)** | Netlify free tier covers early stage; Supabase ~$25/mo; AI API costs variable |
| **AI Cost Per Coach** | ~$2-5/mo (Claude API for meal plans, food analysis) |
| **Gross Margin** | ~90%+ at scale (SaaS with serverless infrastructure) |
| **Payback Period** | Immediate (monthly subscription, no upfront costs for customers) |

### Pricing Strategy

- **14-day free trial** with no credit card required lowers the barrier to entry
- **No contracts** -- cancel anytime -- reduces perceived risk
- **Promotion codes supported** via Stripe for partnerships and marketing campaigns
- **Upgrade path is clear**: coaches naturally grow from Starter to Growth to Professional as their client base expands
- **Professional tier premium** ($199) justified by white-label branding, which is critical for coaches building a brand

### Trial Details

| | |
|---|---|
| **Duration** | 14 days |
| **Credit Card Required** | No |
| **Full Feature Access** | Yes (all features available during trial) |
| **Trial End Behavior** | Prompted to subscribe; access restricted if no payment |
| **Returning Users** | No trial offered to existing/returning customers |

### Billing Infrastructure

- **Stripe Checkout** for initial subscription signup
- **Stripe Billing Portal** for self-serve plan management
- **Stripe Webhooks** for real-time subscription lifecycle events:
  - `checkout.session.completed` -- provisions coach account
  - `customer.subscription.created` -- activates subscription
  - `customer.subscription.updated` -- handles plan changes
  - `customer.subscription.deleted` -- marks subscription canceled
  - `invoice.payment_succeeded` -- confirms payment
  - `invoice.payment_failed` -- flags payment issues
- **Subscription statuses tracked**: `active`, `trialing`, `canceled`, `past_due`, `canceling`

---

## Database Architecture

### Core Tables

```
auth.users (Supabase built-in)
  |
  +-- coaches (1:1 with auth.users)
  |     |-- id (UUID = auth.users.id)
  |     |-- email, name
  |     |-- stripe_customer_id, subscription_status, subscription_plan
  |     |-- gym_features_enabled, branding_data (JSONB)
  |     |
  |     +-- clients (1:N)
  |     |     |-- id (BIGINT), coach_id (FK)
  |     |     |-- client_name, email, phone, notes
  |     |     |-- dietary restrictions (JSONB), goals, gender
  |     |     |-- calorie_goal, protein_goal, carbs_goal, fat_goal
  |     |     |
  |     |     +-- food_diary_entries (1:N)
  |     |     |     |-- entry_date, meal_type
  |     |     |     |-- food_name, calories, protein, carbs, fat
  |     |     |     |-- serving_size, serving_unit, number_of_servings
  |     |     |
  |     |     +-- workout_logs (1:N)
  |     |     |     |-- workout_date, name, exercises (JSONB)
  |     |     |
  |     |     +-- check_ins (1:N)
  |     |     |     |-- check_in_date, energy, sleep, hunger, stress
  |     |     |     |-- meal_plan_adherence, wins, challenges
  |     |     |
  |     |     +-- progress_photos (1:N)
  |     |     +-- measurements (1:N)
  |     |     +-- supplement_intake (1:N)
  |     |     +-- notifications (1:N)
  |     |     +-- reminder_settings (1:1)
  |     |
  |     +-- coach_meal_plans (1:N)
  |     |     |-- plan_data (JSONB), status (draft/published/archived)
  |     |
  |     +-- workout_programs (1:N)
  |     +-- supplement_protocols (1:N)
  |     +-- stories (1:N)
  |           +-- story_views, story_reactions, story_replies
  |
  +-- shared_meal_plans (public, no auth)
        |-- share_id (unique 20-char), plan_data (JSONB)
```

### Security Model

- **Row Level Security (RLS)** enabled on every table
- Coaches can only query/modify rows where `coach_id = auth.uid()`
- Clients can only query/modify their own rows where `client_id = their_id`
- Shared meal plans are publicly readable (no auth) via `share_id`
- Service role key (bypasses RLS) used exclusively in Netlify server-side functions

---

## API Surface

### Overview

**147+ Netlify serverless functions** organized by domain:

| Domain | Endpoints | Key Operations |
|--------|-----------|----------------|
| **Authentication** | 5 | Login, register, invite, password reset, token validation |
| **Meal Plans** | 8 | CRUD, publish, share, AI generation |
| **Food Diary** | 6 | CRUD, search, favorites |
| **AI Analysis** | 5 | Photo (fast/smart), text, voice, label scanning |
| **AI Assistant** | 3 | Nutrition chat, daily insights, meal brainstorm |
| **Nutrition Goals** | 3 | Get/set calorie & macro goals, validation |
| **Workouts** | 10 | CRUD, exercises, AI generation, swaps, guided, clubs |
| **Supplements** | 4 | Protocols, intake tracking, library |
| **Progress** | 8 | Check-ins, measurements, photos (upload/view/delete) |
| **Stories** | 6 | CRUD, view tracking, reactions, replies |
| **Notifications** | 3 | Get, mark read, reminder settings |
| **Billing** | 5 | Checkout, billing portal, cancel, reactivate, verify |
| **Stripe Webhooks** | 1 | Handles 6 event types |
| **Client Management** | 5 | CRUD, archive, restore |
| **Activity** | 3 | Tracking, dashboard stats, coach feed |
| **File Uploads** | 5 | Photos, profiles, logos, videos, voice notes |
| **Scheduled** | 1 | Hourly check-in reminders |
| **Miscellaneous** | ~65 | Coach interactions, branding, settings, legacy endpoints |

### Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| AI food analysis (photo) | 20 requests/minute |
| AI chat assistant | 30 messages/minute |
| General API | Standard Netlify function limits |

---

## Security & Performance

### Security

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Supabase Auth with JWT tokens, auto-refresh before expiry |
| **Authorization** | Row Level Security (RLS) on every database table |
| **API Protection** | Auth token validation on all protected endpoints |
| **Payment Security** | Stripe webhook signature verification |
| **Data Isolation** | Coach-client data strictly separated at database level |
| **Secrets Management** | All API keys in Netlify environment variables, never in frontend code |
| **Input Validation** | Form validation on client side, server-side validation in functions |
| **CORS** | Configured headers on all API responses |
| **HTTPS** | Enforced via Netlify (automatic SSL/TLS) |

### Performance

| Optimization | Implementation |
|-------------|---------------|
| **Caching** | localStorage for dashboard data, plans, supplements; 2-min session cache for auth |
| **Image Compression** | Client-side compression (max 1200px width, 0.8 JPEG quality) before upload |
| **Video Thumbnails** | Generated from video frames, cached in IndexedDB |
| **Database Queries** | Parallel queries with `Promise.all()`, column selection (15% payload reduction) |
| **Skeleton Screens** | Loading placeholders for perceived performance |
| **Optimistic UI** | Immediate UI updates before server confirmation |
| **Pull-to-Refresh** | Mobile gesture for manual data refresh |
| **Asset Caching** | 1-year immutable cache for versioned JS/CSS; 1-hour cache for HTML |
| **Serverless** | Zero cold-start overhead with Netlify Functions on esbuild |

---

## Deployment & Infrastructure

### Hosting

| Component | Provider | Details |
|-----------|----------|---------|
| **Frontend** | Netlify CDN | Global edge network, automatic SSL |
| **API** | Netlify Functions | Serverless Node.js, auto-scaling |
| **Database** | Supabase | Managed PostgreSQL, real-time subscriptions |
| **File Storage** | Supabase Storage | Signed URLs for secure access |
| **Payments** | Stripe | PCI-compliant payment processing |
| **Email** | Resend | Transactional email delivery |
| **DNS** | Configured for `app.ziquefitness.com` |

### Build Pipeline

```
git push --> Netlify auto-build
  1. npm install (dependencies)
  2. npm run build (Vite compiles React SPA)
  3. Output: /app-test-dist/
  4. Functions bundled from /netlify/functions/
  5. Deploy to CDN + Functions
```

### Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `send-checkin-reminders` | Hourly | Send check-in reminders to clients based on their timezone and preferences |

### SPA Routing

All `/app/*` routes serve the React SPA (`app-test.html`), with client-side routing handling page transitions. Legacy HTML pages (pre-SPA coach portal) redirect to new routes.

---

## Mobile Strategy

### Approach: Hybrid (Capacitor)

The app is built as a **React SPA wrapped in Capacitor** for native mobile distribution:

| Platform | Status | Distribution |
|----------|--------|-------------|
| **Web (PWA)** | Live | Direct browser access, installable as PWA |
| **Android** | Built | Google Play Store (signed AAB/APK) |
| **iOS** | Built | Apple App Store (via Xcode) |

### App Details

| | |
|---|---|
| **App ID** | `com.ziquefitness.mealplanner` |
| **App Name** | Zique Fitness Nutrition |
| **Hostname** | `app.ziquefitness.com` |
| **Display Mode** | Standalone (fullscreen, no browser chrome) |
| **Theme Color** | Teal (#0d9488) |

### Mobile-First Design

- **Bottom navigation** on mobile (5 tabs: Home, Diary, Plans, Workouts, More)
- **Desktop sidebar** hidden on mobile viewports
- **Touch targets** minimum 48px for accessibility
- **Swipe gestures** (left-swipe to delete food entries)
- **Pull-to-refresh** on all data pages
- **Responsive breakpoints**: Mobile (<640px), Tablet (640-1024px), Desktop (>1024px)

---

## Metrics & Scale

### Current Marketing Claims

| Metric | Value |
|--------|-------|
| Active Coaches | 500+ |
| Meal Plans Created | 10,000+ |
| Customer Satisfaction | 98% |
| Exercise Library | 1,500+ exercises |
| API Endpoints | 147+ |

### Scaling Characteristics

| Dimension | Approach |
|-----------|----------|
| **Compute** | Serverless (Netlify Functions) -- auto-scales with demand, zero server management |
| **Database** | Supabase managed PostgreSQL -- scales vertically and with connection pooling |
| **Storage** | Supabase Storage -- unlimited file storage with signed URLs |
| **AI** | API-based (Anthropic, Google, OpenAI) -- scales with API rate limits, no GPU management |
| **CDN** | Netlify global edge -- static assets served from nearest PoP |
| **Cost Model** | Pay-per-use infrastructure: costs scale linearly with usage, not ahead of it |

### Cost Structure

| Component | Cost Model | Estimated at 500 Coaches |
|-----------|-----------|-------------------------|
| **Netlify** | Free tier covers early stage; Pro at $19/mo | ~$19/mo |
| **Supabase** | Free tier to $25/mo Pro | ~$25/mo |
| **Anthropic API** | Per-token pricing | ~$500-1,000/mo |
| **Google Gemini** | Per-token pricing | ~$100-200/mo |
| **Stripe** | 2.9% + $0.30 per transaction | ~$1,500/mo at $49K MRR |
| **Resend** | Free tier to $20/mo | ~$20/mo |
| **Total Infrastructure** | | ~$2,000-3,000/mo |
| **Revenue at 500 coaches** | | ~$49,500/mo |
| **Gross Margin** | | ~94% |

---

## Summary

Zique Fitness Nutrition is a production-grade SaaS platform that solves real operational pain for nutrition and fitness coaches. It combines:

- **AI-powered automation** (meal plans, food analysis, workout programming)
- **Client engagement tools** (food diary, check-ins, progress tracking, stories)
- **Business infrastructure** (billing, branding, client management)
- **Cross-platform delivery** (web, Android, iOS)

...into a single product that lets coaches focus on coaching instead of administration.

The platform is built on a modern serverless stack (React + Netlify Functions + Supabase) that scales efficiently, with a clear $49-$199/month pricing model that grows with each coach's business. At 500+ coaches with an average ~$99/month, the business generates approximately $50K MRR with 90%+ gross margins.

This is not a prototype. This is a fully functional, AI-integrated, mobile-ready coaching platform with 147+ API endpoints, 1,500+ exercises, real-time progress tracking, and Stripe-powered subscriptions -- ready for coaches to build their businesses on.
