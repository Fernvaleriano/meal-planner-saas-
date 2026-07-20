// English strings for the Progress page (src/pages/Progress.jsx).
// Namespace: progressPage  →  t('progressPage.<key>')
// Curly-brace tokens like {count} are filled in at runtime by t().
export default {
  // ── Page header ──────────────────────────────────────────────
  pageTitle: 'Progress',

  // ── Tabs ─────────────────────────────────────────────────────
  tabMeasurements: 'Measurements',
  tabPhotos: 'Photos',
  tabBadges: 'Badges',

  // ── TIME_FRAMES — short labels rendered by the segmented control ──
  // The full labels (e.g. '1 Week') are kept in TIME_FRAMES for aria
  // but only shortLabels are displayed; both sets are here for completeness.
  timeframe1wLabel: '1 Week',
  timeframe1wShort: '1W',
  timeframe1mLabel: '1 Month',
  timeframe1mShort: '1M',
  timeframe3mLabel: '3 Months',
  timeframe3mShort: '3M',
  timeframe6mLabel: '6 Months',
  timeframe6mShort: '6M',
  timeframe1yLabel: '1 Year',
  timeframe1yShort: '1Y',
  timeframeAllLabel: 'All Time',
  timeframeAllShort: 'All',

  // ── METRIC_CONFIGS — display labels ──────────────────────────
  metricWeight: 'Weight',
  metricBodyFat: 'Body Fat',
  metricMuscleMass: 'Muscle Mass',
  metricVisceralFat: 'Visceral Fat',
  metricWaist: 'Waist',
  metricChest: 'Chest',
  metricHips: 'Hips',
  metricLeftArm: 'Left Arm',
  metricRightArm: 'Right Arm',
  metricLeftThigh: 'Left Thigh',
  metricRightThigh: 'Right Thigh',
  metricBpSystolic: 'Blood Pressure - Systolic',
  metricBpDiastolic: 'Blood Pressure - Diastolic',
  metricPulse: 'Pulse',

  // ── Measurements tab ─────────────────────────────────────────
  logAllMeasurements: 'Log All Measurements',
  scanInbody: 'Scan InBody',
  inbodyScanning: 'Reading scan…',
  inbodyScanned: 'Scan read! Check the values, then save.',
  inbodyScanFailed: "Couldn't read that scan. Try a clearer photo, or enter the numbers by hand.",
  scanBp: 'Scan blood pressure',
  bpScanning: 'Reading monitor…',
  bpScanned: 'Reading captured! Check the numbers, then save.',
  bpScanFailed: "Couldn't read that monitor. Try a clearer photo, or enter the numbers by hand.",
  inbodyScansTitle: 'InBody Scans',
  inbodyNoDetails: 'No extra details were read from this scan.',
  loadingMeasurements: 'Loading measurements...',
  noDataForTimeFrame: 'No data for selected time frame',
  logValue: 'Log Value',
  // History toggle: 'View entries (5)' / 'Hide entries (5)'
  viewEntries: 'View entries ({count})',
  hideEntries: 'Hide entries ({count})',
  deleteEntryAriaLabel: 'Delete entry',
  showingMostRecent: 'Showing the most recent {shown} of {total}',
  trackMore: 'Track more',
  noMeasurementsYet: 'No measurements yet. Tap "Log All Measurements" to start.',

  // ── Photos tab ───────────────────────────────────────────────
  addPhoto: '+ Add Photo',
  selectBeforePhoto: '① Select your BEFORE photo',
  selectAfterPhoto: '② Now select your AFTER photo',
  progressPhotosTitle: 'Progress Photos',
  compare: 'Compare',
  cancel: 'Cancel',
  loadingPhotos: 'Loading photos...',
  noPhotosYet: 'No progress photos yet',
  noPhotosSubtitle: 'Take your first photo to track your transformation journey!',
  // Labels overlaid on selected photos in compare mode
  labelBefore: 'Before',
  labelAfter: 'After',
  // Photo type display labels (used in comparison badge overlay)
  photoTypeFront: 'Front',
  photoTypeSide: 'Side',
  photoTypeBack: 'Back',
  photoTypeProgress: 'Progress',

  // ── Photo selection confirmation modal ───────────────────────
  useAsBeforePhoto: 'Use as your BEFORE photo?',
  useAsAfterPhoto: 'Use as your AFTER photo?',
  beforePhotoDesc: 'This will be your starting point for comparison.',
  afterPhotoDesc: 'This will be compared against your before photo.',
  yesBeforeBtn: 'Yes, Before',
  yesAfterBtn: 'Yes, After',

  // ── Comparison modal ─────────────────────────────────────────
  photoComparison: 'Photo Comparison',
  analyzing: 'Analyzing...',
  getAiAnalysis: 'Get AI Analysis',
  aiCoachAnalysis: 'AI Coach Analysis',

  // ── Achievements / Badges tab ────────────────────────────────
  loadingAchievements: 'Loading achievements...',
  checkIns: 'Check-ins',
  badgesEarned: 'Badges Earned',
  // '{remaining} more to unlock <BadgeName>'  — only the prefix is translated
  moreToUnlock: '{remaining} more to unlock',
  generatingShare: 'Generating…',
  shareToSocial: 'Share to social media',
  earnedRibbon: 'Earned',

  // ── Quick-log modal ──────────────────────────────────────────
  saving: 'Saving...',
  save: 'Save',

  // ── Delete-entry confirmation modal ─────────────────────────
  deleteEntryTitle: 'Delete entry?',
  // Dynamic: 'Remove the weight entry of 72.5 kg from Jun 1, 2026? If this came from a Weigh-In photo, the photo will be removed too.'
  // {label} = lowercase metric name, {value} = number, {unit} = unit string, {date} = formatted date
  deleteEntryBody: 'Remove the {label} entry of {value} {unit} from {date}? If this came from a Weigh-In photo, the photo will be removed too.',
  delete: 'Delete',
  entryDeleted: 'Entry deleted',

  // ── Full measurement modal ────────────────────────────────────
  logAllMeasurementsTitle: 'Log All Measurements',
  formDate: 'Date',
  // '{unit}' is the runtime weight/circumference abbreviation (kg, lbs, cm, in)
  formWeightLabel: 'Weight ({unit})',
  formBodyFat: 'Body Fat %',
  formMuscleMass: 'Muscle Mass ({unit})',
  formVisceralFat: 'Visceral Fat',
  formChest: 'Chest ({unit})',
  formWaist: 'Waist ({unit})',
  formHips: 'Hips ({unit})',
  formLeftArm: 'Left Arm ({unit})',
  formRightArm: 'Right Arm ({unit})',
  formLeftThigh: 'Left Thigh ({unit})',
  formRightThigh: 'Right Thigh ({unit})',
  formBpSystolic: 'BP Systolic (mmHg)',
  formBpDiastolic: 'BP Diastolic (mmHg)',
  formPulse: 'Pulse (bpm)',
  formNotes: 'Notes (optional)',
  formNotesPh: 'Any notes...',
  saveMeasurement: 'Save Measurement',

  // ── Photo upload modal ────────────────────────────────────────
  addPhotoTitle: 'Add Photo',
  tapToSelectPhoto: 'Tap to select photo',
  photoTypeLabel: 'Photo Type',
  photoTypeOptProgress: 'Progress',
  photoTypeOptFront: 'Front View',
  photoTypeOptSide: 'Side View',
  photoTypeOptBack: 'Back View',
  uploading: 'Uploading...',
  uploadPhoto: 'Upload Photo',
  selectPhoto: 'Select Photo',
  chooseDifferentPhoto: 'Choose Different Photo',

  // ── Toast / error messages ────────────────────────────────────
  sessionMissing: 'Session data missing. Please refresh the page and try again.',
  measurementSaved: 'Measurement saved!',
  errorSavingMeasurement: 'Error saving measurement. Please try again.',
  failedDeleteMeasurement: 'Failed to delete measurement. Please try again.',
  failedDeletePhoto: 'Failed to delete photo. Please try again.',
  errorProcessingPhoto: 'Error processing photo. Please try a different image.',
  pleaseSelectPhoto: 'Please select a photo first.',
  photoUploaded: 'Photo uploaded!',
  errorUploadingPhoto: 'Error uploading photo. Please try again.',
  unableToAnalyze: 'Unable to analyze photos right now. Please try again later.',
  deletePhotoConfirm: 'Delete photo from {date}?',
  errorSavingQuickLog: 'Error saving. Please try again.',
  imageSaved: 'Image saved — ready to share!',
  couldNotGenerateShare: 'Could not generate share image',
};
