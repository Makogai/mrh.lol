import { site } from '../../config/site';
import { buildData } from '../../data';
import type { ThemeDef } from './types';

// "Slash palette": a composer whose caret types "/", then the command palette opens and the highlight steps down two rows,
// next to an embed. Colour only — no Discord logo or art. Everything is markup; the sequence is CSS gated by [data-active].

export interface BotConfig {
  commands: { name: string; description: string }[];
  exampleEmbed: { title: string; fields: { name: string; value: string }[] } | null;
  inviteUrl: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

/** Validates owner/Supabase-supplied JSON; anything malformed is dropped piecewise (never throws, never renders junk). */
export function parseBotConfig(raw: unknown): BotConfig | null {
  if (!isObj(raw)) return null;
  const commands = (Array.isArray(raw.commands) ? raw.commands : []).flatMap((c) => {
    if (!isObj(c)) return [];
    const name = str(c.name, 32);
    const description = str(c.description, 100);
    return name && /^[\w-]+$/.test(name) && description ? [{ name, description }] : [];
  });
  let exampleEmbed: BotConfig['exampleEmbed'] = null;
  if (isObj(raw.exampleEmbed)) {
    const title = str(raw.exampleEmbed.title, 120);
    const fields = (Array.isArray(raw.exampleEmbed.fields) ? raw.exampleEmbed.fields : []).flatMap((f) => {
      if (!isObj(f)) return [];
      const name = str(f.name, 60);
      const value = str(f.value, 120);
      return name && value ? [{ name, value }] : [];
    });
    if (title) exampleEmbed = { title, fields: fields.slice(0, 6) };
  }
  const inviteUrl = typeof raw.inviteUrl === 'string' && /^https:\/\/\S+$/.test(raw.inviteUrl) ? raw.inviteUrl : null;
  return { commands: commands.slice(0, 11), exampleEmbed, inviteUrl };
}

export const discordBot: ThemeDef<BotConfig | null> = {
  id: 'discord-bot',
  label: 'Slash palette',
  vars: { accent: '#5865f2', accentInk: '#ffffff', surface0: '#1e1f22', surface1: '#2b2d31', glow: 'rgb(88 101 242 / 0.5)' },
  motif: 'chat',
  readout: 'discord',
  parseConfig: parseBotConfig,
  cta: (_project, config) =>
    config?.inviteUrl ? { label: 'Add to server', href: config.inviteUrl } : { label: 'Open Atlas', href: site.atlas.url },
  Art: ({ project, config }) => {
    const cmds = config?.commands.slice(0, 6) ?? [];
    const embed = config?.exampleEmbed ?? null;
    return (
      <div className="art art-bot">
        <div className="bot-stage">
          <div className="bot-palette">
            {cmds.length > 0 ? (
              <>
                <span className="bot-hl" />
                <ul>
                  {cmds.map((c) => (
                    <li key={c.name}><b>/{c.name}</b><span>{c.description}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              // Empty state: the real command count over skeleton bars that are clearly not text.
              <div className="bot-empty">
                <b>/{buildData.atlas.stats.discordCommands}</b>
                <span>slash commands</span>
                <i /><i /><i />
              </div>
            )}
          </div>
          <div className="bot-embed">
            <span className="bot-embed-cap">{embed ? 'Example output' : 'About this bot'}</span>
            <div className="bot-embed-card">
              <strong>{embed?.title ?? project.title}</strong>
              {embed ? (
                embed.fields.length > 0 && (
                  <dl>
                    {embed.fields.map((f) => <div key={f.name}><dt>{f.name}</dt><dd>{f.value}</dd></div>)}
                  </dl>
                )
              ) : (
                project.description && <p>{project.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="bot-composer"><span className="bot-slash">/</span><span className="bot-caret" /></div>
      </div>
    );
  },
};
