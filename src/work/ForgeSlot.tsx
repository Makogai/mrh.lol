import { Sigil } from '../components/Sigil';
import { TextLink } from '../components/TextLink';
import { site } from '../config/site';
import { cx } from '../lib/cx';

/** IN THE FORGE: dashed ticks, a sigil, the owner's copy (config: work.forgeSlot) and a GitHub link. Static, never animates. */
export function ForgeSlot({ slim }: { slim?: boolean }) {
  const s = site.work.forgeSlot;
  return (
    <section aria-labelledby="forge-slot-title" className={cx('item slot slot-card forge-slot', slim && 'is-slim')} data-static>
      <span className="forge-slot-sigil" aria-hidden="true"><Sigil name="programming" size={32} /></span>
      <div className="forge-slot-copy">
        <h3 id="forge-slot-title" className="item-title ui-label">{s.title}</h3>
        <p className="item-tag">{s.body}</p>
      </div>
      <TextLink href={s.href} external className="forge-slot-link">{s.linkLabel}</TextLink>
    </section>
  );
}
