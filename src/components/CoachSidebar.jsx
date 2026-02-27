import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Activity, Settings, LogOut, Search, Users, ChevronRight, Circle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function CoachSidebar({ selectedClient, onSelectClient }) {
  const location = useLocation();
  const { clientData, user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  const fetchClients = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const res = await fetch(`/.netlify/functions/get-clients?coachId=${clientData.id}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }, [clientData?.id]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = clients.filter(client =>
    client.client_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getActivityStatus = (client) => {
    if (!client.last_activity_at) return 'inactive';
    const lastActive = new Date(client.last_activity_at);
    const now = new Date();
    const hoursAgo = (now - lastActive) / (1000 * 60 * 60);
    if (hoursAgo < 1) return 'active';
    if (hoursAgo < 24) return 'recent';
    return 'inactive';
  };

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/feed', icon: Activity, label: 'Client Feed' },
  ];

  return (
    <aside className="coach-sidebar">
      <div className="coach-sidebar-header">
        <img src="/icons/logo.png" alt="Zique Fitness" className="coach-sidebar-logo" />
        <span className="coach-sidebar-brand">Zique Fitness</span>
      </div>

      <nav className="coach-sidebar-nav">
        {navItems.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`coach-sidebar-nav-item ${location.pathname === path ? 'active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="coach-sidebar-clients">
        <div className="coach-sidebar-clients-header">
          <Users size={16} />
          <span>Clients</span>
          <span className="coach-sidebar-client-count">{clients.length}</span>
        </div>

        <div className="coach-sidebar-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="coach-sidebar-client-list">
          {loadingClients ? (
            <div className="coach-sidebar-loading">Loading clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="coach-sidebar-empty">
              {searchQuery ? 'No clients found' : 'No clients yet'}
            </div>
          ) : (
            filteredClients.map(client => {
              const status = getActivityStatus(client);
              const isSelected = selectedClient?.id === client.id;
              return (
                <button
                  key={client.id}
                  className={`coach-sidebar-client ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectClient(isSelected ? null : client)}
                >
                  <div className="coach-sidebar-client-avatar">
                    {client.profile_photo_url || client.avatar_url ? (
                      <img src={client.profile_photo_url || client.avatar_url} alt="" />
                    ) : (
                      getInitials(client.client_name)
                    )}
                    <span className={`coach-sidebar-status-dot ${status}`} />
                  </div>
                  <div className="coach-sidebar-client-info">
                    <span className="coach-sidebar-client-name">{client.client_name}</span>
                    <span className="coach-sidebar-client-activity">{getTimeAgo(client.last_activity_at)}</span>
                  </div>
                  <ChevronRight size={14} className="coach-sidebar-client-arrow" />
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="coach-sidebar-footer">
        <Link to="/settings" className={`coach-sidebar-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
          <Settings size={18} />
          <span>Settings</span>
        </Link>
        <div className="coach-sidebar-user">
          <div className="coach-sidebar-user-avatar">
            {getInitials(clientData?.client_name)}
          </div>
          <div className="coach-sidebar-user-info">
            <span className="coach-sidebar-user-name">{clientData?.client_name || 'Coach'}</span>
            <span className="coach-sidebar-user-email">{clientData?.email || ''}</span>
          </div>
          <button onClick={logout} className="coach-sidebar-logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default CoachSidebar;
