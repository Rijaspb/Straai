import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Attempt to load .env from common locations if missing
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Try server/.env
  dotenv.config({ path: path.resolve(__dirname, '../../.env') })
  // Try repo root .env
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Create a dummy client that will fail gracefully
const createDummyClient = () => ({
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: { message: 'Supabase not configured' } }),
    admin: {
      generateLink: () => Promise.resolve({ error: { message: 'Supabase not configured' } })
    }
  }
})

let supabaseAdmin: any

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️  Supabase environment variables not configured')
  console.warn('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file')
  console.warn('   Authentication features will be disabled until configured')
  
  supabaseAdmin = createDummyClient()
} else {
  // Server-side client with service role key for admin operations
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export { supabaseAdmin }
