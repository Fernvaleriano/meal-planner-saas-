/**
 * Authentication utility for Netlify Functions
 * Provides JWT verification and authorization checks
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Standard CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

/**
 * Handle CORS preflight requests
 */
function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  return null;
}

/**
 * Create unauthorized response
 */
function unauthorizedResponse(message = 'Unauthorized') {
  return {
    statusCode: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

/**
 * Create forbidden response
 */
function forbiddenResponse(message = 'Forbidden') {
  return {
    statusCode: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.replace('Bearer ', '');
}

/**
 * Verify JWT token and get user info
 * @param {string} token - JWT token
 * @returns {Promise<{user: object, error: string|null}>}
 */
async function verifyToken(token) {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY not configured');
    return { user: null, error: 'Server configuration error' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('Token verification failed:', error?.message || 'No user found');
      return { user: null, error: 'Invalid or expired token' };
    }

    return { user, error: null };
  } catch (err) {
    console.error('Token verification error:', err);
    return { user: null, error: 'Token verification failed' };
  }
}

/**
 * Authenticate request and verify user owns the coach account
 * @param {object} event - Netlify event object
 * @param {string} coachId - Coach ID to verify ownership
 * @returns {Promise<{user: object|null, error: object|null}>}
 */
async function authenticateCoach(event, coachId) {
  const token = extractToken(event);

  if (!token) {
    return { user: null, error: unauthorizedResponse('Missing authorization token') };
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    return { user: null, error: unauthorizedResponse(error || 'Invalid token') };
  }

  // Verify user ID matches coach ID
  if (user.id !== coachId) {
    console.warn(`Authorization mismatch: Token user ${user.id} tried to access coach ${coachId}`);
    return { user: null, error: forbiddenResponse('Not authorized to access this resource') };
  }

  return { user, error: null };
}

/**
 * Authenticate request and verify user is the client or the client's coach
 * @param {object} event - Netlify event object
 * @param {string} clientId - Client ID to verify access
 * @returns {Promise<{user: object|null, role: string|null, error: object|null}>}
 */
async function authenticateClientAccess(event, clientId) {
  const token = extractToken(event);

  if (!token) {
    return { user: null, role: null, error: unauthorizedResponse('Missing authorization token') };
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    return { user: null, role: null, error: unauthorizedResponse(error || 'Invalid token') };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Check if user is the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, coach_id, user_id')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    return { user: null, role: null, error: forbiddenResponse('Client not found') };
  }

  // Check if user is the client themselves
  if (client.user_id === user.id) {
    return { user, role: 'client', error: null };
  }

  // Check if user is the coach
  if (client.coach_id === user.id) {
    return { user, role: 'coach', error: null };
  }

  console.warn(`Authorization denied: User ${user.id} tried to access client ${clientId}`);
  return { user: null, role: null, error: forbiddenResponse('Not authorized to access this client') };
}

/**
 * Simple authentication - just verify the token is valid
 * @param {object} event - Netlify event object
 * @returns {Promise<{user: object|null, error: object|null}>}
 */
async function authenticateRequest(event) {
  const token = extractToken(event);

  if (!token) {
    return { user: null, error: unauthorizedResponse('Missing authorization token') };
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    return { user: null, error: unauthorizedResponse(error || 'Invalid token') };
  }

  return { user, error: null };
}

/**
 * Rate limiting store (in-memory, resets on function cold start)
 * For production, consider using Redis or a database
 */
const rateLimitStore = new Map();

/**
 * Check rate limit for a user/action combination
 * @param {string} userId - User ID
 * @param {string} action - Action identifier (e.g., 'analyze-photo', 'generate-plan')
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{allowed: boolean, remaining: number, resetIn: number}}
 */
function checkRateLimit(userId, action, maxRequests = 10, windowMs = 60000) {
  const key = `${userId}:${action}`;
  const now = Date.now();

  let record = rateLimitStore.get(key);

  // Clean up old records
  if (record && now > record.resetAt) {
    record = null;
  }

  if (!record) {
    record = {
      count: 0,
      resetAt: now + windowMs
    };
  }

  record.count++;
  rateLimitStore.set(key, record);

  const allowed = record.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - record.count);
  const resetIn = Math.max(0, record.resetAt - now);

  return { allowed, remaining, resetIn };
}

/**
 * Create rate limit exceeded response
 */
function rateLimitResponse(resetIn) {
  return {
    statusCode: 429,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil(resetIn / 1000).toString()
    },
    body: JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil(resetIn / 1000)
    })
  };
}

module.exports = {
  corsHeaders,
  handleCors,
  unauthorizedResponse,
  forbiddenResponse,
  extractToken,
  verifyToken,
  authenticateCoach,
  authenticateClientAccess,
  authenticateRequest,
  checkRateLimit,
  rateLimitResponse
};
