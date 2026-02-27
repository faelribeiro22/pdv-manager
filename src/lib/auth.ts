import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { getRequest } from '@tanstack/react-start/server'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'
import type { Database } from './database.types'

export function createSupabaseServerClient() {
  const request = getRequest()
  const cookieHeader = request?.headers.get('cookie') ?? ''

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader)
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          void serializeCookieHeader(name, value, options)
        })
      },
    },
  })
}

export async function getServerSession() {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getServerUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
