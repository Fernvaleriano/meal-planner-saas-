# Meal Planner SaaS for Coaches

AI-powered fitness and nutrition platform connecting coaches with clients. Built with React, Supabase, Stripe, and Netlify Functions.

## Tech Stack

- **Frontend**: React 18 SPA (Vite), PWA with offline support
- **Backend**: 156 Netlify serverless functions
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Payments**: Stripe (subscriptions, checkout, webhooks)
- **AI**: Anthropic Claude, OpenAI, Google Gemini
- **Nutrition APIs**: Edamam, Spoonacular
- **Email**: Resend / SendGrid / Mailgun
- **Mobile**: Capacitor (iOS + Android)

## Features

- AI-powered meal plan generation
- Workout builder with 1500+ exercise library
- Coach-client chat with media sharing
- Food diary with photo analysis
- Progress tracking (photos, measurements, weight)
- Supplement protocols and tracking
- Custom intake forms and check-ins
- Coach stories/feed
- White-label branding for coaches
- Stripe subscription billing (Starter, Growth, Professional)

## Quick Start

### Prerequisites

- Node.js 18+
- Netlify CLI (`npm i -g netlify-cli`)
- Supabase project (with service role key)
- Stripe account

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd meal-planner-saas-

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your actual keys (see .env.example for all required vars)

# Run database migrations
# Apply migrations in order from supabase/migrations/ via Supabase Dashboard or CLI

# Start development server
npm run dev
```

### Development Commands

```bash
npm run dev          # Full Netlify dev server (functions + frontend)
npm run dev:spa      # Vite dev server only (frontend)
npm run build        # Production build

# Mobile
npm run cap:sync     # Sync Capacitor
npm run cap:ios      # Open iOS project
npm run cap:android  # Open Android project

# Android builds
npm run android:build-debug    # Debug APK
npm run android:build-release  # Release AAB
npm run android:build-apk      # Release APK

# Utilities
npm run import:exercises       # Import exercise library
npm run upload:videos          # Upload exercise videos
```

## Environment Variables

See [`.env.example`](.env.example) for the full list of required environment variables. At minimum you need:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `ANTHROPIC_API_KEY` | Yes | For AI meal plan generation |
| `RESEND_API_KEY` | Yes* | Email provider (or SendGrid/Mailgun) |
| `URL` | Yes | Your production domain URL |

## Deployment

### Netlify (Production)

1. Connect repo to Netlify
2. Set all environment variables in Netlify Dashboard > Site Settings > Environment
3. Build command: `npm install && npm run build`
4. Deploy directory: `.` (root)
5. Set up Stripe webhook pointing to `https://yourdomain.com/.netlify/functions/stripe-webhook`

### Stripe Webhook Events

Configure your Stripe webhook to listen for:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Project Structure

```
├── netlify/functions/     # 156 serverless API endpoints
│   └── utils/             # Shared auth, email, helpers
├── src/                   # React SPA source
│   ├── components/        # Reusable UI components
│   ├── pages/             # Route pages
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Client utilities
├── supabase/migrations/   # 58 database migrations
├── css/                   # Legacy page styles
├── js/                    # Legacy page scripts
├── icons/                 # App icons and assets
├── android/               # Capacitor Android project
└── ios/                   # Capacitor iOS project
```

## Security

- Row-Level Security (RLS) on all Supabase tables
- JWT authentication on all API endpoints
- Signed URLs for file access (7-day expiry)
- Rate limiting on AI/upload endpoints
- Security headers (X-Frame-Options, HSTS, etc.)
- Input sanitization on file uploads

## License

Proprietary - All rights reserved.
