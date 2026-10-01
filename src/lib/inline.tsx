import type { ReactNode } from 'react';

/**
 * Renders `**emphasis**` in config copy as amber <strong>. It is the only markup config copy may use, which keeps
 * site.ts free of JSX (it must stay importable by plain Node) without needing a markdown parser.
 */
export function renderEmphasis(text: string, className?: string): ReactNode[] {
  const cls = className ?? 'font-[inherit] text-amber-400';
  // With one capture group, split() puts the captured (emphasised) text at every odd index.
  return text.split(/\*\*(.+?)\*\*/g).flatMap<ReactNode>((part, i) => {
    if (part === '') return [];
    return i % 2 === 1 ? [<strong key={`em-${i}`} className={cls}>{part}</strong>] : [part];
  });
}
