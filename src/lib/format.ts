// Locale-independent formatting. Intl / toLocale*String depend on the machine that builds the page, so the prerendered
// HTML (built in Docker, en-US) and the client (the visitor's locale) could disagree → hydration mismatch (trap #6).

/** 1234567 → "1,234,567". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const [int, frac] = Math.abs(n).toString().split('.');
  // Exponent notation (≥ 1e21) never occurs in our data; print it untouched rather than mangle it.
  if (int.includes('e')) return String(n);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** '2026-09-30' → '30 Sep 2026'. Parsed by hand: `new Date()` would shift the day in non-UTC time zones. */
export function formatDayUTC(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  if (!m) return isoDay;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return isoDay;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** Replaces `{key}` placeholders; numbers go through formatNumber. Unknown keys are left as written. */
export function fillTemplate(text: string, values: Record<string, number | string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!Object.hasOwn(values, key)) return whole;
    const v = values[key];
    return typeof v === 'number' ? formatNumber(v) : v;
  });
}
