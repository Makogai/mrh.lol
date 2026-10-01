// Client-side mirror of the rules in supabase/migrations/0001_init.sql (public.submit_contact) and BUILD_PLAN §6.7.
// If you change a rule here, change it there too: the server is the authority, this only saves a round trip.
export type ContactField = 'name' | 'replyTo' | 'message';
export type ContactErrorCode = 'invalid_name' | 'invalid_reply_to' | 'invalid_message';

export interface ContactInput { name: string; replyTo: string; message: string }

export const LIMITS = {
  nameMax: 80,
  replyMin: 2,
  replyMax: 254,
  messageMin: 10,
  messageMax: 4000,
} as const;

export type ValidationResult =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: Partial<Record<ContactField, ContactErrorCode>> };

// Postgres `[[:cntrl:]]` is the C0 controls + DEL; same set here. (Tabs/newlines are also rejected in a *name*.)
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DISCORD = /^@?[a-z0-9_.]{2,32}$/i;

// Length is measured in code points to match Postgres char_length() (an emoji counts once, not as two UTF-16 units).
const len = (s: string) => [...s].length;

export function validateField(field: ContactField, raw: string): ContactErrorCode | null {
  const v = raw.trim();
  switch (field) {
    case 'name':
      return len(v) < 1 || len(v) > LIMITS.nameMax || CONTROL.test(v) ? 'invalid_name' : null;
    case 'replyTo': {
      const okLen = len(v) >= LIMITS.replyMin && len(v) <= LIMITS.replyMax;
      const okShape = EMAIL.test(v) || (DISCORD.test(v) && !v.includes('..'));
      return okLen && okShape ? null : 'invalid_reply_to';
    }
    case 'message':
      return len(v) < LIMITS.messageMin || len(v) > LIMITS.messageMax ? 'invalid_message' : null;
  }
}

export function validateContact(input: ContactInput): ValidationResult {
  const errors: Partial<Record<ContactField, ContactErrorCode>> = {};
  for (const field of ['name', 'replyTo', 'message'] as const) {
    const code = validateField(field, input[field]);
    if (code) errors[field] = code;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: input.name.trim(), replyTo: input.replyTo.trim(), message: input.message.trim() } };
}
