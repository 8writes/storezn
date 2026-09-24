create table if not exists app_error_logs (
  id text primary key default gen_random_uuid()::text,
  level text not null default 'error',
  source text not null,
  route text,
  method text,
  status_code integer,
  message text not null,
  name text,
  stack text,
  user_id text,
  user_role text,
  store_id text,
  request_id text,
  metadata jsonb,
  resolved boolean not null default false,
  resolved_by text references users(id) on delete set null,
  resolved_at timestamp,
  created_at timestamp not null default now()
);

create index if not exists idx_app_error_logs_created_at on app_error_logs(created_at);
create index if not exists idx_app_error_logs_level on app_error_logs(level);
create index if not exists idx_app_error_logs_route on app_error_logs(route);
create index if not exists idx_app_error_logs_resolved on app_error_logs(resolved);
