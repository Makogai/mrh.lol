import { useRef, useState } from 'react';
import { ButtonLink } from '../components/Button';
import { IconDiscord } from '../components/icons';
import { site } from '../config/site';
import { cx } from '../lib/cx';
import { CopyButton, type CopyStatus } from './CopyButton';

/** Decorative corner trace: two copper lines ending in pads. A copy sends an amber pulse down the top one (contact.css). */
function Trace() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 240 80"
      className="pointer-events-none absolute right-0 top-0 h-20 w-[min(62%,15rem)]"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className="ct-trace-base" d="M240 24H176L152 48H88" />
      <path className="ct-trace-base" d="M240 52H208L196 64H140" />
      <path className="ct-trace-pulse" pathLength={1} d="M240 24H176L152 48H88" />
      <circle className="ct-trace-pad" cx="82" cy="48" r="5" />
      <circle className="ct-trace-pad" cx="134" cy="64" r="4" />
    </svg>
  );
}

export function DiscordCard({ className }: { className?: string }) {
  const { handle, altHandle, serverInvite } = site.contact.discord;
  const handleRef = useRef<HTMLParagraphElement>(null);
  const [copy, setCopy] = useState<CopyStatus>('idle');

  return (
    <div data-copy={copy} className={cx('ct-discord relative overflow-hidden rounded-card p-6 md:p-10', className)}>
      <Trace />
      <div className="relative flex items-center gap-4">
        <IconDiscord size={24} className="text-ink-100" />
        {/* The section's other h3 is the form title; this one is a quiet mono label so the handle is the loudest thing. */}
        <h3 className="font-mono text-xs font-medium uppercase tracking-label text-ink-300">Discord</h3>
      </div>

      <p
        ref={handleRef}
        // select-all: one tap/click selects the whole handle, so manual copy works on every device.
        className="relative mt-8 select-all font-mono text-[clamp(1.75rem,1.2rem+2.6vw,3rem)] font-medium leading-[1.1] tracking-snug text-ink-100 [overflow-wrap:anywhere]"
      >
        {handle}
      </p>
      {altHandle && (
        <p className="relative mt-4 font-mono text-sm text-ink-400">
          also <span className="select-all text-ink-300">{altHandle}</span>
        </p>
      )}

      <div className="relative mt-8 flex flex-wrap items-center gap-4">
        <CopyButton
          text={handle}
          targetRef={handleRef}
          copiedAnnouncement={`Discord handle ${handle} copied`}
          onStatusChange={setCopy}
        />
        {serverInvite && (
          <ButtonLink href={serverInvite} variant="ghost" size="lg" external>Join the server</ButtonLink>
        )}
      </div>
    </div>
  );
}
