/**
 * Polish → English map name translations.
 * WoT replays from Polish-locale clients store map names in Polish.
 * This dictionary normalizes them for display.
 * Full list of current active World of Tanks maps.
 */
export const ENGLISH_MAP_NAMES = {
  Airfield: 'Airfield',
  Cliff: 'Cliff',
  ElHalluf: 'El Halluf',
  Ensk: 'Ensk',
  GhostTown: 'Ghost Town',
  Glacier: 'Glacier',
  Himmelsdorf: 'Himmelsdorf',
  Klondike: 'Klondike',
  LiveOaks: 'Live Oaks',
  Mines: 'Mines',
  Murovanka: 'Murovanka',
  Outpost: 'Outpost',
  OysterBay: 'Oyster Bay',
  Pilsen: 'Pilsen',
  Prokhorovka: 'Prokhorovka',
  Ruinberg: 'Ruinberg',
  SafeHaven: 'Safe Haven',
  SandRiver: 'Sand River',
  SiegfriedLine: 'Siegfried Line',
  Steppes: 'Steppes',
  Studzianki: 'Studzianki',
  Tundra: 'Tundra',
  Westfield: 'Westfield',
} as const;

export const POLISH_TO_ENGLISH_MAP_NAMES: Record<string, string> = {
  'Lotnisko': ENGLISH_MAP_NAMES.Airfield,
  'Urwisko': ENGLISH_MAP_NAMES.Cliff,
  'El Halluf': ENGLISH_MAP_NAMES.ElHalluf,
  'Ensk': ENGLISH_MAP_NAMES.Ensk,
  'Miasto duchów': ENGLISH_MAP_NAMES.GhostTown,
  'Lodowiec': ENGLISH_MAP_NAMES.Glacier,
  'Himmelsdorf': ENGLISH_MAP_NAMES.Himmelsdorf,
  'Klondike': ENGLISH_MAP_NAMES.Klondike,
  'Dębina': ENGLISH_MAP_NAMES.LiveOaks,
  'Kopalnia': ENGLISH_MAP_NAMES.Mines,
  'Kopalnie': ENGLISH_MAP_NAMES.Mines,
  'Murowanka': ENGLISH_MAP_NAMES.Murovanka,
  'Posterunek': ENGLISH_MAP_NAMES.Outpost,
  'Zatoka małży': ENGLISH_MAP_NAMES.OysterBay,
  'Pilzno': ENGLISH_MAP_NAMES.Pilsen,
  'Prochorowka': ENGLISH_MAP_NAMES.Prokhorovka,
  'Ruinberg': ENGLISH_MAP_NAMES.Ruinberg,
  'Bezpieczna przystań': ENGLISH_MAP_NAMES.SafeHaven,
  'Piaszczysta rzeka': ENGLISH_MAP_NAMES.SandRiver,
  'Linia Zygfryda': ENGLISH_MAP_NAMES.SiegfriedLine,
  'Step': ENGLISH_MAP_NAMES.Steppes,
  'Studzianki': ENGLISH_MAP_NAMES.Studzianki,
  'Tundra': ENGLISH_MAP_NAMES.Tundra,
  'Westfield': ENGLISH_MAP_NAMES.Westfield,
};

/** Returns the English map name, or the original string if no translation found. */
export function normalizeMapName(mapName: string): string {
  return POLISH_TO_ENGLISH_MAP_NAMES[mapName] ?? mapName;
}
