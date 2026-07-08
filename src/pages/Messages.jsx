import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, Search, MessageCircle, X, Trash2, Check, CheckCheck, Paperclip, SmilePlus, Mic, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { supabase } from '../utils/supabase';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';
import { onAppResume } from '../hooks/useAppLifecycle';
import { getDateLocale } from '../utils/dateLocale';

import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';
import {
  isVoiceRecordingSupported,
  isVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  cancelVoiceRecording,
  formatRecordingTime
} from '../utils/voiceRecorder';
// localStorage cache helper for instant display on resume
const getCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  return null;
};

const setMsgCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
};

const REACTION_EMOJIS = ['❤️', '💪', '🔥', '👏', '😂', '👍'];

// "Reacted [emoji] to your X" notifications are sent as plain messages by
// the backend. Detect them so they can be demoted from full-size bubbles to
// quiet inline pills. The trailing target is intentionally permissive so
// new reactable surfaces (measurements, weigh-in, gym check-in, etc.) all
// match without having to update the regex each time.
const REACTION_NOTIFICATION_RE = /^Reacted\s+\S.*?\s+to\s+your\s+/i;

// The server sends coach reactions as plain "Reacted {emoji} to {subject}"
// chat messages in English. For Spanish clients we re-render them on the
// client (the server doesn't know the client's language — it's per-device).
// The subject vocabulary is bounded by react-to-activity.js's shortLabel
// formats. Callers only invoke this when language === 'es', so English clients
// are completely unaffected; unknown subjects fall back to the original text.
const translateReactionSubject = (subject, t) => {
  const s = subject.trim();
  let m;
  if ((m = s.match(/^your measurement of (.+)$/i)))   return t('messagesPage.reactSubjMeasurementOf', { value: m[1] });
  if ((m = s.match(/^your check-in \((.+)\)$/i)))      return t('messagesPage.reactSubjCheckinDetail', { detail: m[1] });
  if ((m = s.match(/^your "(.+)" workout$/i)))         return t('messagesPage.reactSubjNamedWorkout', { name: m[1] });
  if ((m = s.match(/^your new PR \((.+)\)$/i)))        return t('messagesPage.reactSubjNewPrDetail', { detail: m[1] });
  if ((m = s.match(/^your voice note on (.+)$/i)))     return t('messagesPage.reactSubjVoiceNoteOn', { exercise: m[1] });
  if ((m = s.match(/^your note on (.+)$/i)))           return t('messagesPage.reactSubjNoteOn', { exercise: m[1] });
  if ((m = s.match(/^your (.+) gym check-in$/i)))      return t('messagesPage.reactSubjGymCheckinDetail', { detail: m[1] });
  const exact = {
    'your workout': 'reactSubjWorkout',
    'your completed workout': 'reactSubjWorkout',
    'your measurements': 'reactSubjMeasurements',
    'your logged measurements': 'reactSubjMeasurements',
    'your weigh-in': 'reactSubjWeighIn',
    'your gym check-in': 'reactSubjGymCheckin',
    'your check-in': 'reactSubjCheckin',
    'your weekly check-in': 'reactSubjCheckinWeekly',
    'your progress photo': 'reactSubjProgressPhoto',
    'your pr': 'reactSubjPr',
    'your new pr': 'reactSubjNewPr',
    'your workout note': 'reactSubjWorkoutNote',
  };
  const key = exact[s.toLowerCase()];
  if (key) return t('messagesPage.' + key);
  if ((m = s.match(/^your (.+) photo$/i)))             return t('messagesPage.reactSubjTypedPhoto', { type: m[1] });
  return subject; // graceful fallback
};

const translateReactionMessage = (text, t) => {
  const m = text.match(/^Reacted\s+(.+?)\s+to\s+(your\b[\s\S]*)$/i);
  if (!m) return text;
  return t('messagesPage.reactedTo', { emoji: m[1], subject: translateReactionSubject(m[2], t) });
};

// Split a reaction notification's leading verb + emoji from the rest of the
// sentence so the emoji can be shown as a warm, prominent chip instead of
// sitting inline in a dim gray line. Works for both the EN ("Reacted 🔥 to
// your new PR (...)") and ES ("Reaccionó 🔥 a tu ...") formats — the emoji is
// always the token immediately after the verb. Falls back to the whole string
// with no emoji if the shape is unexpected.
const splitReactionNote = (displayText) => {
  const m = displayText.match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
  if (!m) return { emoji: '', text: displayText };
  return { emoji: m[2], text: m[3] };
};

// Coach replies are sent in two formats, both using U+2014 em-dashes:
//   Re: <subject> — "<quoted excerpt>" — <reply text>   (with a quoted detail)
//   Re: <subject> — <reply text>                        (no detail to quote)
// Parse the structure so it renders as a proper quote block instead of one
// long run-on line. The quoted form is tried first; the quote-less form
// covers activity wins that have no detail (e.g. a gym check-in).
const parseReplyMessage = (text) => {
  if (!text) return null;
  const quoted = text.match(/^Re:\s+(.+?)\s+—\s+["“](.+?)["”]\s+—\s+([\s\S]+)$/);
  if (quoted) {
    return {
      subject: quoted[1].trim(),
      quote: quoted[2].trim(),
      reply: quoted[3].trim(),
    };
  }
  const plain = text.match(/^Re:\s+(.+?)\s+—\s+([\s\S]+)$/);
  if (plain) {
    return {
      subject: plain[1].trim(),
      quote: '',
      reply: plain[2].trim(),
    };
  }
  return null;
};

// Detect emoji-only messages (up to ~3 emoji, no other text) so we can
// render them at large size without a bubble — the universal iMessage /
// WhatsApp / Telegram convention. ‍ (ZWJ) and ️ (variation
// selector) are kept explicit so the regex is invariant to file encoding.
const EMOJI_STRIP_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200D\uFE0F\s]/gu;
const isEmojiOnlyMessage = (text) => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 12) return false;
  return trimmed.replace(EMOJI_STRIP_RE, '').length === 0;
};

function Messages() {
  const { user, clientData } = useAuth();
  const location = useLocation();
  const { showError, showSuccess } = useToast();
  const { t, language } = useLanguage();
  const isCoach = clientData?.is_coach === true;
  const coachId = isCoach ? user?.id : null;
  const clientId = clientData?.id;

  // Load cached conversations for instant display
  const cachedConvos = clientId ? getCache(`messages_${clientId}`) : null;

  // State
  const [conversations, setConversations] = useState(cachedConvos || []);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(!cachedConvos);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaPreview, setMediaPreview] = useState(null); // { file, dataUrl, type }
  const [uploading, setUploading] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [selectedMsgId, setSelectedMsgId] = useState(null); // for unsend menu
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null); // for emoji reaction picker
  const [resubscribeKey, setResubscribeKey] = useState(0); // Incremented on resume to force Supabase channel re-subscribe
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const resubscribeAttemptsRef = useRef(0); // Track consecutive reconnection attempts
  const lastResubscribeTimeRef = useRef(0); // Timestamp of last resubscribe
  // IDs of messages confirmed by handleSend's API response — kept so the
  // fetchMessages merge never drops them even if the server response is stale.
  const confirmedSentIdsRef = useRef(new Set());
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  // Track whether the user is scrolled to bottom so we can restore it when
  // the tab becomes visible again (display:none resets scroll position).
  const isAtBottomRef = useRef(true);
  // Track whether the Messages tab is the active/visible tab so background
  // polling doesn't accidentally mark messages as read while the user is
  // on another page.
  const isVisibleRef = useRef(location.pathname === '/messages');

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback((instant = false) => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    // Always also try scrollIntoView on the sentinel element for reliability
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
  }, []);

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    try {
      let url;
      if (isCoach) {
        url = `/.netlify/functions/chat?action=conversations&coachId=${coachId}`;
      } else {
        url = `/.netlify/functions/chat?action=client-conversations&clientId=${clientId}`;
      }
      const result = await apiGet(url);
      const convos = result.conversations || [];
      setConversations(convos);
      // Cache for instant display on next visit / resume
      if (clientId) {
        setMsgCache(`messages_${clientId}`, convos);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [isCoach, coachId, clientId]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(fetchConversations);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async () => {
    if (!activeConvo) return;
    setLoadingMessages(true);
    try {
      const cId = isCoach ? coachId : activeConvo.coachId;
      const clId = isCoach ? activeConvo.clientId : clientId;
      const result = await apiGet(
        `/.netlify/functions/chat?action=messages&coachId=${cId}&clientId=${clId}&limit=100`
      );
      const serverMessages = result.messages || [];
      // Merge instead of replace: keep any optimistic messages that haven't
      // been confirmed by the server yet. This prevents recently-sent messages
      // from disappearing when the 15s polling refetch fires.
      setMessages(prev => {
        const serverIds = new Set(serverMessages.map(m => m.id));
        const pendingOptimistic = prev.filter(m =>
          typeof m.id === 'string' &&
          (m.id.startsWith('optimistic-') || m.id.startsWith('temp-')) &&
          !serverIds.has(m.id)
        );
        // Also check if any optimistic message's content matches a server message
        // (meaning it was confirmed) — if so, don't keep the optimistic version
        const confirmedTexts = new Set(serverMessages.map(m => `${m.sender_type}:${m.message}`));
        const trulyPending = pendingOptimistic.filter(m =>
          !confirmedTexts.has(`${m.sender_type}:${m.message}`)
        );
        // Safety net: preserve messages that handleSend confirmed but the
        // server response doesn't include yet (can happen with stale cache
        // or replication lag).  Once the server response includes them,
        // clear them from the confirmed set.
        const missingConfirmed = prev.filter(m =>
          confirmedSentIdsRef.current.has(m.id) && !serverIds.has(m.id)
        );
        // Clean up confirmed IDs that are now in the server response
        for (const id of confirmedSentIdsRef.current) {
          if (serverIds.has(id)) confirmedSentIdsRef.current.delete(id);
        }
        return [...serverMessages, ...trulyPending, ...missingConfirmed];
      });

      // Only mark messages as read when the Messages tab is actually visible.
      // The component stays mounted (persistent tab) even on other pages —
      // marking read in the background would prevent the unread badge from showing.
      if (isVisibleRef.current) {
        await apiPost('/.netlify/functions/chat', {
          action: 'mark-read',
          coachId: cId,
          clientId: clId,
          readerType: isCoach ? 'coach' : 'client'
        });

        // Update conversation unread count locally
        setConversations(prev => prev.map(c => {
          const matchId = isCoach ? c.clientId : c.coachId;
          const activeId = isCoach ? activeConvo.clientId : activeConvo.coachId;
          return matchId === activeId ? { ...c, unreadCount: 0 } : c;
        }));
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConvo, isCoach, coachId, clientId, scrollToBottom]);

  // Handle file selection for media
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showError(t('messagesPage.errorFileType'));
      return;
    }

    // Validate file size (250MB)
    if (file.size > 250 * 1024 * 1024) {
      showError(t('messagesPage.errorFileTooLarge'));
      return;
    }

    const isVideo = file.type.startsWith('video/');
    // Use object URL for preview (memory-efficient, works for large videos)
    const previewUrl = URL.createObjectURL(file);

    setMediaPreview({
      file,
      previewUrl,
      dataUrl: null, // will be set only for small images using base64 fallback
      type: isVideo ? 'video' : 'image'
    });

    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  // Remove media preview
  const clearMediaPreview = () => {
    if (mediaPreview?.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview(null);
  };

  // Release the mic if the user navigates away mid-recording
  useEffect(() => () => cancelVoiceRecording(), []);

  // Turn a finished voice recording into a pending attachment so the sender
  // can listen back before hitting send (same flow as photo/video).
  const attachVoiceRecording = (rec) => {
    setRecordingVoice(false);
    setRecordSeconds(0);
    if (!rec) return;
    if (rec.durationMs < 1000) {
      showError(t('messagesPage.errorRecordingShort'));
      return;
    }
    if (mediaPreview?.previewUrl) URL.revokeObjectURL(mediaPreview.previewUrl);
    const file = new File([rec.blob], `voice-message.${rec.extension}`, { type: rec.mimeType });
    setMediaPreview({
      file,
      previewUrl: URL.createObjectURL(rec.blob),
      dataUrl: null,
      type: 'audio'
    });
  };

  const handleToggleVoiceRecording = async () => {
    if (isVoiceRecording()) {
      const rec = await stopVoiceRecording();
      attachVoiceRecording(rec);
      return;
    }
    if (!isVoiceRecordingSupported()) {
      showError(t('messagesPage.errorVoiceUnsupported'));
      return;
    }
    try {
      await startVoiceRecording({
        onTick: setRecordSeconds,
        // 5-minute cap reached: attach what was recorded instead of losing it
        onAutoStop: attachVoiceRecording
      });
      setRecordSeconds(0);
      setRecordingVoice(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      showError(t('messagesPage.errorMicAccess'));
    }
  };

  // Upload media to server using signed URL (bypasses Netlify body size limit)
  const uploadMedia = async (file) => {
    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;

    // Determine file extension from name or MIME type
    const ext = file.name?.split('.').pop() || file.type.split('/')[1] || 'bin';

    // Step 1: Get a signed upload URL from the server
    const urlResult = await apiPost('/.netlify/functions/get-chat-upload-url', {
      coachId: cId,
      clientId: clId,
      contentType: file.type,
      fileExtension: ext
    });

    if (!urlResult.success || !urlResult.uploadUrl) {
      throw new Error(urlResult.error || t('messagesPage.errorGetUploadUrl'));
    }

    // Step 2: Upload the file directly to Supabase Storage
    const uploadRes = await fetch(urlResult.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadRes.ok) {
      throw new Error(t('messagesPage.errorUploadStorage'));
    }

    return {
      mediaUrl: urlResult.publicUrl,
      mediaType: urlResult.mediaType
    };
  };

  // Send a message (with optional media)
  const handleSend = async () => {
    const hasText = newMessage.trim();
    const hasMedia = mediaPreview;

    if ((!hasText && !hasMedia) || sending) return;

    const msgText = newMessage.trim();
    setNewMessage('');
    setSending(true);
    setUploading(!!mediaPreview);

    try {
      const cId = isCoach ? coachId : activeConvo.coachId;
      const clId = isCoach ? activeConvo.clientId : clientId;

      let mediaUrl = null;
      let mediaType = null;

      // Upload media first if present
      if (mediaPreview) {
        const uploadResult = await uploadMedia(mediaPreview.file);
        mediaUrl = uploadResult.mediaUrl;
        mediaType = uploadResult.mediaType;
        clearMediaPreview();
        setUploading(false);
      }

      // Optimistic update — use a string ID prefixed with 'optimistic-' so the
      // realtime handler and polling merge can recognize and replace it.
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg = {
        id: optimisticId,
        sender_type: isCoach ? 'coach' : 'client',
        message: msgText || null,
        media_url: mediaUrl,
        media_type: mediaType,
        created_at: new Date().toISOString(),
        is_read: false
      };
      isAtBottomRef.current = true; // Always scroll to see your own sent message
      setMessages(prev => [...prev, optimisticMsg]);
      setMediaPreview(null);

      const result = await apiPost('/.netlify/functions/chat', {
        action: 'send',
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client',
        message: msgText || null,
        mediaUrl,
        mediaType
      });

      // Replace the optimistic message with the server-confirmed one
      if (result?.message) {
        confirmedSentIdsRef.current.add(result.message.id);
        setMessages(prev => prev.map(m => m.id === optimisticId ? result.message : m));
      }

      // Update conversation list with new last message
      const previewText = msgText || (mediaType === 'video' ? t('messagesPage.sentVideo') : mediaType === 'audio' ? t('messagesPage.sentVoice') : t('messagesPage.sentPhoto'));
      setConversations(prev => prev.map(c => {
        const matchId = isCoach ? c.clientId : c.coachId;
        const activeId = isCoach ? activeConvo.clientId : activeConvo.coachId;
        if (matchId === activeId) {
          return {
            ...c,
            lastMessage: previewText,
            lastMessageAt: new Date().toISOString(),
            lastMessageSender: isCoach ? 'coach' : 'client',
            hasMessages: true
          };
        }
        return c;
      }));
    } catch (err) {
      console.error('Error sending message:', err);
      showError(err.message?.includes('upload') || err.message?.includes('storage')
        ? t('messagesPage.errorUploadMedia')
        : t('messagesPage.errorSendMessage'));
      setUploading(false);
    } finally {
      setSending(false);
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  // Unsend (delete) a message
  const handleUnsend = async (msgId) => {
    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;

    try {
      await apiPost('/.netlify/functions/chat', {
        action: 'delete',
        messageId: msgId,
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client'
      });

      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== msgId));
      setSelectedMsgId(null);
    } catch (err) {
      console.error('Error unsending message:', err);
    }
  };

  // Toggle emoji reaction on a message
  const handleReaction = async (msgId, emoji) => {
    const myReactorType = isCoach ? 'coach' : 'client';
    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;
    const reactionMsg = `__REACTION__:${msgId}:${emoji}`;

    // Check if we already have this reaction in messages
    const existingReaction = messages.find(
      m => m.message === reactionMsg && m.sender_type === myReactorType && !m.deleted_at
    );

    // Optimistic update
    let tempId = null;
    if (existingReaction) {
      // Remove it locally
      setMessages(prev => prev.filter(m => m.id !== existingReaction.id));
    } else {
      // Add a temporary reaction message
      tempId = `temp-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        sender_type: myReactorType,
        message: reactionMsg,
        is_read: true,
        created_at: new Date().toISOString()
      }]);
    }

    setReactionPickerMsgId(null);

    try {
      await apiPost('/.netlify/functions/chat', {
        action: 'toggle-reaction',
        messageId: msgId,
        emoji,
        reactorType: myReactorType,
        coachId: cId,
        clientId: clId
      });
    } catch (err) {
      console.error('Error toggling reaction:', err);
      // Revert the optimistic update instead of doing a full refetch
      // which would replace the entire message array and cause disappearances.
      if (existingReaction) {
        // We removed it — add it back
        setMessages(prev => [...prev, existingReaction]);
      } else if (tempId) {
        // We added a temp — remove it
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    }
  };

  // Handle enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Open a conversation
  const openConversation = (convo) => {
    setActiveConvo(convo);
    setMessages([]);
    setSelectedMsgId(null);
    isAtBottomRef.current = true; // New conversation always starts at bottom
    setMediaPreview(null);
  };

  // Close unsend menu or reaction picker when clicking elsewhere
  useEffect(() => {
    if (selectedMsgId === null && reactionPickerMsgId === null) return;
    const handleClick = () => {
      setSelectedMsgId(null);
      setReactionPickerMsgId(null);
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [selectedMsgId, reactionPickerMsgId]);

  // For client: auto-open single conversation
  useEffect(() => {
    if (!isCoach && conversations.length === 1 && !activeConvo) {
      openConversation(conversations[0]);
    }
  }, [isCoach, conversations, activeConvo]);

  // Page scroll position is managed centrally by Layout (per-path
  // restoration). The chat list has its own scroll-to-bottom logic below.

  // Re-fetch data when app resumes from background.
  // Without this, users see stale conversation data on re-entry and have to pull-to-refresh.
  useEffect(() => {
    const unsub = onAppResume(() => {
      fetchConversations();
      // Force Supabase Realtime channels to tear down and reconnect.
      // The WebSocket connection dies during background and channels
      // silently stop receiving events. Incrementing the key causes
      // the channel useEffects to re-run (cleanup old → create new).
      setResubscribeKey(k => k + 1);
    });
    return () => unsub();
  }, [fetchConversations]);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeConvo) {
      fetchMessages();
    }
  }, [activeConvo, fetchMessages]);

  // Polling fallback: refetch messages every 15s when a conversation is open.
  // Supabase Realtime can silently fail (RLS blocks events, WebSocket drops
  // without error). This ensures messages always appear within 15 seconds
  // even when realtime is broken. The polling is lightweight — it only runs
  // when a conversation is actively open, and stops when the user leaves.
  useEffect(() => {
    if (!activeConvo) return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeConvo, fetchMessages]);

  // Track scroll position — update isAtBottomRef on every scroll event
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "at bottom" if within 80px of the end
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeConvo]); // Re-attach when conversation changes (container re-renders)

  // Keep visibility ref in sync with location changes
  useEffect(() => {
    isVisibleRef.current = location.pathname === '/messages';
  }, [location.pathname]);

  // Restore scroll position when returning to the Messages tab.
  // display:none → display:block resets scroll, so we re-anchor to bottom.
  useEffect(() => {
    if (location.pathname !== '/messages') return;
    // Tab just became visible — restore scroll if user was at bottom
    const container = messagesContainerRef.current;
    if (container && messages.length > 0 && isAtBottomRef.current) {
      // Use rAF to wait for the browser to finish layout after display:block
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    }
  }, [location.pathname, scrollToBottom, messages.length]);

  // Auto-scroll to bottom when new messages arrive (only if user is at bottom)
  useEffect(() => {
    if (messages.length > 0 && isAtBottomRef.current) {
      // Immediate scroll attempt
      scrollToBottom(true);
      // Double-rAF ensures the browser has completed layout before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(true);
        });
      });
      // Delayed attempt to handle images/media loading and affecting layout
      const timer = setTimeout(() => {
        if (isAtBottomRef.current) scrollToBottom(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [messages, scrollToBottom]);

  // Real-time subscription for new messages + updates (read receipts, deletes)
  useEffect(() => {
    if (!activeConvo) return;

    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;

    // Include resubscribeKey in channel name to avoid collision with the
    // channel being torn down. Without this, removeChannel (async) and the
    // new subscription race, and the new channel silently fails to connect.
    const channel = supabase
      .channel(`chat-${cId}-${clId}-${resubscribeKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `coach_id=eq.${cId}`
        },
        (payload) => {
          const newMsg = payload.new;
          // Use == for type-coerced comparison — Supabase payload types
          // may differ from local JS types (string vs number)
          if (String(newMsg.client_id) === String(clId)) {
            const myType = isCoach ? 'coach' : 'client';
            if (newMsg.sender_type !== myType) {
              setMessages(prev => {
                // Replace temp reaction message or add new
                if (prev.some(m => m.id === newMsg.id)) return prev;
                // If it's a reaction message from the other party, just add it
                // (temp messages from self have string IDs starting with 'temp-')
                return [...prev, newMsg];
              });
              // Only mark as read if Messages tab is visible; otherwise
              // notify BottomNav to show the unread badge instantly.
              if (!newMsg.message?.startsWith('__REACTION__:')) {
                if (isVisibleRef.current) {
                  apiPost('/.netlify/functions/chat', {
                    action: 'mark-read',
                    coachId: cId,
                    clientId: clId,
                    readerType: isCoach ? 'coach' : 'client'
                  });
                } else {
                  // Dispatch event so BottomNav updates badge immediately
                  window.dispatchEvent(new CustomEvent('new-unread-message'));
                }
              }
            } else {
              // Our own message came through real-time.
              // For regular messages: handleSend already replaces the optimistic
              // message with the server-confirmed one via the API response, so we
              // skip processing here to avoid race conditions that can remove the
              // message from state.
              // For reactions: handleReaction doesn't use the API response, so we
              // still need realtime to reconcile temp reaction messages.
              const isReaction = newMsg.message?.startsWith('__REACTION__:');
              if (isReaction) {
                setMessages(prev => {
                  const withoutTemp = prev.filter(m => {
                    if (typeof m.id === 'string' &&
                        m.id.startsWith('temp-') &&
                        m.message === newMsg.message) {
                      return false;
                    }
                    return true;
                  });
                  if (withoutTemp.some(m => m.id === newMsg.id)) return withoutTemp;
                  return [...withoutTemp, newMsg];
                });
              } else {
                // Regular own message — just deduplicate (don't touch optimistic)
                setMessages(prev => {
                  if (prev.some(m => m.id === newMsg.id)) return prev;
                  // If the optimistic version was already replaced by handleSend,
                  // just skip. If not, the optimistic msg stays until apiPost
                  // response replaces it (which is the correct behavior).
                  const hasOptimistic = prev.some(m =>
                    typeof m.id === 'string' &&
                    m.id.startsWith('optimistic-') &&
                    m.message === newMsg.message
                  );
                  if (hasOptimistic) return prev; // handleSend will replace it
                  return [...prev, newMsg];
                });
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `coach_id=eq.${cId}`
        },
        (payload) => {
          const updated = payload.new;
          if (String(updated.client_id) === String(clId)) {
            // If soft-deleted, remove from view (also handles reaction removal)
            if (updated.deleted_at) {
              setMessages(prev => prev.filter(m => m.id !== updated.id));
            } else {
              // Update read status
              setMessages(prev => prev.map(m =>
                m.id === updated.id ? { ...m, is_read: updated.is_read, read_at: updated.read_at } : m
              ));
            }
          }
        }
      )
      .subscribe((status, err) => {
        // Monitor channel health — if it drops, try to reconnect.
        // This catches the case where the Supabase WebSocket silently dies
        // while the user is actively using the app (no background resume,
        // no offline event — messages just stop arriving).
        if (status === 'SUBSCRIBED') {
          // Successfully connected — reset the retry counter
          resubscribeAttemptsRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[Messages] Chat channel died:', status, err);
          const now = Date.now();
          // Reset counter if last attempt was more than 2 minutes ago (not a rapid loop)
          if (now - lastResubscribeTimeRef.current > 120000) {
            resubscribeAttemptsRef.current = 0;
          }
          resubscribeAttemptsRef.current++;
          lastResubscribeTimeRef.current = now;

          if (resubscribeAttemptsRef.current <= 3) {
            // Try to reconnect with increasing delay — give Supabase time
            // to self-heal before we force a resubscribe
            const delay = resubscribeAttemptsRef.current * 3000;
            setTimeout(() => setResubscribeKey(k => k + 1), delay);
          } else {
            // Gave up — just log it. Don't dispatch a global stuck banner
            // because the rest of the app still works fine. The user can
            // navigate away and back to Messages to retry.
            console.warn('[Messages] Channel keeps dying after', resubscribeAttemptsRef.current, 'attempts');
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvo, isCoach, coachId, clientId, scrollToBottom, resubscribeKey]);

  // Real-time subscription for conversation list updates
  useEffect(() => {
    if (!user?.id) return;

    const filterField = isCoach ? 'coach_id' : 'client_id';
    const filterValue = isCoach ? coachId : clientId;

    const channel = supabase
      .channel(`chat-list-${filterValue}-${resubscribeKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `${filterField}=eq.${filterValue}`
        },
        (payload) => {
          const newMsg = payload.new;
          const myType = isCoach ? 'coach' : 'client';

          // Skip reaction messages in conversation list preview
          if (newMsg.message?.startsWith('__REACTION__:')) return;

          setConversations(prev => {
            const updated = prev.map(c => {
              const matchId = isCoach ? c.clientId : c.coachId;
              const msgMatchId = isCoach ? newMsg.client_id : newMsg.coach_id;
              if (matchId === msgMatchId) {
                const previewText = newMsg.message || (newMsg.media_type === 'video' ? t('messagesPage.sentVideo') : newMsg.media_type === 'gif' ? t('messagesPage.sentGif') : newMsg.media_type === 'audio' ? t('messagesPage.sentVoice') : t('messagesPage.sentPhoto'));
                return {
                  ...c,
                  lastMessage: previewText,
                  lastMessageAt: newMsg.created_at,
                  lastMessageSender: newMsg.sender_type,
                  hasMessages: true,
                  unreadCount: (newMsg.sender_type !== myType && (!activeConvo || (isCoach ? activeConvo.clientId !== newMsg.client_id : activeConvo.coachId !== newMsg.coach_id)))
                    ? (c.unreadCount || 0) + 1
                    : c.unreadCount
                };
              }
              return c;
            });
            return updated.sort((a, b) => {
              if (a.hasMessages && !b.hasMessages) return -1;
              if (!a.hasMessages && b.hasMessages) return 1;
              if (a.hasMessages && b.hasMessages) return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
              return (a.clientName || '').localeCompare(b.clientName || '');
            });
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          resubscribeAttemptsRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[Messages] List channel died:', status, err);
          const now = Date.now();
          if (now - lastResubscribeTimeRef.current > 120000) {
            resubscribeAttemptsRef.current = 0;
          }
          resubscribeAttemptsRef.current++;
          lastResubscribeTimeRef.current = now;

          if (resubscribeAttemptsRef.current <= 3) {
            const delay = resubscribeAttemptsRef.current * 3000;
            setTimeout(() => setResubscribeKey(k => k + 1), delay);
          } else {
            console.warn('[Messages] List channel keeps dying');
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isCoach, coachId, clientId, activeConvo, resubscribeKey]);

  // Format time for conversation list
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(getDateLocale(), { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return t('messagesPage.yesterday');
    } else if (diffDays < 7) {
      return date.toLocaleDateString(getDateLocale(), { weekday: 'short' });
    }
    return date.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric' });
  };

  // Format message time
  const formatMessageTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(getDateLocale(), { hour: 'numeric', minute: '2-digit' });
  };

  // Group messages by date
  const groupMessagesByDate = (msgs) => {
    const groups = [];
    let currentDate = null;

    msgs.forEach(msg => {
      const msgDate = new Date(msg.created_at).toLocaleDateString(getDateLocale(), {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ type: 'date', label: msgDate });
      }
      groups.push({ type: 'message', data: msg });
    });

    return groups;
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const name = (isCoach ? c.clientName : c.coachName) || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const toggleBulkClient = (clientId) => {
    setSelectedClientIds(prev => prev.includes(clientId)
      ? prev.filter(id => id !== clientId)
      : [...prev, clientId]
    );
  };

  const selectAllBulkClients = () => {
    const allIds = conversations.map(c => c.clientId).filter(Boolean);
    setSelectedClientIds(allIds);
  };

  const clearBulkSelection = () => setSelectedClientIds([]);

  const handleBulkSend = async () => {
    if (!isCoach || !coachId) return;
    if (!bulkMessage.trim() || selectedClientIds.length === 0 || bulkSending) return;

    setBulkSending(true);
    try {
      await apiPost('/.netlify/functions/chat', {
        action: 'bulk-send',
        coachId,
        clientIds: selectedClientIds,
        message: bulkMessage.trim()
      });

      const now = new Date().toISOString();
      setConversations(prev => prev.map(c => selectedClientIds.includes(c.clientId)
        ? { ...c, lastMessage: bulkMessage.trim(), lastMessageAt: now, lastMessageSender: 'coach', hasMessages: true }
        : c
      ));

      setBulkMessage('');
      setSelectedClientIds([]);
      setBulkMode(false);
      showSuccess(t('messagesPage.successBulkSent'));
    } catch (err) {
      console.error('Error sending bulk message:', err);
      showError(t('messagesPage.errorBulkSend'));
    } finally {
      setBulkSending(false);
    }
  };

  // Total unread count
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const myType = isCoach ? 'coach' : 'client';

  // Separate reaction messages from regular messages and build a reaction map
  const REACTION_PREFIX = '__REACTION__:';
  const reactionMap = {}; // { targetMsgId: [{ emoji, senderType, msgId }] }
  const regularMessages = [];

  messages.forEach(msg => {
    if (msg.message && msg.message.startsWith(REACTION_PREFIX)) {
      // Parse: __REACTION__:{targetId}:{emoji}
      const parts = msg.message.slice(REACTION_PREFIX.length).split(':');
      const targetId = parseInt(parts[0]);
      const emoji = parts.slice(1).join(':'); // emoji might contain colons
      if (targetId && emoji) {
        if (!reactionMap[targetId]) reactionMap[targetId] = [];
        reactionMap[targetId].push({ emoji, senderType: msg.sender_type, msgId: msg.id });
      }
    } else {
      regularMessages.push(msg);
    }
  });

  const grouped = groupMessagesByDate(regularMessages);

  // Render media content in a message bubble
  const renderMedia = (msg) => {
    if (!msg.media_url) return null;

    if (msg.media_type === 'audio') {
      return (
        <div className="chat-msg-audio">
          <audio
            src={msg.media_url}
            controls
            preload="metadata"
            className="chat-media-audio"
          />
        </div>
      );
    }

    if (msg.media_type === 'video') {
      return (
        <div className="chat-msg-media">
          <video
            src={msg.media_url}
            controls
            playsInline
            preload="metadata"
            className="chat-media-video"
            onLoadedMetadata={() => scrollToBottom(true)}
          />
        </div>
      );
    }

    // Image or GIF
    return (
      <div className="chat-msg-media" onClick={(e) => { e.stopPropagation(); setLightboxUrl(msg.media_url); }}>
        <img
          src={msg.media_url}
          alt={msg.media_type === 'gif' ? t('messagesPage.gifAlt') : t('messagesPage.photoAlt')}
          className="chat-media-image"
          onLoad={() => scrollToBottom(true)}
        />
      </div>
    );
  };

  // Conversation thread view
  if (activeConvo) {
    const convoName = isCoach ? activeConvo.clientName : (activeConvo.coachName || t('messagesPage.yourCoach'));
    const canSend = newMessage.trim() || mediaPreview;

    return (
      <div className="chat-page">
        <div className="chat-thread-header">
          <div className="chat-thread-avatar">
            {activeConvo.profilePhoto || activeConvo.coachPhoto ? (
              <img src={activeConvo.profilePhoto || activeConvo.coachPhoto} alt={convoName} />
            ) : (
              getInitials(convoName)
            )}
          </div>
          <div className="chat-thread-name">{convoName}</div>
        </div>

        <div className="chat-messages-container" ref={messagesContainerRef}>
          {messages.length === 0 && (
            loadingMessages ? (
              <div className="chat-skeleton" aria-hidden="true">
                <div className="chat-skeleton-bubble theirs short" />
                <div className="chat-skeleton-bubble theirs long" />
                <div className="chat-skeleton-bubble mine medium" />
                <div className="chat-skeleton-bubble theirs medium" />
                <div className="chat-skeleton-bubble mine short" />
              </div>
            ) : (
              <div className="chat-empty-thread">
                <MessageCircle size={40} />
                <p>{t('messagesPage.noMessagesThread')}</p>
                <p className="chat-empty-sub">{t('messagesPage.startConversation')}</p>
              </div>
            )
          )}

          {grouped.map((item, idx) => {
            if (item.type === 'date') {
              return (
                <div key={`date-${idx}`} className="chat-date-divider">
                  <span>{item.label}</span>
                </div>
              );
            }

            const msg = item.data;
            const isMine = msg.sender_type === myType;
            const hasMedia = !!msg.media_url;
            const isOldReaction = !!(msg.message && REACTION_NOTIFICATION_RE.test(msg.message));
            // Reply detection is best-effort and only applied when the message
            // is plain text (no media). On parse failure, parsedReply is null
            // and the bubble falls through to the regular text render.
            const parsedReply = !hasMedia && !isOldReaction ? parseReplyMessage(msg.message) : null;
            const emojiOnly = !hasMedia && !isOldReaction && !parsedReply && isEmojiOnlyMessage(msg.message);

            // Build grouped reactions from the reactionMap for this message
            const msgReactionList = reactionMap[msg.id] || [];
            const groupedReactions = [];
            const emojiMap = {};
            msgReactionList.forEach(r => {
              if (!emojiMap[r.emoji]) {
                emojiMap[r.emoji] = { emoji: r.emoji, count: 0, myReaction: false };
                groupedReactions.push(emojiMap[r.emoji]);
              }
              emojiMap[r.emoji].count++;
              if (r.senderType === myType) {
                emojiMap[r.emoji].myReaction = true;
              }
            });

            return (
              <div
                key={msg.id}
                className={`chat-msg ${isMine ? 'mine' : 'theirs'} ${isOldReaction ? 'reaction-msg' : ''} ${emojiOnly ? 'emoji-only' : ''} ${parsedReply ? 'has-reply-quote' : ''}`}
              >
                <div className="chat-msg-row">
                  {/* Reaction trigger on left for own messages */}
                  {isMine && (
                    <button
                      className="chat-reaction-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id);
                        setSelectedMsgId(null);
                      }}
                      title={t('messagesPage.reactTitle')}
                    >
                      <SmilePlus size={16} />
                    </button>
                  )}

                  <div
                    className={`chat-msg-bubble ${hasMedia ? 'media-bubble' : ''} ${isOldReaction ? 'reaction-bubble' : ''} ${emojiOnly ? 'emoji-only-bubble' : ''} ${parsedReply ? 'reply-bubble' : ''}`}
                    onClick={(e) => {
                      if (isMine) {
                        e.stopPropagation();
                        setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id);
                      }
                    }}
                  >
                    {renderMedia(msg)}
                    {parsedReply ? (
                      <>
                        <div className="chat-reply-quote">
                          <span className="chat-reply-subject">{parsedReply.subject}</span>
                          {parsedReply.quote && <span className="chat-reply-quote-text">{parsedReply.quote}</span>}
                        </div>
                        <p className="chat-reply-text">{parsedReply.reply}</p>
                      </>
                    ) : isOldReaction ? (
                      (() => {
                        const displayText = language === 'es' ? translateReactionMessage(msg.message, t) : msg.message;
                        const { emoji, text } = splitReactionNote(displayText);
                        return (
                          <div className="reaction-note">
                            {emoji && <span className="reaction-note-emoji">{emoji}</span>}
                            <span className="reaction-note-text">{text}</span>
                          </div>
                        );
                      })()
                    ) : (
                      msg.message && <p>{msg.message}</p>
                    )}

                    {/* Time + read receipt */}
                    <span className="chat-msg-time">
                      {formatMessageTime(msg.created_at)}
                      {isMine && (
                        <span className="chat-read-receipt">
                          {msg.is_read ? (
                            <CheckCheck size={14} className="chat-read-icon read" />
                          ) : (
                            <Check size={14} className="chat-read-icon" />
                          )}
                        </span>
                      )}
                    </span>

                    {/* Unsend button */}
                    {isMine && selectedMsgId === msg.id && (
                      <button
                        className="chat-unsend-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsend(msg.id);
                        }}
                      >
                        <Trash2 size={13} />
                        {t('messagesPage.unsend')}
                      </button>
                    )}
                  </div>

                  {/* Reaction trigger on right for other's messages */}
                  {!isMine && (
                    <button
                      className="chat-reaction-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id);
                        setSelectedMsgId(null);
                      }}
                      title={t('messagesPage.reactTitle')}
                    >
                      <SmilePlus size={16} />
                    </button>
                  )}
                </div>

                {/* Emoji reaction picker */}
                {reactionPickerMsgId === msg.id && (
                  <div className={`chat-reaction-picker ${isMine ? 'picker-right' : 'picker-left'}`} onClick={(e) => e.stopPropagation()}>
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        className={`chat-reaction-emoji-btn ${emojiMap[emoji]?.myReaction ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReaction(msg.id, emoji);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Reactions display below bubble */}
                {groupedReactions.length > 0 && (
                  <div className={`chat-reactions-row ${isMine ? 'reactions-right' : 'reactions-left'}`}>
                    {groupedReactions.map(r => (
                      <button
                        key={r.emoji}
                        className={`chat-reaction-chip ${r.myReaction ? 'my-reaction' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReaction(msg.id, r.emoji);
                        }}
                      >
                        <span>{r.emoji}</span>
                        {r.count > 1 && <span className="reaction-count">{r.count}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Media preview */}
        {mediaPreview && (
          <div className="chat-media-preview">
            <button className="chat-media-preview-close" onClick={clearMediaPreview}>
              <X size={18} />
            </button>
            {mediaPreview.type === 'video' ? (
              <video src={mediaPreview.previewUrl} className="chat-media-preview-content" controls />
            ) : mediaPreview.type === 'audio' ? (
              <audio src={mediaPreview.previewUrl} className="chat-media-preview-audio" controls preload="metadata" />
            ) : (
              <img src={mediaPreview.previewUrl} alt={t('messagesPage.previewAlt')} className="chat-media-preview-content" />
            )}
          </div>
        )}

        {/* Input bar */}
        <div className="chat-input-bar">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*"
            style={{ display: 'none' }}
          />
          <button
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            title={t('messagesPage.attachTitle')}
          >
            <Paperclip size={20} />
          </button>
          <button
            className={`chat-attach-btn chat-voice-btn ${recordingVoice ? 'recording' : ''}`}
            onClick={handleToggleVoiceRecording}
            disabled={sending}
            title={recordingVoice ? t('messagesPage.stopRecordingTitle') : t('messagesPage.recordVoiceTitle')}
          >
            {recordingVoice ? (
              <>
                <Square size={16} fill="currentColor" />
                <span className="chat-voice-timer">{formatRecordingTime(recordSeconds)}</span>
              </>
            ) : (
              <Mic size={20} />
            )}
          </button>
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('messagesPage.inputPlaceholder')}
            rows={1}
            className="chat-input"
            enterKeyHint="send"
          />
          <button
            className="chat-send-btn"
            onClick={() => handleSend()}
            disabled={!canSend || sending}
          >
            {uploading ? (
              <div className="chat-send-spinner" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        {/* Lightbox for viewing media full-screen */}
        {lightboxUrl && (
          <div className="chat-lightbox" onClick={() => setLightboxUrl(null)}>
            <button className="chat-lightbox-close" onClick={() => setLightboxUrl(null)}>
              <X size={24} />
            </button>
            <img src={lightboxUrl} alt={t('messagesPage.fullSizeAlt')} onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="chat-page">
      <div className="chat-list-header">
        <h1>{t('messagesPage.heading')}</h1>
        <div className="chat-list-header-actions">
          {totalUnread > 0 && <span className="chat-total-badge">{totalUnread}</span>}
          {isCoach && (
            <button
              className={`chat-bulk-toggle ${bulkMode ? 'active' : ''}`}
              onClick={() => {
                setBulkMode(prev => !prev);
                setSelectedClientIds([]);
              }}
            >
              {bulkMode ? t('messagesPage.cancelBulk') : t('messagesPage.massMessage')}
            </button>
          )}
        </div>
      </div>

      {isCoach && bulkMode && (
        <div className="chat-bulk-panel">
          <div className="chat-bulk-row">
            <span>{t('messagesPage.selectedCount', { count: selectedClientIds.length })}</span>
            <div>
              <button className="chat-bulk-link" onClick={selectAllBulkClients}>{t('messagesPage.selectAll')}</button>
              <button className="chat-bulk-link" onClick={clearBulkSelection}>{t('messagesPage.clearSelection')}</button>
            </div>
          </div>
          <textarea
            className="chat-bulk-input"
            rows={3}
            placeholder={t('messagesPage.bulkPlaceholder')}
            value={bulkMessage}
            onChange={(e) => setBulkMessage(e.target.value)}
          />
          <button
            className="chat-bulk-send"
            disabled={!bulkMessage.trim() || selectedClientIds.length === 0 || bulkSending}
            onClick={handleBulkSend}
          >
            {bulkSending ? t('messagesPage.bulkSending') : (selectedClientIds.length === 1 ? t('messagesPage.bulkSendOne', { count: selectedClientIds.length || 0 }) : t('messagesPage.bulkSendMany', { count: selectedClientIds.length || 0 }))}
          </button>
        </div>
      )}

      {isCoach && (
        <div className="chat-search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder={t('messagesPage.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="chat-conversations-list">
        {loading ? (
          <div className="chat-loading">{t('messagesPage.loadingConversations')}</div>
        ) : filteredConversations.length === 0 ? (
          <div className="chat-empty">
            <MessageCircle size={48} />
            <p>{t('messagesPage.noConversations')}</p>
          </div>
        ) : (
          filteredConversations.map(convo => {
            const name = isCoach ? convo.clientName : (convo.coachName || t('messagesPage.yourCoach'));
            const preview = convo.lastMessage
              ? (convo.lastMessageSender === myType ? t('messagesPage.youPrefix') : '') + convo.lastMessage
              : t('messagesPage.noMessagesYet');
            const isSelected = selectedClientIds.includes(convo.clientId);

            return (
              <button
                key={convo.clientId || convo.coachId}
                className={`chat-convo-item ${convo.unreadCount > 0 ? 'unread' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => bulkMode && isCoach ? toggleBulkClient(convo.clientId) : openConversation(convo)}
              >
                {isCoach && bulkMode && (
                  <input
                    type="checkbox"
                    className="chat-bulk-checkbox"
                    checked={isSelected}
                    onChange={() => toggleBulkClient(convo.clientId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div className="chat-convo-avatar">
                  {convo.profilePhoto || convo.coachPhoto ? (
                    <img src={convo.profilePhoto || convo.coachPhoto} alt={name} loading="lazy" decoding="async" />
                  ) : (
                    getInitials(name)
                  )}
                </div>
                <div className="chat-convo-content">
                  <div className="chat-convo-top">
                    <span className="chat-convo-name">{name}</span>
                    <span className="chat-convo-time">{formatTime(convo.lastMessageAt)}</span>
                  </div>
                  <div className="chat-convo-bottom">
                    <span className="chat-convo-preview">{preview}</span>
                    {convo.unreadCount > 0 && (
                      <span className="chat-unread-badge">{convo.unreadCount}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Messages;
