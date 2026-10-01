import { useMemo, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { mergeRefs } from '../lib/refs';
import { IconArrowUpRight } from './icons';
import { useMagnetic } from './useMagnetic';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  /** md = 48 px tall, lg = 56 px. Both clear the 44 px minimum tap target. */
  size?: ButtonSize;
  /** Magnetic pull toward the pointer (fine pointers only). Reserved for the two hero CTAs. */
  magnetic?: boolean;
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
}

// Colour/shadow changes use the base duration on the out-ease; transform uses the spring. Both live in one `transition`
// declaration because Tailwind's transition-* utilities can't give each property its own curve.
const TRANSITION =
  '[transition:background-color_var(--dur-base)_var(--ease-out),color_var(--dur-base)_var(--ease-out),box-shadow_var(--dur-base)_var(--ease-out),transform_var(--dur-spring)_var(--ease-spring)]';
// --mx/--my come from useMagnetic, --press from :active. Motion-safe only, so reduced-motion users get no transform at all.
const TRANSFORM = 'motion-safe:[transform:translate3d(var(--mx,0px),var(--my,0px),0)_scale(var(--press,1))]';

const BASE = cx(
  'relative inline-flex shrink-0 select-none items-center justify-center rounded-pad no-underline',
  'cursor-pointer touch-manipulation font-semibold [font-stretch:105%] tracking-snug',
  'active:[--press:0.97] disabled:cursor-not-allowed disabled:opacity-60',
  TRANSITION,
  TRANSFORM,
);

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-amber-400 font-[650] text-iron-950 hover:bg-amber-300 hover:shadow-glow-amber',
  // Teal glow at reduced strength vs. shadow-glow-teal: the ghost button must not out-shout the primary.
  ghost:
    'bg-ink-100/[0.03] text-ink-100 shadow-hairline-strong hover:bg-ink-100/[0.07] hover:shadow-[0_0_0_1px_rgb(62_224_208/0.22),0_8px_40px_-12px_rgb(62_224_208/0.3)]',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
};

/** Class string shared by Button and ButtonLink; exported so other components can style an element as a button. */
export function buttonClasses({ variant = 'primary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}

// The label sits in its own span so it can drift at half the magnet's distance — a cheap parallax that makes the pull
// feel physical rather than a rigid box sliding.
function Label({ icon, iconPosition = 'start', external, children }: Pick<ButtonOwnProps, 'icon' | 'iconPosition'> & { external?: boolean; children?: ReactNode }) {
  const start = icon && iconPosition === 'start' ? icon : null;
  const end = icon && iconPosition === 'end' ? icon : null;
  return (
    <span className="relative inline-flex items-center gap-2 motion-safe:[transform:translate3d(calc(var(--mx,0px)_*_0.5),calc(var(--my,0px)_*_0.5),0)] motion-safe:[transition:transform_var(--dur-spring)_var(--ease-spring)]">
      {start}
      {children}
      {end}
      {external && !end && <IconArrowUpRight size={20} />}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </span>
  );
}

export type ButtonProps = ButtonOwnProps & ComponentPropsWithRef<'button'>;

export function Button({ variant, size, magnetic = false, icon, iconPosition, className, ref, type = 'button', children, ...rest }: ButtonProps) {
  const magnet = useMagnetic<HTMLButtonElement>(magnetic);
  const merged = useMemo(() => mergeRefs<HTMLButtonElement>(ref, magnet), [ref, magnet]);
  return (
    <button {...rest} ref={merged} type={type} className={buttonClasses({ variant, size, className })}>
      <Label icon={icon} iconPosition={iconPosition}>{children}</Label>
    </button>
  );
}

export type ButtonLinkProps = ButtonOwnProps & ComponentPropsWithRef<'a'> & {
  /** Opens in a new tab with rel="noopener noreferrer", an up-right arrow and a screen-reader hint. */
  external?: boolean;
};

export function ButtonLink({ variant, size, magnetic = false, icon, iconPosition, external = false, className, ref, children, ...rest }: ButtonLinkProps) {
  const magnet = useMagnetic<HTMLAnchorElement>(magnetic);
  const merged = useMemo(() => mergeRefs<HTMLAnchorElement>(ref, magnet), [ref, magnet]);
  const externalProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : null;
  return (
    <a {...rest} {...externalProps} ref={merged} className={buttonClasses({ variant, size, className })}>
      <Label icon={icon} iconPosition={iconPosition} external={external}>{children}</Label>
    </a>
  );
}
