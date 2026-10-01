import { site } from '../config/site';

// Output is a raw HTML string spliced between the <!--seo-head--> markers by scripts/prerender.mjs.
// Everything derives from `site` (single source of truth) — nothing personal is hard-coded here.

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `/og.png` → `https://mrh.lol/og.png`; already-absolute URLs pass through. */
const abs = (path: string) => (/^https?:\/\//.test(path) ? path : `${site.origin}${path.startsWith('/') ? '' : '/'}${path}`);

const meta = (attr: 'name' | 'property', key: string, value: string | number) =>
  `<meta ${attr}="${key}" content="${escapeAttr(String(value))}" />`;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Icons, manifest and theme colour — shared by the real page and the 404 so neither triggers an implicit /favicon.ico 404. */
function iconLinks(): string {
  return [
    // favicon.ico stays for crawlers and browsers that ignore SVG icons; declaring it also stops Chrome from probing
    // /favicon.ico implicitly (a 404 there lands in the console and costs Lighthouse Best Practices).
    '<link rel="icon" href="/favicon.ico" sizes="32x32" />',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/site.webmanifest" />',
    meta('name', 'theme-color', site.seo.themeColor),
  ].join('');
}

/**
 * JSON for a <script type="application/ld+json">. `<` is escaped so no string in the graph (a bio, a handle…) can ever
 * close the script element early — the one injection vector JSON inside HTML has.
 */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

function jsonLd(): string {
  const origin = site.origin;
  const personId = `${origin}/#person`;
  const { contact } = site;

  // Every channel with a real profile URL. Discord has none (profile URLs need numeric IDs), so it is deliberately absent;
  // null channels (TODO(me)) drop out by themselves, which keeps the graph truthful as the owner fills them in.
  const sameAs = [contact.github, contact.roblox, contact.twitter, contact.youtube, contact.twitch]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => c.href);

  const person: Record<string, unknown> = {
    '@type': 'Person',
    '@id': personId,
    name: site.displayName,
    alternateName: site.spokenName,
    url: `${origin}/`,
    image: site.avatar ? abs(site.avatar.src.png) : `${origin}/icon-512.png`,
    ...(contact.email ? { email: `mailto:${contact.email}` } : {}),
    knowsAbout: site.interests.map(capitalise),
    sameAs,
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: 'mrh.lol',
        publisher: { '@id': personId },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${origin}/#profile`,
        url: `${origin}/`,
        name: site.seo.title,
        isPartOf: { '@id': `${origin}/#website` },
        mainEntity: { '@id': personId },
      },
      person,
      // Reuses the sibling site's own @id so the two sites' graphs join up instead of describing the project twice.
      {
        '@type': 'WebSite',
        '@id': `${site.flagship.url}/#website`,
        name: site.flagship.title,
        url: site.flagship.url,
        creator: { '@id': personId },
      },
    ],
  };

  return `<script type="application/ld+json">${safeJson(graph)}</script>`;
}

export function renderHead(): string {
  const { seo } = site;
  const url = `${site.origin}/`;
  const image = abs(seo.ogImage.src);

  return [
    `<title>${escapeText(seo.title)}</title>`,
    meta('name', 'description', seo.description),
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    iconLinks(),
    // Open Graph
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'mrh.lol'),
    meta('property', 'og:title', seo.title),
    meta('property', 'og:description', seo.description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', seo.ogImage.width),
    meta('property', 'og:image:height', seo.ogImage.height),
    meta('property', 'og:image:alt', seo.ogImage.alt),
    // Twitter / X — no twitter:site: the owner has no handle, and an invented one would be worse than none.
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', seo.title),
    meta('name', 'twitter:description', seo.description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', seo.ogImage.alt),
    jsonLd(),
  ].join('\n    ');
}

export function renderNotFoundHead(): string {
  return [
    '<title>404 — mrh.lol</title>',
    iconLinks(),
    // A 404 page must never be indexed, even if a crawler reaches it through a soft redirect.
    meta('name', 'robots', 'noindex'),
  ].join('\n    ');
}
