// Tiny inline badge that surfaces a coach's reaction emoji on the item it was
// left on (measurement, meal, PR, photo, etc.). Renders nothing when there is
// no reaction, so consumers can drop it into a row unconditionally.
function CoachReactionBadge({ reaction, size = 'sm', title = 'Coach reacted' }) {
  if (!reaction) return null;
  const emoji = typeof reaction === 'string' ? reaction : reaction.reaction;
  if (!emoji) return null;

  return (
    <span
      className={`coach-reaction-badge coach-reaction-badge--${size}`}
      title={title}
      aria-label={title}
    >
      {emoji}
    </span>
  );
}

export default CoachReactionBadge;
