import { ButtonLink } from '../components/Button';
import { IconArrowRight } from '../components/icons';

// Prerendered with renderToStaticMarkup and shipped WITHOUT JS (BUILD_PLAN §6.5/§8.6): no hooks, no effects, no CSS import.
// This file is never in the client graph, so styling is utilities only — Tailwind still scans it and the classes land
// in the shared stylesheet that 404.html links.
//
// The joke is the identity of the site: a PCB trace that stops short of its pad. "This trace leads nowhere."

// Same three layers as the hero (§7.1) so the 404 feels like a dark corner of the same board, not a different site.
const BACKDROP =
  'bg-[radial-gradient(60%_50%_at_28%_80%,rgb(255_194_71/0.065),transparent_70%),radial-gradient(50%_40%_at_85%_8%,rgb(96_165_250/0.05),transparent_70%),linear-gradient(180deg,var(--color-iron-800)_0%,var(--color-iron-900)_55%,var(--color-iron-950)_100%)]';

/** A trace that runs in from the left, takes a 45° bend and stops one gap short of an open (unconnected) pad. */
function BrokenTrace() {
  return (
    <svg
      viewBox="0 0 480 96"
      width="480"
      height="96"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="mt-8 h-auto w-full max-w-[30rem] overflow-visible md:mt-12 xl:max-w-[40rem]"
    >
      {/* Soft bloom under the live copper — light, not a shadow. */}
      <path d="M0 72H144L184 32H296" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" className="stroke-amber-400/[0.07]" />
      <path d="M0 72H144L184 32H296" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-amber-400/70" />
      {/* The burnt end of the trace: a hot dot where the copper stops. */}
      <circle cx="296" cy="32" r="3" className="fill-amber-300" />
      {/* Two stray flecks bridging the gap — the signal that didn't make it. */}
      <circle cx="326" cy="32" r="1.25" className="fill-amber-400/40" />
      <circle cx="342" cy="32" r="1" className="fill-amber-400/20" />
      {/* The open pad: a ring with nothing connected to it. */}
      <circle cx="384" cy="32" r="9" strokeWidth="1.5" className="stroke-ink-300/55" />
      <circle cx="384" cy="32" r="2.5" className="fill-ink-300/55" />
      {/* Silkscreen ticks, purely decorative. */}
      <path d="M368 56v8M384 56v8M400 56v8" strokeWidth="1" strokeLinecap="round" className="stroke-ink-500/70" />
    </svg>
  );
}

export function NotFound() {
  return (
    <main className={`relative flex min-h-svh flex-col justify-center overflow-x-clip py-24 ${BACKDROP}`}>
      <div className="site-container">
        <p className="font-mono text-xs font-medium uppercase tracking-label text-ink-400">Error 404 · No route</p>

        {/* clamp(6rem, 30vw, 18rem): at 390 px the three figures span ~230 px of the 358 px content width; the cap
            keeps them from outgrowing a 2560 px screen. nowrap so a narrow phone never breaks "404" onto two lines.
            Tracking is looser than the hero name's -0.045em: at that setting the wide "0" swallows its neighbouring "4"s. */}
        <h1 className="mt-6 whitespace-nowrap text-[clamp(6rem,30vw,18rem)] font-[850] leading-[0.8] tracking-[-0.02em] text-ink-100 [font-stretch:125%]">
          404<span className="sr-only"> — page not found</span>
        </h1>

        <BrokenTrace />

        <p className="mt-8 max-w-[32ch] text-xl text-ink-300 md:mt-12">This trace leads nowhere.</p>

        <div className="mt-10 md:mt-12">
          <ButtonLink href="/" size="lg" icon={<IconArrowRight />} iconPosition="end">
            Back to mrh.lol
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
