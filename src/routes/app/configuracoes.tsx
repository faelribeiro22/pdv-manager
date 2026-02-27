import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect } from 'react'
import { Save, AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../contexts/auth-context'
import { createSupabaseServerClient } from '../../lib/auth'

const updateEstablishmentFn = createServerFn({ method: 'POST' })
  .validator((d: { id: string; name: string; address?: string; phone?: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('establishments').update({
      name: data.name,
      address: data.address || null,
      phone: data.phone || null,
      updated_at: new Date().toISOString(),
    }).eq('id', data.id)
    if (error) throw new Error(error.message)
  })

const deactivateEstablishmentFn = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    await supabase.from('establishments').update({ active: false }).eq('id', data)
  })

interface SettingsForm {
  name: string
  address: string
  phone: string
}

export const Route = createFileRoute('/app/configuracoes')({
  component: ConfiguracoesPage,
})

function ConfiguracoesPage() {
  const { currentEstablishment, currentMembership, refreshEstablishments, signOut } = useAuth()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const { register, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm<SettingsForm>()

  useEffect(() => {
    if (currentEstablishment) {
      reset({
        name: currentEstablishment.name,
        address: currentEstablishment.address ?? '',
        phone: currentEstablishment.phone ?? '',
      })
    }
  }, [currentEstablishment, reset])

  const onSubmit = async (data: SettingsForm) => {
    if (!currentEstablishment) return
    setError(null)
    try {
      await updateEstablishmentFn({
        data: { id: currentEstablishment.id, name: data.name, address: data.address, phone: data.phone },
      })
      await refreshEstablishments()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  const handleDeactivate = async () => {
    if (!currentEstablishment) return
    await deactivateEstablishmentFn({ data: currentEstablishment.id })
    await signOut()
  }

  const isOwner = currentMembership?.role === 'owner'

  if (!currentEstablishment) {
    return <div className="p-8 text-center text-gray-500">Nenhum estabelecimento selecionado.</div>
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* Establishment info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Dados do Estabelecimento</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
          {saved && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">Alterações salvas!</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do estabelecimento *</label>
            <input
              {...register('name', { required: true })}
              disabled={!isOwner}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input
              {...register('address')}
              disabled={!isOwner}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="Rua, número, bairro"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input
              {...register('phone')}
              disabled={!isOwner}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="pt-1">
            <p className="text-xs text-gray-400 mb-1">Plano: <span className="font-medium text-gray-600 capitalize">{currentEstablishment.plan}</span></p>
          </div>

          {isOwner && (
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              <Save size={16} />
              {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
            </button>
          )}
        </form>
      </div>

      {/* Danger zone */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h2 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} />Zona de Perigo
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Desativar o estabelecimento irá encerrar o acesso de todos os funcionários. Esta ação pode ser revertida por um super administrador.
          </p>
          {!confirmDeactivate ? (
            <button
              onClick={() => setConfirmDeactivate(true)}
              className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Desativar estabelecimento
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-600 font-medium">Tem certeza?</p>
              <button
                onClick={handleDeactivate}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Sim, desativar
              </button>
              <button
                onClick={() => setConfirmDeactivate(false)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
