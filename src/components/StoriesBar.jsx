import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import StoryViewer from './StoryViewer';
import CreateStoryModal from './CreateStoryModal';

const avatarFor = (name, url) =>
  url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Member')}&background=0d9488&color=fff`;

// Instagram-style row of client "stories" rings.
//   mode="client": shown to a client. Leads with a "Your story" (+) tile, then
//                  the coach's clients' group-visible stories (and the client's
//                  own). Tapping a ring opens the viewer; the + posts a story.
//   mode="coach":  shown to a coach. Lists every client's active stories so the
//                  coach can review and delete them. No posting tile.
function StoriesBar({ mode = 'client', clientId, coachId, selfName, selfAvatar }) {
  const [groups, setGroups] = useState([]);
  const [openGroup, setOpenGroup] = useState(null); // group object whose stories are open
  const [showCreate, setShowCreate] = useState(false);
  const isClient = mode === 'client';

  const fetchGroups = useCallback(async () => {
    if (!coachId) return;
    if (isClient && !clientId) return;
    try {
      const qs = isClient
        ? `clientId=${clientId}&coachId=${coachId}`
        : `coachId=${coachId}`;
      const data = await apiGet(`/.netlify/functions/get-group-stories?${qs}`);
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Error loading group stories:', err);
    }
  }, [isClient, clientId, coachId]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleViewStory = useCallback((storyId) => {
    if (!isClient || !clientId) return Promise.resolve();
    return apiPost('/.netlify/functions/view-client-story', { storyId, clientId });
  }, [isClient, clientId]);

  const handleDeleteStory = useCallback((storyId) => {
    return apiPost('/.netlify/functions/delete-client-story', {
      storyId,
      ...(isClient ? { clientId } : { coachId })
    });
  }, [isClient, clientId, coachId]);

  const closeViewer = () => {
    setOpenGroup(null);
    fetchGroups(); // refresh seen/expired state
  };

  // The viewer's own group (if they've posted), used to decide what the
  // "Your story" tile does on tap.
  const selfGroup = isClient ? groups.find(g => g.isSelf) : null;
  const otherGroups = isClient ? groups.filter(g => !g.isSelf) : groups;

  // Coach mode with nothing to show → render nothing.
  if (!isClient && groups.length === 0) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.scroller}>
        {/* Client: leading "Your story" tile */}
        {isClient && (
          <div style={styles.item}>
            <button
              style={styles.ringBtn}
              onClick={() => (selfGroup ? setOpenGroup(selfGroup) : setShowCreate(true))}
              aria-label={selfGroup ? 'View your story' : 'Add a story'}
            >
              <div style={{ ...styles.ring, ...(selfGroup?.hasUnseen ? styles.ringUnseen : styles.ringSeen) }}>
                <img src={avatarFor(selfName, selfAvatar)} alt="" style={styles.avatar} />
              </div>
              <span style={styles.addBadge} onClick={(e) => { e.stopPropagation(); setShowCreate(true); }}>
                <Plus size={13} strokeWidth={3} />
              </span>
            </button>
            <span style={styles.label}>Your story</span>
          </div>
        )}

        {/* Everyone else */}
        {otherGroups.map(group => (
          <div key={group.authorClientId} style={styles.item}>
            <button
              style={styles.ringBtn}
              onClick={() => setOpenGroup(group)}
              aria-label={`View ${group.authorName}'s story`}
            >
              <div style={{ ...styles.ring, ...(group.hasUnseen ? styles.ringUnseen : styles.ringSeen) }}>
                <img src={avatarFor(group.authorName, group.authorAvatar)} alt="" style={styles.avatar} />
              </div>
            </button>
            <span style={styles.label}>{group.authorName?.split(' ')[0] || 'Member'}</span>
          </div>
        ))}
      </div>

      {openGroup && openGroup.stories?.length > 0 && (
        <StoryViewer
          stories={openGroup.stories}
          coachName={openGroup.authorName}
          coachAvatar={openGroup.authorAvatar}
          clientId={clientId}
          coachId={coachId}
          showInteractions={false}
          onViewStory={handleViewStory}
          onDeleteStory={handleDeleteStory}
          onClose={closeViewer}
        />
      )}

      {showCreate && (
        <CreateStoryModal
          clientId={clientId}
          onClose={() => setShowCreate(false)}
          onCreated={fetchGroups}
        />
      )}
    </div>
  );
}

const styles = {
  wrap: { padding: '10px 0 4px' },
  scroller: {
    display: 'flex', gap: 14, overflowX: 'auto', padding: '0 16px',
    WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none'
  },
  item: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: '0 0 auto', width: 68 },
  ringBtn: { position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  ring: {
    width: 62, height: 62, borderRadius: '50%', padding: 3,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
  },
  ringUnseen: { background: 'linear-gradient(135deg, #2cb5a5 0%, #0d9488 50%, #14b8a6 100%)' },
  ringSeen: { background: 'var(--border-color, #d1d5db)' },
  avatar: {
    width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover',
    border: '2px solid var(--card-bg, #fff)', boxSizing: 'border-box'
  },
  addBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: '50%',
    background: '#2cb5a5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid var(--card-bg, #fff)'
  },
  label: {
    fontSize: 11, color: 'var(--text-secondary, #64748b)', maxWidth: 64,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center'
  }
};

export default StoriesBar;
