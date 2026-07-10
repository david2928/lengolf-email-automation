// Shared utilities for the email-processor edge function.

export function log(severity: string, message: string, metadata: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  }));
}

// Default timeout for outbound HTTP calls. Nothing may hang a cycle indefinitely.
export const HTTP_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = HTTP_TIMEOUT_MS): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function extractPlainText(htmlBody: string): string {
  let text = htmlBody
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<[^>]+>/g, '');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.replace(/\s+/g, ' ').trim();
}

const TRANSIENT_ERROR_PATTERNS = [
  'fetch failed', 'econnreset', 'econnrefused', 'etimedout', 'enotfound',
  'eai_again', 'enetunreach', 'ehostunreach', 'socket hang up', 'network error',
  'timeout', 'timed out', 'esockettimedout',
  'service unavailable', '503', '502', '504', 'bad gateway', 'gateway timeout',
  'rate limit', 'too many requests', '429',
  'temporary failure', 'try again', 'temporarily unavailable',
  // Deno fetch rejects with TypeError messages shaped differently from
  // Node/undici — connection-level failures must still classify as transient.
  'error sending request', 'client error (connect', 'connection closed',
  'connection reset', 'connection refused', 'dns error',
];

export function isTransientError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { message?: string; code?: string; name?: string; cause?: unknown };
  const message = (typeof error === 'string' ? error : err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (message.includes(pattern) || code.includes(pattern) || name.includes(pattern)) return true;
  }
  if (name === 'typeerror' && message.includes('fetch')) return true;
  if (name === 'aborterror' || name === 'timeouterror') return true;
  // Wrapped errors (service layer throws plain Errors) keep the original as cause.
  if (typeof error === 'object' && err.cause) return isTransientError(err.cause);
  return false;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Deterministic date parse for month-name dates like "January 15, 2025" or
 * "Jan 11, 2026". Never goes through Date/toISOString, so it cannot shift a
 * day based on the runtime timezone (the bug that hit the Cloud Run version).
 * Returns YYYY-MM-DD or null.
 */
export function parseMonthNameDate(input: string): string | null {
  const m = input.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

/**
 * Parse "2:00 PM" or "14:00" to HH:mm (24-hour).
 */
export function parseTimeToStandard(timeString: string): string {
  const cleaned = timeString.trim();
  if (/[AP]M/i.test(cleaned)) {
    const match = cleaned.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!match) throw new Error(`Invalid 12-hour time format: ${timeString}`);
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    else if (period === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  const match = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (!match) throw new Error(`Invalid time format: ${timeString}`);
  const hours = parseInt(match[1], 10);
  if (hours < 0 || hours > 23) throw new Error(`Invalid hour value: ${hours}`);
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/**
 * Add duration hours to an HH:mm time, wrapping at midnight.
 */
export function calculateEndTime24(startTime: string, duration: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + Math.round(duration * 60);
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function ordinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Format YYYY-MM-DD as "Sat, 13th December" using UTC math only —
 * deterministic regardless of runtime timezone.
 */
export function formatDisplayDate(dateString: string): string {
  const m = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateString;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = date.getUTCDate();
  return `${WEEKDAYS[date.getUTCDay()]}, ${day}${ordinalSuffix(day)} ${MONTH_NAMES[date.getUTCMonth()]}`;
}
