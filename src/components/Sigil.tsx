import type { SVGProps } from 'react';
import type { PillarId } from '../config/site';
import type { Platform } from '../data/types';
import { cx } from '../lib/cx';
import { PILLAR_PATHS, PLATFORM_PATHS } from './sigil-paths';

// The four pillar sigils are the only identity marks on the site (V2_DESIGN §1): 24-grid, 1.5 px stroke, currentColor, ~300 B
// each (path data in sigil-paths.ts, shared with the OG image). They sit in the system bar, the Loadout slots, platform tags
// and the footer sign-off. Decorative by default: pair them with a visible or sr-only label.
interface SigilProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> { size?: number }

function Mark({ d, size = 24, className, ...rest }: SigilProps & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className={cx('sigil', className)} {...rest}>
      <path d={d} />
    </svg>
  );
}

export function Sigil({ name, ...props }: SigilProps & { name: PillarId }) {
  return <Mark d={PILLAR_PATHS[name]} {...props} />;
}

export function PlatformSigil({ name, ...props }: SigilProps & { name: Platform }) {
  return <Mark d={PLATFORM_PATHS[name]} {...props} />;
}
