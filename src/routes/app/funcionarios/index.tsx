import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Edit2, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { EstablishmentMember, Profile } from '../../../lib/database.types'

const getMembersFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: establishmentId }) => {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('establishment_members')
      .select('*, profiles(name, avatar_url)')
      .eq('establishment_id', establishmentId)
      .order('created_at')
    return (data ?? []) as (EstablishmentMember & { profiles: Pick<Profile, 'name' | 'avatar_url'> | null })[]
  })

const toggleMemberFn = createServerFn({ method: 'POST' })
  .validator((d: { memberId: string; active: boolean }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    await supabase.from('establishment_members').update({ active: data.active }).eq('id', data.memberId)
  })

const updateRoleFn = createServerFn({ method: 'POST' })
  .validator((d: { memberId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    await supabase.from('establishment_members').update({ role: data.role as never }).eq('id', data.memberId)
  })

const roleLabels: Record<string, string> = { owner: 'Proprietário', admin: 'Admin', cashier: 'Caixa' }
const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-indigo-100 text-indigo-700',
  cashier: 'bg-green-100 text-green-700',
}

export const Route = createFileRoute('/app/funcionarios/')({
  component: FuncionariosPage,
})

function FuncionariosPage() {
  const { currentEstablishment, currentMembership } = useAuth()
  const [members, setMembers] = useState<Awaited<ReturnType<typeof getMembersFn>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentEstablishment) return
    const res = await getMembersFn({ data: currentEstablishment.id })
    setMembers(res)
    setLoading(false)
  }, [currentEstablishment])

  useEffect(() => { load() }, [load])

  const handleToggle = async (memberId: string, active: boolean) => {
    await toggleMemberFn({ data: { memberId, active } })
    load()
  }

  const handleRoleChange = async (memberId: string, role: string) => {
    await updateRoleFn({ data: { memberId, role } })
    load()
  }

  const isOwner = currentMembership?.role === 'owner'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Funcionários</h1>
        <Link
          to="/app/funcionarios/novo"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />Convidar
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum funcionário</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Cargo</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                {isOwner && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className={`hover:bg-gray-50 ${!m.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                        {m.profiles?.name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <span className="font-medium text-gray-800">{m.profiles?.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isOwner && m.role !== 'owner' ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-medium border-0 focus:outline-none cursor-pointer ${roleColors[m.role] ?? ''}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="cashier">Caixa</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleColors[m.role] ?? ''}`}>
                        {roleLabels[m.role] ?? m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => handleToggle(m.id, !m.active)}
                          className="text-gray-400 hover:text-gray-600"
                          title={m.active ? 'Desativar' : 'Ativar'}
                        >
                          {m.active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
