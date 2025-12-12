import { getAuthToken } from './supabase'

async function authenticatedFetch(endpoint, options = {}) {
  const token = await getAuthToken()

  if (!token) {
    throw new Error('Not authenticated. Please log in.')
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  }

  return fetch(endpoint, {
    ...options,
    headers
  })
}

export async function apiGet(endpoint) {
  const response = await authenticatedFetch(endpoint, { method: 'GET' })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}

export async function apiPost(endpoint, body) {
  const response = await authenticatedFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}

export async function apiPut(endpoint, body) {
  const response = await authenticatedFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}

export async function apiDelete(endpoint) {
  const response = await authenticatedFetch(endpoint, { method: 'DELETE' })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}
