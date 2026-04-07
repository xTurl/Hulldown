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

export interface Wn8Expected {
  expDmg: number;     // expected direct damage per battle
  expFrag: number;    // expected kills per battle
  expSpot: number;    // expected spotted per battle
  expDef: number;     // expected defence (dropped capture) per battle
  expWinRate: number; // expected win rate as fraction (0–1)
}

/**
 * Real WN8 formula per XVM specification.
 * Requires per-tank expected values (Wn8Expected) for accurate results.
 * Falls back to a rough approximation when expected values are unavailable.
 */
export function calculateWn8(
  stats: {
    battles: number;
    wins: number;
    damage_dealt: number;
    frags: number;
    spotted: number;
    dropped_capture_points: number;
  },
  exp?: Wn8Expected,
): number {
  if (stats.battles === 0) return 0;

  if (!exp) {
    // Rough fallback — used only when expected values cannot be fetched
    const wr = stats.wins / stats.battles;
    const dmg = stats.damage_dealt / stats.battles;
    return Math.max(0, Math.round(dmg * 0.8 + wr * 2000 - 1000));
  }

  const n = stats.battles;
  // Guard against 0/0 = NaN when both actual and expected value are 0
  const safeRatio = (actual: number, expected: number) =>
    expected > 0 ? actual / expected : (actual > 0 ? 2.0 : 0);

  const rDmg = safeRatio(stats.damage_dealt / n, exp.expDmg);
  const rFrag = safeRatio(stats.frags       / n, exp.expFrag);
  const rSpot = safeRatio(stats.spotted     / n, exp.expSpot);
  const rDef  = safeRatio(stats.dropped_capture_points / n, exp.expDef);
  const rWin  = safeRatio(stats.wins        / n, exp.expWinRate);

  // XVM reference formula — https://wiki.modxvm.com/en/WN8
  const rDmgN = Math.max(0, (rDmg - 0.22) / 0.78);
  const rFragN = Math.max(0, Math.min(rDmg + 0.2, 1.5) * (rFrag - 0.12) / 0.88);
  const rSpotN = Math.max(0, Math.min(rDmg + 0.1, 1.3) * (rSpot - 0.38) / 0.62);
  const rDefN  = Math.max(0, Math.min(rDmg + 0.1, 1.0) * (rDef  - 0.10) / 0.90);
  const rWinN  = Math.max(0, (rWin - 0.71) / 0.29);

  return Math.max(0, Math.round(
    980 * rDmgN + 210 * rFragN + 155 * rSpotN + 75 * rDefN + 145 * Math.min(1.8, rWinN),
  ));
}

/**
 * WNX — WN8 variant that credits assisted damage (spotting + tracking).
 * Uses effectiveDmg = directDmg + (radio + track assist) * 0.5 in place of directDmg,
 * keeping expected values the same so light tanks / scouts get a fairer rating.
 *
 * The assistedRadio / assistedTrack fields must be per-battle averages (as returned by the WG API).
 */
export function calculateWnx(
  stats: {
    battles: number;
    wins: number;
    damage_dealt: number;
    frags: number;
    spotted: number;
    dropped_capture_points: number;
    avg_damage_assisted_radio?: number;
    avg_damage_assisted?: number;
    avg_damage_assisted_track?: number;
  },
  exp?: Wn8Expected,
): number {
  if (stats.battles === 0) return 0;

  const assistedRadio = stats.avg_damage_assisted_radio ?? stats.avg_damage_assisted ?? 0;
  const assistedTrack = stats.avg_damage_assisted_track ?? 0;
  const effectiveDmg = stats.damage_dealt / stats.battles + (assistedRadio + assistedTrack) * 0.5;

  return calculateWn8(
    { ...stats, damage_dealt: Math.round(effectiveDmg * stats.battles) },
    exp,
  );
}
