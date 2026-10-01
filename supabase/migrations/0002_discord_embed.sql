-- mrh.lol — richer Discord notification for new contact messages. Idempotent: safe to re-run.
-- Replaces private.notify_discord() from 0001; the trigger itself is unchanged.
begin;

-- Presentation settings. `on conflict do nothing` keeps your edits when re-running.
-- discord_avatar_url: GitHub avatar is stable today; switch to https://mrh.lol/... once the site is live.
insert into private.settings (key, value) values
  ('site_url',           'https://mrh.lol'),
  ('inbox_url',          'https://supabase.com/dashboard/project/mdnscabgxfpdmrveuube/editor'),
  ('discord_avatar_url', 'https://github.com/Makogai.png'),
  ('discord_buttons',    'on')  -- 'off' drops the link buttons if Discord ever rejects them
on conflict (key) do nothing;

-- Rough, dependency-free UA summary — only meant to tell "phone vs desktop, which browser" at a glance.
create or replace function private.describe_user_agent(p_ua text) returns text
language sql immutable set search_path = '' as $$
  select case when p_ua is null or p_ua = '' then 'Unknown device' else
    (case when p_ua ~* '(iphone|android.*mobile|mobile safari|windows phone)' then '📱 Mobile'
          when p_ua ~* '(ipad|tablet|android)' then '📱 Tablet'
          else '🖥️ Desktop' end)
    || ' · ' ||
    (case when p_ua ~* 'edg/' then 'Edge'
          when p_ua ~* 'opr/|opera' then 'Opera'
          when p_ua ~* 'firefox/|fxios' then 'Firefox'
          when p_ua ~* 'chrome/|crios' then 'Chrome'
          when p_ua ~* 'safari/' then 'Safari'
          when p_ua ~* '(curl|wget|python|httpclient|bot|spider)' then 'Script/bot'
          else 'Browser' end)
    || ' on ' ||
    (case when p_ua ~* '(iphone|ipad|ios)' then 'iOS'
          when p_ua ~* 'android' then 'Android'
          when p_ua ~* 'windows' then 'Windows'
          when p_ua ~* '(mac os x|macintosh)' then 'macOS'
          when p_ua ~* 'cros' then 'ChromeOS'
          when p_ua ~* 'linux' then 'Linux'
          else 'unknown OS' end)
  end
$$;

create or replace function private.notify_discord() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_site    text;
  v_inbox   text;
  v_avatar  text;
  v_buttons boolean;
  v_ts      bigint := extract(epoch from new.created_at)::bigint;
  v_nth     bigint;
  v_reply   text;
  v_quote   text;
  v_payload jsonb;
begin
  select max(value) filter (where key = 'discord_webhook_url'),
         coalesce(max(value) filter (where key = 'site_url'), 'https://mrh.lol'),
         max(value) filter (where key = 'inbox_url'),
         max(value) filter (where key = 'discord_avatar_url'),
         coalesce(max(value) filter (where key = 'discord_buttons'), 'on') = 'on'
    into v_url, v_site, v_inbox, v_avatar, v_buttons
    from private.settings;
  if v_url is null or v_url !~ '^https://((canary|ptb)\.)?(discord\.com|discordapp\.com)/api/webhooks/' then
    return new;
  end if;

  begin
    -- How many messages this sender (salted IP hash) has sent, including this one.
    select count(*) into v_nth from public.messages m where m.ip_hash = new.ip_hash;

    -- Email vs handle: inline code so it is one tap to copy on mobile.
    v_reply := case
      when new.reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        then '✉️ **Email**' || chr(10) || '`' || replace(new.reply_to, '`', '') || '`'
      else '💬 **Discord / handle**' || chr(10) || '`@' || ltrim(replace(new.reply_to, '`', ''), '@') || '`'
    end;

    -- Quote every line so the message reads as a block; Discord caps descriptions at 4096.
    v_quote := '> ' || replace(left(new.message, 3900), chr(10), chr(10) || '> ');

    v_payload := jsonb_build_object(
      'username', 'mrh.lol',
      'avatar_url', v_avatar,
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb), -- a message can never ping @everyone
      'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'author', jsonb_build_object('name', 'mrh.lol  ·  contact form', 'url', v_site || '/#contact', 'icon_url', v_avatar),
        'title', left('New message from ' || new.name, 256),
        'description', v_quote,
        'color', 16761415, -- #ffc247 lantern amber, the site's signature accent
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Reply via', 'value', v_reply, 'inline', true),
          jsonb_build_object('name', 'Received', 'value', format('<t:%s:f>%s<t:%s:R>', v_ts, chr(10), v_ts), 'inline', true),
          jsonb_build_object('name', 'Sender', 'value',
            (case when v_nth <= 1 then '🆕 First message' else format('🔁 Message #%s from them', v_nth) end)
            || chr(10) || private.describe_user_agent(new.user_agent), 'inline', true)
        ),
        'footer', jsonb_build_object('text', format('#%s  ·  %s chars  ·  reply from your own inbox', new.id, char_length(new.message)), 'icon_url', v_avatar),
        'timestamp', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )))
    );

    -- Link buttons on a plain webhook need ?with_components=true (non-interactive components only).
    if v_buttons and v_inbox is not null then
      v_payload := v_payload || jsonb_build_object('components', jsonb_build_array(jsonb_build_object(
        'type', 1,
        'components', jsonb_build_array(
          jsonb_build_object('type', 2, 'style', 5, 'label', 'Open inbox', 'url', v_inbox),
          jsonb_build_object('type', 2, 'style', 5, 'label', 'mrh.lol', 'url', v_site)
        )
      )));
      v_url := v_url || case when v_url like '%?%' then '&' else '?' end || 'with_components=true';
    end if;

    perform net.http_post(url := v_url, body := v_payload);
  exception when others then
    raise warning 'notify_discord skipped: %', sqlerrm; -- a webhook problem must never lose a message
  end;
  return new;
end $$;
revoke all on function private.notify_discord() from public;
revoke all on function private.describe_user_agent(text) from public;

commit;
