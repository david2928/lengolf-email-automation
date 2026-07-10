# Cloud Run Decommission Plan (email-processor)

Status: **EXECUTED 2026-07-10 (steps 2–3, approved by David).**
Created 2026-07-10 as part of the migration to the Supabase Edge Function
(`supabase/functions/email-processor/`, project `bisimqmtxjsptehhqpeg`,
pg_cron job `email-processor`, every 5 minutes).

Executed on 2026-07-10 after David's approval:
- Cloud Run `email-processor` scaled to zero via **manual scaling**
  (`gcloud run services update ... --scaling=0`; note `--max-instances=0` is
  rejected — Cloud Run requires a positive integer for autoscaling maxScale).
  Service state: `run.googleapis.com/scalingMode: manual`,
  `manualInstanceCount: '0'` — no instance can start regardless of traffic.
- Cloud Scheduler job `email-processor` (asia-southeast1) **deleted**.

Still pending (step 4): delete the Cloud Run service entirely after ~30 days
of clean edge-function operation (around 2026-08-10). Secret Manager secrets
`gmail-credentials`/`gmail-token` are intentionally kept (step 5).

## Why decommission

The Cloud Run service `email-processor` (project `lengolf-email-automation`,
region `asia-southeast1`) ran an infinite in-process polling loop. With
`min-instances=0` and CPU throttling, outbound Gmail/Secret Manager calls could
hang forever without a timeout; the loop silently deadlocked on
2026-07-09T09:04Z and had processed nothing since 2026-07-01. The vestigial
Cloud Scheduler job `email-processor` (every 10 min) POSTs to a `/process`
route that no longer exists (404s).

## Risk while the old service is still up

If the frozen Cloud Run instance ever restarts, its loop resumes and processes
the same Gmail labels concurrently with the edge function. The unique
constraint on `processed_emails.gmail_message_id` prevents most duplicates,
but the old code checks-then-inserts (TOCTOU), so a narrow double-booking /
double-notification window exists. **Recommendation: pause the old service as
soon as the edge function has a few clean days — or immediately, since the old
loop has been dead since 2026-07-09 anyway and provides no coverage.**

## Steps (after David confirms)

1. Verify edge function health over the observation window:
   ```sql
   SELECT jobid, status, start_time FROM cron.job_run_details
   WHERE jobname = 'email-processor' ORDER BY start_time DESC LIMIT 20;
   SELECT status_code, left(content, 120), created FROM net._http_response
   WHERE content LIKE '%classpass%' ORDER BY created DESC LIMIT 10;
   SELECT source_type, action_taken, count(*), max(processed_at)
   FROM processed_emails
   WHERE processed_at > now() - interval '7 days' GROUP BY 1, 2;
   ```
2. Stop traffic to the old service (keeps revision history, reversible):
   ```bash
   gcloud run services update email-processor \
     --project lengolf-email-automation --region asia-southeast1 \
     --min-instances=0 --max-instances=0
   ```
3. Delete the dead Cloud Scheduler job:
   ```bash
   gcloud scheduler jobs delete email-processor \
     --project lengolf-email-automation --location asia-southeast1
   ```
4. After ~30 days of clean operation, delete the service entirely:
   ```bash
   gcloud run services delete email-processor \
     --project lengolf-email-automation --region asia-southeast1
   ```
5. Optional cleanup afterwards: Secret Manager secrets `gmail-credentials` /
   `gmail-token` in the `lengolf-email-automation` GCP project remain the
   canonical backup of the Gmail OAuth credentials — keep them unless the
   credentials are rotated, in which case update both Secret Manager and the
   Supabase edge function secrets (`GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`).

## Rollback (if the edge function misbehaves)

1. Pause the pg_cron job:
   ```sql
   SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'email-processor'), active := false);
   ```
2. Re-enable Cloud Run scaling (`--max-instances=1`) — the old code path is
   unchanged in `src/` and its secrets are still in Secret Manager.
