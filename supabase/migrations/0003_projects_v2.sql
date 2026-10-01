-- mrh.lol v2 — per-app themes for the Builds section. Idempotent: safe to re-run in the Supabase SQL editor.
-- (The design doc calls this 0002_projects_v2; 0002 was already taken by the Discord embed migration.)
--
-- Every new column is NULLABLE with no default: NULL means "not set here", so scripts/gen-data.mjs keeps the value from
-- src/config/site.ts (projects[]). A row only wins on the fields you actually fill in. Ordering reuses the existing
-- `sort_order` (default 100 = unset); there is no separate `sort` column.
--
-- Add app #3: one INSERT (slug, title, tagline, status, accent, published = true, theme = null → 'forge' look) and rebuild.
begin;

alter table public.projects
  add column if not exists theme        text,
  add column if not exists featured     boolean,
  add column if not exists platform     text[],
  add column if not exists stats        jsonb,
  add column if not exists theme_config jsonb;

-- theme: registry key (src/work/themes). Unknown keys fall back to 'forge' in the UI, so only the shape is checked here.
alter table public.projects drop constraint if exists projects_theme_check;
alter table public.projects add constraint projects_theme_check
  check (theme is null or theme ~ '^[a-z0-9-]{1,32}$');

alter table public.projects drop constraint if exists projects_platform_check;
alter table public.projects add constraint projects_platform_check
  check (platform is null or (platform <@ array['roblox', 'discord', 'web', 'cli']::text[] and cardinality(platform) <= 4));

-- stats: up to 3 readouts, [{"label": "Users", "value": "1,204"}]. Real data only: the card shows them verbatim.
alter table public.projects drop constraint if exists projects_stats_check;
alter table public.projects add constraint projects_stats_check
  check (stats is null or (jsonb_typeof(stats) = 'array' and jsonb_array_length(stats) <= 3));

-- theme_config: theme-specific JSON, validated by the theme at build time (discord-bot: commands, exampleEmbed, inviteUrl).
alter table public.projects drop constraint if exists projects_theme_config_check;
alter table public.projects add constraint projects_theme_config_check
  check (theme_config is null or (jsonb_typeof(theme_config) = 'object' and pg_column_size(theme_config) <= 8192));

-- The existing "Published projects are public" policy and the SELECT grant already cover new columns (table-level grant).

commit;
