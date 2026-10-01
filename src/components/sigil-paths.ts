// Path data for the four pillar sigils + platform tags, shared by components/Sigil.tsx and scripts/gen-assets.mjs (the OG image
// draws the same marks). Plain data, no imports at runtime, so Node can load it directly. 24-grid, drawn as 1.5px strokes.
export const PILLAR_PATHS = {
  // a caret inside square brackets
  programming: 'M9 4H5v16h4M15 4h4v16h-4M10 9.5l2.5 2.5-2.5 2.5',
  // a crosshair with a gap in the centre: ring + four ticks that stop short of the middle
  games: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM12 2v6M12 16v6M2 12h6M16 12h6',
  // three speed lines running into a four-point spark
  anime: 'M2 8h7M2 12h6M2 16h7M17 6q.8 5.2 6 6-5.2.8-6 6-.8-5.2-6-6 5.2-.8 6-6Z',
  // a weight plate (ring + hub) with the bar running through it
  training: 'M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 12h3.5M18.5 12H22',
} as const;

// Platform tags on build cards. Same grid and stroke so they sit next to the pillar sigils without a style change.
export const PLATFORM_PATHS = {
  roblox: 'M7.5 3.5 20 7l-3.5 12.5L4 16ZM11 10.5l3 .8-.8 3-3-.8Z', // a tilted block with a stud hole
  discord: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3ZM10.5 15l3-6', // a message box with a slash
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18', // globe
  cli: 'M5 7l5 5-5 5M12 17h7', // prompt
} as const;
