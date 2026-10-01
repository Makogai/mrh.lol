import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '../components/Button';
import { IconCheck, IconCopy } from '../components/icons';

export type CopyStatus = 'idle' | 'copied' | 'manual';

interface CopyButtonProps {
  /** The exact string that lands on the clipboard. */
  text: string;
  /** The on-page element showing `text`; it is selected for the legacy and manual fallbacks. */
  targetRef: RefObject<HTMLElement | null>;
  /** Spoken (polite live region) once the copy succeeds. */
  copiedAnnouncement: string;
  onStatusChange?: (status: CopyStatus) => void;
}

const COPIED_MS = 2400; // long enough to notice, short enough that the button is useful again immediately
const MANUAL_MS = 8000;

function selectContents(el: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * "Copy handle" with a three-step fallback ladder, because a Discord handle has no profile URL to link to and
 * copying it is the primary action of the whole section:
 *   1. navigator.clipboard.writeText (needs a secure context),
 *   2. select the handle and document.execCommand('copy') (older browsers, http previews, blocked permissions),
 *   3. leave the handle selected and tell the visitor to press Ctrl+C / ⌘C.
 */
export function CopyButton({ text, targetRef, copiedAnnouncement, onStatusChange }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const update = useCallback((next: CopyStatus, resetAfter: number) => {
    setStatus(next);
    onStatusChange?.(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus('idle');
      setAnnouncement('');
      onStatusChange?.('idle');
    }, resetAfter);
  }, [onStatusChange]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const el = targetRef.current;
    let ok = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch { /* permission denied or insecure context → next rung */ }
    }
    if (!ok && el) {
      selectContents(el);
      try { ok = document.execCommand('copy'); } catch { /* removed or blocked → manual rung */ }
    }
    if (ok) {
      setAnnouncement(copiedAnnouncement);
      update('copied', COPIED_MS);
      return;
    }
    if (el) selectContents(el); // handle stays highlighted so Ctrl+C / ⌘C just works
    setAnnouncement('Press Control C or Command C to copy.');
    update('manual', MANUAL_MS);
  };

  const copied = status === 'copied';
  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        onClick={copy}
        // Fixed minimum so "Copy handle" and "Copied" don't make the button (and the row beside it) jump.
        className="min-w-48"
        icon={copied ? <IconCheck className="text-amber-400" /> : <IconCopy />}
      >
        {copied ? 'Copied' : 'Copy handle'}
      </Button>
      {status === 'manual' && (
        <span aria-hidden="true" className="font-mono text-xs uppercase tracking-label text-amber-300">Press Ctrl+C / ⌘C</span>
      )}
      {/* Always mounted (even when empty) so screen readers register the region before its text changes. */}
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
