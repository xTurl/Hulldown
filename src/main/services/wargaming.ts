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

async function fetchJson(url: string, timeout: number): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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

export async function getPlayerTankStats(accountId: number, apiKey: string, region: string): Promise<WgTankStat[]> {
  const base = getBaseUrl(region);
  const data = await fetchJson(
    buildUrl(`${base}/tanks/stats/`, { application_id: apiKey, account_id: accountId }),
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

export async function getVehicleEncyclopedia(apiKey: string, region: string, tankIds?: number[]): Promise<Record<number, WgVehicle>> {
  const base = getBaseUrl(region);
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
