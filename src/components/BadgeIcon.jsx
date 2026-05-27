import {
  Sprout,
  Flame,
  Zap,
  Dumbbell,
  Medal,
  Trophy,
  Crown,
  Gem,
} from 'lucide-react';

// Maps the `iconName` string from BADGE_TIERS (utils/badges.js) to the
// matching lucide-react component. Keeping this in one place means the
// canvas share card and the React UIs render the same icon set.
const ICON_MAP = {
  Sprout,
  Flame,
  Zap,
  Dumbbell,
  Medal,
  Trophy,
  Crown,
  Gem,
};

// Renders the lucide icon for a badge tier. Pass `color` to override the
// default `tier.iconColor` (e.g. greyed-out for locked badges). Returns
// null when the tier has no `iconName` so callers can fall back safely.
export default function BadgeIcon({
  tier,
  size = 24,
  strokeWidth = 2,
  color,
  className,
}) {
  if (!tier?.iconName) return null;
  const Icon = ICON_MAP[tier.iconName];
  if (!Icon) return null;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      color={color || tier.iconColor}
      className={className}
    />
  );
}
