import { supabase } from './supabase';

// Get auth token for API calls
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// Authenticated fetch wrapper
async function authenticatedFetch(url, options = {}) {
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// API helper methods
export async function apiGet(url) {
  return authenticatedFetch(url, { method: 'GET' });
}

export async function apiPost(url, data) {
  return authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function apiPut(url, data) {
  return authenticatedFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function apiDelete(url) {
  return authenticatedFetch(url, { method: 'DELETE' });
}
