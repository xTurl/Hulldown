export interface TutorialLink {
  label: string;
  url: string;
}

export interface Tutorial {
  id: string;
  title: string;
  subtitle: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  // Which weak stats trigger a recommendation for this tutorial
  triggers: {
    lowSurvival?: boolean;    // survival < 35%
    lowWinRate?: boolean;     // win rate < 50%
    lowDamage?: boolean;      // avg damage below tier average proxy (wn8 < 900)
    lowSpots?: boolean;       // avg spots < 0.5
    lowWnxVsWn8?: boolean;    // wnx significantly lower than wn8
  };
  sections: {
    heading: string;
    body: string;
  }[];
  links: TutorialLink[];
}

export const tutorials: Tutorial[] = [
  {
    id: 'ammo-types',
    title: 'Ammo Types: AP, APCR, HEAT & HE',
    subtitle: 'Understanding when and why to use each shell type',
    difficulty: 'beginner',
    tags: ['mechanics', 'damage', 'penetration'],
    triggers: { lowDamage: true },
    sections: [
      {
        heading: 'AP — Armor Piercing (standard)',
        body: 'The default round for most tanks. Loses penetration over distance. Normalizes on impact (+5°), which helps against angled armor. Use it as your go-to shell — it\'s cheap and reliable.',
      },
      {
        heading: 'APCR — Armor Piercing Composite Rigid (premium)',
        body: 'Faster velocity and more pen than AP, but loses pen over distance faster and has worse normalization (+2°). Best used at close-to-mid range against heavily armored flat surfaces. Not always better than AP at long range.',
      },
      {
        heading: 'HEAT — High Explosive Anti-Tank (premium)',
        body: 'Does NOT lose pen over distance — it\'s always full pen at any range. However, it does NOT normalize (0°), meaning it bounces easier off angled armor. Critically: spaced armor, tracks, and objects in flight path absorb HEAT completely. Aim for flat surfaces, avoid shooting through tracks.',
      },
      {
        heading: 'HE — High Explosive',
        body: 'Low penetration but deals splash damage even on non-penetration. Always deals at least some damage if it hits (armored tanks take ~10-20% of alpha). Very effective against open-topped SPGs, light tank tracks, and under-armored tanks. On heavily armored targets, switch to AP/HEAT.',
      },
      {
        heading: 'HESH — High Explosive Squash Head',
        body: 'Used by some British guns. Behaves like HE with higher pen. Does not normalize. When it penetrates, it creates a large spall pattern for high damage. Loses effectiveness against spaced or composite armor.',
      },
    ],
    links: [
      { label: 'WG Wiki — Shell types', url: 'https://wiki.wargaming.net/en/Battle_Mechanics#Shell_types' },
    ],
  },

  {
    id: 'overmatch',
    title: '3 Caliber Rule (Overmatch)',
    subtitle: 'Why large guns punch through thin armor without rolling for pen',
    difficulty: 'intermediate',
    tags: ['mechanics', 'armor', 'penetration'],
    triggers: { lowDamage: true, lowSurvival: true },
    sections: [
      {
        heading: 'The rule',
        body: 'If a shell\'s caliber is MORE than 3× the thickness of the armor it hits, it overmatches — meaning it automatically penetrates regardless of angle. Normal ricochets (>70° autobounce) do NOT apply.',
      },
      {
        heading: 'Practical example',
        body: 'A 122mm gun overmatches any armor 40mm or thinner (122 / 3 = 40.6). This means that even if you angle a 40mm roof at 80°, a 122mm shell goes straight through. This is why hull-down matters: you expose only your turret, not your thin roof plate.',
      },
      {
        heading: 'What this means for you',
        body: 'Thin roof/engine deck armor on many tanks (20-40mm) is overmatched by most high-tier guns. Avoid presenting your top hull to enemies shooting down at you. Conversely, use this knowledge offensively: aim for roof plates, commander\'s hatches, and engine decks on tanks you\'re shooting down onto.',
      },
      {
        heading: '2 Caliber rule (normalization bonus)',
        body: 'When caliber is between 2-3× armor thickness, normalization doubles to +10° instead of +5°. A 100mm gun against 40mm armor benefits from this, making it easier to pen even at angles.',
      },
    ],
    links: [
      { label: 'WG Wiki — Armor Mechanics', url: 'https://wiki.wargaming.net/en/Battle_Mechanics#Overmatch' },
    ],
  },

  {
    id: 'spotting',
    title: 'Spotting Mechanics',
    subtitle: 'How vision, concealment and render distance work',
    difficulty: 'intermediate',
    tags: ['mechanics', 'scouting', 'vision'],
    triggers: { lowSpots: true, lowWnxVsWn8: true },
    sections: [
      {
        heading: 'View range vs render distance',
        body: 'Your view range determines how far you can spot enemies. The absolute maximum render distance is 564m — no tank can be spotted beyond this. Your effective spotting range is: min(your view range × terrain factor, 564m).',
      },
      {
        heading: 'Concealment (camo)',
        body: 'Every tank has a camo rating (higher = harder to spot). Moving reduces camo significantly, firing reduces it to near zero for ~several seconds. Bushes add concealment if you\'re stationary and 15m+ behind them. The formula: effective_spotting_range = your_view_range × (1 − their_camo_rating).',
      },
      {
        heading: 'Proxy spotting',
        body: 'Any tank within 50m is automatically spotted regardless of camo, bushes, or line of sight. This is "proxy spot" — useful to know when pushing a bush line.',
      },
      {
        heading: 'Shared vision',
        body: 'When ANY teammate spots a tank, all players can see and shoot it — even without direct line of sight. This is why passive scouting (sitting in a bush, not shooting) is valuable: you light up tanks for your whole team without losing your own camo.',
      },
      {
        heading: 'Key tips',
        body: '1) Don\'t fire from a bush unless you\'re sure you can reset camo before spotted. 2) Stay 15m from your bush. 3) Light tanks should often prioritize passive scouting early game. 4) Binoculars add 25% view range but only while stationary for 3s.',
      },
    ],
    links: [
      { label: 'WG Wiki — Spotting', url: 'https://wiki.wargaming.net/en/Battle_Mechanics#Spotting' },
    ],
  },

  {
    id: 'hull-down',
    title: 'Hull-Down Positioning',
    subtitle: 'Expose only your strongest armor — your turret',
    difficulty: 'beginner',
    tags: ['positioning', 'survival', 'armor'],
    triggers: { lowSurvival: true, lowWinRate: true },
    sections: [
      {
        heading: 'What is hull-down?',
        body: 'Hull-down means positioning your tank so only the turret is visible above a ridge, hill, or terrain feature. The hull — usually your weakest armor zone — is hidden from enemy fire.',
      },
      {
        heading: 'Why it works',
        body: 'Most tanks have far stronger turret armor than hull armor, and a smaller silhouette. Enemies can only shoot at your turret ring and mantlet, which are often impossible to penetrate. Meanwhile, you have a full field of fire.',
      },
      {
        heading: 'Finding hull-down positions',
        body: 'Look for ridges you can back up to, hills you can crest just enough to aim, or objects at the right height. Drive slowly forward until your gun just clears the obstacle. Move back to reload or when targeted.',
      },
      {
        heading: 'Turret weak spots still exist',
        body: 'Commander\'s hatches, copulas, and thin turret roofs (overmatch targets) are still vulnerabilities. Wiggle slightly to make these harder to hit. Know your own turret\'s weak spots.',
      },
      {
        heading: 'Not every tank suits hull-down',
        body: 'Low gun depression (how far your gun points down) limits your ability to go hull-down. Russian tanks typically have −5° or less. American and British tanks often have −10° or more — use this advantage.',
      },
    ],
    links: [],
  },

  {
    id: 'sidescraping',
    title: 'Sidescraping & Armor Angling',
    subtitle: 'Make your armor work by increasing effective thickness',
    difficulty: 'intermediate',
    tags: ['positioning', 'survival', 'armor'],
    triggers: { lowSurvival: true },
    sections: [
      {
        heading: 'Basic angling',
        body: 'Turning your hull at ~30-40° to the enemy increases the effective thickness of your armor. A 100mm plate angled at 30° has an effective thickness of ~115mm. This also increases the chance of a ricochet (auto-ricochet at >70° angle).',
      },
      {
        heading: 'Sidescraping',
        body: 'Park behind a corner, angling your hull so your side is nearly parallel to the wall. Only the rear corner of your tank peeks out. You can fire and then pull back. Enemy shells hit your angled side armor (now very thick) or the building — not your flat weak front lower plate.',
      },
      {
        heading: 'Avoiding the "pike nose" trap',
        body: 'Some tanks (IS-7, IS-3) have a pike nose design. If you angle them too much, the pike nose becomes flat to the enemy and easy to penetrate. These tanks should be driven straight-on or with very slight angle only.',
      },
      {
        heading: 'Lower front plate (LFP)',
        body: 'The lower front plate is almost always weaker than the upper. When not sidescraping, aim to hide your LFP behind terrain, rubble, or go hull-down. This single habit dramatically reduces your damage taken.',
      },
    ],
    links: [],
  },

  {
    id: 'matchmaking',
    title: 'Playing Bottom Tier (Matchmaking)',
    subtitle: 'How to contribute when you\'re the smallest tank on the field',
    difficulty: 'intermediate',
    tags: ['strategy', 'matchmaking', 'mindset'],
    triggers: { lowWinRate: true },
    sections: [
      {
        heading: 'How MM works',
        body: 'WoT uses a 3-tier spread: you can be top tier (your tier), mid tier (tier+1), or bottom tier (tier+2). As bottom tier you face tanks with significantly more HP, armor, and pen than you.',
      },
      {
        heading: 'The mindset shift',
        body: 'Bottom tier doesn\'t mean useless. Your job changes: instead of being a damage dealer, you become a support player. Spot, track, clean up damaged tanks, and play flanks where your mobility shines.',
      },
      {
        heading: 'Where to aim',
        body: 'Your standard ammo may not pen front armor of tier+2 heavies. Aim for weak spots: lower front plates, sides, rear, view ports. Use premium ammo on the toughest targets. HE on heavily armored tanks still does some damage.',
      },
      {
        heading: 'Positioning',
        body: 'Don\'t fight in positions that demand you tank hits. Use cover more aggressively. Flank routes work well since higher-tier tanks are often slower. If you\'re a light or medium, your speed is your armor.',
      },
      {
        heading: 'Platoon tip',
        body: 'Platooning with same-tier friends helps — you share the MM weight. Never platoon a tier 8 with a tier 6: the tier 6 will almost always end up in tier 8 games.',
      },
    ],
    links: [
      { label: 'iyouxin — Bottom Tier Guide (YouTube)', url: 'https://www.youtube.com/@iyouxin' },
    ],
  },

  {
    id: 'map-awareness',
    title: 'Map Awareness & Positioning',
    subtitle: 'Being in the right place at the right time',
    difficulty: 'intermediate',
    tags: ['strategy', 'positioning', 'map'],
    triggers: { lowWinRate: true, lowSurvival: true },
    sections: [
      {
        heading: 'Read the minimap constantly',
        body: 'Glance at the minimap every 5-10 seconds. Track where your team is clustering and where there are gaps. A flank with no friendly presence will collapse — either go there or warn teammates.',
      },
      {
        heading: 'Early game: take your position fast',
        body: 'The first 60 seconds determine map control. Fast tanks should rush key spots (hill, corner, bush lines). Slow heavies commit to a corridor early. Hesitation means enemies take the better position first.',
      },
      {
        heading: 'Don\'t follow the crowd',
        body: 'If 8 of your teammates all go one direction, the other flank is undefended. One or two tanks on a weak flank can delay an entire push. An empty flank collapsed = game over.',
      },
      {
        heading: 'Crossfire beats frontal fights',
        body: 'A tank fighting two enemies from different angles is almost always going to die. Position to create crossfires on enemies. If two of you can shoot an enemy from 90° apart, neither of you takes return fire.',
      },
      {
        heading: 'When to push and when to hold',
        body: 'Hold when outnumbered — let enemies come to you. Push when you have HP advantage or numbers. Dead tanks deal zero damage: surviving to deal one more shot is almost always better than a "heroic" last stand.',
      },
    ],
    links: [],
  },

  {
    id: 'damage-trading',
    title: 'Damage Trading & HP Management',
    subtitle: 'How to deal more damage than you take',
    difficulty: 'intermediate',
    tags: ['strategy', 'damage', 'hp'],
    triggers: { lowDamage: true, lowWinRate: true },
    sections: [
      {
        heading: 'What is a trade?',
        body: 'Every time you fire and an enemy fires back, you\'re "trading" HP. A good trade means you deal more damage than you take — ideally because you have more armor, faster reload, or better position.',
      },
      {
        heading: 'Peek-a-boo (shoot and hide)',
        body: 'Drive out, fire, drive back into cover before the enemy reloads. Your reload and theirs determines the rhythm. If your reload is 8s and theirs is 12s, you can fire twice before they fire once — massive advantage.',
      },
      {
        heading: 'Never sit still after firing',
        body: 'The moment you fire, your position is known. Move laterally or retreat to cover. A tank that moves unpredictably after shooting is much harder to hit than one that stays put to reload in the open.',
      },
      {
        heading: 'HP is a resource — spend it wisely',
        body: 'Having 600HP at the end of a game means nothing if you didn\'t win. But taking 600 damage to reset a cap or deal 1200 damage is a good trade. Think about what your HP buys the team, not just how to preserve it.',
      },
      {
        heading: 'Catch tanks reloading',
        body: 'If you see an enemy fire, that\'s your window. Push in, take your shot, and retreat before they reload. Autoloaders are the exception — assume a full clip after you hear their last shot.',
      },
    ],
    links: [],
  },
];
