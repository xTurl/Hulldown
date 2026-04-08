export function getWn8Color(wn8: number): string {
  if (wn8 <= 100)  return '#dd2222';  // dark red
  if (wn8 <= 200)  return '#dd5533';  // red
  if (wn8 <= 400)  return '#dd7700';  // dark orange
  if (wn8 <= 600)  return '#ddaa00';  // orange
  if (wn8 <= 800)  return '#ddcc00';  // light orange
  if (wn8 <= 1000) return '#aacc00';  // yellow
  if (wn8 <= 1300) return '#66cc22';  // light green
  if (wn8 <= 1600) return '#33aa33';  // green
  if (wn8 <= 1800) return '#228844';  // darker green
  if (wn8 <= 2000) return '#22bbdd';  // light blue
  if (wn8 <= 2200) return '#2299ee';  // blue
  if (wn8 <= 2300) return '#1166cc';  // darker blue
  if (wn8 <= 2400) return '#aa77ff';  // light purple
  if (wn8 <= 2600) return '#9955ff';  // purple
  if (wn8 <= 3100) return '#7733ee';  // darker purple
  if (wn8 <= 4000) return '#6622cc';  // even darker purple
  return '#bb44ff';                    // super unicum — bright magenta-purple
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
  // rDmgC is computed first; the other caps depend on it (not on raw rDmg).
  const rDmgC  = Math.max(0, (rDmg - 0.22) / 0.78);
  const rFragC = Math.max(0, Math.min(rDmgC + 0.2, (rFrag - 0.12) / 0.88));
  const rSpotC = Math.max(0, Math.min(rDmgC + 0.1, (rSpot - 0.38) / 0.62));
  const rDefC  = Math.max(0, Math.min(rDmgC + 0.1, (rDef  - 0.10) / 0.90));
  const rWinC  = Math.max(0, (rWin - 0.71) / 0.29);

  return Math.max(0, Math.round(
    980 * rDmgC +
    210 * rDmgC  * rFragC +
    155 * rFragC * rSpotC +
    75  * rDefC  * rFragC +
    145 * Math.min(1.8, rWinC),
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
