export function getWn8Color(wn8: number): string {
  if (wn8 < 300) return '#f05555';  // Very Bad    — red
  if (wn8 < 450) return '#e88a00';  // Bad         — orange
  if (wn8 < 650) return '#d4b800';  // Below avg   — yellow
  if (wn8 < 900) return '#96b82c';  // Average     — yellow-green
  if (wn8 < 1200) return '#52a84a'; // Above avg   — green
  if (wn8 < 1600) return '#38b8d4'; // Good        — teal
  if (wn8 < 1900) return '#5590e8'; // Very Good   — blue
  if (wn8 < 2350) return '#a05de8'; // Great       — purple
  if (wn8 < 2900) return '#c264f0'; // Unicum      — light purple
  return '#e040fb';                  // Super Unicum — bright magenta
}

export function getWn8Label(wn8: number): string {
  if (wn8 < 300) return 'Very Bad';
  if (wn8 < 450) return 'Bad';
  if (wn8 < 650) return 'Below Average';
  if (wn8 < 900) return 'Average';
  if (wn8 < 1200) return 'Above Average';
  if (wn8 < 1600) return 'Good';
  if (wn8 < 1900) return 'Very Good';
  if (wn8 < 2350) return 'Great';
  if (wn8 < 2900) return 'Unicum';
  return 'Super Unicum';
}

export function getWrColor(winRate: number): string {
  if (winRate < 46) return '#cd3333';
  if (winRate < 49) return '#d77900';
  if (winRate < 52) return '#d7b600';
  if (winRate < 56) return '#4d7326';
  if (winRate < 60) return '#4099b4';
  return '#793db6';
}

export function calculateWn8(stats: {
  battles: number; wins: number; damage_dealt: number;
  frags: number; spotted: number; dropped_capture_points: number;
}): number {
  if (stats.battles === 0) return 0;
  const wr = stats.wins / stats.battles;
  const dmg = stats.damage_dealt / stats.battles;
  return Math.max(0, Math.round(dmg * 0.8 + wr * 2000 - 1000));
}

/**
 * Przybliżone WNX — metryka tomato.gg uwzględniająca assisted damage
 * (spotting radio + tracking). Dzięki temu lekkie czołgi i spoty
 * są oceniane sprawiedliwiej niż w WN8.
 *
 * Formuła oficjalna jest własnością tomato.gg i nie jest publiczna.
 * Tutaj: effectiveDmg = directDmg + assistedDmg * 0.5, reszta jak WN8.
 */
export function calculateWnx(stats: {
  battles: number;
  wins: number;
  damage_dealt: number;
  frags: number;
  spotted: number;
  dropped_capture_points: number;
  // WG API zwraca te pola już jako wartości per bitwę (avg_*)
  avg_damage_assisted_radio?: number;
  avg_damage_assisted?: number;
  avg_damage_assisted_track?: number;
}): number {
  if (stats.battles === 0) return 0;

  const directDmg = stats.damage_dealt / stats.battles;
  const assistedRadio = stats.avg_damage_assisted_radio ?? stats.avg_damage_assisted ?? 0;
  const assistedTrack = stats.avg_damage_assisted_track ?? 0;

  const effectiveDmg = directDmg + (assistedRadio + assistedTrack) * 0.5;
  const wr = stats.wins / stats.battles;

  return Math.max(0, Math.round(effectiveDmg * 0.8 + wr * 2000 - 1000));
}
