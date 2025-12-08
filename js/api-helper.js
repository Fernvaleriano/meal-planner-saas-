/**
 * API Helper - Adds authentication to all API calls
 * Include this on pages that need to make authenticated API calls
 */

/**
 * Get the current auth token from Supabase
 * @returns {Promise<string|null>} The JWT token or null if not logged in
 */
async function getAuthToken() {
    // Get supabase instance (should be initialized on the page)
    if (typeof supabase === 'undefined') {
        console.error('Supabase not initialized');
        return null;
    }

    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

/**
 * Make an authenticated API call
 * @param {string} endpoint - The API endpoint (e.g., '/.netlify/functions/get-clients')
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} The fetch response
 */
async function authenticatedFetch(endpoint, options = {}) {
    const token = await getAuthToken();

    if (!token) {
        throw new Error('Not authenticated. Please log in.');
    }

    // Merge headers with Authorization
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };

    return fetch(endpoint, {
        ...options,
        headers
    });
}

/**
 * GET request with authentication
 * @param {string} endpoint - The API endpoint
 * @returns {Promise<any>} The JSON response
 */
async function apiGet(endpoint) {
    const response = await authenticatedFetch(endpoint, { method: 'GET' });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

/**
 * POST request with authentication
 * @param {string} endpoint - The API endpoint
 * @param {Object} body - The request body
 * @returns {Promise<any>} The JSON response
 */
async function apiPost(endpoint, body) {
    const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

/**
 * PUT request with authentication
 * @param {string} endpoint - The API endpoint
 * @param {Object} body - The request body
 * @returns {Promise<any>} The JSON response
 */
async function apiPut(endpoint, body) {
    const response = await authenticatedFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

/**
 * DELETE request with authentication
 * @param {string} endpoint - The API endpoint
 * @returns {Promise<any>} The JSON response
 */
async function apiDelete(endpoint) {
    const response = await authenticatedFetch(endpoint, { method: 'DELETE' });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { authenticatedFetch, apiGet, apiPost, apiPut, apiDelete, getAuthToken };
}
