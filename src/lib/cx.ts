/** Joins class names, skipping falsy parts. Deliberately not a Tailwind-merge: conflicting utilities are a bug to fix at the call site. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = '';
  for (const p of parts) if (p) out += out ? ` ${p}` : p;
  return out;
}
