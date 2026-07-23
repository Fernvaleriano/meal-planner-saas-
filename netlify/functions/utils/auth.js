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
    .select('id, coach_id, user_id, trainer_id')
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

  // A gym TRAINER may access a client assigned to them (the gym owns the client;
  // the trainer coaches it). Treated as 'coach' for per-client endpoints, but only
  // for their own assigned clients. Owners/clients never reach this branch.
  if (client.trainer_id != null) {
    const { data: trainerRow } = await supabase
      .from('gym_trainers')
      .select('id, gym_coach_id')
      .eq('trainer_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (trainerRow && trainerRow.gym_coach_id === client.coach_id
        && String(trainerRow.id) === String(client.trainer_id)) {
      return { user, role: 'coach', error: null };
    }
  }

  console.warn(`Authorization denied: User ${user.id} tried to access client ${clientId}`);
  return { user: null, role: null, error: forbiddenResponse('Not authorized to access this client') };
}

/**
 * Resolve an authenticated user to their "gym context" for the multi-trainer
 * feature.
 *
 * Returns one of:
 *   role: 'owner'   → the login owns the gym (an existing coaches row). Their
 *                     gymCoachId is their own id and trainerId is null. This is
 *                     every normal coach today — nothing about them changes.
 *   role: 'trainer' → the login is an active trainer under a gym. gymCoachId is
 *                     the GYM OWNER's id (which is what coach_id points at on all
 *                     clients/assignments), and trainerId scopes them to their
 *                     assigned clients (clients.trainer_id).
 *
 * IMPORTANT: this NEVER changes behavior for a plain coach — an owner always
 * resolves to {role:'owner', gymCoachId: self, trainerId: null}, identical to
 * the old authenticateCoach world. Trainers are the only new case.
 *
 * @param {object} event - Netlify event object
 * @returns {Promise<{user, role, gymCoachId, trainerId, trainer, error}>}
 */
async function resolveGymContext(event) {
  const token = extractToken(event);
  if (!token) {
    return { user: null, role: null, gymCoachId: null, trainerId: null, trainer: null, error: unauthorizedResponse('Missing authorization token') };
  }

  const { user, error } = await verifyToken(token);
  if (error || !user) {
    return { user: null, role: null, gymCoachId: null, trainerId: null, trainer: null, error: unauthorizedResponse(error || 'Invalid token') };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Owner wins: if this user has a coaches row, they ARE a gym. This keeps every
  // existing coach on exactly the old path (gymCoachId = self, no trainer scope).
  const { data: coachRow } = await supabase
    .from('coaches')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (coachRow) {
    return { user, role: 'owner', gymCoachId: user.id, trainerId: null, trainer: null, error: null };
  }

  // Otherwise, are they an active trainer under some gym?
  const { data: trainerRow } = await supabase
    .from('gym_trainers')
    .select('*')
    .eq('trainer_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (trainerRow) {
    return {
      user,
      role: 'trainer',
      gymCoachId: trainerRow.gym_coach_id,
      trainerId: trainerRow.id,
      trainer: trainerRow,
      error: null
    };
  }

  // Neither a coach nor a trainer — not part of any gym.
  return { user, role: null, gymCoachId: null, trainerId: null, trainer: null, error: forbiddenResponse('Not a coach or trainer') };
}

/**
 * Authenticate a request against a gym, allowing EITHER the gym owner OR one of
 * that gym's active trainers. Use this on endpoints that both should reach
 * (e.g. listing clients, assigning workouts) instead of authenticateCoach.
 *
 * The caller passes the gymCoachId it's operating on (the coach_id it would have
 * used before). Owners must match it exactly; trainers must belong to it.
 *
 * @param {object} event
 * @param {string} gymCoachId - the coach_id the request targets
 * @returns {Promise<{user, role, gymCoachId, trainerId, trainer, error}>}
 */
async function authenticateGymMember(event, gymCoachId) {
  const ctx = await resolveGymContext(event);
  if (ctx.error) return ctx;

  if (ctx.gymCoachId !== gymCoachId) {
    console.warn(`Gym mismatch: user ${ctx.user?.id} (role ${ctx.role}) tried to access gym ${gymCoachId}`);
    return { ...ctx, user: null, error: forbiddenResponse('Not authorized to access this gym') };
  }

  return ctx;
}

/**
 * Client-id scope for a trainer, for use on any coach endpoint that returns
 * per-client data. Returns:
 *   - an array of client ids the caller is allowed to see (a TRAINER's assigned
 *     clients under `coachId`), OR
 *   - null → NO extra scoping (the caller is the gym owner, or there's no valid
 *     trainer token). This keeps every owner call byte-for-byte unchanged.
 *
 * Usage in a function that queries a table with a `client_id` column:
 *   const scope = await trainerClientIdScope(event, supabase, coachId);
 *   if (scope) query = query.in('client_id', scope);   // scope=[] → returns nothing
 *
 * Owner-safe and dormant: with no Authorization header this resolves to null.
 * IMPORTANT: for the scoping to actually engage, the PAGE must send the
 * trainer's Bearer token to the endpoint and pass the GYM's id as coachId.
 *
 * @param {object} event
 * @param {object} supabase - a service-key client
 * @param {string} coachId - the gym coach id the request targets
 * @returns {Promise<Array<number>|null>}
 */
async function trainerClientIdScope(event, supabase, coachId, knownCtx) {
  // No token and no already-resolved context → legacy/owner (no scoping).
  if (!knownCtx && !extractToken(event)) return null;
  let ctx = knownCtx;
  if (!ctx) {
    try { ctx = await resolveGymContext(event); } catch (e) { return null; }
  }
  if (ctx && ctx.role === 'trainer') {
    // A trainer's gym comes from their TOKEN, never the request. A call that
    // targets a different gym's coachId is denied (fail closed). An absent
    // coachId still scopes to the token's gym (no bypass by omitting it).
    if (coachId != null && ctx.gymCoachId !== coachId) return [];
    try {
      const { data, error } = await supabase
        .from('clients').select('id')
        .eq('coach_id', ctx.gymCoachId).eq('trainer_id', ctx.trainerId);
      if (error) return [];
      return (data || []).map(c => c.id);
    } catch (e) { return []; }
  }
  return null; // owner or not a trainer → no scoping
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
 * Master/admin account email. Maintenance endpoints that act across ALL
 * coaches (backfills, global exercise cleanup, diagnostics) must be limited to
 * this account. Verified via a real signed JWT, never a client-supplied value.
 */
const MASTER_EMAIL = 'contact@ziquefitness.com';

/**
 * Authenticate a request and require it to be the master/admin account.
 * @param {object} event - Netlify event object
 * @returns {Promise<{user: object|null, error: object|null}>}
 */
async function authenticateMaster(event) {
  const token = extractToken(event);
  if (!token) {
    return { user: null, error: unauthorizedResponse('Missing authorization token') };
  }
  const { user, error } = await verifyToken(token);
  if (error || !user) {
    return { user: null, error: unauthorizedResponse(error || 'Invalid token') };
  }
  if ((user.email || '').toLowerCase() !== MASTER_EMAIL) {
    return { user: null, error: forbiddenResponse('Admin only') };
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
 * Durable rate limit check backed by Postgres (rate_limit_counters +
 * bump_rate_limit()). Unlike checkRateLimit above, this survives cold starts
 * and is shared across function instances. Fails OPEN: if the DB call errors,
 * the request is allowed (rate limiting must never take a feature down), but
 * the in-memory counter still applies as a same-instance backstop.
 *
 * @param {string} userId - User ID (or IP for unauthenticated callers)
 * @param {string} action - Action identifier (e.g. 'meal-image')
 * @param {number} maxRequests - Maximum requests allowed per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, resetIn: number}>}
 */
async function checkRateLimitDurable(userId, action, maxRequests = 10, windowMs = 60000) {
  const local = checkRateLimit(userId, action, maxRequests, windowMs);
  if (!local.allowed) return local;

  if (!SUPABASE_SERVICE_KEY) return local;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: count, error } = await supabase.rpc('bump_rate_limit', {
      p_key: `${action}:${userId}`,
      p_window_seconds: Math.ceil(windowMs / 1000)
    });
    if (error || typeof count !== 'number') {
      if (error) console.error('Durable rate limit check failed (allowing request):', error.message || error);
      return local;
    }
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetIn: windowMs
    };
  } catch (err) {
    console.error('Durable rate limit check failed (allowing request):', err.message);
    return local;
  }
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
  authenticateMaster,
  resolveGymContext,
  authenticateGymMember,
  trainerClientIdScope,
  checkRateLimit,
  checkRateLimitDurable,
  rateLimitResponse
};
