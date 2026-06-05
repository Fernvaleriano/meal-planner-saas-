// Spanish (Latin-American neutral) strings for src/pages/Messages.jsx
// Namespace: messagesPage  →  t('messagesPage.<key>')
export default {
  // Page heading
  heading: 'Mensajes',

  // Conversation list
  loadingConversations: 'Cargando conversaciones...',
  noConversations: 'Aún no hay conversaciones',
  searchPlaceholder: 'Buscar clientes...',
  yourCoach: 'Tu entrenador',

  // Conversation preview
  youPrefix: 'Tú: ',
  noMessagesYet: 'Sin mensajes aún',

  // Time labels
  yesterday: 'Ayer',

  // Empty thread state
  noMessagesThread: 'Sin mensajes aún',
  startConversation: 'Envía un mensaje para iniciar la conversación',

  // Input bar
  inputPlaceholder: 'Enviar un mensaje...',
  attachTitle: 'Enviar foto o video',

  // Message actions
  unsend: 'Eliminar',
  reactTitle: 'Reaccionar',

  // Media preview alt text
  previewAlt: 'Vista previa',
  fullSizeAlt: 'Tamaño completo',
  gifAlt: 'GIF',
  photoAlt: 'Foto',

  // Conversation preview snippets (app-generated, not user-typed content)
  sentVideo: 'Envió un video',
  sentPhoto: 'Envió una foto',
  sentGif: 'Envió un GIF',

  // Bulk messaging (coach only)
  massMessage: 'Mensaje masivo',
  cancelBulk: 'Cancelar',
  selectedCount: '{count} seleccionado(s)',
  selectAll: 'Seleccionar todos',
  clearSelection: 'Limpiar',
  bulkPlaceholder: 'Escribe un mensaje para los clientes seleccionados...',
  bulkSending: 'Enviando...',
  bulkSendOne: 'Enviar a {count} cliente',
  bulkSendMany: 'Enviar a {count} clientes',

  // Toast / error messages
  errorFileType: 'Por favor selecciona un archivo de imagen o video.',
  errorFileTooLarge: 'Archivo demasiado grande. El tamaño máximo es 250 MB.',
  errorUploadMedia: 'Error al subir el archivo. Intenta de nuevo o usa un archivo más pequeño.',
  errorSendMessage: 'Error al enviar el mensaje. Intenta de nuevo.',
  errorBulkSend: 'Error al enviar el mensaje masivo. Intenta de nuevo.',
  successBulkSent: 'Mensaje enviado a los clientes seleccionados.',

  // Internal thrown error messages (caught and shown to user)
  errorGetUploadUrl: 'No se pudo obtener la URL de carga',
  errorUploadStorage: 'No se pudo subir el archivo al almacenamiento',
};
