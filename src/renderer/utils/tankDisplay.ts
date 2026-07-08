/**
 * Single source of truth for tank presentation constants shared across views:
 * class icons, nation flags, mastery badges and class labels.
 */
import iconLight from '../assets/light.png';
import iconLightPremium from '../assets/light_premium.png';
import iconMedium from '../assets/medium.png';
import iconMediumPremium from '../assets/medium_premium.png';
import iconHeavy from '../assets/heavy.png';
import iconHeavyPremium from '../assets/heavy_premium.png';
import iconTD from '../assets/tank_destroyer.png';
import iconTDPremium from '../assets/tank_destroyer_premium.png';
import iconSPG from '../assets/artyllery.png';

export const TANK_TYPE_ICONS: Record<string, { normal: string; premium?: string }> = {
  lightTank:  { normal: iconLight,  premium: iconLightPremium },
  mediumTank: { normal: iconMedium, premium: iconMediumPremium },
  heavyTank:  { normal: iconHeavy,  premium: iconHeavyPremium },
  'AT-SPG':   { normal: iconTD,     premium: iconTDPremium },
  SPG:        { normal: iconSPG },
};

export function tankTypeIcon(type: string | undefined, isPremium = false): string {
  if (!type) return '';
  const icons = TANK_TYPE_ICONS[type];
  if (!icons) return '';
  return (isPremium && icons.premium) ? icons.premium : icons.normal;
}

export const TANK_TYPE_LABELS: Record<string, string> = {
  lightTank: 'Light Tank',
  mediumTank: 'Medium Tank',
  heavyTank: 'Heavy Tank',
  'AT-SPG': 'Tank Destroyer',
  SPG: 'SPG',
};

export const NATION_FLAGS: Record<string, string> = {
  france: '🇫🇷', germany: '🇩🇪', usa: '🇺🇸', ussr: '🇷🇺', uk: '🇬🇧',
  japan: '🇯🇵', china: '🇨🇳', czech: '🇨🇿', sweden: '🇸🇪', poland: '🇵🇱',
  italy: '🇮🇹', netherlands: '🇳🇱', pan_america: '🌎',
};

export function nationFlag(nation: string | undefined): string {
  return nation ? (NATION_FLAGS[nation] ?? '') : '';
}

// Index = markOfMastery value from the replay (0 = none … 4 = Ace Tanker)
export const MASTERY_LABELS = ['', '3rd', '2nd', '1st', 'Ace'];
export const MASTERY_COLORS = ['', '#9ca3af', '#a78bfa', '#fbbf24', '#f97316'];

export function masteryLabel(m: number): string {
  return MASTERY_LABELS[m] ?? '';
}

export function masteryColor(m: number): string {
  return MASTERY_COLORS[m] ?? '';
}
