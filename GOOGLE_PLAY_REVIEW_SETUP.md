# Google Play Review - Test Account Setup

This document provides instructions for setting up test credentials for Google Play app review.

## Issue Summary

Google Play rejected the app for two reasons:
1. **Icon Mismatch** - The Android launcher icon didn't match the store listing (FIXED)
2. **Invalid Login Credentials** - The credentials provided didn't work

## How to Create Test Credentials

### Option A: Create a Test Client Account (Recommended)

The mobile app is primarily designed for clients, so provide client credentials:

1. **Create a test coach account first** (if you don't have one):
   - Go to https://app.ziquefitness.com/signup.html
   - Create a coach account with a test email

2. **Create a test client from the coach dashboard**:
   - Log in as the coach
   - Go to Clients section
   - Add a new client with:
     - Name: `Google Play Reviewer`
     - Email: `playstore-test@ziquefitness.com` (or similar test email)
     - Password: Create a simple password like `TestReview2024!`

3. **Verify the client can log in**:
   - Go to https://app.ziquefitness.com/client-login.html
   - Test the credentials work

### Option B: Create a Test Coach Account

If you want reviewers to test coach features:

1. Go to https://app.ziquefitness.com/signup.html
2. Create account:
   - Email: `playstore-reviewer@ziquefitness.com`
   - Password: `TestReview2024!`

3. Verify login works at https://app.ziquefitness.com/login.html

## Providing Credentials to Google Play

1. Go to **Play Console** > Your App > **App content**
2. Click on **App access**
3. Select **"All or some functionality is restricted"**
4. Add instructions:

```
Test Account Credentials:

For Client Portal (primary app experience):
- Open the app
- Tap "Client Login"
- Email: [your test client email]
- Password: [your test password]

For Coach Portal (admin features):
- Open the app
- Tap "Coach Login"
- Email: [your test coach email]
- Password: [your test password]
```

5. Save and submit for review

## Important Notes

- Use dedicated test accounts (don't use production accounts)
- Test credentials before submitting to Google Play
- Don't use accounts with real client data
- Ensure the test account has some sample data (meal plans, etc.) so reviewers can see app functionality

## Checklist Before Resubmission

- [ ] Android launcher icons updated (now using Zique Fitness logo)
- [ ] Test client account created and verified
- [ ] Test coach account created and verified (optional)
- [ ] Credentials entered in Play Console App Access section
- [ ] Sample data added to test accounts
- [ ] App rebuilt with new icons
- [ ] New APK/AAB uploaded to Play Console
