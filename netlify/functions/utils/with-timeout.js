/**
 * Wraps a Netlify function handler with a deadline timeout.
 *
 * Netlify has a hard 10-second limit (26s on paid plans) that kills the
 * function mid-response with no error returned to the client. This wrapper
 * ensures we return a proper 504 response before Netlify kills us, so the
 * frontend can handle it gracefully (retry, show error, etc.) instead of
 * receiving a mysterious connection drop.
 *
 * Usage:
 *   const { withTimeout } = require('./utils/with-timeout');
 *   exports.handler = withTimeout(async (event, context) => {
 *     // ... normal handler logic
 *   });
 */

const DEFAULT_DEADLINE_MS = 8500; // 1.5s buffer before Netlify's 10s limit

function withTimeout(handler, deadlineMs = DEFAULT_DEADLINE_MS) {
  return async (event, context) => {
    // Let OPTIONS (CORS preflight) through immediately — no timeout needed
    if (event.httpMethod === 'OPTIONS') {
      return handler(event, context);
    }

    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          statusCode: 504,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
          body: JSON.stringify({
            error: 'Request took too long',
            timeout: true,
          }),
        });
      }, deadlineMs);
    });

    return Promise.race([handler(event, context), timeout]);
  };
}

module.exports = { withTimeout };
