/**
 * Error utility functions for handling transient vs permanent errors
 */

/**
 * List of error patterns that indicate transient (retryable) errors
 * These are typically network issues, timeouts, or temporary service unavailability
 */
const TRANSIENT_ERROR_PATTERNS = [
  // Network errors
  'fetch failed',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'socket hang up',
  'network error',

  // Timeout errors
  'timeout',
  'timed out',
  'ESOCKETTIMEDOUT',

  // Temporary service errors
  'service unavailable',
  '503',
  '502',
  '504',
  'bad gateway',
  'gateway timeout',

  // Rate limiting
  'rate limit',
  'too many requests',
  '429',

  // Temporary failures
  'temporary failure',
  'try again',
  'temporarily unavailable'
];

/**
 * Check if an error is transient (retryable)
 * Transient errors are typically network issues or temporary service problems
 * that may resolve on their own if retried later
 *
 * @param {Error|string} error - The error to check
 * @returns {boolean} - True if the error is transient and should be retried
 */
function isTransientError(error) {
  if (!error) return false;

  const errorMessage = typeof error === 'string'
    ? error.toLowerCase()
    : (error.message || '').toLowerCase();

  const errorCode = error?.code?.toLowerCase() || '';
  const errorName = error?.name?.toLowerCase() || '';

  // Check error message, code, and name against transient patterns
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    const lowerPattern = pattern.toLowerCase();
    if (
      errorMessage.includes(lowerPattern) ||
      errorCode.includes(lowerPattern) ||
      errorName.includes(lowerPattern)
    ) {
      return true;
    }
  }

  // Check for TypeError with fetch failed (common in Node.js)
  if (error?.name === 'TypeError' && errorMessage.includes('fetch')) {
    return true;
  }

  // Check for AbortError (request cancelled/timed out)
  if (error?.name === 'AbortError') {
    return true;
  }

  return false;
}

/**
 * Check if an error is permanent (should not be retried)
 * @param {Error|string} error - The error to check
 * @returns {boolean} - True if the error is permanent
 */
function isPermanentError(error) {
  return !isTransientError(error);
}

module.exports = {
  isTransientError,
  isPermanentError,
  TRANSIENT_ERROR_PATTERNS
};
