import type { LiveGameKey } from '../config/site';
import type { RGB } from './veins/palette';

/**
 * Ambient-pulse colour while he is in a game (V2_DESIGN §2 "Wow"). Same hexes as the game accents in frame.css:
 * CS2 tan #d9b26a, War Thunder phosphor #b7e07a, Roblox coral #ff8f80. Editing in a code editor keeps the default teal.
 */
export const GAME_TINT: Record<LiveGameKey, RGB | null> = {
  cs2: [217, 178, 106],
  warThunder: [183, 224, 122],
  roblox: [255, 143, 128],
  code: null,
};
