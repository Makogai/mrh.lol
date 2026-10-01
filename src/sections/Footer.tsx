import { IconArrowUp } from '../components/icons';
import { TextLink } from '../components/TextLink';
import { site } from '../config/site';
import { buildData } from '../data';

// The year comes from build data, not `new Date()`: the prerendered HTML and the hydrated client must agree (trap #6).
export function Footer() {
  return (
    <footer>
      <div className="site-container">
        <div className="flex flex-col gap-6 border-t border-ink-100/8 py-12 md:flex-row md:items-center md:justify-between">
          <p className="flex items-baseline gap-4">
            <span className="font-semibold text-ink-100">{site.displayName}</span>
            <span className="font-mono text-xs text-ink-400">© {buildData.buildYear}</span>
          </p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {site.sourceUrl && (
              <TextLink href={site.sourceUrl} external className="inline-flex min-h-12 items-center">
                Source
              </TextLink>
            )}
            <TextLink href="#top" className="inline-flex min-h-12 items-center gap-2">
              Back to top
              <IconArrowUp size={16} />
            </TextLink>
          </nav>
        </div>
      </div>
    </footer>
  );
}
