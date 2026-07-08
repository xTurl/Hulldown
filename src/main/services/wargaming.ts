function getBaseUrl(region: string): string {
  const urls: Record<string, string> = {
    EU: 'https://api.worldoftanks.eu/wot',
    NA: 'https://api.worldoftanks.com/wot',
    ASIA: 'https://api.worldoftanks.asia/wot',
  };
  return urls[region] || urls.EU;
}

function buildUrl(base: string, params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  return `${base}?${qs.toString()}`;
}

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;

/** Client errors (4xx) won't succeed on retry; everything else might. */
class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry + exponential backoff. Retries transient failures
 * (network errors, timeouts, 5xx, 429) up to MAX_RETRIES times;
 * other 4xx responses fail immediately.
 */
async function fetchJson(url: string, timeout: number): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (e) {
      lastError = e;
      const retriable = !(e instanceof HttpError) || e.status >= 500 || e.status === 429;
      if (!retriable || attempt === MAX_RETRIES) throw e;
      console.warn(`[wargaming] Request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastError;
}

export interface WgPlayerInfo {
  account_id: number;
  nickname: string;
  created_at: number;
  last_battle_time: number;
  statistics: {
    all: {
      battles: number; wins: number; damage_dealt: number;
      frags: number; survived_battles: number; spotted: number;
      dropped_capture_points: number; xp: number;
    };
  };
}

export interface WgTankStat {
  tank_id: number;
  all: {
    battles: number; wins: number; damage_dealt: number;
    frags: number; survived_battles: number; spotted: number;
    dropped_capture_points: number; xp: number;
    // losses/draws — needed to determine win/loss/draw when reconstructing
    // an abandoned battle's result from cumulative stat deltas
    losses?: number;
    draws?: number;
    // Assistance damage — already in default response
    avg_damage_assisted?: number;      // spotting (radio) per battle
    avg_damage_assisted_radio?: number;
    avg_damage_assisted_track?: number;
    avg_damage_blocked?: number;       // blocked per battle
    radio_assisted_damage?: number;    // totals (for manual calc)
    track_assisted_damage?: number;
  };
}

export interface WgVehicle {
  tank_id: number;
  name: string;
  tag: string;
  tier: number;
  type: string;
  nation: string;
  is_premium: boolean;
}

export async function getPlayerInfo(accountId: number, apiKey: string, region: string): Promise<WgPlayerInfo> {
  const base = getBaseUrl(region);
  const data = await fetchJson(
    buildUrl(`${base}/account/info/`, { application_id: apiKey, account_id: accountId }),
    10000,
  ) as Record<string, unknown>;
  if (data.status === 'error') throw new Error((data.error as Record<string, unknown>).message as string);
  return (data.data as Record<string, unknown>)[accountId.toString()] as WgPlayerInfo;
}

export async function getPlayerTankStats(
  accountId: number, apiKey: string, region: string, tankIds?: number[],
): Promise<WgTankStat[]> {
  const base = getBaseUrl(region);
  const params: Record<string, unknown> = { application_id: apiKey, account_id: accountId };
  if (tankIds && tankIds.length > 0) params.tank_id = tankIds.join(',');
  const data = await fetchJson(
    buildUrl(`${base}/tanks/stats/`, params),
    30000,
  ) as Record<string, unknown>;
  if (data.status === 'error') throw new Error((data.error as Record<string, unknown>).message as string);
  return ((data.data as Record<string, unknown>)[accountId.toString()] as WgTankStat[]) || [];
}

export interface WgPlayerSearchResult {
  account_id: number;
  nickname: string;
}

export async function searchPlayer(username: string, apiKey: string, region: string): Promise<WgPlayerSearchResult[]> {
  const base = getBaseUrl(region);
  const data = await fetchJson(
    buildUrl(`${base}/account/list/`, { application_id: apiKey, search: username, limit: 5 }),
    10000,
  ) as Record<string, unknown>;
  if (data.status === 'error') throw new Error((data.error as Record<string, unknown>).message as string);
  return (data.data as WgPlayerSearchResult[]) || [];
}

export interface Wn8ExpEntry {
  tankId: number;
  expDmg: number;
  expFrag: number;
  expSpot: number;
  expDef: number;
  expWinRate: number; // fraction 0–1
}

export async function getWn8ExpectedValues(): Promise<Map<number, Wn8ExpEntry>> {
  const data = await fetchJson(
    'https://static.modxvm.com/wn8-data-exp/json/wn8exp.json',
    15000,
  ) as { data: Array<{ IDNum: number; expDef: number; expFrag: number; expSpot: number; expDamage: number; expWinRate: number }> };
  const map = new Map<number, Wn8ExpEntry>();
  for (const item of data.data) {
    map.set(item.IDNum, {
      tankId:     item.IDNum,
      expDmg:     item.expDamage,
      expFrag:    item.expFrag,
      expSpot:    item.expSpot,
      expDef:     item.expDef,
      expWinRate: item.expWinRate / 100,
    });
  }
  return map;
}

// WG API rejects more than 100 IDs in a single tank_id parameter with
// TANK_ID_LIST_LIMIT_EXCEEDED — chunk requests to stay under that limit.
const TANK_ID_CHUNK_SIZE = 100;

async function fetchEncyclopediaChunk(
  base: string, apiKey: string, tankIds?: number[],
): Promise<Record<number, WgVehicle>> {
  const params: Record<string, unknown> = {
    application_id: apiKey,
    fields: 'tank_id,name,tag,tier,type,nation,is_premium',
    language: 'en',
  };
  if (tankIds && tankIds.length > 0) {
    params.tank_id = tankIds.join(',');
  }
  const data = await fetchJson(buildUrl(`${base}/encyclopedia/vehicles/`, params), 30000) as Record<string, unknown>;
  if (data.status === 'error') throw new Error((data.error as Record<string, unknown>).message as string);
  return data.data as Record<number, WgVehicle>;
}

export async function getVehicleEncyclopedia(apiKey: string, region: string, tankIds?: number[]): Promise<Record<number, WgVehicle>> {
  const base = getBaseUrl(region);

  if (!tankIds || tankIds.length === 0) {
    return fetchEncyclopediaChunk(base, apiKey);
  }

  const chunks: number[][] = [];
  for (let i = 0; i < tankIds.length; i += TANK_ID_CHUNK_SIZE) {
    chunks.push(tankIds.slice(i, i + TANK_ID_CHUNK_SIZE));
  }
  const results = await Promise.all(chunks.map(chunk => fetchEncyclopediaChunk(base, apiKey, chunk)));
  return Object.assign({}, ...results) as Record<number, WgVehicle>;
}
