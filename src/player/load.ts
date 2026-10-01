// Fetch + validate everything the renderer needs. Throws PlayerError('network' | 'format' | 'decode').
import type { AvatarManifest } from './manifest';
import { BONE_NAMES } from './manifest';
import { perr } from './err';

export type TexSource = ImageBitmap | HTMLImageElement;
export interface Loaded { man: AvatarManifest; bin: ArrayBuffer; tex: Map<string, TexSource> }

async function get(url: URL, signal: AbortSignal, init?: RequestInit): Promise<Response> {
  let r: Response;
  try { r = await fetch(url, { ...init, signal }); } catch (e) { throw signal.aborted ? e : perr('network', 'fetch failed ' + url.pathname, e); }
  if (!r.ok) throw perr('network', r.status + ' ' + url.pathname);
  return r;
}

async function decode(blob: Blob, name: string): Promise<TexSource> {
  try {
    // colorSpaceConversion 'none': the shader does the sRGB decode, so the browser must not touch the pixels.
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    try { await img.decode(); return img; } catch (e) { throw perr('decode', name, e); } finally { URL.revokeObjectURL(img.src); }
  }
}

export async function load(baseUrl: string, signal: AbortSignal): Promise<Loaded> {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/', location.href);
  // no-cache = revalidate: avatar.json has a stable name, everything else is content-hashed and immutable.
  const mr = await get(new URL('avatar.json', base), signal, { cache: 'no-cache' });
  let man: AvatarManifest;
  try { man = await mr.json(); } catch (e) { throw perr('format', 'avatar.json is not JSON', e); }
  if (man.format !== 'mrh-avatar' || man.version !== 1 || man.bones?.length !== 8 || BONE_NAMES.some((n, i) => man.bones[i].name !== n)) {
    throw perr('format', 'unsupported manifest');
  }

  const urls = [...new Set(man.materials.flatMap((m) => (m.texture ? [m.texture.url] : [])))];
  const [bin, ...imgs] = await Promise.all([
    get(new URL(man.bin.url, base), signal).then((r) => r.arrayBuffer()),
    ...urls.map((u) => get(new URL(u, base), signal).then((r) => r.blob()).then((b) => decode(b, u))),
  ]);
  const tex = new Map<string, TexSource>(urls.map((u, i) => [u, imgs[i]]));

  const h = new DataView(bin);
  const u32 = man.bin.indexType === 'u32';
  const bad = (): never => { imgs.forEach((i) => (i as ImageBitmap).close?.()); throw perr('format', 'avatar bin does not match the manifest'); };
  // Length first: DataView throws RangeError on a short buffer (an empty 200 from a misconfigured CDN), and that would be reported as 'decode'.
  if (bin.byteLength < 48) bad();
  const N = h.getUint32(8, true), I = h.getUint32(12, true), off = (o: number) => h.getUint32(o, true);
  if (
    h.getUint32(0, true) !== 0x4148524d /* "MRHA" */ || h.getUint16(4, true) !== 1 ||
    (h.getUint16(6, true) & 1) !== +u32 || N !== man.bin.vertexCount || I !== man.bin.indexCount ||
    h.getUint32(36, true) !== man.bin.byteLength || bin.byteLength !== man.bin.byteLength ||
    // gl.ts feeds these offsets straight to vertexAttribPointer, so they must be the SPEC 3.1 layout (pos, nrm, uv, skin, indices)
    off(16) !== 48 || off(20) !== 48 + 6 * N || off(24) !== 48 + 8 * N || off(28) !== 48 + 12 * N || off(32) !== 48 + 16 * N ||
    off(32) + I * (u32 ? 4 : 2) > bin.byteLength
  ) bad();
  return { man, bin, tex };
}
