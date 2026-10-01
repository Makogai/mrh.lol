// Prerenders index.html and 404.html from the client build's template + the SSR bundle (BUILD_PLAN §6.5).
//   vite build  →  dist/index.html (template with markers)      vite build --ssr  →  dist-ssr/entry-server.js
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// react-dom/server picks its build from NODE_ENV when loaded from node_modules; default to the production one.
process.env.NODE_ENV ??= 'production';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Same rule as vite.config.ts, so parallel implementers (MRH_PKG) never touch each other's output.
const pkg = process.env.MRH_PKG;
const outDir = resolve(root, pkg ? `dist-${pkg}` : 'dist');
const ssrDir = `${outDir}-ssr`;

const SEO_RE = /<!--seo-head-->[\s\S]*?<!--\/seo-head-->/;
const APP_MARK = '<!--app-html-->';

const template = await readFile(resolve(outDir, 'index.html'), 'utf8');
// Fail loudly: a silently missing marker would ship an empty #root or the placeholder <title>.
if (!SEO_RE.test(template)) throw new Error('prerender: <!--seo-head-->…<!--/seo-head--> region not found in index.html');
if (!template.includes(APP_MARK)) throw new Error('prerender: <!--app-html--> marker not found in index.html');

const entry = await import(pathToFileURL(resolve(ssrDir, 'entry-server.js')).href);

// Replacer functions, never replacement strings: rendered HTML may contain `$&`, `$1`… which String.replace would expand.
const fill = (html, head, body) => html.replace(SEO_RE, () => head).replace(APP_MARK, () => body);

const index = fill(template, entry.renderHead(), entry.render());

// The 404 is static: no hydration, so no module script and no module preload. Stylesheet and font preload stay.
const notFoundBase = template
  .replace(/<script\b[^>]*\btype="module"[^>]*>\s*<\/script>\s*/g, '')
  .replace(/<script\b[^>]*\bdata-entry-loader\b[^>]*>[\s\S]*?<\/script>\s*/g, '') // vite.config.ts defers the entry through this loader
  .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/g, '');
const notFound = fill(notFoundBase, entry.renderNotFoundHead(), entry.renderNotFound());

for (const [name, html] of [['index.html', index], ['404.html', notFound]]) {
  const file = resolve(outDir, name);
  await writeFile(file, html);
  console.log(`[prerender] ${pkg ? `dist-${pkg}` : 'dist'}/${name}  ${(await stat(file)).size.toLocaleString('en-US')} bytes`);
}

await rm(ssrDir, { recursive: true, force: true });
