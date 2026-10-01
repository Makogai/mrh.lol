// Contact form transport: one POST to the public.submit_contact RPC over plain fetch (no supabase-js — JS budget).
// Contract: BUILD_PLAN §6.7 / §10.2.
import { env, supabaseHeaders } from '../lib/env';
import type { ContactErrorCode, ContactField } from './validate';

export type { ContactField, ContactErrorCode };

export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; field: ContactField }
  | { ok: false; reason: 'rate_limited' | 'busy' | 'network' | 'server' | 'not_configured' };

export interface SubmitInput {
  name: string;
  replyTo: string;
  message: string;
  /** Honeypot value. Humans never see the field, so it is always '' for them. */
  website: string;
  /** Milliseconds between the form mounting and the submit; the server treats < 2 s as a bot. */
  elapsedMs: number;
}

const FIELD_FOR_CODE: Record<ContactErrorCode, ContactField> = {
  invalid_name: 'name',
  invalid_reply_to: 'replyTo',
  invalid_message: 'message',
};

/**
 * Dev-only QA hook: `#qa-form=ok|invalid_name|…|slow` short-circuits the network so every UI state can be screenshotted
 * without a backend. It sits entirely inside `import.meta.env.DEV`, so Rollup drops it (and its strings) from production.
 */
async function devOverride(): Promise<SubmitResult | null> {
  if (!import.meta.env.DEV) return null;
  const mode = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('qa-form');
  if (!mode) return null;
  await new Promise((r) => setTimeout(r, mode === 'slow' ? 4000 : 600));
  switch (mode) {
    case 'ok':
    case 'slow': return { ok: true };
    case 'invalid_name': return { ok: false, reason: 'invalid', field: 'name' };
    case 'invalid_reply_to': return { ok: false, reason: 'invalid', field: 'replyTo' };
    case 'invalid_message': return { ok: false, reason: 'invalid', field: 'message' };
    case 'rate_limited': return { ok: false, reason: 'rate_limited' };
    case 'busy': return { ok: false, reason: 'busy' };
    case 'server': return { ok: false, reason: 'server' };
    case 'network': return { ok: false, reason: 'network' };
    default: return null;
  }
}

export async function submitContact(input: SubmitInput): Promise<SubmitResult> {
  if (import.meta.env.DEV) {
    const forced = await devOverride();
    if (forced) return forced;
  }
  if (!env.supabaseUrl || !env.supabaseAnonKey) return { ok: false, reason: 'not_configured' };

  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/submit_contact`, {
      method: 'POST',
      headers: supabaseHeaders(env.supabaseAnonKey),
      body: JSON.stringify({
        p_name: input.name.trim(),
        p_reply_to: input.replyTo.trim(),
        p_message: input.message.trim(),
        p_website: input.website,
        p_elapsed_ms: Math.max(0, Math.round(input.elapsedMs)),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    // Offline, DNS, CORS, or the 12 s timeout: from the visitor's side these are all "couldn't reach the server".
    return { ok: false, reason: 'network' };
  }

  if (res.ok) return { ok: true };

  // PostgREST puts our RAISE message in `message`; an unparseable body just means a generic failure.
  let message = '';
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') message = body.message;
  } catch { /* not JSON */ }

  // hasOwn, not `in`: a hostile or odd message like "constructor" must not resolve through the prototype chain.
  if (res.status === 400 && Object.hasOwn(FIELD_FOR_CODE, message)) {
    return { ok: false, reason: 'invalid', field: FIELD_FOR_CODE[message as ContactErrorCode] };
  }
  if (res.status === 429) return { ok: false, reason: message === 'busy' ? 'busy' : 'rate_limited' };
  return { ok: false, reason: 'server' };
}
