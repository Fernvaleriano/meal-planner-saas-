import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Search, MessageCircle, Image, X, Trash2, Check, CheckCheck, Paperclip, Loader, SmilePlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { supabase } from '../utils/supabase';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';
import { onAppResume } from '../hooks/useAppLifecycle';

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

function Messages() {
  const { user, clientData } = useAuth();
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
  const [selectedMsgId, setSelectedMsgId] = useState(null); // for unsend menu
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null); // for emoji reaction picker
  const [resubscribeKey, setResubscribeKey] = useState(0); // Incremented on resume to force Supabase channel re-subscribe
  const resubscribeAttemptsRef = useRef(0); // Track consecutive reconnection attempts
  const lastResubscribeTimeRef = useRef(0); // Timestamp of last resubscribe
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState(null);

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
      setMessages(result.messages || []);

      // Mark messages as read
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
      alert('Please select an image or video file.');
      return;
    }

    // Validate file size (250MB)
    if (file.size > 250 * 1024 * 1024) {
      alert('File too large. Maximum size is 250MB.');
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
      throw new Error(urlResult.error || 'Failed to get upload URL');
    }

    // Step 2: Upload the file directly to Supabase Storage
    const uploadRes = await fetch(urlResult.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadRes.ok) {
      throw new Error('Failed to upload file to storage');
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

      // Optimistic update
      const optimisticMsg = {
        id: Date.now(),
        sender_type: isCoach ? 'coach' : 'client',
        message: msgText || null,
        media_url: mediaUrl,
        media_type: mediaType,
        created_at: new Date().toISOString(),
        is_read: false
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setMediaPreview(null);

      await apiPost('/.netlify/functions/chat', {
        action: 'send',
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client',
        message: msgText || null,
        mediaUrl,
        mediaType
      });

      // Update conversation list with new last message
      const previewText = msgText || (mediaType === 'video' ? 'Sent a video' : 'Sent a photo');
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
      alert(err.message?.includes('upload') || err.message?.includes('storage')
        ? 'Failed to upload media. Please try again or use a smaller file.'
        : 'Failed to send message. Please try again.');
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
    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;
    const reactorType = isCoach ? 'coach' : 'client';
    const reactorId = isCoach ? coachId : clientId;

    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = [...(m.reactions || [])];
      const existingIdx = reactions.findIndex(
        r => r.emoji === emoji && r.reactor_type === reactorType && r.reactor_id === String(reactorId)
      );
      if (existingIdx >= 0) {
        reactions.splice(existingIdx, 1);
      } else {
        reactions.push({ id: Date.now(), message_id: msgId, reactor_type: reactorType, reactor_id: String(reactorId), emoji });
      }
      return { ...m, reactions };
    }));

    setReactionPickerMsgId(null);

    try {
      await apiPost('/.netlify/functions/chat', {
        action: 'toggle-reaction',
        messageId: msgId,
        emoji,
        reactorType,
        reactorId: String(reactorId)
      });
    } catch (err) {
      console.error('Error toggling reaction:', err);
      // Revert on failure by re-fetching
      fetchMessages();
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

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Re-fetch data when app resumes from background.
  // Without this, if the user is on the Messages page and backgrounds the app,
  // any in-flight fetches die and the page stays stuck on loading forever.
  useEffect(() => {
    const unsub = onAppResume((backgroundMs) => {
      if (backgroundMs < 3000) return;
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

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
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
        scrollToBottom(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [messages, scrollToBottom]);

  // Real-time subscription for new messages + updates (read receipts, deletes)
  useEffect(() => {
    if (!activeConvo) return;

    const cId = isCoach ? coachId : activeConvo.coachId;
    const clId = isCoach ? activeConvo.clientId : clientId;

    const channel = supabase
      .channel(`chat-${cId}-${clId}`)
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
          if (newMsg.client_id === parseInt(clId)) {
            const myType = isCoach ? 'coach' : 'client';
            if (newMsg.sender_type !== myType) {
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              apiPost('/.netlify/functions/chat', {
                action: 'mark-read',
                coachId: cId,
                clientId: clId,
                readerType: isCoach ? 'coach' : 'client'
              });
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
          if (updated.client_id === parseInt(clId)) {
            // If soft-deleted, remove from view
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
          // Reset counter if last attempt was more than 60s ago (not a rapid loop)
          if (now - lastResubscribeTimeRef.current > 60000) {
            resubscribeAttemptsRef.current = 0;
          }
          resubscribeAttemptsRef.current++;
          lastResubscribeTimeRef.current = now;

          if (resubscribeAttemptsRef.current <= 3) {
            // Try to reconnect with increasing delay
            const delay = resubscribeAttemptsRef.current * 2000;
            console.log('[Messages] Reconnect attempt', resubscribeAttemptsRef.current, 'in', delay, 'ms');
            setTimeout(() => setResubscribeKey(k => k + 1), delay);
          } else {
            // Gave up — show the reload banner
            console.warn('[Messages] Channel keeps dying after', resubscribeAttemptsRef.current, 'attempts — showing reload');
            window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'stuck' } }));
          }
        }
      });

    // Periodic health check: if the channel isn't in 'joined' state after
    // being subscribed for a while, something silently broke.
    const channelHealthCheck = setInterval(() => {
      const state = channel?.state;
      if (state && state !== 'joined' && state !== 'joining') {
        console.warn('[Messages] Chat channel unhealthy, state:', state);
        window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'stuck' } }));
        clearInterval(channelHealthCheck);
      }
    }, 15000);

    // Separate channel for reaction changes
    const reactionsChannel = supabase
      .channel(`chat-reactions-${cId}-${clId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_reactions'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new;
            setMessages(prev => prev.map(m => {
              if (m.id !== newReaction.message_id) return m;
              const reactions = [...(m.reactions || [])];
              if (!reactions.some(r => r.id === newReaction.id)) {
                reactions.push(newReaction);
              }
              return { ...m, reactions };
            }));
          } else if (payload.eventType === 'DELETE') {
            const removed = payload.old;
            setMessages(prev => prev.map(m => {
              if (m.id !== removed.message_id) return m;
              return { ...m, reactions: (m.reactions || []).filter(r => r.id !== removed.id) };
            }));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(channelHealthCheck);
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionsChannel);
    };
  }, [activeConvo, isCoach, coachId, clientId, scrollToBottom, resubscribeKey]);

  // Real-time subscription for conversation list updates
  useEffect(() => {
    if (!user?.id) return;

    const filterField = isCoach ? 'coach_id' : 'client_id';
    const filterValue = isCoach ? coachId : clientId;

    const channel = supabase
      .channel(`chat-list-${filterValue}`)
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

          setConversations(prev => {
            const updated = prev.map(c => {
              const matchId = isCoach ? c.clientId : c.coachId;
              const msgMatchId = isCoach ? newMsg.client_id : newMsg.coach_id;
              if (matchId === msgMatchId) {
                const previewText = newMsg.message || (newMsg.media_type === 'video' ? 'Sent a video' : newMsg.media_type === 'gif' ? 'Sent a GIF' : 'Sent a photo');
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
          if (now - lastResubscribeTimeRef.current > 60000) {
            resubscribeAttemptsRef.current = 0;
          }
          resubscribeAttemptsRef.current++;
          lastResubscribeTimeRef.current = now;

          if (resubscribeAttemptsRef.current <= 3) {
            const delay = resubscribeAttemptsRef.current * 2000;
            setTimeout(() => setResubscribeKey(k => k + 1), delay);
          } else {
            console.warn('[Messages] List channel keeps dying — showing reload');
            window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'stuck' } }));
          }
        }
      });

    const listHealthCheck = setInterval(() => {
      const state = channel?.state;
      if (state && state !== 'joined' && state !== 'joining') {
        console.warn('[Messages] List channel unhealthy, state:', state);
        window.dispatchEvent(new CustomEvent('app-resume-sync', { detail: { phase: 'stuck' } }));
        clearInterval(listHealthCheck);
      }
    }, 15000);

    return () => {
      clearInterval(listHealthCheck);
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
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Format message time
  const formatMessageTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Group messages by date
  const groupMessagesByDate = (msgs) => {
    const groups = [];
    let currentDate = null;

    msgs.forEach(msg => {
      const msgDate = new Date(msg.created_at).toLocaleDateString([], {
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

  // Total unread count
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const grouped = groupMessagesByDate(messages);
  const myType = isCoach ? 'coach' : 'client';

  // Render media content in a message bubble
  const renderMedia = (msg) => {
    if (!msg.media_url) return null;

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
          alt={msg.media_type === 'gif' ? 'GIF' : 'Photo'}
          className="chat-media-image"
          onLoad={() => scrollToBottom(true)}
        />
      </div>
    );
  };

  // Conversation thread view
  if (activeConvo) {
    const convoName = isCoach ? activeConvo.clientName : (activeConvo.coachName || 'Your Coach');
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
              <div className="chat-empty-thread">
                <Loader size={28} className="spin" />
              </div>
            ) : (
              <div className="chat-empty-thread">
                <MessageCircle size={40} />
                <p>No messages yet</p>
                <p className="chat-empty-sub">Send a message to start the conversation</p>
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
            const isReaction = msg.message && /^Reacted .+ to your (breakfast|lunch|dinner|snack|meal|workout|new PR!|workout note)$/i.test(msg.message);
            const msgReactions = msg.reactions || [];
            const reactorType = isCoach ? 'coach' : 'client';
            const reactorId = String(isCoach ? coachId : clientId);

            // Group reactions by emoji with count and whether current user reacted
            const groupedReactions = [];
            const emojiMap = {};
            msgReactions.forEach(r => {
              if (!emojiMap[r.emoji]) {
                emojiMap[r.emoji] = { emoji: r.emoji, count: 0, myReaction: false };
                groupedReactions.push(emojiMap[r.emoji]);
              }
              emojiMap[r.emoji].count++;
              if (r.reactor_type === reactorType && r.reactor_id === reactorId) {
                emojiMap[r.emoji].myReaction = true;
              }
            });

            return (
              <div
                key={msg.id}
                className={`chat-msg ${isMine ? 'mine' : 'theirs'} ${isReaction ? 'reaction-msg' : ''}`}
                onClick={(e) => {
                  if (isMine) {
                    e.stopPropagation();
                    setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id);
                    setReactionPickerMsgId(null);
                  }
                }}
              >
                <div className={`chat-msg-bubble ${hasMedia ? 'media-bubble' : ''} ${isReaction ? 'reaction-bubble' : ''}`}>
                  {renderMedia(msg)}
                  {msg.message && <p>{msg.message}</p>}

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
                      Unsend
                    </button>
                  )}

                  {/* Reaction picker trigger */}
                  <button
                    className={`chat-reaction-trigger ${isMine ? 'left' : 'right'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id);
                      setSelectedMsgId(null);
                    }}
                    title="React"
                  >
                    <SmilePlus size={16} />
                  </button>

                  {/* Emoji reaction picker */}
                  {reactionPickerMsgId === msg.id && (
                    <div className={`chat-reaction-picker ${isMine ? 'picker-left' : 'picker-right'}`} onClick={(e) => e.stopPropagation()}>
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
                </div>

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
            ) : (
              <img src={mediaPreview.previewUrl} alt="Preview" className="chat-media-preview-content" />
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
            title="Send photo or video"
          >
            <Paperclip size={20} />
          </button>
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
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
            <img src={lightboxUrl} alt="Full size" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="chat-page">
      <div className="chat-list-header">
        <h1>Messages</h1>
        {totalUnread > 0 && <span className="chat-total-badge">{totalUnread}</span>}
      </div>

      {isCoach && (
        <div className="chat-search-bar">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="chat-conversations-list">
        {loading ? (
          <div className="chat-loading">Loading conversations...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="chat-empty">
            <MessageCircle size={48} />
            <p>No conversations yet</p>
          </div>
        ) : (
          filteredConversations.map(convo => {
            const name = isCoach ? convo.clientName : (convo.coachName || 'Your Coach');
            const preview = convo.lastMessage
              ? (convo.lastMessageSender === myType ? 'You: ' : '') + convo.lastMessage
              : 'No messages yet';

            return (
              <button
                key={convo.clientId || convo.coachId}
                className={`chat-convo-item ${convo.unreadCount > 0 ? 'unread' : ''}`}
                onClick={() => openConversation(convo)}
              >
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
