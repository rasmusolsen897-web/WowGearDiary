create table if not exists wcl_reports (
  report_code text primary key,
  source_url text,
  title text,
  visibility text,
  region text,
  guild_name text,
  guild_server_slug text,
  guild_server_region text,
  owner_name text,
  zone_id integer,
  zone_name text,
  start_time timestamptz,
  end_time timestamptz,
  revision integer,
  segments integer,
  raid_night_date date,
  import_status text not null default 'ready',
  last_error text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wcl_fights (
  report_code text not null references wcl_reports(report_code) on delete cascade,
  fight_id integer not null,
  encounter_id integer,
  encounter_name text not null,
  difficulty integer,
  kill boolean not null default false,
  size integer,
  start_time timestamptz,
  end_time timestamptz,
  average_item_level numeric(8, 2),
  boss_percentage numeric(8, 2),
  fight_percentage numeric(8, 2),
  complete_raid boolean not null default false,
  in_progress boolean not null default false,
  wipe_called_time timestamptz,
  raid_night_date date,
  primary key (report_code, fight_id)
);

create table if not exists wcl_fight_players (
  report_code text not null references wcl_reports(report_code) on delete cascade,
  fight_id integer not null,
  actor_key text not null,
  actor_id integer,
  actor_name text not null,
  actor_realm text,
  actor_region text,
  class_name text,
  spec_name text,
  role text,
  parse_percent numeric(8, 2),
  dps numeric(12, 2),
  item_level numeric(8, 2),
  kill boolean not null default false,
  raid_night_date date,
  primary key (report_code, fight_id, actor_key)
);

create table if not exists wcl_loot_events (
  event_uid text primary key,
  report_code text not null references wcl_reports(report_code) on delete cascade,
  fight_id integer,
  actor_key text,
  actor_name text,
  item_id integer,
  item_name text,
  item_level numeric(8, 2),
  quality text,
  encounter_name text,
  occurred_at timestamptz,
  is_tier boolean not null default false
);

create index if not exists wcl_reports_updated_at_idx on wcl_reports (updated_at desc);
create index if not exists wcl_reports_raid_night_idx on wcl_reports (raid_night_date desc);
create index if not exists wcl_fights_report_idx on wcl_fights (report_code, encounter_name);
create index if not exists wcl_fight_players_actor_idx on wcl_fight_players (actor_key, raid_night_date desc);
create index if not exists wcl_loot_events_report_idx on wcl_loot_events (report_code, occurred_at desc);
