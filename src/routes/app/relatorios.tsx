import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import { Calendar, TrendingUp, ShoppingBag, Users } from 'lucide-react'
import { useAuth } from '../../contexts/auth-context'
import { createSupabaseServerClient } from '../../lib/auth'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

type DateRange = 'today' | 'week' | 'month' | 'custom'

function getDateRange(range: DateRange, from?: string, to?: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'today') return { from: todayStart, to: now }
  if (range === 'week') {
    const start = new Date(todayStart)
    start.setDate(start.getDate() - start.getDay())
    return { from: start, to: now }
  }
  if (range === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  }
  return { from: from ? new Date(from) : todayStart, to: to ? new Date(to) : now }
}

const getReportsFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { establishmentId: string; from: string; to: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: sales } = await supabase
      .from('sales')
      .select('id, total, discount, created_at, sale_payments(payment_type, amount), sale_items(qty, product_id, products(name))')
      .eq('establishment_id', data.establishmentId)
      .eq('status', 'completed')
      .gte('created_at', data.from)
      .lte('created_at', data.to)
      .order('created_at')

    const list = sales ?? []
    const totalRevenue = list.reduce((s, sale) => s + sale.total, 0)
    const totalDiscount = list.reduce((s, sale) => s + (sale.discount ?? 0), 0)
    const avgTicket = list.length > 0 ? totalRevenue / list.length : 0

    // Payment breakdown
    const byPayment: Record<string, number> = {}
    for (const sale of list) {
      for (const p of (sale.sale_payments ?? [])) {
        byPayment[p.payment_type] = (byPayment[p.payment_type] ?? 0) + p.amount
      }
    }

    // By day
    const byDay: Record<string, number> = {}
    for (const sale of list) {
      const day = sale.created_at.slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + sale.total
    }

    // Top products
    const byProduct: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const sale of list) {
      for (const item of (sale.sale_items ?? [])) {
        const name = (item as any).products?.name ?? 'Desconhecido'
        if (!byProduct[item.product_id]) byProduct[item.product_id] = { name, qty: 0, revenue: 0 }
        byProduct[item.product_id].qty += item.qty
      }
    }
    const topProducts = Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 10)

    return { totalRevenue, totalDiscount, avgTicket, transactionCount: list.length, byPayment, byDay, topProducts }
  })

const paymentLabels: Record<string, string> = { cash: 'Dinheiro', pix: 'PIX', debit: 'Débito', credit: 'Crédito' }

export const Route = createFileRoute('/app/relatorios')({
  component: RelatoriosPage,
})

function RelatoriosPage() {
  const { currentEstablishment } = useAuth()
  const [range, setRange] = useState<DateRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<Awaited<ReturnType<typeof getReportsFn>> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentEstablishment) return
    setLoading(true)
    const { from, to } = getDateRange(range, customFrom, customTo)
    const res = await getReportsFn({
      data: {
        establishmentId: currentEstablishment.id,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    })
    setData(res)
    setLoading(false)
  }, [currentEstablishment, range, customFrom, customTo])

  useEffect(() => { load() }, [load])

  const maxDay = data ? Math.max(...Object.values(data.byDay), 1) : 1
  const maxPayment = data ? Math.max(...Object.values(data.byPayment), 1) : 1

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week', 'month', 'custom'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${range === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              {r === 'today' ? 'Hoje' : r === 'week' ? 'Semana' : r === 'month' ? 'Mês' : 'Personalizado'}
            </button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-gray-400">-</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Receita Total</span>
                <TrendingUp size={18} className="text-green-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(data?.totalRevenue ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Transações</span>
                <ShoppingBag size={18} className="text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data?.transactionCount ?? 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Ticket Médio</span>
                <Users size={18} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(data?.avgTicket ?? 0)}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Descontos</span>
                <Calendar size={18} className="text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(data?.totalDiscount ?? 0)}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Revenue by day */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Receita por Dia</h2>
              {Object.keys(data?.byDay ?? {}).length === 0 ? (
                <p className="text-gray-400 text-sm">Sem dados no período</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data?.byDay ?? {}).slice(-14).map(([day, val]) => (
                    <div key={day}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500 dark:text-gray-400">{new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{fmt(val)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(val / maxDay) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment breakdown */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Por Forma de Pagamento</h2>
              <div className="space-y-3">
                {Object.keys(paymentLabels).map((type) => {
                  const val = data?.byPayment[type] ?? 0
                  const pct = data?.totalRevenue ? (val / data.totalRevenue) * 100 : 0
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{paymentLabels[type]}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{fmt(val)} <span className="text-gray-400 text-xs">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Top products */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Top 10 Produtos (por quantidade)</h2>
            </div>
            {(data?.topProducts ?? []).length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">Sem dados</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Produto</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Qtd vendida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data?.topProducts.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{p.name}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800 dark:text-gray-200 font-bold">{p.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
