import type { GlyphKind } from './types';
import { useStatus } from './store';

const LINE = {
  online: 'Online now — fastest reply.',
  idle: "Away — I'll see it soon.",
  dnd: "Heads down — I'll reply later.",
  offline: 'Offline — leave a message below.',
} as const;

/**
 * The Comms card's status: keyed on the Discord status only. Unknown, loading, stale and failure all return null, so the card
 * shows the handle alone and never an invented "Online".
 */
export function useContactLine(): { text: string; glyph: GlyphKind } | null {
  const { state, snapshot } = useStatus();
  const d = state === 'live' || state === 'partial' ? snapshot?.discord : null;
  return d ? { text: LINE[d.status], glyph: d.status } : null;
}
