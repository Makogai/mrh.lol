// DEV-ONLY QA FIXTURES (see projects.ts). `#qa-avatar` → inline SVG data URI; `#qa-avatar=real` → the generated renditions.
import type { AvatarConfig } from '../../config/site';

const svg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><radialGradient id="g" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#ffc247"/><stop offset=".55" stop-color="#7a4a10"/><stop offset="1" stop-color="#0a0d16"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="210" r="86" fill="#eef2fb" opacity=".85"/><path d="M96 512c10-120 80-190 160-190s150 70 160 190z" fill="#eef2fb" opacity=".85"/></svg>',
  );

// avif/webp are empty on purpose: Bezel skips a <source> with no URL, because a <source type="image/avif"> pointing at an
// SVG would be chosen by Chrome and then fail to decode, with no fallback to the <img>.
export const mockAvatar: AvatarConfig = {
  src: { avif: '', webp: '', png: svg },
  src2x: null,
  width: 512,
  height: 512,
  alt: 'QA FIXTURE avatar',
};

export const realAvatar: AvatarConfig = {
  src: { avif: '/avatar/avatar-512.avif', webp: '/avatar/avatar-512.webp', png: '/avatar/avatar-512.png' },
  src2x: { avif: '/avatar/avatar-1024.avif', webp: '/avatar/avatar-1024.webp', png: '/avatar/avatar-1024.png' },
  width: 512,
  height: 512,
  alt: 'QA FIXTURE real avatar',
};
