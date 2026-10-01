// Avatar renditions from the owner's source art (BUILD_PLAN §9.4).  npm run gen:avatar
// Reads assets-src/avatar.png (never modified), writes public/avatar/avatar-{512,1024}.{avif,webp,png}.
// It only produces files: site.avatar stays null until the lead reviews them and pastes the object from site.ts.
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const src = resolve(fileURLToPath(new URL('../assets-src/avatar.png', import.meta.url)));
const outDir = resolve(fileURLToPath(new URL('../public/avatar/', import.meta.url)));

if (!existsSync(src)) {
  console.log('gen-avatar: assets-src/avatar.png not found — nothing to do (site.avatar stays null).');
  process.exit(0);
}
await mkdir(outDir, { recursive: true });

// 352 = the phone rendition: the bezel is 176 CSS px there, and a 512 px file (29 KB AVIF) would be fetched at startup
// because the avatar sits inside the lazy-load distance of the first viewport.
for (const size of [352, 512, 1024]) {
  // 'attention' picks the crop window around the most salient region, so an off-centre face survives the square crop.
  const base = sharp(src).resize(size, size, { fit: 'cover', position: 'attention' });
  const jobs = {
    avif: base.clone().avif({ quality: 55, effort: 6 }),
    webp: base.clone().webp({ quality: 82 }),
    png: base.clone().png({ palette: false, compressionLevel: 9 }),
  };
  for (const [ext, pipeline] of Object.entries(jobs)) {
    const file = join(outDir, `avatar-${size}.${ext}`);
    await pipeline.toFile(file);
    const kb = (await stat(file)).size / 1024;
    console.log(`avatar-${size}.${ext}`.padEnd(20), `${kb.toFixed(1)} KB${size === 512 && ext === 'avif' && kb > 40 ? '   (over the 40 KB target)' : ''}`);
  }
}
