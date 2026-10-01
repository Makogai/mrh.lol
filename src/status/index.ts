// Public surface of src/status (live status, V2_DESIGN §6). Nothing outside this folder imports anything else from it.
//   hooks:      useStatus, useStatusLine, useLiveGame, useLiveSession (game + name + start time for the IN MATCH timer),
//               useElapsed (HH:MM:SS, 1 Hz while visible)
//   components: StatusChip (system bar), PlayerChip (hero SIGNED IN AS), PartyPanel (lobby), StatusGlyph
//   contact:    useContactLine (the Comms card's one-line promise, or null)
//   fixtures:   ./fixtures (qa only, not re-exported: it must stay out of the bundle)
import './status.css';
export type { GlyphKind, StatusSnapshot, StatusState, StatusView } from './types';
export { glyphOf, useLiveGame, useLiveSession, useStatus, useStatusLine } from './store';
export { useContactLine } from './contact';
export { formatElapsed, useElapsed } from './useElapsed';
export { PartyPanel } from './PartyPanel';
export { PlayerChip } from './PlayerChip';
export { StatusChip } from './StatusChip';
export { StatusGlyph } from './StatusGlyph';
