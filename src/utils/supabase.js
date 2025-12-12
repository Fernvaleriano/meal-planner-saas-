import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qewqcjzlfqamqwbccapr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3Fjanpsb3FhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0MDQ2NTksImV4cCI6MjA0Nzk4MDY1OX0.rD_fHjlcAxapvzPV7fWCENn3XCR1YF2KGmhJR4BqHMw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
