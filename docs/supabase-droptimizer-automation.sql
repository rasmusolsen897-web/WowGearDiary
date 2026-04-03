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

create index if not exists sim_runs_character_idx on sim_runs (character_name, scenario, run_date desc);
create index if not exists sim_run_items_run_idx on sim_run_items (sim_run_id);
create index if not exists droptimizer_payloads_lookup_idx on droptimizer_payloads (character_name, scenario);
