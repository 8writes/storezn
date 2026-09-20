\pset pager off

SELECT
  min(created_at) AS oldest_log,
  max(created_at) AS newest_log,
  count(*) AS total_logs
FROM api_request_logs;

SELECT
  (created_at AT TIME ZONE 'Africa/Lagos')::date AS lagos_day,
  count(*) AS requests,
  count(*) FILTER (WHERE status_code >= 500) AS server_errors
FROM api_request_logs
GROUP BY lagos_day
ORDER BY lagos_day DESC
LIMIT 14;
