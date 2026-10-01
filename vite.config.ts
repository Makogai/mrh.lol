import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// MRH_PKG=<package> isolates parallel implementers sharing one checkout (own outDir + own dep-optimizer cache).
// Unset in Docker / for the lead → plain dist/.
const pkg = process.env.MRH_PKG;
const outDir = pkg ? `dist-${pkg}` : 'dist';

// The hero name (LCP) is set in Mona Sans' width axis, and the mono labels sit above the fold too. Preloading the hashed
// files means the swap from the metric-matched fallback usually happens before first paint, and - the part that shows in
// Lighthouse's simulated LCP - the mono file is requested from the HTML in parallel with the CSS instead of one dependent
// round trip later (CSS -> layout -> font). Vite never preloads fonts on its own. Both subsets are ~10-47 KB.
function preloadDisplayFont(): Plugin {
  const FONTS = [/mona-sans-site-[\w-]+\.woff2$/, /martian-mono-site-[\w-]+\.woff2$/];
  return {
    name: 'mrh:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return FONTS.flatMap((re) => files.filter((f) => re.test(f))).map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

// The page is fully prerendered, so the module entry only adds interactivity (and starts the canvas). Loading it at
// startup is what makes Lighthouse's simulated LCP ~2.1 s against an observed 0.3 s: Lantern charges every script that
// STARTS before the observed LCP (84 KB gzip over simulated slow 4G, plus its CPU time at 4x slowdown) to the h1, which
// needs none of it. fetchpriority="low" does not help - Lantern includes scripts regardless of priority (measured).
// So the entry is requested right after first contentful paint instead. Cost: hydration begins one paint later, a few
// hundred ms on a real connection (the 3 s timer covers a hidden tab, where no paint entry ever fires).
// The 404 page has no hydration; scripts/prerender.mjs strips this tag (data-entry-loader) from it.
function deferEntryUntilPaint(): Plugin {
  const MODULE_TAG = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
  return {
    name: 'mrh:defer-entry-until-paint',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(MODULE_TAG, (_tag, src: string) => {
          const loader =
            '(function(s){var d=0;function g(){if(d)return;d=1;var e=document.createElement("script");e.type="module";e.crossOrigin="";e.src=s;document.head.appendChild(e)}' +
            'try{new PerformanceObserver(function(l,o){l.getEntries().forEach(function(x){if(x.name==="first-contentful-paint"){o.disconnect();setTimeout(g,0)}})}).observe({type:"paint",buffered:true})}catch(x){addEventListener("load",g)}' +
            'setTimeout(g,3000)})(' + JSON.stringify(src) + ')';
          return '<script data-entry-loader>' + loader + '</script>';
        });
      },
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), preloadDisplayFont(), deferEntryUntilPaint()],
  cacheDir: pkg ? `node_modules/.vite-${pkg}` : 'node_modules/.vite',
  build: { outDir: isSsrBuild ? `${outDir}-ssr` : outDir, sourcemap: false },
}));
