import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Search, MessageCircle, Image, X, Trash2, Check, CheckCheck, Paperclip } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { supabase } from '../utils/supabase';

const GIPHY_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L29';

function Messages() {
  const { user, clientData } = useAuth();
  const isCoach = clientData?.is_coach === true;
  const coachId = isCoach ? user?.id : null;
  const clientId = clientData?.id;

  // State
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Media attachment state
  const [mediaPreview, setMediaPreview] = useState(null); // { file, url, type }
  const [uploading, setUploading] = useState(false);

  // GIF picker state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const gifTimerRef = useRef(null);

  // Message actions state
  const [contextMenu, setContextMenu] = useState(null); // { msgId, x, y }
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      setConversations(result.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [isCoach, coachId, clientId]);

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
      setTimeout(scrollToBottom, 100);

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

  // Send a message (text and/or media)
  const handleSend = async (mediaUrl = null, mediaType = null) => {
    const hasText = newMessage.trim();
    const hasMedia = mediaUrl || mediaPreview;

    if ((!hasText && !hasMedia) || sending) return;

    const msgText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const cId = isCoach ? coachId : activeConvo.coachId;
      const clId = isCoach ? activeConvo.clientId : clientId;

      let finalMediaUrl = mediaUrl;
      let finalMediaType = mediaType;

      // Upload file if we have a preview attachment (not a GIF URL)
      if (!mediaUrl && mediaPreview) {
        setUploading(true);
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(mediaPreview.file);
        });

        const uploadResult = await apiPost('/.netlify/functions/upload-chat-media', {
          fileData: base64,
          coachId: cId,
          clientId: clId
        });

        if (uploadResult.success) {
          finalMediaUrl = uploadResult.mediaUrl;
          finalMediaType = uploadResult.mediaType;
        }
        setUploading(false);
      }

      // Optimistic update
      const optimisticMsg = {
        id: Date.now(),
        sender_type: isCoach ? 'coach' : 'client',
        message: msgText || null,
        media_url: finalMediaUrl,
        media_type: finalMediaType,
        created_at: new Date().toISOString(),
        is_read: false
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setMediaPreview(null);
      setTimeout(scrollToBottom, 50);

      await apiPost('/.netlify/functions/chat', {
        action: 'send',
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client',
        message: msgText || null,
        mediaUrl: finalMediaUrl,
        mediaType: finalMediaType
      });

      // Update conversation list preview
      const previewText = msgText || (finalMediaType === 'video' ? 'Sent a video' : finalMediaType === 'gif' ? 'Sent a GIF' : 'Sent a photo');
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
    } finally {
      setSending(false);
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  // Handle file selection for photo/video
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Only photos and videos are supported.');
      return;
    }

    const url = URL.createObjectURL(file);
    setMediaPreview({
      file,
      url,
      type: file.type.startsWith('video/') ? 'video' : 'image'
    });
    setShowGifPicker(false);
    // Reset file input so the same file can be re-selected
    e.target.value = '';
  };

  // Clear media preview
  const clearMediaPreview = () => {
    if (mediaPreview?.url) {
      URL.revokeObjectURL(mediaPreview.url);
    }
    setMediaPreview(null);
  };

  // GIF picker - load trending on open
  const openGifPicker = async () => {
    setShowGifPicker(true);
    setGifQuery('');
    clearMediaPreview();
    await fetchGifs('trending');
  };

  // Fetch GIFs from GIPHY
  const fetchGifs = async (query) => {
    setGifsLoading(true);
    try {
      const endpoint = query === 'trending' ? 'trending' : 'search';
      const url = `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${GIPHY_KEY}&limit=20&rating=pg-13${query !== 'trending' ? '&q=' + encodeURIComponent(query) : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error('Error fetching GIFs:', err);
      setGifs([]);
    } finally {
      setGifsLoading(false);
    }
  };

  // Handle GIF search with debounce
  const handleGifSearch = (value) => {
    setGifQuery(value);
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    gifTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        fetchGifs(value.trim());
      } else {
        fetchGifs('trending');
      }
    }, 400);
  };

  // Select a GIF and send it
  const selectGif = (gifUrl) => {
    setShowGifPicker(false);
    handleSend(gifUrl, 'gif');
  };

  // Delete a message
  const deleteMessage = async (msgId) => {
    setContextMenu(null);
    try {
      const cId = isCoach ? coachId : activeConvo.coachId;
      const clId = isCoach ? activeConvo.clientId : clientId;

      await apiPost('/.netlify/functions/chat', {
        action: 'delete',
        messageId: msgId,
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client'
      });

      // Remove from UI
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // Handle long press / context menu on message
  const handleMessageAction = (e, msg) => {
    const isMine = msg.sender_type === (isCoach ? 'coach' : 'client');
    if (!isMine) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      msgId: msg.id,
      x: rect.left,
      y: rect.top - 44
    });
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
    setMediaPreview(null);
    setShowGifPicker(false);
    setContextMenu(null);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

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

  // Real-time subscription for new messages
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
              setTimeout(scrollToBottom, 100);

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
            style={{ maxWidth: '100%', borderRadius: 12 }}
          />
        </div>
      );
    }

    // Image or GIF
    return (
      <div className="chat-msg-media" onClick={() => setLightboxUrl(msg.media_url)}>
        <img
          src={msg.media_url}
          alt={msg.media_type === 'gif' ? 'GIF' : 'Photo'}
          loading="lazy"
          style={{ maxWidth: '100%', borderRadius: 12, cursor: 'pointer' }}
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
          <button className="chat-back-btn" onClick={() => { setActiveConvo(null); fetchConversations(); }}>
            <ArrowLeft size={20} />
          </button>
          <div className="chat-thread-avatar">
            {getInitials(convoName)}
          </div>
          <div className="chat-thread-name">{convoName}</div>
        </div>

        <div className="chat-messages-container">
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
                onContextMenu={(e) => handleMessageAction(e, msg)}
                onTouchStart={(e) => {
                  if (!isMine) return;
                  const timer = setTimeout(() => handleMessageAction(e, msg), 500);
                  e.currentTarget._longPressTimer = timer;
                }}
                onTouchEnd={(e) => {
                  if (e.currentTarget._longPressTimer) {
                    clearTimeout(e.currentTarget._longPressTimer);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.currentTarget._longPressTimer) {
                    clearTimeout(e.currentTarget._longPressTimer);
                  }
                }}
              >
                <div className={`chat-msg-bubble ${hasMedia ? 'media-bubble' : ''}`}>
                  {renderMedia(msg)}
                  {msg.message && <p>{msg.message}</p>}
                  <div className="chat-msg-footer">
                    <span className="chat-msg-time">{formatMessageTime(msg.created_at)}</span>
                    {isMine && (
                      <span className="chat-read-status">
                        {msg.is_read ? <CheckCheck size={14} /> : <Check size={14} />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Context menu for message actions */}
        {contextMenu && (
          <div
            className="chat-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => deleteMessage(contextMenu.msgId)}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}

        {/* Media preview before sending */}
        {mediaPreview && (
          <div className="chat-media-preview">
            <button className="chat-media-preview-close" onClick={clearMediaPreview}>
              <X size={18} />
            </button>
            {mediaPreview.type === 'video' ? (
              <video src={mediaPreview.url} controls style={{ maxHeight: 200, borderRadius: 8 }} />
            ) : (
              <img src={mediaPreview.url} alt="Preview" style={{ maxHeight: 200, borderRadius: 8 }} />
            )}
          </div>
        )}

        {/* GIF Picker */}
        {showGifPicker && (
          <div className="chat-gif-picker">
            <div className="chat-gif-picker-header">
              <input
                type="text"
                placeholder="Search GIFs..."
                value={gifQuery}
                onChange={(e) => handleGifSearch(e.target.value)}
                autoFocus
              />
              <button onClick={() => setShowGifPicker(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="chat-gif-grid">
              {gifsLoading ? (
                <div className="chat-gif-loading">Loading...</div>
              ) : gifs.length === 0 ? (
                <div className="chat-gif-loading">No GIFs found</div>
              ) : (
                gifs.map(gif => (
                  <img
                    key={gif.id}
                    src={gif.images.fixed_height_still?.url || gif.images.fixed_height.url}
                    data-gif={gif.images.fixed_height.url}
                    alt={gif.title}
                    onClick={() => selectGif(gif.images.fixed_height.url)}
                    onMouseEnter={(e) => { e.target.src = e.target.dataset.gif; }}
                    onMouseLeave={(e) => { e.target.src = gif.images.fixed_height_still?.url || gif.images.fixed_height.url; }}
                    loading="lazy"
                  />
                ))
              )}
            </div>
            <div className="chat-gif-powered">Powered by GIPHY</div>
          </div>
        )}

        {/* Input bar with attachment buttons */}
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
            title="Send photo or video"
          >
            <Paperclip size={20} />
          </button>
          <button
            className="chat-gif-btn"
            onClick={() => showGifPicker ? setShowGifPicker(false) : openGifPicker()}
            title="Send GIF"
          >
            GIF
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
            disabled={(!canSend && !mediaPreview) || sending || uploading}
          >
            <Send size={20} />
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
