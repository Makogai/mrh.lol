// DEV-ONLY QA FIXTURES. Imported dynamically from qa.ts inside `if (import.meta.env.DEV)`, so production strips this
// whole file (verified by grepping dist for "QA FIXTURE"). Never import it anywhere else.
// Exercises: all four statuses, several accents, link combinations, > 4 tags (must clamp to 4), with/without image.
import type { Project } from '../../data/types';

// A flat 1600×1000 gradient stands in for a screenshot; explicit dimensions exercise the CLS-safe image path.
const art =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#161b28"/><stop offset="1" stop-color="#0a0d16"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><path d="M0 700H700L820 580H1600" stroke="#ffc247" stroke-width="6" fill="none" opacity=".6"/><circle cx="1500" cy="580" r="18" fill="#3ee0d0"/></svg>',
  );

export const qaProjects: Project[] = [
  {
    slug: 'qa-fixture-one',
    title: 'QA FIXTURE One',
    tagline: 'A fixture with an image, both links and more tags than the card may show.',
    description: null,
    url: 'https://example.com/',
    repoUrl: 'https://example.com/repo',
    status: 'live',
    tags: ['TypeScript', 'Vite', 'Canvas', 'Tooling', 'Fifth tag must not render'],
    accent: 'teal',
    image: { src: art, width: 1600, height: 1000, alt: 'QA FIXTURE placeholder screenshot' },
  },
  {
    slug: 'qa-fixture-two',
    title: 'QA FIXTURE Two — a much longer title that has to wrap gracefully',
    tagline: 'Repo only, work in progress, no image.',
    description: null,
    url: null,
    repoUrl: 'https://example.com/repo-two',
    status: 'wip',
    tags: ['Rust', 'CLI'],
    accent: 'violet',
    image: null,
  },
  {
    slug: 'qa-fixture-three',
    title: 'QA FIXTURE Three',
    tagline: 'Link only, beta, no tags.',
    description: null,
    url: 'https://example.com/three',
    repoUrl: null,
    status: 'beta',
    tags: [],
    accent: 'amber',
    image: null,
  },
];
