import type { ReactNode } from 'react';
import { Reveal } from '../components/Reveal';
import { IconArrowUpRight, IconGitHub, IconMail, IconRoblox, IconTwitch, IconX, IconYouTube } from '../components/icons';
import { site } from '../config/site';
import { cx } from '../lib/cx';

interface Tile { key: string; label: string; handle: string; href: string; icon: ReactNode; external: boolean }

/** Builds the tile list from config; every channel that is null (TODO(me)) simply doesn't render. */
function tiles(): Tile[] {
  const c = site.contact;
  const out: Tile[] = [];
  out.push({ key: 'github', label: c.github.label, handle: c.github.handle, href: c.github.href, icon: <IconGitHub size={24} />, external: true });
  if (c.email) out.push({ key: 'email', label: 'Email', handle: c.email, href: `mailto:${c.email}`, icon: <IconMail size={24} />, external: false });
  if (c.roblox) out.push({ key: 'roblox', label: c.roblox.label, handle: c.roblox.handle, href: c.roblox.href, icon: <IconRoblox size={24} />, external: true });
  if (c.twitter) out.push({ key: 'twitter', label: c.twitter.label, handle: c.twitter.handle, href: c.twitter.href, icon: <IconX size={24} />, external: true });
  if (c.youtube) out.push({ key: 'youtube', label: c.youtube.label, handle: c.youtube.handle, href: c.youtube.href, icon: <IconYouTube size={24} />, external: true });
  if (c.twitch) out.push({ key: 'twitch', label: c.twitch.label, handle: c.twitch.handle, href: c.twitch.href, icon: <IconTwitch size={24} />, external: true });
  return out;
}

export function ChannelList({ className, stretch = false }: { className?: string; stretch?: boolean }) {
  const list = tiles();
  return (
    <ul
      aria-label="Other ways to reach me"
      // auto-rows-fr + stretch lets the tiles fill the Discord card's height when the form is absent (xl, two columns).
      className={cx('grid gap-4 md:grid-cols-2 xl:grid-cols-1', stretch && 'xl:h-full xl:auto-rows-fr', className)}
    >
      {list.map((t, i) => (
        // Reveal wraps the tile (not the other way round): its own transition would override the tile's hover transitions.
        <Reveal as="li" key={t.key} index={i + 1} className="flex">
          <a
            href={t.href}
            {...(t.external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
            className="group flex min-h-16 w-full min-w-0 items-center gap-4 rounded-pad bg-iron-900 px-5 py-4 no-underline shadow-hairline transition-[box-shadow,background-color] duration-(--dur-fast) ease-(--ease-out) hover:bg-iron-850 hover:shadow-hairline-strong"
          >
            <span className="shrink-0 text-ink-300 transition-colors duration-(--dur-fast) ease-(--ease-out) group-hover:text-amber-400">{t.icon}</span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-ink-400">{t.label}</span>
              <span className="truncate font-mono text-sm text-ink-100">{t.handle}</span>
            </span>
            <IconArrowUpRight size={20} className="ml-auto shrink-0 text-ink-400 transition-colors duration-(--dur-fast) ease-(--ease-out) group-hover:text-amber-400" />
            {t.external && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        </Reveal>
      ))}
    </ul>
  );
}
