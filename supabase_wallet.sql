-- Run AFTER supabase_schema.sql. Adds wallet columns + weekly weekend push schedule.
alter table customers
  add column if not exists apple_serial text,
  add column if not exists apple_type text,
  add column if not exists apple_url text,
  add column if not exists google_object_id text,
  add column if not exists google_url text,
  add column if not exists last_weekend_push timestamptz;

-- Weekly warm message: Friday 09:00 UTC (~11:00-12:00 Cairo). The function skips anyone pushed in the last 5 days.
-- Replace <PROJECT_REF> and <CRON_SECRET> (same value as the CRON_SECRET function secret).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('maxdaily-weekend-push', '0 9 * * 5', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/wallet',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>',
               'Authorization','Bearer <ANON_KEY>'),
    body := '{"action":"weekend"}'::jsonb);
$$);
