-- Migration: email-processor cycle lease lock
-- Description: Lease-based lock so overlapping email-processor invocations
--   (pg_cron overlap, manual triggers) cannot run a processing cycle
--   concurrently. A lease (rather than a session advisory lock) survives
--   PostgREST connection pooling and auto-expires if an invocation crashes.
-- Date: 2026-07-10

CREATE TABLE IF NOT EXISTS public.automation_locks (
  name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automation_locks IS
  'Lease locks for automation jobs (e.g. email-processor edge function). A job holds the lock while locked_until > now().';

-- Service role bypasses RLS; enabling it with no policies blocks anon/authenticated.
ALTER TABLE public.automation_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_automation_lock(p_name TEXT, p_lease_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.automation_locks AS l (name, locked_until)
  VALUES (p_name, now() + make_interval(secs => p_lease_seconds))
  ON CONFLICT (name) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE l.locked_until < now()
  RETURNING TRUE INTO v_acquired;
  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_automation_lock(p_name TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.automation_locks
  SET locked_until = now(), updated_at = now()
  WHERE name = p_name;
$$;

REVOKE ALL ON FUNCTION public.acquire_automation_lock(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_automation_lock(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_automation_lock(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_automation_lock(TEXT) TO service_role;
