# Google Play Store Release Guide

This guide walks you through publishing Zique Fitness Nutrition to the Google Play Store.

## Prerequisites

- Java JDK 17+ installed
- Android SDK (via Android Studio)
- Google Play Developer Account ($25 one-time fee)

## Step 1: Create Your Signing Keystore

Your keystore is used to sign all releases. **Keep it safe forever** - you cannot update your app without it.

```bash
keytool -genkey -v \
  -keystore ziquefitness-release.keystore \
  -alias ziquefitness \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted for:
- Keystore password (save this!)
- Your name, organization, city, state, country
- Key password (can be same as keystore password)

**IMPORTANT**:
- Store the keystore file securely (NOT in git)
- Save the passwords in a password manager
- Back up to multiple secure locations

## Step 2: Set Environment Variables

Before building, set these environment variables:

```bash
export ZIQUE_KEYSTORE_FILE="/path/to/ziquefitness-release.keystore"
export ZIQUE_KEYSTORE_PASSWORD="your-keystore-password"
export ZIQUE_KEY_ALIAS="ziquefitness"
export ZIQUE_KEY_PASSWORD="your-key-password"
```

For persistent use, add to your `~/.bashrc` or `~/.zshrc`.

## Step 3: Build the Release Bundle

Google Play requires an Android App Bundle (AAB):

```bash
# Build the signed release bundle
npm run android:build-release
```

The output will be at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### Alternative: Build APK (for testing)

```bash
npm run android:build-apk
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## Step 4: Test Your Release Build

Before uploading, test on a real device:

```bash
# Install the APK
adb install android/app/build/outputs/apk/release/app-release.apk
```

Verify:
- [ ] App launches correctly
- [ ] All features work
- [ ] No debug logs visible
- [ ] Performance is acceptable

## Step 5: Prepare Play Store Listing

### Required Assets

| Asset | Dimensions | Notes |
|-------|------------|-------|
| App Icon | 512x512 PNG | Already have |
| Feature Graphic | 1024x500 PNG | Promotional banner |
| Phone Screenshots | 1080x1920+ | Min 2, max 8 |
| Tablet Screenshots | 1920x1080+ | Optional but recommended |

### Required Information

1. **App Title**: Zique Fitness Nutrition (max 30 chars)
2. **Short Description**: AI-powered meal planning for your fitness goals (max 80 chars)
3. **Full Description**: Up to 4000 chars describing features
4. **Privacy Policy URL**: Required (you collect user data)
5. **Category**: Health & Fitness
6. **Content Rating**: Complete the questionnaire in Play Console
7. **Contact Email**: Required for users to reach you

### Privacy Policy

Since you collect user data (account info, meal preferences), you need a privacy policy. Host it at a URL like:
- `https://app.ziquefitness.com/privacy-policy`

## Step 6: Create Play Console Listing

1. Go to [Google Play Console](https://play.google.com/console)
2. Create a new app
3. Fill in store listing details
4. Upload screenshots and graphics
5. Complete content rating questionnaire
6. Set up pricing (Free or Paid)
7. Select countries for distribution

## Step 7: Upload Your Bundle

1. Go to **Release** > **Production** (or start with Internal/Closed testing)
2. Create a new release
3. Upload your `app-release.aab` file
4. Add release notes
5. Review and roll out

## Version Management

For each new release, update in `android/app/build.gradle`:

```gradle
versionCode 2        // Increment by 1 for each release
versionName "1.1.0"  // Semantic versioning
```

- `versionCode`: Integer that must increase with each upload
- `versionName`: User-visible version string

## Testing Tracks

Use these for staged rollouts:

1. **Internal Testing**: Up to 100 testers, instant approval
2. **Closed Testing**: Invite-only, good for beta
3. **Open Testing**: Anyone can join from Play Store
4. **Production**: Full public release

## Troubleshooting

### Build fails with signing error
- Verify environment variables are set correctly
- Check keystore file path is absolute
- Ensure passwords don't contain special characters that need escaping

### App rejected for "not enough native functionality"
- Add push notifications (Firebase Cloud Messaging)
- Implement native features like app shortcuts or widgets
- Show offline functionality

### ProGuard/minification issues
- Check `proguard-rules.pro` for missing keep rules
- Test release build thoroughly before uploading

## Useful Commands

```bash
# Check signing configuration
cd android && ./gradlew signingReport

# Clean build
cd android && ./gradlew clean

# Build debug APK for testing
npm run android:build-debug
```

## Security Notes

Never commit to git:
- `*.keystore` files
- Passwords or secrets
- `google-services.json` (if using Firebase)

Add to `.gitignore`:
```
*.keystore
*.jks
google-services.json
```
