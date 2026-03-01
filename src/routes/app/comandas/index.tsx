import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect } from 'react'
import { Plus, Clock, Users, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { Tab } from '../../../lib/database.types'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const getTabsFn = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: establishmentId }) => {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('tabs')
      .select('*, tab_items(id)')
      .eq('establishment_id', establishmentId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
    return (data ?? []) as (Tab & { tab_items: { id: string }[] })[]
  })

const createTabFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { establishmentId: string; employeeId: string; customerName: string; tableNumber: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: tab, error } = await supabase
      .from('tabs')
      .insert({
        establishment_id: data.establishmentId,
        employee_id: data.employeeId,
        customer_name: data.customerName,
        table_number: data.tableNumber || null,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return tab
  })

interface NewTabForm {
  customerName: string
  tableNumber: string
}

export const Route = createFileRoute('/app/comandas/')({
  component: ComandasPage,
})

function elapsed(opened: string) {
  const ms = Date.now() - new Date(opened).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
}

function tabColor(opened: string) {
  const m = Math.floor((Date.now() - new Date(opened).getTime()) / 60000)
  if (m >= 120) return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
  if (m >= 60) return 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
  return 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
}

function tabBadge(opened: string) {
  const m = Math.floor((Date.now() - new Date(opened).getTime()) / 60000)
  if (m >= 120) return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
  if (m >= 60) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
  return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
}

function ComandasPage() {
  const { currentEstablishment, user } = useAuth()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<Awaited<ReturnType<typeof getTabsFn>>>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<NewTabForm>()

  const load = async () => {
    if (!currentEstablishment) return
    setLoading(true)
    const res = await getTabsFn({ data: currentEstablishment.id })
    setTabs(res)
    setLoading(false)
  }

  useEffect(() => { load() }, [currentEstablishment])

  const onCreate = async (data: NewTabForm) => {
    if (!currentEstablishment || !user) return
    await createTabFn({
      data: {
        establishmentId: currentEstablishment.id,
        employeeId: user.id,
        customerName: data.customerName,
        tableNumber: data.tableNumber,
      },
    })
    reset()
    setShowModal(false)
    load()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Comandas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{tabs.length} abertas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /><span className="hidden sm:inline">Nova </span>Comanda
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : tabs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhuma comanda aberta</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate({ to: '/app/comandas/$tabId', params: { tabId: tab.id } })}
              className={`text-left border-2 rounded-xl p-4 hover:shadow-md transition-all ${tabColor(tab.opened_at)}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{tab.customer_name}</h3>
                  {tab.table_number && <p className="text-sm text-gray-500 dark:text-gray-400">Mesa {tab.table_number}</p>}
                </div>
                <ChevronRight size={18} className="text-gray-400 mt-0.5" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tabBadge(tab.opened_at)}`}>
                    <Clock size={11} />{elapsed(tab.opened_at)}
                  </span>
                  <span>{tab.tab_items?.length ?? 0} itens</span>
                </div>
                <span className="font-bold text-gray-800 dark:text-gray-200">{fmt(tab.total)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New tab modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nova Comanda</h2>
            <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do cliente *</label>
                <input
                  {...register('customerName', { required: true })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: João Silva"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mesa (opcional)</label>
                <input
                  {...register('tableNumber')}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: 5"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-semibold">
                  {isSubmitting ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
