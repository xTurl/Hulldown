/**
 * Polish → English map name translations.
 * WoT replays from Polish-locale clients store map names in Polish.
 * This dictionary normalizes them for display.
 * Full list of current active World of Tanks maps.
 */
export const ENGLISH_MAP_NAMES = {
  // Summer
  Abbey:          'Abbey',
  Berlin:         'Berlin',
  Cliff:          'Cliff',
  EmpiresBorder:  "Empire's Border",
  Ensk:           'Ensk',
  FishermansBay:  "Fisherman's Bay",
  Fjords:         'Fjords',
  Highway:        'Highway',
  Himmelsdorf:    'Himmelsdorf',
  Karelia:        'Karelia',
  Lakeville:      'Lakeville',
  LiveOaks:       'Live Oaks',
  Malinovka:      'Malinovka',
  Mines:          'Mines',
  MountainPass:   'Mountain Pass',
  Murovanka:      'Murovanka',
  Overlord:       'Overlord',
  Paris:          'Paris',
  PearlRiver:     'Pearl River',
  Pilsen:         'Pilsen',
  Prokhorovka:    'Prokhorovka',
  Province:       'Province',
  Redshire:       'Redshire',
  Ruinberg:       'Ruinberg',
  SereneCoast:    'Serene Coast',
  SiegfriedLine:  'Siegfried Line',
  Steppes:        'Steppes',
  Studzianki:     'Studzianki',
  Tundra:         'Tundra',
  Westfield:      'Westfield',
  Widepark:       'Widepark',
  // Winter
  Erlenberg:      'Erlenberg',
  Glacier:        'Glacier',
  MannerheimLine: 'Mannerheim Line',
  // Desert
  Airfield:       'Airfield',
  ElHalluf:       'El Halluf',
  GhostTown:      'Ghost Town',
  SandRiver:      'Sand River',
  // Grand Battle
  Hinterland:     'Hinterland',
  Klondike:       'Klondike',
  Nebelburg:      'Nebelburg',
  // Frontline
  Kraftwerk:      'Kraftwerk',
  Normandy:       'Normandy',
  // Legacy — removed maps that may appear in older replays
  FierySalient:   'Fiery Salient',
  Kharkov:        'Kharkov',
  Mittengard:     'Mittengard',
  Outpost:        'Outpost',
  OysterBay:      'Oyster Bay',
  SafeHaven:      'Safe Haven',
  SacredValley:   'Sacred Valley',
  Stalingrad:     'Stalingrad',
  Swamp:          'Swamp',
  Windstorm:      'Windstorm',
  Winterberg:     'Winterberg',
} as const;

/**
 * Maps Polish display names (as stored in replay files by the Polish-locale client)
 * to canonical English names.
 * Only entries where the Polish name differs from the English name are included.
 * Multiple Polish variants for the same map are kept when different WoT versions
 * used different translations or capitalizations.
 */
export const POLISH_TO_ENGLISH_MAP_NAMES: Record<string, string> = {
  // Active maps
  'Opactwo':            ENGLISH_MAP_NAMES.Abbey,
  'Klasztor':           ENGLISH_MAP_NAMES.Abbey,
  'Urwisko':            ENGLISH_MAP_NAMES.Cliff,
  'Granica Imperium':   ENGLISH_MAP_NAMES.EmpiresBorder,
  'Region Enska':       ENGLISH_MAP_NAMES.Ensk,
  'Zatoka Rybaka':      ENGLISH_MAP_NAMES.FishermansBay,
  'Zatoka Rybacka':     ENGLISH_MAP_NAMES.FishermansBay,
  'Fiordy':             ENGLISH_MAP_NAMES.Fjords,
  'Autostrada':         ENGLISH_MAP_NAMES.Highway,
  'Dębina':             ENGLISH_MAP_NAMES.LiveOaks,
  'Malinówka':          ENGLISH_MAP_NAMES.Malinovka,
  'Malinowka':          ENGLISH_MAP_NAMES.Malinovka,
  'Kopalnia':           ENGLISH_MAP_NAMES.Mines,
  'Kopalnie':           ENGLISH_MAP_NAMES.Mines,
  'Przełęcz Górska':    ENGLISH_MAP_NAMES.MountainPass,
  'Przełęcz':           ENGLISH_MAP_NAMES.MountainPass,
  'Murowanka':          ENGLISH_MAP_NAMES.Murovanka,
  'Paryż':              ENGLISH_MAP_NAMES.Paris,
  'Perłowa Rzeka':      ENGLISH_MAP_NAMES.PearlRiver,
  'Rzeka Perłowa':      ENGLISH_MAP_NAMES.PearlRiver,
  'Pilzno':             ENGLISH_MAP_NAMES.Pilsen,
  'Prochorowka':        ENGLISH_MAP_NAMES.Prokhorovka,
  'Prowincja':          ENGLISH_MAP_NAMES.Province,
  'Czerwona Wieś':      ENGLISH_MAP_NAMES.Redshire,
  'Spokojna Przystań':  ENGLISH_MAP_NAMES.SereneCoast,
  'Cichy Brzeg':        ENGLISH_MAP_NAMES.SereneCoast,
  'Linia Zygfryda':     ENGLISH_MAP_NAMES.SiegfriedLine,
  'Step':               ENGLISH_MAP_NAMES.Steppes,
  'Lodowiec':           ENGLISH_MAP_NAMES.Glacier,
  'Linia Mannerheima':  ENGLISH_MAP_NAMES.MannerheimLine,
  'Lotnisko':           ENGLISH_MAP_NAMES.Airfield,
  'El Halluf':          ENGLISH_MAP_NAMES.ElHalluf,
  'Miasto duchów':      ENGLISH_MAP_NAMES.GhostTown,
  'Miasto Duchów':      ENGLISH_MAP_NAMES.GhostTown,
  'Piaszczysta rzeka':  ENGLISH_MAP_NAMES.SandRiver,
  'Piaszczysta Rzeka':  ENGLISH_MAP_NAMES.SandRiver,
  'Zaplecze':           ENGLISH_MAP_NAMES.Hinterland,
  'Normandia':          ENGLISH_MAP_NAMES.Normandy,
  // Legacy — removed maps
  'Łuk Ognia':          ENGLISH_MAP_NAMES.FierySalient,
  'Charków':            ENGLISH_MAP_NAMES.Kharkov,
  'Posterunek':         ENGLISH_MAP_NAMES.Outpost,
  'Zatoka małży':       ENGLISH_MAP_NAMES.OysterBay,
  'Bezpieczna przystań': ENGLISH_MAP_NAMES.SafeHaven,
  'Święta Dolina':      ENGLISH_MAP_NAMES.SacredValley,
  'Bagno':              ENGLISH_MAP_NAMES.Swamp,
  'Wichura':            ENGLISH_MAP_NAMES.Windstorm,
};

/** Returns the English map name, or the original string if no translation found. */
export function normalizeMapName(mapName: string): string {
  return POLISH_TO_ENGLISH_MAP_NAMES[mapName] ?? mapName;
}
