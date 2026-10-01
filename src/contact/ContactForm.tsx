import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { IconAlert, IconCheck, IconSpinner } from '../components/icons';
import { site } from '../config/site';
import { isSupabaseConfigured } from '../lib/env';
import { fillTemplate } from '../lib/format';
import { cx } from '../lib/cx';
import { submitContact } from './submit';
import { LIMITS, validateContact, validateField, type ContactErrorCode, type ContactField } from './validate';

// Field-level copy (BUILD_PLAN §8.4). Keyed by the same codes the server raises, so a 400 reuses the client message.
const FIELD_COPY: Record<ContactErrorCode, string> = {
  invalid_name: `Tell me what to call you (up to ${LIMITS.nameMax} characters).`,
  invalid_reply_to: 'Enter an email address or a Discord username.',
  invalid_message: `Write at least ${LIMITS.messageMin} characters (up to ${LIMITS.messageMax}).`,
};
const CODE_FOR_FIELD: Record<ContactField, ContactErrorCode> = {
  name: 'invalid_name',
  replyTo: 'invalid_reply_to',
  message: 'invalid_message',
};
const FIELD_ORDER: ContactField[] = ['name', 'replyTo', 'message'];

type Failure = 'rate_limited' | 'busy' | 'network' | 'server' | 'not_configured';

function failureCopy(reason: Failure): string {
  const discord = site.contact.discord.handle;
  switch (reason) {
    case 'rate_limited': return "That's a few messages in a row — try again in a few minutes, or ping me on Discord.";
    case 'busy': return `The inbox is flooded right now — Discord works: ${discord}.`;
    case 'network': return "Couldn't reach the server. Check your connection and try again.";
    case 'server': return 'Something broke on my end. Try again, or reach me on Discord.';
    // Only reachable in dev (production hides the form when the backend isn't configured), so the developer-facing text
    // is behind DEV and stripped from the production bundle.
    case 'not_configured':
      return import.meta.env.DEV
        ? 'Form backend not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
        : 'Something broke on my end. Try again, or reach me on Discord.';
  }
}

// 48 px tall (h-12) inputs on iron-850; the hairline brightens on hover/focus and turns coral when invalid. The amber
// focus ring is the global :focus-visible rule — this only adds the surface change.
const CONTROL = cx(
  'block w-full rounded-pad bg-iron-850 px-4 text-base text-ink-100 shadow-hairline',
  'transition-shadow duration-(--dur-fast) ease-(--ease-out) placeholder:text-ink-400',
  'hover:shadow-hairline-strong focus:shadow-hairline-strong',
  'aria-[invalid=true]:shadow-[inset_0_0_0_1px_rgb(255_143_128/0.7)]',
);
const LABEL = 'mb-2 block text-sm font-semibold text-ink-100 [font-stretch:105%]';

function FieldError({ id, code }: { id: string; code: ContactErrorCode | undefined }) {
  if (!code) return null;
  return (
    <p id={id} className="flex min-w-0 items-start gap-2 text-sm text-coral-400">
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      <span>{FIELD_COPY[code]}</span>
    </p>
  );
}

function FormFields({ onSent, focusOnMount }: { onSent: (replyTo: string) => void; focusOnMount: boolean }) {
  const uid = useId();
  const id = { name: `${uid}-name`, replyTo: `${uid}-reply`, message: `${uid}-message`, hp: `${uid}-website` };
  const hint = `${uid}-reply-hint`;
  const counter = `${uid}-count`;
  const err = { name: `${uid}-name-err`, replyTo: `${uid}-reply-err`, message: `${uid}-message-err` };

  const [values, setValues] = useState({ name: '', replyTo: '', message: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<ContactField, ContactErrorCode>>>({});
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const refs = {
    name: useRef<HTMLInputElement>(null),
    replyTo: useRef<HTMLInputElement>(null),
    message: useRef<HTMLTextAreaElement>(null),
  };
  const busy = useRef(false); // synchronous guard: state updates are too late to stop a double-click
  // Time since the form appeared. Captured in an effect (never in render — SSR/hydration safety, plan rule 7). The
  // server treats a submit under 2 s as a bot, so it's measured from mount rather than from the first keystroke.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = performance.now();
    if (focusOnMount) refs.name.current?.focus();
  }, []);

  const revalidate = (field: ContactField, value: string) =>
    setErrors((prev) => {
      const next = { ...prev };
      const code = validateField(field, value);
      if (code) next[field] = code;
      else delete next[field];
      return next;
    });

  const onChange = (field: ContactField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (touched[field]) revalidate(field, value);
  };

  // Blurring an untouched, empty field says nothing — nagging someone who only tabbed through is hostile. Anything
  // typed, or a prior submit attempt, makes the field "touched" and validated from then on.
  const onBlur = (field: ContactField) => {
    if (!touched[field] && values[field].trim() === '') return;
    setTouched((t) => ({ ...t, [field]: true }));
    revalidate(field, values[field]);
  };

  const focusFirst = (bad: Partial<Record<ContactField, ContactErrorCode>>) => {
    const first = FIELD_ORDER.find((f) => bad[f]);
    if (first) refs[first].current?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return; // double submit while a request is in flight
    const checked = validateContact(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      setTouched({ name: true, replyTo: true, message: true });
      focusFirst(checked.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    busy.current = true;
    setSending(true);
    const result = await submitContact({ ...checked.value, website: values.website, elapsedMs: performance.now() - mountedAt.current });
    busy.current = false;
    setSending(false);
    if (result.ok) {
      onSent(checked.value.replyTo);
      return;
    }
    if (result.reason === 'invalid') {
      // The server disagreed with the client (rules drifted, or something the regex can't see): show its verdict inline.
      const bad = { [result.field]: CODE_FOR_FIELD[result.field] };
      setErrors(bad);
      setTouched((t) => ({ ...t, [result.field]: true }));
      focusFirst(bad);
      return;
    }
    setFailure(result.reason);
  };

  const messageLen = values.message.length;
  const describe = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={sending} className="relative mt-8 flex flex-col gap-6">
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <p className="rounded-pad bg-amber-400/10 p-4 font-mono text-xs text-amber-300 shadow-[inset_0_0_0_1px_rgb(255_194_71/0.3)]">
          {failureCopy('not_configured')}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={id.name} className={LABEL}>Name</label>
          <input
            ref={refs.name}
            id={id.name}
            name="name"
            type="text"
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
            onBlur={() => onBlur('name')}
            autoComplete="name"
            maxLength={LIMITS.nameMax}
            required
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describe(errors.name && err.name)}
            className={cx(CONTROL, 'h-12')}
          />
          <div className="mt-2 empty:hidden"><FieldError id={err.name} code={errors.name} /></div>
        </div>

        <div className="min-w-0">
          <label htmlFor={id.replyTo} className={LABEL}>Where can I reply?</label>
          <input
            ref={refs.replyTo}
            id={id.replyTo}
            name="reply_to"
            type="text"
            inputMode="email"
            value={values.replyTo}
            onChange={(e) => onChange('replyTo', e.target.value)}
            onBlur={() => onBlur('replyTo')}
            // `email` autocomplete is still the best offer for most visitors; the field accepts Discord names too.
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={LIMITS.replyMax}
            required
            aria-invalid={errors.replyTo ? true : undefined}
            aria-describedby={describe(hint, errors.replyTo && err.replyTo)}
            className={cx(CONTROL, 'h-12')}
          />
          <p id={hint} className="mt-2 text-sm text-ink-400">Email or Discord username</p>
          <div className="mt-2 empty:hidden"><FieldError id={err.replyTo} code={errors.replyTo} /></div>
        </div>
      </div>

      <div className="min-w-0">
        <label htmlFor={id.message} className={LABEL}>Message</label>
        <textarea
          ref={refs.message}
          id={id.message}
          name="message"
          rows={6}
          value={values.message}
          onChange={(e) => onChange('message', e.target.value)}
          onBlur={() => onBlur('message')}
          maxLength={LIMITS.messageMax}
          required
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describe(counter, errors.message && err.message)}
          className={cx(CONTROL, 'min-h-40 resize-y py-4 leading-6')}
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0"><FieldError id={err.message} code={errors.message} /></div>
          <span id={counter} className={cx('ml-auto shrink-0 font-mono text-xs', messageLen >= LIMITS.messageMax - 200 ? 'text-amber-300' : 'text-ink-400')}>
            {messageLen} / {LIMITS.messageMax}
          </span>
        </div>
      </div>

      {/* Honeypot: real people never see or reach it (off-screen, tabIndex -1, aria-hidden); form-filling bots tend to
          fill every input. Deliberately not display:none — some bots skip fields they can tell are hidden. */}
      <div aria-hidden="true" className="ct-hp">
        <label htmlFor={id.hp}>Website</label>
        <input
          id={id.hp}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
        />
      </div>

      {/* The alert container is always mounted so assistive tech registers the live region before the text arrives. */}
      <div role="alert">
        {failure && (
          <div className="flex items-start gap-4 rounded-pad bg-coral-400/10 p-4 shadow-[inset_0_0_0_1px_rgb(255_143_128/0.3)]">
            <IconAlert size={20} className="mt-0.5 shrink-0 text-coral-400" />
            <div className="min-w-0 text-sm text-ink-100">
              <p>{failureCopy(failure)}</p>
              {failure !== 'busy' && failure !== 'not_configured' && (
                <p className="mt-2 text-ink-300">
                  Discord: <span className="select-all font-mono text-ink-100">{site.contact.discord.handle}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-start gap-4">
        <Button
          type="submit"
          // Ghost: Discord "Copy handle" is the primary route (config.contact.primary), so it owns the one amber fill.
          variant="ghost"
          size="lg"
          // aria-disabled (not disabled) keeps focus on the button and lets the click through to our busy guard.
          aria-disabled={sending || undefined}
          className="aria-disabled:cursor-progress aria-disabled:opacity-80"
          icon={sending ? <IconSpinner /> : undefined}
        >
          {sending ? 'Sending…' : 'Send message'}
        </Button>
        <p className="font-mono text-xs text-ink-400">{site.contact.form.note}</p>
      </div>
    </form>
  );
}

function SentPanel({ replyTo, onReset }: { replyTo: string; onReset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Moving focus to the confirmation tells keyboard and screen-reader users the form is gone and what happened.
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="mt-8 flex flex-col items-start gap-6">
      <span className="grid size-12 place-items-center rounded-full bg-teal-400/10 text-teal-400 shadow-[inset_0_0_0_1px_rgb(62_224_208/0.35)]">
        <IconCheck size={24} />
      </span>
      <div className="min-w-0">
        <h3 ref={heading} tabIndex={-1} className="text-2xl font-[800] [font-stretch:112.5%] tracking-snug">Message sent</h3>
        <p className="mt-4 text-lg text-ink-300 [overflow-wrap:anywhere]">{fillTemplate(site.contact.form.success, { replyTo })}</p>
      </div>
      <Button variant="ghost" onClick={onReset}>Send another</Button>
    </div>
  );
}

export function ContactForm({ className }: { className?: string }) {
  // null = still composing; a string = sent (the address we promised to reply to).
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  return (
    <Reveal index={2} className={className}>
      <div className="ct-form-card rounded-card p-6 md:p-10">
        {sentTo === null ? (
          <>
            <h3 className="text-2xl font-[800] [font-stretch:112.5%] tracking-snug text-ink-100">{site.contact.form.title}</h3>
            {/* key = round remounts the fields on "Send another": empty values, a fresh elapsed-time clock, focus on Name. */}
            <FormFields key={round} focusOnMount={round > 0} onSent={setSentTo} />
          </>
        ) : (
          <SentPanel replyTo={sentTo} onReset={() => { setSentTo(null); setRound((r) => r + 1); }} />
        )}
      </div>
    </Reveal>
  );
}
