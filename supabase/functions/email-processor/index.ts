// email-processor edge function
//
// Runs ONE processing cycle per invocation (request-driven — no in-process
// loops; this replaces the Cloud Run service whose infinite loop silently
// deadlocked under CPU throttling). Scheduled via pg_cron + pg_net every
// 5 minutes; see supabase/migrations/20260710_email_processor_cron.sql.
//
// Concurrency: a lease lock in public.automation_locks guards the whole cycle
// so overlapping invocations (pg_cron overlap, manual triggers) cannot
// double-process. The unique constraint on processed_emails.gmail_message_id
// remains the last line of defense.
//
// Secrets (set via `supabase secrets set`):
//   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
//   LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID_CLASSPASS / LINE_GROUP_ID_WEBRESOS
//   EMAIL_PROCESSOR_SECRET (shared secret checked on every request)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GmailClient } from './gmail.ts';
import { LineNotifier } from './notify.ts';
import { ClassPassProcessor, CycleStats, WebResosProcessor } from './processors.ts';
import { log } from './utils.ts';

const LOCK_NAME = 'email-processor';
const LOCK_LEASE_SECONDS = 600;
// Stop starting new threads well before the edge-function wall-clock limit
// and the pg_net request timeout.
const CYCLE_BUDGET_MS = 150_000;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Compare via SHA-256 digests so the string comparison's timing reveals
// nothing about the secret itself.
async function secretMatches(provided: string | null, expected: string): Promise<boolean> {
  if (!provided) return false;
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const a = await digest(provided);
  const b = await digest(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  // Shared-secret check on top of the platform JWT verification, so holders
  // of the public anon key cannot trigger processing cycles.
  const secret = requiredEnv('EMAIL_PROCESSOR_SECRET');
  if (!(await secretMatches(req.headers.get('x-processor-secret'), secret))) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  // Acquire the cycle lease; if another invocation holds it, exit quietly.
  const { data: lockAcquired, error: lockError } = await supabase.rpc('acquire_automation_lock', {
    p_name: LOCK_NAME,
    p_lease_seconds: LOCK_LEASE_SECONDS,
  });
  if (lockError) {
    log('ERROR', 'Failed to acquire automation lock', { error: lockError.message });
    return jsonResponse({ error: 'lock_error' }, 500);
  }
  if (!lockAcquired) {
    log('INFO', 'Another invocation holds the lock, skipping cycle');
    return jsonResponse({ skipped: 'locked' }, 200);
  }

  const deadline = Date.now() + CYCLE_BUDGET_MS;
  const result: { classpass?: CycleStats | { error: string }; resos?: CycleStats | { error: string } } = {};

  try {
    const gmail = new GmailClient(
      requiredEnv('GMAIL_CLIENT_ID'),
      requiredEnv('GMAIL_CLIENT_SECRET'),
      requiredEnv('GMAIL_REFRESH_TOKEN'),
    );
    await gmail.init();

    const lineToken = requiredEnv('LINE_CHANNEL_ACCESS_TOKEN');
    const completedLabel = Deno.env.get('LABEL_COMPLETED') || 'Web Leads - completed';

    const classPass = new ClassPassProcessor(
      gmail, supabase,
      new LineNotifier(lineToken, requiredEnv('LINE_GROUP_ID_CLASSPASS'), 'CLASSPASS'),
      Deno.env.get('LABEL_CLASSPASS') || 'Web Leads (ClassPass)',
      completedLabel, 'classpass', 'ClassPass', deadline,
    );
    const webResos = new WebResosProcessor(
      gmail, supabase,
      new LineNotifier(lineToken, requiredEnv('LINE_GROUP_ID_WEBRESOS'), 'RESOS'),
      Deno.env.get('LABEL_RESOS') || 'Web Leads (ResOS)',
      completedLabel, 'resos', 'ResOS', deadline,
    );

    // Sources run sequentially: both share the Gmail quota and the cycle
    // deadline, and sequential runs keep the logs readable.
    try {
      result.classpass = await classPass.processEmails();
    } catch (error) {
      result.classpass = { error: (error as Error).message };
      log('ERROR', 'ClassPass processing failed', { error: (error as Error).message });
    }
    try {
      result.resos = await webResos.processEmails();
    } catch (error) {
      result.resos = { error: (error as Error).message };
      log('ERROR', 'ResOS processing failed', { error: (error as Error).message });
    }

    log('INFO', 'Cycle complete', result as Record<string, unknown>);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    log('ERROR', 'Cycle failed', { error: (error as Error).message });
    return jsonResponse({ error: (error as Error).message, ...result }, 500);
  } finally {
    const { error: releaseError } = await supabase.rpc('release_automation_lock', { p_name: LOCK_NAME });
    if (releaseError) {
      // Not fatal: the lease expires on its own after LOCK_LEASE_SECONDS.
      log('WARN', 'Failed to release automation lock', { error: releaseError.message });
    }
  }
});
