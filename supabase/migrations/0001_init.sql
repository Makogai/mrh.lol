-- mrh.lol — contact inbox + projects grid. Idempotent: safe to re-run in the Supabase SQL editor.
begin;

-- Async HTTP for the optional Discord ping. Requests are only sent after the transaction commits.
create extension if not exists pg_net with schema extensions;

-- ── Private schema: never exposed through the Data API ─────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.settings from public, anon, authenticated;

-- Seed. `on conflict do nothing` keeps your edits when re-running.
insert into private.settings (key, value) values
  ('ip_salt', encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex')),
  ('rate_window_minutes', '10'),
  ('rate_max_per_window', '3'),
  ('rate_max_per_day', '10'),
  ('global_max_per_day', '200')
on conflict (key) do nothing;
-- Discord notifications stay OFF until you add a webhook URL:
--   insert into private.settings (key, value) values ('discord_webhook_url', 'https://discord.com/api/webhooks/…')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

-- ── Messages: the contact-form inbox (read it in Table Editor → public.messages) ───────────────────
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null,
  reply_to   text not null,
  message    text not null,
  ip_hash    text not null,   -- salted SHA-256; raw IPs are never stored
  user_agent text,
  is_read    boolean not null default false
);
create index if not exists messages_ip_hash_created_at_idx on public.messages (ip_hash, created_at desc);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

alter table public.messages enable row level security;
-- No policies on purpose: RLS on + zero policies = anon/authenticated can neither read nor write.
revoke all on public.messages from anon, authenticated;

-- ── Projects: drives the "What I've built" grid. Read at BUILD time with the anon key. ─────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  title        text not null check (char_length(title) between 1 and 60),
  tagline      text not null check (char_length(tagline) between 1 and 140),
  description  text check (description is null or char_length(description) <= 600),
  url          text check (url is null or url ~ '^https://'),
  repo_url     text check (repo_url is null or repo_url ~ '^https://'),
  status       text not null default 'live' check (status in ('live', 'beta', 'wip', 'archived')),
  tags         text[] not null default '{}' check (cardinality(tags) <= 6),
  accent       text not null default 'teal' check (accent in ('amber', 'teal', 'violet', 'blue')),
  image_url    text check (image_url is null or image_url ~ '^https://'),
  image_width  int check (image_width is null or image_width > 0),
  image_height int check (image_height is null or image_height > 0),
  image_alt    text,
  sort_order   int not null default 100,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.projects enable row level security;
drop policy if exists "Published projects are public" on public.projects;
create policy "Published projects are public" on public.projects
  for select to anon, authenticated using (published = true);
revoke insert, update, delete, truncate on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
  for each row execute function private.touch_updated_at();

-- ── RPC: the only way in for the contact form ─────────────────────────────────────────────────────
create or replace function public.submit_contact(
  p_name       text,
  p_reply_to   text,
  p_message    text,
  p_website    text default null,    -- honeypot: humans never fill it
  p_elapsed_ms integer default null  -- ms between form render and submit (client-reported)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_name    text := btrim(coalesce(p_name, ''));
  v_reply   text := btrim(coalesce(p_reply_to, ''));
  v_msg     text := btrim(coalesce(p_message, ''));
  v_ip      text;
  v_hash    text;
  v_window  int;
  v_max_win int;
  v_max_day int;
  v_global  int;
begin
  -- Bots get a fake success so they learn nothing.
  if coalesce(p_website, '') <> '' or (p_elapsed_ms is not null and p_elapsed_ms < 2000) then
    return jsonb_build_object('ok', true);
  end if;

  -- Validation mirrors src/contact/validate.ts; the client maps these codes to field messages.
  if char_length(v_name) < 1 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'invalid_name';
  end if;
  if char_length(v_reply) < 2 or char_length(v_reply) > 254 or not (
       v_reply ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or (v_reply ~* '^@?[a-z0-9_.]{2,32}$' and v_reply !~ '\.\.')
  ) then
    raise sqlstate 'PT400' using message = 'invalid_reply_to';
  end if;
  if char_length(v_msg) < 10 or char_length(v_msg) > 4000 then
    raise sqlstate 'PT400' using message = 'invalid_message';
  end if;

  -- Client IP → salted hash. The left-most X-Forwarded-For entry can be client-supplied, so prefer the
  -- proxy-set headers; the global daily cap below is the backstop against rotation.
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  select encode(sha256(convert_to(v_ip || ':' || s.value, 'UTF8')), 'hex') into v_hash
    from private.settings s where s.key = 'ip_salt';
  v_hash := coalesce(v_hash, encode(sha256(convert_to(v_ip, 'UTF8')), 'hex'));

  select coalesce(max(value) filter (where key = 'rate_window_minutes'), '10')::int,
         coalesce(max(value) filter (where key = 'rate_max_per_window'), '3')::int,
         coalesce(max(value) filter (where key = 'rate_max_per_day'), '10')::int,
         coalesce(max(value) filter (where key = 'global_max_per_day'), '200')::int
    into v_window, v_max_win, v_max_day, v_global
    from private.settings;

  -- Serialise concurrent submits from one IP so two parallel requests can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  if (select count(*) from public.messages m
        where m.ip_hash = v_hash and m.created_at > now() - make_interval(mins => v_window)) >= v_max_win
     or (select count(*) from public.messages m
        where m.ip_hash = v_hash and m.created_at > now() - interval '1 day') >= v_max_day then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  if (select count(*) from public.messages m where m.created_at > now() - interval '1 day') >= v_global then
    raise sqlstate 'PT429' using message = 'busy';
  end if;

  insert into public.messages (name, reply_to, message, ip_hash, user_agent)
  values (v_name, v_reply, v_msg, v_hash, left(v_headers->>'user-agent', 300));

  return jsonb_build_object('ok', true);
end
$$;
revoke all on function public.submit_contact(text, text, text, text, integer) from public;
grant execute on function public.submit_contact(text, text, text, text, integer) to anon, authenticated;

-- ── Optional Discord ping on every new message (no-op unless a webhook URL is stored) ─────────────
create or replace function private.notify_discord() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select s.value into v_url from private.settings s where s.key = 'discord_webhook_url';
  if v_url is null or v_url !~ '^https://((canary|ptb)\.)?(discord\.com|discordapp\.com)/api/webhooks/' then
    return new;
  end if;
  begin
    perform net.http_post(
      url  := v_url,
      body := jsonb_build_object(
        'username', 'mrh.lol',
        'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb), -- a message can never ping @everyone
        'embeds', jsonb_build_array(jsonb_build_object(
          'title', left('New message from ' || new.name, 256),
          'description', left(new.message, 4000),
          'color', 16761415, -- #ffc247 lantern amber
          'fields', jsonb_build_array(jsonb_build_object('name', 'Reply to', 'value', left(new.reply_to, 1024))),
          'timestamp', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ))
      )
    );
  exception when others then
    raise warning 'notify_discord skipped: %', sqlerrm; -- a webhook problem must never lose a message
  end;
  return new;
end $$;
revoke all on function private.notify_discord() from public;
drop trigger if exists messages_notify_discord on public.messages;
create trigger messages_notify_discord after insert on public.messages
  for each row execute function private.notify_discord();

-- ── Example project (uncomment, edit, run; then trigger a rebuild — DEPLOY.md) ─────────────────────
-- insert into public.projects (slug, title, tagline, url, status, tags, accent, sort_order, published)
-- values ('my-tool', 'My Tool', 'One line about what it does.', 'https://example.mrh.lol', 'beta', '{roblox,tools}', 'violet', 10, true);

commit;

notify pgrst, 'reload schema';
