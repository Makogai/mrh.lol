import type { ReactElement } from 'react';
import type { Project } from '../../data/types';

/** What every theme's Art receives. `active` mirrors the card's [data-active] (CSS does the animating; props are for markup choices). */
export interface ThemeArtProps<C = unknown> { project: Project; config: C; active: boolean; reduced: boolean }

export interface ThemeDef<C = unknown> {
  id: string;
  label: string;
  /** The five variables every themed surface reads. `forge` ignores accent/accentInk/glow: its accent comes from project.accent. */
  vars: { accent: string; accentInk: string; surface0: string; surface1: string; glow: string };
  motif: 'strata' | 'chat' | 'trace' | 'grid' | 'scanline' | 'ladder'; // rule of one texture
  /** SSR-safe: CSS + inline SVG only, no canvas, no browser globals. */
  Art: (p: ThemeArtProps<C>) => ReactElement;
  /** invalid → null → Art renders its empty state. */
  parseConfig?: (raw: unknown) => C | null;
  readout: 'ore' | 'discord' | 'plain';
  /** Additive to the spec: overrides the primary CTA (label + href). Return null for the default "Open" → project.url. */
  cta?: (project: Project, config: C | null) => { label: string; href: string } | null;
}

export interface Readout { value: string; label: string }
