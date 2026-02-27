'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Establishment, EstablishmentMember } from '../lib/database.types'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  establishments: Establishment[]
  currentEstablishment: Establishment | null
  currentMembership: EstablishmentMember | null
  loading: boolean
  setCurrentEstablishment: (id: string) => void
  signOut: () => Promise<void>
  refreshEstablishments: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [currentEstablishment, setCurrentEstablishmentState] = useState<Establishment | null>(null)
  const [currentMembership, setCurrentMembership] = useState<EstablishmentMember | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }, [])

  const loadEstablishments = useCallback(async (userId: string) => {
    const { data: members } = await supabase
      .from('establishment_members')
      .select('establishment_id')
      .eq('user_id', userId)
      .eq('active', true)

    if (!members?.length) {
      setEstablishments([])
      return []
    }

    const ids = members.map((m) => m.establishment_id)
    const { data: estabs } = await supabase
      .from('establishments')
      .select('*')
      .in('id', ids)
      .eq('active', true)

    const list = estabs ?? []
    setEstablishments(list)
    return list
  }, [])

  const loadMembership = useCallback(async (userId: string, establishmentId: string) => {
    const { data } = await supabase
      .from('establishment_members')
      .select('*')
      .eq('user_id', userId)
      .eq('establishment_id', establishmentId)
      .single()
    setCurrentMembership(data)
  }, [])

  const setCurrentEstablishment = useCallback((id: string) => {
    const estab = establishments.find((e) => e.id === id)
    if (estab) {
      setCurrentEstablishmentState(estab)
      localStorage.setItem('pdv_establishment_id', id)
      if (user) loadMembership(user.id, id)
    }
  }, [establishments, user, loadMembership])

  const refreshEstablishments = useCallback(async () => {
    if (user) {
      const list = await loadEstablishments(user.id)
      if (list.length > 0) {
        const stored = localStorage.getItem('pdv_establishment_id')
        const target = list.find((e) => e.id === stored) ?? list[0]
        setCurrentEstablishmentState(target)
        loadMembership(user.id, target.id)
      }
    }
  }, [user, loadEstablishments, loadMembership])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        await loadProfile(u.id)
        const list = await loadEstablishments(u.id)
        if (list.length > 0) {
          const stored = localStorage.getItem('pdv_establishment_id')
          const target = list.find((e) => e.id === stored) ?? list[0]
          setCurrentEstablishmentState(target)
          await loadMembership(u.id, target.id)
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        await loadProfile(u.id)
        const list = await loadEstablishments(u.id)
        if (list.length > 0) {
          const stored = localStorage.getItem('pdv_establishment_id')
          const target = list.find((e) => e.id === stored) ?? list[0]
          setCurrentEstablishmentState(target)
          await loadMembership(u.id, target.id)
        }
      } else {
        setProfile(null)
        setEstablishments([])
        setCurrentEstablishmentState(null)
        setCurrentMembership(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile, loadEstablishments, loadMembership])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('pdv_establishment_id')
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      establishments,
      currentEstablishment,
      currentMembership,
      loading,
      setCurrentEstablishment,
      signOut,
      refreshEstablishments,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
