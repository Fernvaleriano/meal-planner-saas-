import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Search, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { supabase } from '../utils/supabase';

function Messages() {
  const { user, clientData } = useAuth();
  const isCoach = clientData?.is_coach === true;
  const coachId = isCoach ? user?.id : null;
  const clientId = clientData?.id;

  // State
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null); // { clientId, clientName, coachId, coachName }
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

  // Send a message
  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    const msgText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const cId = isCoach ? coachId : activeConvo.coachId;
      const clId = isCoach ? activeConvo.clientId : clientId;

      // Optimistic update
      const optimisticMsg = {
        id: Date.now(),
        sender_type: isCoach ? 'coach' : 'client',
        message: msgText,
        created_at: new Date().toISOString(),
        is_read: false
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setTimeout(scrollToBottom, 50);

      await apiPost('/.netlify/functions/chat', {
        action: 'send',
        coachId: cId,
        clientId: clId,
        senderType: isCoach ? 'coach' : 'client',
        message: msgText
      });

      // Update conversation list with new last message
      setConversations(prev => prev.map(c => {
        const matchId = isCoach ? c.clientId : c.coachId;
        const activeId = isCoach ? activeConvo.clientId : activeConvo.coachId;
        if (matchId === activeId) {
          return {
            ...c,
            lastMessage: msgText,
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
      inputRef.current?.focus();
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
  };

  // For client: auto-open single conversation
  useEffect(() => {
    if (!isCoach && conversations.length === 1 && !activeConvo) {
      openConversation(conversations[0]);
    }
  }, [isCoach, conversations, activeConvo]);

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
          // Only add if it's for this conversation and not from us
          if (newMsg.client_id === parseInt(clId)) {
            const myType = isCoach ? 'coach' : 'client';
            if (newMsg.sender_type !== myType) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              setTimeout(scrollToBottom, 100);

              // Mark as read immediately since we're viewing the convo
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

          // Update conversation list when new message arrives
          setConversations(prev => {
            const updated = prev.map(c => {
              const matchId = isCoach ? c.clientId : c.coachId;
              const msgMatchId = isCoach ? newMsg.client_id : newMsg.coach_id;
              if (matchId === msgMatchId) {
                return {
                  ...c,
                  lastMessage: newMsg.message,
                  lastMessageAt: newMsg.created_at,
                  lastMessageSender: newMsg.sender_type,
                  hasMessages: true,
                  // Only increment unread if message is not from us and not viewing this convo
                  unreadCount: (newMsg.sender_type !== myType && (!activeConvo || (isCoach ? activeConvo.clientId !== newMsg.client_id : activeConvo.coachId !== newMsg.coach_id)))
                    ? (c.unreadCount || 0) + 1
                    : c.unreadCount
                };
              }
              return c;
            });
            // Re-sort by most recent
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

  // Conversation thread view
  if (activeConvo) {
    const convoName = isCoach ? activeConvo.clientName : (activeConvo.coachName || 'Your Coach');

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

            return (
              <div key={msg.id} className={`chat-msg ${isMine ? 'mine' : 'theirs'}`}>
                <div className="chat-msg-bubble">
                  <p>{msg.message}</p>
                  <span className="chat-msg-time">{formatMessageTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-bar">
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
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            <Send size={20} />
          </button>
        </div>
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
