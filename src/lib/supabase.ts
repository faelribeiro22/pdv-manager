import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export const SUPABASE_URL = 'https://pneenwjnosghjcloskfr.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_ftQms_tSj7I9VbVZ1Wd40Q_mtQ-XSVW'

export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
