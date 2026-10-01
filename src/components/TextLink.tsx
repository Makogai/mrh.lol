import type { ComponentPropsWithRef } from 'react';
import { cx } from '../lib/cx';
import { IconArrowUpRight } from './icons';

export type TextLinkProps = ComponentPropsWithRef<'a'> & {
  /** Opens in a new tab with rel="noopener noreferrer", an up-right arrow and a screen-reader hint. */
  external?: boolean;
};

/** Inline link. The underline is the affordance (colour alone is not enough), so it stays on at rest. */
export function TextLink({ external = false, className, children, ...rest }: TextLinkProps) {
  const externalProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : null;
  return (
    <a
      {...rest}
      {...externalProps}
      className={cx(
        'text-ink-100 underline decoration-ink-100/30 underline-offset-4',
        'transition-colors duration-(--dur-fast) ease-(--ease-out)',
        'hover:text-amber-300 hover:decoration-amber-400',
        className,
      )}
    >
      {children}
      {external && (
        <>
          <IconArrowUpRight size={16} className="ml-2 inline-block align-[-0.15em]" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </a>
  );
}
