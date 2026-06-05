// English strings (the default / source language).
//
// Structure: grouped by area (common, login, settings, language). Keys are
// looked up by dot-path, e.g. t('settings.preferences'). Curly-brace tokens
// like {email} are filled in at runtime by the t() helper.
//
// When adding a NEW user-facing string anywhere in the React app, add it here
// first, then add the matching Spanish line in es.js. Anything missing from
// es.js automatically falls back to the English text here, so the app never
// shows a blank — it just shows English until the Spanish line is added.
export default {
  common: {
    save: 'Save',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    cancel: 'Cancel',
    loading: 'Loading...',
    edit: 'Edit',
    select: 'Select',
    notSet: 'Not set',
    tryAgain: 'Try again',
    signOut: 'Sign out',
    yes: 'Yes',
  },

  login: {
    welcomeBack: 'Welcome Back',
    signInPortal: 'Sign in to your client portal',
    signInTo: 'Sign in to {brand}',
    email: 'Email',
    emailPlaceholder: 'your@email.com',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    forgot: 'Forgot your password?',
    notClient: 'Not a client? Go back to select your role',
    poweredBy: 'Powered by {brand}',
    poweredByDefault: 'Powered by Ziquecoach',
    loginFailed: 'Login failed',
    notRegistered: 'This account is not registered as a client',
  },

  language: {
    title: 'Language',
    subtitle: 'Choose your language',
  },

  // Bottom-nav / sidebar tab names. These are the DEFAULTS — a coach who
  // renames a tab in Branding Settings always overrides these, in any
  // language. English values here must match DEFAULT_TERMINOLOGY in
  // BrandingContext exactly so English behavior is unchanged.
  nav: {
    home: 'Home',
    diary: 'Diary',
    plans: 'Meals',
    workouts: 'Workouts',
    messages: 'Messages',
    meals: 'Meals',
    check_in: 'Check-In',
    progress: 'Progress',
    recipes: 'Recipes',
  },

  settings: {
    // Profile header
    defaultUser: 'User',

    // My Coach
    myCoach: 'MY COACH',
    nutritionCoach: 'Nutrition Coach',
    message: 'Message',
    messageYourCoach: 'Message your coach',

    // My Profile
    myProfile: 'MY PROFILE',
    editProfileAria: 'Edit profile',
    physicalStats: 'Physical Stats',
    activityLevel: 'Activity Level',
    dietFoodPreferences: 'Diet & Food Preferences',
    allergies: 'Allergies',
    dislikedFoods: 'Disliked Foods',
    preferredFoods: 'Preferred Foods',
    proteinPowder: 'Protein Powder',
    mealsPerDayShort: '{count} meals/day',

    // Activity labels
    activity: {
      sedentary: 'Sedentary',
      lightlyActive: 'Lightly Active',
      moderatelyActive: 'Moderately Active',
      veryActive: 'Very Active',
      extraActive: 'Extra Active',
    },

    // Preferences
    preferences: 'PREFERENCES',
    darkMode: 'Dark Mode',
    darkModeSub: 'Easier on the eyes at night',
    exerciseDemos: 'Exercise Demos',
    exerciseDemosSub: 'Choose demonstration style',
    optAll: 'All',
    optMale: 'Male',
    optFemale: 'Female',
    weightUnit: 'Weight Unit',
    weightUnitSub: 'Kilograms or pounds',
    waterGoal: 'Water Goal',
    waterGoalSub: 'Daily intake target',
    waterGlasses: 'glasses',
    waterOz: 'oz',
    waterMl: 'mL',
    waterLiters: 'liters',
    languageRow: 'Language',
    languageRowSub: 'Choose your language',

    // Coach tools
    coachTools: 'COACH TOOLS',
    brandingSettings: 'Branding Settings',
    brandingSettingsSub: 'Colors, fonts, modules, terminology',
    clientBilling: 'Client Billing',
    clientBillingSub: 'Payment plans, revenue, promo codes',

    // Billing (client)
    billing: 'BILLING',
    billingSubscription: 'Billing & Subscription',
    billingSubscriptionSub: 'Manage your plan, payments, invoices',

    // Help
    helpSupport: 'HELP & SUPPORT',
    appTutorial: 'App Tutorial',
    appTutorialSub: 'Watch a quick walkthrough of the app',

    // Account
    account: 'ACCOUNT',
    changePassword: 'Change Password',
    changePasswordSub: 'Update your account password',
    exportData: 'Export My Data',
    exportDataSub: 'Email me a copy of my data (link expires in 1 hour)',
    deleteAccount: 'Delete My Account',
    deleteAccountSub: 'Deactivates now; permanently deleted after 30 days',
    logOut: 'Log Out',
    version: '{brand} · v1.0',

    // Logout confirm
    logoutConfirm: 'Are you sure you want to log out?',

    // Password modal
    pwSendLinkIntro: "We'll send a password reset link to your email address:",
    pwSend: 'Send Reset Email',
    pwSending: 'Sending...',
    pwNoEmail: 'No email address found for your account',
    pwSent: 'Password reset email sent to {email}. Check your inbox!',
    pwFailed: 'Failed to send reset email. Please try again.',

    // Delete modal
    deleteIntro: 'This will deactivate your account immediately, sign you out, cancel billing, and permanently delete your data in 30 days. To cancel within 30 days, email contact@ziquecoach.com.',
    deleteTypeToConfirm: 'Type DELETE to confirm:',
    deleteConfirmPlaceholder: 'DELETE',
    deleteConfirmBtn: 'Permanently Delete My Account',
    deleting: 'Deleting...',
    deleteScheduled: 'Your account is scheduled for deletion.',
    deleteCannotYet: 'This account cannot be deleted yet.',
    deleteFailed: 'Could not process the deletion request. Please try again.',

    // Export toasts
    exportSent: 'Your data export has been emailed to you.',
    exportRateLimited: 'You can request one data export every 24 hours.',
    exportFailed: 'Could not start your data export. Please try again later.',

    // Photo
    photoWaitProfile: 'Please wait for your profile to load',
    photoUpdated: 'Profile photo updated!',
    photoFailed: 'Failed to upload photo. Please try again.',

    // Profile save toasts
    profileSaveFailed: 'Failed to save profile. Please try again.',

    // Preference toasts
    prefUpdateFailed: 'Failed to update preference. Please try again.',
    waterGoalUpdateFailed: 'Failed to update water goal. Please try again.',
    waterUnitUpdateFailed: 'Failed to update water unit. Please try again.',

    // Edit Profile modal
    editProfile: 'Edit Profile',
    fitnessWorkout: 'Fitness & Workout',
    age: 'Age',
    agePlaceholder: 'e.g. 30',
    gender: 'Gender',
    weightWithUnit: 'Weight ({unit})',
    weightPlaceholder: 'e.g. 185',
    height: 'Height',
    heightFt: 'ft',
    heightIn: 'in',
    fitnessLevel: 'Fitness Level',
    fitnessLevelBeginner: 'Complete Beginner',
    fitnessLevelSome: 'Some Experience',
    fitnessLevelIntermediate: 'Intermediate',
    fitnessLevelAdvanced: 'Advanced',
    exerciseFrequency: 'Exercise Frequency',
    freqNone: 'Not at all right now',
    freq12: '1-2 times per week',
    freq34: '3-4 times per week',
    freq5: '5+ times per week',
    workoutDuration: 'Workout Duration',
    dur1530: '15-30 minutes',
    dur3045: '30-45 minutes',
    dur4560: '45-60 minutes',
    dur60: '60+ minutes',
    equipmentAccess: 'Equipment Access',
    equipFullGym: 'Full Gym Membership',
    equipHomeGym: 'Home Gym with Equipment',
    equipMinimal: 'Minimal Equipment',
    equipBodyweight: 'No Equipment (bodyweight)',
    exerciseTypesEnjoy: 'Exercise Types You Enjoy',
    typeWeightTraining: 'Weight Training',
    typeCardio: 'Cardio',
    typeHiit: 'HIIT / Circuit',
    typeYoga: 'Yoga / Pilates',
    typeGroup: 'Group Classes',
    typeSports: 'Sports',
    typeWalking: 'Walking / Hiking',
    typeSwimming: 'Swimming',
    healthConcerns: 'Health Concerns / Injuries',
    healthConcernsPlaceholder: "e.g. Shoulder injury, bad knees... Type 'None' if none.",
    fitnessGoals: 'Fitness Goals',
    fitnessGoalsPlaceholder: 'e.g. Run a 5K, do 10 pull-ups, improve flexibility...',
    dietType: 'Diet Type',
    dietOmnivore: 'Omnivore',
    dietVegetarian: 'Vegetarian',
    dietVegan: 'Vegan',
    dietKeto: 'Keto',
    dietPaleo: 'Paleo',
    mealsPerDay: 'Meals Per Day',
    macroPreference: 'Macro Preference',
    macroBalancedDefault: 'Balanced (default)',
    macroBalanced: 'Balanced',
    macroHighProtein: 'High Protein',
    macroLowCarb: 'Low Carb',
    macroHighCarb: 'High Carb',
    macroLowFat: 'Low Fat',
    allergiesPlaceholder: 'e.g. Shellfish, Peanuts',
    dislikedFoodsPlaceholder: 'e.g. Mushrooms, Olives',
    preferredFoodsPlaceholder: 'e.g. Chicken, Rice, Broccoli',
    cookingEquipment: 'Cooking Equipment',
    cookingEquipmentPlaceholder: 'e.g. Oven, Air Fryer, Stovetop',
    budget: 'Budget',
    budgetFriendly: 'Budget-Friendly',
    budgetModerate: 'Moderate',
    budgetPremium: 'Premium',
    iUseProteinPowder: 'I use protein powder',
    brand: 'Brand',
    brandPlaceholder: 'e.g. Optimum Nutrition',
    calories: 'Calories',
    proteinG: 'Protein (g)',
    carbsG: 'Carbs (g)',
    fatG: 'Fat (g)',
  },
};
