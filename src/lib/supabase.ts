import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
