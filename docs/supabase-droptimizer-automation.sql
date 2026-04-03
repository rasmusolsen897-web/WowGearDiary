create table if not exists sim_runs (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  scenario text not null,
  run_date date not null default current_date,
  status text not null,
  source text not null default 'automation',
  raidbots_job_id text,
  report_url text,
  base_dps integer,
  difficulty text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (character_name, scenario, run_date)
);

alter table if exists sim_runs
  add column if not exists attempt_count integer not null default 0;

alter table if exists sim_runs
  add column if not exists next_retry_at timestamptz;

create table if not exists sim_run_items (
  id uuid primary key default gen_random_uuid(),
  sim_run_id uuid not null references sim_runs(id) on delete cascade,
  item_id integer,
  item_name text not null,
  slot text,
  item_level integer,
  dps_delta integer not null default 0,
  dps_pct numeric(8,2) not null default 0,
  source_type text,
  source_id text,
  source_name text,
  difficulty text
);

create table if not exists droptimizer_payloads (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  scenario text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (character_name, scenario)
);

create table if not exists droptimizer_scheduler_state (
  scenario text primary key,
  active_run_id uuid references sim_runs(id) on delete set null,
  lock_token text,
  lock_expires_at timestamptz,
  last_seeded_run_date date,
  updated_at timestamptz not null default now()
);

insert into droptimizer_scheduler_state (scenario)
values ('raid_heroic')
on conflict (scenario) do nothing;

create index if not exists sim_runs_character_idx on sim_runs (character_name, scenario, run_date desc);
create index if not exists sim_runs_queue_idx on sim_runs (scenario, run_date, status, next_retry_at);
create index if not exists sim_run_items_run_idx on sim_run_items (sim_run_id);
create index if not exists droptimizer_payloads_lookup_idx on droptimizer_payloads (character_name, scenario);
