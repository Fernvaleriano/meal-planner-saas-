// English strings for src/pages/Messages.jsx
// Namespace: messagesPage  →  t('messagesPage.<key>')
export default {
  // Page heading
  heading: 'Messages',

  // Conversation list
  loadingConversations: 'Loading conversations...',
  noConversations: 'No conversations yet',
  searchPlaceholder: 'Search clients...',
  yourCoach: 'Your Coach',

  // Conversation preview
  youPrefix: 'You: ',
  noMessagesYet: 'No messages yet',

  // Time labels
  yesterday: 'Yesterday',

  // Empty thread state
  noMessagesThread: 'No messages yet',
  startConversation: 'Send a message to start the conversation',

  // Input bar
  inputPlaceholder: 'Send a message...',
  attachTitle: 'Send photo or video',

  // Message actions
  unsend: 'Unsend',
  reactTitle: 'React',

  // Media preview alt text
  previewAlt: 'Preview',
  fullSizeAlt: 'Full size',
  gifAlt: 'GIF',
  photoAlt: 'Photo',

  // Conversation preview snippets (not user-typed content — these are
  // app-generated placeholders when a media file was the last message)
  sentVideo: 'Sent a video',
  sentPhoto: 'Sent a photo',
  sentGif: 'Sent a GIF',

  // Bulk messaging (coach only)
  massMessage: 'Mass message',
  cancelBulk: 'Cancel',
  selectedCount: '{count} selected',
  selectAll: 'Select all',
  clearSelection: 'Clear',
  bulkPlaceholder: 'Write a message to selected clients...',
  bulkSending: 'Sending...',
  // Singular and plural are separate keys; component picks the right one.
  bulkSendOne: 'Send to {count} client',
  bulkSendMany: 'Send to {count} clients',

  // Toast / error messages
  errorFileType: 'Please select an image or video file.',
  errorFileTooLarge: 'File too large. Maximum size is 250MB.',
  errorUploadMedia: 'Failed to upload media. Please try again or use a smaller file.',
  errorSendMessage: 'Failed to send message. Please try again.',
  errorBulkSend: 'Failed to send bulk message. Please try again.',
  successBulkSent: 'Message sent to selected clients.',

  // Internal thrown error messages (caught and shown to user)
  errorGetUploadUrl: 'Failed to get upload URL',
  errorUploadStorage: 'Failed to upload file to storage',

  // Coach-reaction chat pills ("Reacted {emoji} to {subject}"). Only used
  // when the client is in Spanish; English renders the server text as-is.
  reactedTo: 'Reacted {emoji} to {subject}',
  reactSubjMeasurementOf: 'your measurement of {value}',
  reactSubjCheckinDetail: 'your check-in ({detail})',
  reactSubjNamedWorkout: 'your "{name}" workout',
  reactSubjNewPrDetail: 'your new PR ({detail})',
  reactSubjVoiceNoteOn: 'your voice note on {exercise}',
  reactSubjNoteOn: 'your note on {exercise}',
  reactSubjGymCheckinDetail: 'your {detail} gym check-in',
  reactSubjTypedPhoto: 'your {type} photo',
  reactSubjWorkout: 'your workout',
  reactSubjMeasurements: 'your measurements',
  reactSubjWeighIn: 'your weigh-in',
  reactSubjGymCheckin: 'your gym check-in',
  reactSubjCheckin: 'your check-in',
  reactSubjCheckinWeekly: 'your weekly check-in',
  reactSubjProgressPhoto: 'your progress photo',
  reactSubjPr: 'your PR',
  reactSubjNewPr: 'your new PR',
  reactSubjWorkoutNote: 'your workout note',
};
