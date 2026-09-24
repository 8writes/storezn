create table if not exists api_request_logs (
  id text primary key default gen_random_uuid()::text,
  source text not null,
  route text not null,
  method text not null,
  status_code integer not null,
  duration_ms integer not null,
  request_id text,
  error_name text,
  error_message text,
  created_at timestamp not null default now()
);

create index if not exists idx_api_request_logs_created_at on api_request_logs(created_at);
create index if not exists idx_api_request_logs_source on api_request_logs(source);
create index if not exists idx_api_request_logs_route on api_request_logs(route);
create index if not exists idx_api_request_logs_status on api_request_logs(status_code);
