create table if not exists sim_runs (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  scenario text not null,
  run_date date not null default current_date,
  status text not null,
  source text not null default 'automation',
  trigger_kind text not null default 'automation',
  workflow_run_id text,
  raidbots_job_id text,
  report_url text,
  base_dps integer,
  difficulty text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  unique (character_name, scenario, run_date)
);

alter table if exists sim_runs
  add column if not exists trigger_kind text not null default 'automation';

alter table if exists sim_runs
  add column if not exists workflow_run_id text;

update sim_runs
set trigger_kind = case
  when source = 'manual' then 'manual'
  else 'automation'
end
where trigger_kind is null
   or trigger_kind = '';

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
  enabled boolean not null default false,
  validation_status text not null default 'pending',
  validation_error text,
  validated_at timestamptz,
  payload_hash text,
  payload_source text not null default 'ui_capture',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (character_name, scenario)
);

alter table if exists droptimizer_payloads
  add column if not exists enabled boolean not null default false;

alter table if exists droptimizer_payloads
  add column if not exists validation_status text not null default 'pending';

alter table if exists droptimizer_payloads
  add column if not exists validation_error text;

alter table if exists droptimizer_payloads
  add column if not exists validated_at timestamptz;

alter table if exists droptimizer_payloads
  add column if not exists payload_hash text;

alter table if exists droptimizer_payloads
  add column if not exists payload_source text not null default 'ui_capture';

update droptimizer_payloads
set payload_source = coalesce(nullif(payload_source, ''), 'ui_capture')
where payload_source is null
   or payload_source = '';

create table if not exists droptimizer_scheduler_state (
  scenario text primary key,
  active_run_id uuid references sim_runs(id) on delete set null,
  active_workflow_run_id text,
  current_run_date date,
  lock_token text,
  lock_expires_at timestamptz,
  last_seeded_run_date date,
  last_kickoff_at timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table if exists droptimizer_scheduler_state
  add column if not exists active_workflow_run_id text;

alter table if exists droptimizer_scheduler_state
  add column if not exists current_run_date date;

alter table if exists droptimizer_scheduler_state
  add column if not exists last_kickoff_at timestamptz;

alter table if exists droptimizer_scheduler_state
  add column if not exists last_started_at timestamptz;

alter table if exists droptimizer_scheduler_state
  add column if not exists last_completed_at timestamptz;

alter table if exists droptimizer_scheduler_state
  add column if not exists last_error text;

insert into droptimizer_scheduler_state (scenario)
values ('raid_heroic')
on conflict (scenario) do nothing;

create index if not exists sim_runs_character_idx on sim_runs (character_name, scenario, run_date desc);
create index if not exists sim_runs_queue_idx on sim_runs (scenario, run_date, status, next_retry_at);
create index if not exists sim_runs_workflow_idx on sim_runs (workflow_run_id);
create index if not exists sim_run_items_run_idx on sim_run_items (sim_run_id);
create index if not exists droptimizer_payloads_lookup_idx on droptimizer_payloads (character_name, scenario);
create index if not exists droptimizer_payloads_status_idx on droptimizer_payloads (scenario, enabled, validation_status);
