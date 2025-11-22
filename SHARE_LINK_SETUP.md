# Share Link Feature - Setup Guide

This guide explains how to set up and use the new share link functionality for meal plans.

## Overview

The share link feature allows coaches to generate shareable URLs for meal plans that clients can access. Clients have full access to view, change, and revise meals using the same functionality available to coaches.

## Features Implemented

✅ **Share Link Generation** - Coaches can generate unique shareable URLs
✅ **Database Storage** - Meal plans are stored in Supabase for persistent access
✅ **Client Access** - Clients can view shared plans without authentication
✅ **Full Functionality** - Clients can Change and Revise meals just like coaches
✅ **Copy to Clipboard** - Easy one-click link copying
✅ **Responsive Modal** - Beautiful share link display modal

## Setup Instructions

### 1. Install Dependencies

Run the following command in your project directory:

```bash
npm install
```

This will install the required `@supabase/supabase-js` package.

### 2. Create Database Table

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**
4. Copy and paste the contents of `database-setup.sql`
5. Click **Run** to create the `shared_meal_plans` table

The table structure includes:
- `id` - Primary key
- `share_id` - Unique 8-character identifier used in URLs
- `plan_data` - JSONB column storing the complete meal plan
- `created_at` - Timestamp
- `updated_at` - Timestamp

### 3. Configure Environment Variables

You need to set up environment variables for Netlify Functions to access Supabase.

#### For Local Development

Create a `.env` file in the root directory:

```bash
SUPABASE_URL=https://qewqcjzlfqamqwbccapr.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
GEMINI_API_KEY=your-existing-gemini-key
```

To get your Supabase Service Key:
1. Go to Supabase Dashboard → Settings → API
2. Copy the `service_role` key (NOT the `anon` key)
3. ⚠️ **IMPORTANT**: The service role key bypasses Row Level Security - keep it secret!

#### For Production (Netlify)

1. Go to your Netlify Dashboard
2. Navigate to **Site Settings** → **Environment Variables**
3. Add the following variables:
   - `SUPABASE_URL` = `https://qewqcjzlfqamqwbccapr.supabase.co`
   - `SUPABASE_SERVICE_KEY` = `your-service-role-key`
   - `GEMINI_API_KEY` = `your-existing-gemini-key`

### 4. Deploy to Netlify

After setting up the environment variables, deploy your site:

```bash
git add .
git commit -m "Add share link functionality"
git push origin main
```

Netlify will automatically rebuild your site with the new Netlify Functions.

## How It Works

### For Coaches

1. **Generate a meal plan** using the meal plan generator
2. **View the plan** on `view-plan.html`
3. **Click "🔗 Share Plan Link"** button
4. **Copy the generated link** and send it to your client

### For Clients

1. **Receive the share link** from their coach (e.g., `https://yoursite.com/view-plan.html?share=abc12345`)
2. **Click the link** to view their personalized meal plan
3. **Use all features**:
   - View complete nutrition breakdown
   - Change meals to get different options
   - Revise meals with custom requests
   - Download PDF of the plan

### Technical Flow

```
Coach generates plan → Clicks "Share" → Plan saved to Supabase
                                      ↓
                           Unique URL generated (share_id)
                                      ↓
                           Coach copies and shares URL
                                      ↓
Client clicks link → URL contains ?share=abc12345 → Plan loaded from Supabase
                                      ↓
                           Client can view & modify plan
```

## File Structure

```
meal-planner-saas-/
├── netlify/
│   └── functions/
│       ├── generate-meal-plan.js      # Existing AI meal generation
│       ├── save-shared-plan.js        # NEW: Save plans to database
│       └── get-shared-plan.js         # NEW: Retrieve shared plans
├── view-plan.html                     # UPDATED: Added share functionality
├── database-setup.sql                 # NEW: Database schema
├── package.json                       # NEW: Dependencies
└── SHARE_LINK_SETUP.md               # This file
```

## API Endpoints

### Save Shared Plan
- **Endpoint**: `/.netlify/functions/save-shared-plan`
- **Method**: POST
- **Body**: `{ "planData": {...} }`
- **Response**: `{ "shareId": "abc12345", "shareUrl": "https://..." }`

### Get Shared Plan
- **Endpoint**: `/.netlify/functions/get-shared-plan?shareId=abc12345`
- **Method**: GET
- **Response**: `{ "planData": {...}, "createdAt": "..." }`

## Security Considerations

✅ **Row Level Security (RLS)** enabled on the database table
✅ **Public read access** for shared plans (required for client access)
✅ **Service key** used only in server-side Netlify Functions
✅ **Unique share IDs** prevent URL guessing

## Troubleshooting

### "Failed to generate share link"
- Check that `SUPABASE_SERVICE_KEY` is set in Netlify environment variables
- Verify the database table was created correctly
- Check Netlify function logs for detailed errors

### "Failed to load shared plan"
- Verify the share ID is correct in the URL
- Check that the plan exists in the database
- Ensure Row Level Security policies are set correctly

### Dependencies not found
- Run `npm install` in your project directory
- Redeploy to Netlify after installing dependencies

## Testing the Feature

1. **Local Testing**:
   ```bash
   netlify dev
   ```
   This will start a local development server with Netlify Functions.

2. **Generate a test plan** at `http://localhost:8888/generator.html`

3. **View the plan** at `http://localhost:8888/view-plan.html`

4. **Click "Share Plan Link"** to test the share functionality

5. **Open the generated link** in a new incognito window to simulate a client

## Support

If you encounter any issues:
1. Check the browser console for JavaScript errors
2. Check Netlify function logs in the Netlify dashboard
3. Verify all environment variables are set correctly
4. Ensure the database table was created successfully

---

**Happy Sharing! 🎉**
