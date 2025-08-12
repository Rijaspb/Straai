import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY

// Use placeholder values to prevent crashes when env vars are missing
const placeholderUrl = 'https://placeholder.supabase.co'
const placeholderKey = 'placeholder-key'

let supabase: any

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase environment variables not configured')
  console.warn('   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env')
  console.warn('   Using placeholder values - authentication will not work until configured')
  
  supabase = createClient(placeholderUrl, placeholderKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  })
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  })
}

export { supabase }
