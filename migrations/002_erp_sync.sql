create table if not exists erp_sync_runs (
  id serial primary key,
  status text not null default 'running',
  triggered_by text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text
);

create index if not exists erp_sync_runs_started_idx on erp_sync_runs (started_at desc);
