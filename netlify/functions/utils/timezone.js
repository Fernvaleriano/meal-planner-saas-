/**
 * Timezone utility for getting the correct "today" date based on user's timezone
 *
 * Problem: Server runs in UTC, but users are in different timezones.
 * When a user in Pacific Time (UTC-8) logs food at 11 PM on Dec 15,
 * UTC time is already Dec 16 at 7 AM. Without timezone awareness,
 * the food would be logged to the wrong day.
 *
 * Solution: Accept the user's timezone and calculate their local date.
 */

/**
 * Get today's date string in the user's timezone
 * @param {string} timezone - IANA timezone string (e.g., 'America/Los_Angeles', 'Asia/Bangkok')
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getTodayInTimezone(timezone) {
  try {
    if (!timezone) {
      // Fallback to UTC if no timezone provided
      return new Date().toISOString().split('T')[0];
    }

    // Create a date formatter for the user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    // Format returns YYYY-MM-DD in en-CA locale
    return formatter.format(new Date());
  } catch (error) {
    console.error('Invalid timezone, falling back to UTC:', timezone, error.message);
    // Fallback to UTC if timezone is invalid
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Parse timezone from request query parameters or body
 * @param {object} event - Netlify function event
 * @returns {string|null} Timezone string or null
 */
function getTimezoneFromRequest(event) {
  // Check query parameters first
  const queryTimezone = event.queryStringParameters?.timezone;
  if (queryTimezone) return queryTimezone;

  // Check request body for POST/PUT requests
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      return body.timezone || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get the default date for a request, respecting user's timezone
 * @param {string|null} providedDate - Date provided in request (YYYY-MM-DD)
 * @param {string|null} timezone - User's timezone
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getDefaultDate(providedDate, timezone) {
  if (providedDate) {
    return providedDate;
  }
  return getTodayInTimezone(timezone);
}

module.exports = {
  getTodayInTimezone,
  getTimezoneFromRequest,
  getDefaultDate
};
