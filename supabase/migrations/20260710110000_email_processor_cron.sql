-- Migration: schedule the email-processor edge function via pg_cron + pg_net
-- Description: Replaces the Cloud Run in-process loop. POSTs to the edge
--   function every 5 minutes; the function runs exactly one processing cycle
--   per invocation and exits early if another invocation holds the lease lock.
-- Date: 2026-07-10
--
-- NOTE: This file is a TEMPLATE. The two ANON-KEY / PROCESSOR-SECRET
-- placeholders in the SQL body below are secrets and intentionally not
-- committed: substitute the project anon key (JWT) and the
-- EMAIL_PROCESSOR_SECRET edge function secret, then apply manually (Supabase
-- SQL editor or Management API). Do not run as-is. When substituting
-- programmatically, use replaceAll semantics and verify no placeholder
-- remains before applying.

SELECT cron.unschedule('email-processor')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-processor');

SELECT cron.schedule(
  'email-processor',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
        url := 'https://bisimqmtxjsptehhqpeg.supabase.co/functions/v1/email-processor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer __ANON_KEY__',
            'x-processor-secret', '__PROCESSOR_SECRET__',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 240000
    ) AS request_id;
  $$
);
