// DEV-ONLY QA FIXTURES (loaded by useProjects via `#qa-builds=N`, N = 1..8). Production strips this file.
// Exercises: every bento count, all four statuses, all themes, filled bot config, stats overrides, image bezel, no-link cards.
import type { Project } from '../../data/types';
import { site } from '../../config/site';

const art =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#161b28"/><path d="M0 700H700L820 580H1600" stroke="#ffc247" stroke-width="6" fill="none" opacity=".6"/><circle cx="1500" cy="580" r="18" fill="#3ee0d0"/></svg>',
  );

const base: Omit<Project, 'slug' | 'title' | 'tagline' | 'sort'> = {
  description: null, url: 'https://example.com/', repoUrl: null, status: 'live', platform: ['web'], accent: 'teal',
  image: null, theme: null, featured: false, stats: null, themeConfig: null,
};

const [atlas, bot] = site.projects;

const filledBot: Project = {
  ...bot,
  slug: 'qa-bot-filled',
  title: 'Bot with commands',
  featured: false,
  themeConfig: {
    commands: ['minerals', 'sites', 'luck', 'planner', 'gear', 'drops', 'quests'].map((name) => ({ name, description: `Look up ${name} — ranked and cached` })),
    exampleEmbed: { title: 'Aurelite', fields: [{ name: 'Rarity', value: '1 in 24,000' }, { name: 'Where', value: 'Frostbite Cavern' }, { name: 'Luck', value: '+12%' }, { name: 'Sell', value: '$4,100' }] },
    inviteUrl: 'https://example.com/invite',
  },
};

export const qaProjects: Project[] = [
  { ...atlas, sort: 0 },
  { ...bot, sort: 1 },
  { ...base, slug: 'qa-three', title: 'Forge tool three', tagline: 'A web tool with a bezelled screenshot and its own readouts.', platform: ['web', 'cli'], accent: 'violet', image: { src: art, width: 1600, height: 1000, alt: 'Fixture screenshot' }, stats: [{ label: 'Users', value: '1,204' }, { label: 'Uptime', value: '99.9%' }], repoUrl: 'https://example.com/repo', sort: 2 },
  { ...base, slug: 'qa-four', title: 'Beta thing', tagline: 'Beta status, a Roblox platform tag and no repo.', status: 'beta', platform: ['roblox'], accent: 'amber', sort: 3 },
  { ...base, slug: 'qa-five', title: 'Work in progress', tagline: 'A WIP build with no link at all: it must render without CTAs.', status: 'wip', url: null, accent: 'blue', sort: 4 },
  { ...base, slug: 'qa-six', title: 'Archived experiment', tagline: 'Archived, with a deliberately long tagline that has to clamp to two lines instead of pushing the card taller than its cell.', status: 'archived', accent: 'violet', repoUrl: 'https://example.com/repo', sort: 5 },
  { ...filledBot, sort: 6 },
  { ...base, slug: 'qa-eight', title: 'An extremely long project title that wraps', tagline: 'Last card in the full eight-card layout.', platform: ['discord', 'cli'], accent: 'amber', sort: 7 },
];
