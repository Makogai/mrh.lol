import './shell.css';
import { IconArrowUp } from '../components/icons';
import { Sigil } from '../components/Sigil';
import { TextLink } from '../components/TextLink';
import { site, type PillarId } from '../config/site';
import { buildData } from '../data';

const SIGILS: PillarId[] = ['programming', 'games', 'anime', 'training'];

// Year and stamp come from build data, not `new Date()`: the prerendered HTML and the hydrated client must agree (trap #6).
export function Footer() {
  return (
    <footer>
      <div className="site-container">
        <div className="flex flex-col gap-6 border-t border-ink-100/8 py-12 md:flex-row md:items-center md:justify-between">
          <a href="#top" className="ft-back">
            {site.footer.back}
            <IconArrowUp size={20} />
          </a>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="flex items-baseline gap-4">
              <span className="font-semibold text-ink-100">{site.displayName}</span>
              <span className="font-mono text-xs text-ink-400">© {buildData.buildYear}</span>
            </p>
            {site.sourceUrl && (
              <TextLink href={site.sourceUrl} external className="inline-flex min-h-12 items-center">
                Source
              </TextLink>
            )}
            <span className="font-mono text-[10px] text-ink-400">v2 · build {buildData.buildStamp}</span>
            {/* The four pillar sigils as a sign-off: decorative, the same marks as the Loadout. */}
            <span aria-hidden="true" className="flex items-center gap-3 text-ink-400">
              {SIGILS.map((id) => (
                <Sigil key={id} name={id} size={16} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
