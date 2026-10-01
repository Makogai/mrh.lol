import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// MRH_PKG=<package> isolates parallel implementers sharing one checkout (own outDir + own dep-optimizer cache).
// Unset in Docker / for the lead → plain dist/.
const pkg = process.env.MRH_PKG;
const outDir = pkg ? `dist-${pkg}` : 'dist';

// The hero name (LCP) is set in Mona Sans' width axis. Preloading the hashed file means the swap from the
// metric-matched fallback usually happens before first paint. Vite never preloads fonts on its own.
function preloadDisplayFont(): Plugin {
  return {
    name: 'mrh:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /mona-sans-latin-wdth-normal-[\w-]+\.woff2$/.test(f));
        if (!file) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), preloadDisplayFont()],
  cacheDir: pkg ? `node_modules/.vite-${pkg}` : 'node_modules/.vite',
  build: { outDir: isSsrBuild ? `${outDir}-ssr` : outDir, sourcemap: false },
}));
