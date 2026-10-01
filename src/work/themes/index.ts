import { atlas } from './atlas';
import { discordBot } from './discord-bot';
import { forge } from './forge';
import type { ThemeDef } from './types';

// Adding app #3–#8 = one Supabase row (theme: null → forge). A bespoke look = one file here + one entry below + ≤150 lines in themes.css.
export const themes: Record<string, ThemeDef<any>> = { atlas, 'discord-bot': discordBot, forge };

export const resolveTheme = (id: string | null): ThemeDef<any> => (id && Object.hasOwn(themes, id) ? themes[id] : themes.forge);
export type { ThemeDef, ThemeArtProps, Readout } from './types';
