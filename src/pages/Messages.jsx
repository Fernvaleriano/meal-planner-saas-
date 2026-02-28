import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Search, MessageCircle, Image, X, Trash2, Check, CheckCheck, Paperclip } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, ensureFreshSession } from '../utils/api';
import { supabase } from '../utils/supabase';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaPreview, setMediaPreview] = useState(null); // { file, dataUrl, type }
  const [uploading, setUploading] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState(null); // for unsend menu
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
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    }
  }, []);

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    try {
      // Ensure fresh auth session before fetching — prevents stale token hangs
      await ensureFreshSession();

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

  // Close unsend menu when clicking elsewhere
  useEffect(() => {
    if (selectedMsgId === null) return;
    const handleClick = () => setSelectedMsgId(null);
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [selectedMsgId]);

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
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvo, isCoach, coachId, clientId, scrollToBottom]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isCoach, coachId, clientId, activeConvo]);

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
          loading="lazy"
          className="chat-media-image"
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
            <div className="chat-empty-thread">
              <MessageCircle size={40} />
              <p>No messages yet</p>
              <p className="chat-empty-sub">Send a message to start the conversation</p>
            </div>
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

            return (
              <div
                key={msg.id}
                className={`chat-msg ${isMine ? 'mine' : 'theirs'}`}
                onClick={(e) => {
                  if (isMine) {
                    e.stopPropagation();
                    setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id);
                  }
                }}
              >
                <div className={`chat-msg-bubble ${hasMedia ? 'media-bubble' : ''}`}>
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
                </div>
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
                    <img src={convo.profilePhoto || convo.coachPhoto} alt={name} />
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
