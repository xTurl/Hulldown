import * as cheerio from 'cheerio';
import type { MapStat } from '../types';

const TOMATO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' };

interface TomatoData {
  mapStats: MapStat[];
  recentWn8?: number;
  recentWr?: number;
}

export interface TomatoSessionData {
  battles: number;
  wins: number;
  losses: number;
  winRate: number;
  wn8: number;
  wnx: number;
  dpg: number;
  frags: number;
  survival: number;
  spots: number;
  assist: number;
  avgTier: number;
  tankCount: number;
}

export async function debugSessionData(username: string, accountId: number, region: string): Promise<unknown> {
  const url = `https://tomato.gg/stats/${username}-${accountId}/${region}`;
  try {
    const response = await fetch(url, { headers: TOMATO_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { error: `HTTP ${response.status}`, url };
    const html = await response.text();
    const $ = cheerio.load(html);
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (!nextDataScript) return { error: 'No __NEXT_DATA__ found', url, htmlLength: html.length };
    const nextData = JSON.parse(nextDataScript);
    const pageProps = nextData?.props?.pageProps;
    const recentStats = pageProps?.recentStats;
    const days = recentStats?.data?.days;
    const day1overall = days?.['1']?.overall ?? null;
    return {
      url,
      daysKeys: days ? Object.keys(days) : [],
      day1Keys: day1overall ? Object.keys(day1overall) : [],
      day1: day1overall,
    };
  } catch (e) {
    return { error: String(e), url };
  }
}

export async function getSessionData(username: string, accountId: number, region: string): Promise<TomatoSessionData | null> {
  const url = `https://tomato.gg/stats/${username}-${accountId}/${region}`;
  try {
    const response = await fetch(url, { headers: TOMATO_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (!nextDataScript) return null;

    const nextData = JSON.parse(nextDataScript);
    const overall = nextData?.props?.pageProps?.recentStats?.data?.days?.['1']?.overall;
    if (!overall || !overall.battles) return null;

    return {
      battles:   overall.battles    ?? 0,
      wins:      overall.wins       ?? 0,
      losses:    overall.losses     ?? 0,
      winRate:   overall.winrate    ?? 0,
      wn8:       overall.wn8        ?? 0,
      wnx:       overall.wnx        ?? 0,
      dpg:       overall.dpg        ?? 0,
      frags:     overall.frags      ?? 0,
      survival:  overall.survival   ?? 0,
      spots:     overall.spots      ?? 0,
      assist:    overall.assist     ?? 0,
      avgTier:   overall.tier       ?? 0,
      tankCount: overall.tankcount  ?? 0,
    };
  } catch (e) {
    console.error('Failed to fetch tomato.gg session data:', e);
    return null;
  }
}

export async function scrapeTomatoGgPlayerData(username: string, accountId: number, region: string): Promise<TomatoData> {
  const url = `https://tomato.gg/stats/${username}-${accountId}/${region}`;
  try {
    const response = await fetch(url, { headers: TOMATO_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { mapStats: [] };
    const html = await response.text();
    const $ = cheerio.load(html);

    // Try to extract Next.js data
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      return extractFromNextData(nextData);
    }

    return { mapStats: [] };
  } catch (e) {
    console.error('Failed to scrape tomato.gg player page:', e);
    return { mapStats: [] };
  }
}

export async function scrapeTomatoGgTankData(username: string, accountId: number, region: string, tankId: number): Promise<MapStat[]> {
  const urls = [
    `https://tomato.gg/stats/${username}-${accountId}/${region}/tank/${tankId}`,
    `https://tomato.gg/stats/${username}-${accountId}/${region}?tank_id=${tankId}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: TOMATO_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);

      const nextDataScript = $('#__NEXT_DATA__').html();
      if (nextDataScript) {
        const nextData = JSON.parse(nextDataScript);
        const mapStats = extractMapStatsFromNextData(nextData, tankId);
        if (mapStats.length > 0) return mapStats;
      }
    } catch (e) {
      // Try next URL
    }
  }

  return [];
}

function extractFromNextData(nextData: unknown): TomatoData {
  try {
    const data = nextData as Record<string, unknown>;
    const props = data.props as Record<string, unknown>;
    const pageProps = props?.pageProps as Record<string, unknown>;

    if (pageProps?.playerData) {
      const playerData = pageProps.playerData as Record<string, unknown>;
      return {
        mapStats: extractMapStats(playerData),
        recentWn8: (playerData.recentWN8 as number) || undefined,
        recentWr: (playerData.recentWR as number) || undefined,
      };
    }
  } catch (e) {
    // ignore parse errors
  }
  return { mapStats: [] };
}

function extractMapStatsFromNextData(nextData: unknown, tankId: number): MapStat[] {
  try {
    const data = nextData as Record<string, unknown>;
    const props = data.props as Record<string, unknown>;
    const pageProps = props?.pageProps as Record<string, unknown>;

    if (pageProps) {
      return extractMapStats(pageProps as Record<string, unknown>);
    }
  } catch (e) {
    // ignore
  }
  return [];
}

function extractMapStats(data: Record<string, unknown>): MapStat[] {
  const mapStats: MapStat[] = [];
  try {
    const maps = data.mapStats as Array<Record<string, unknown>>;
    if (Array.isArray(maps)) {
      for (const m of maps) {
        const battles = Number(m.battles || 0);
        const wins = Number(m.wins || 0);
        mapStats.push({
          mapId: String(m.mapId || m.map_id || ''),
          mapName: String(m.mapName || m.map_name || m.name || 'Nieznana mapa'),
          battles,
          wins,
          winRate: battles > 0 ? Math.round((wins / battles) * 100 * 10) / 10 : 0,
          avgDamage: Number(m.avgDamage || m.avg_damage || 0),
        });
      }
    }
  } catch (e) {
    // ignore
  }
  return mapStats;
}
