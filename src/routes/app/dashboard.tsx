import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { TrendingUp, ShoppingCart, ClipboardList, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/auth-context'
import { createSupabaseServerClient } from '../../lib/auth'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const getDashboardData = createServerFn({ method: 'GET' })
  .validator((establishmentId: string) => establishmentId)
  .handler(async ({ data: establishmentId }) => {
    const supabase = createSupabaseServerClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [salesRes, lowStockRes, openTabsRes, recentSalesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, created_at, sale_payments(payment_type, amount)')
        .eq('establishment_id', establishmentId)
        .eq('status', 'completed')
        .gte('created_at', today.toISOString()),
      supabase
        .from('products')
        .select('id, name, stock_qty, min_stock, unit')
        .eq('establishment_id', establishmentId)
        .eq('active', true)
        .filter('stock_qty', 'lte', 'min_stock'),
      supabase
        .from('tabs')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', establishmentId)
        .eq('status', 'open'),
      supabase
        .from('sales')
        .select('id, total, created_at, sale_items(qty, products(name))')
        .eq('establishment_id', establishmentId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const sales = salesRes.data ?? []
    const totalRevenue = sales.reduce((s, sale) => s + sale.total, 0)
    const avgTicket = sales.length > 0 ? totalRevenue / sales.length : 0

    // Payment breakdown
    const paymentBreakdown: Record<string, number> = {}
    for (const sale of sales) {
      for (const pay of (sale.sale_payments ?? [])) {
        paymentBreakdown[pay.payment_type] = (paymentBreakdown[pay.payment_type] ?? 0) + pay.amount
      }
    }

    return {
      totalRevenue,
      transactionCount: sales.length,
      avgTicket,
      openTabsCount: openTabsRes.count ?? 0,
      paymentBreakdown,
      lowStockProducts: lowStockRes.data ?? [],
      recentSales: recentSalesRes.data ?? [],
    }
  })

export const Route = createFileRoute('/app/dashboard')({
  component: DashboardPage,
})

const paymentLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  debit: 'Débito',
  credit: 'Crédito',
}

function DashboardPage() {
  const { currentEstablishment } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboardData>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstablishment) return
    getDashboardData({ data: currentEstablishment.id })
      .then(setData)
      .finally(() => setLoading(false))
  }, [currentEstablishment])

  if (!currentEstablishment) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Nenhum estabelecimento selecionado.</p>
      </div>
    )
  }

  const maxPayment = data ? Math.max(...Object.values(data.paymentBreakdown), 1) : 1

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Resumo de hoje — {currentEstablishment.name}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Hoje"
              value={fmt(data?.totalRevenue ?? 0)}
              icon={<TrendingUp size={20} className="text-green-500" />}
              color="green"
            />
            <StatCard
              title="Transações"
              value={String(data?.transactionCount ?? 0)}
              icon={<ShoppingCart size={20} className="text-indigo-500" />}
              color="indigo"
            />
            <StatCard
              title="Ticket Médio"
              value={fmt(data?.avgTicket ?? 0)}
              icon={<TrendingUp size={20} className="text-amber-500" />}
              color="amber"
            />
            <StatCard
              title="Tabs Abertas"
              value={String(data?.openTabsCount ?? 0)}
              icon={<ClipboardList size={20} className="text-blue-500" />}
              color="blue"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Payment breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Vendas por Forma de Pagamento</h2>
              <div className="space-y-3">
                {Object.keys(paymentLabels).map((type) => {
                  const val = data?.paymentBreakdown[type] ?? 0
                  const pct = (val / maxPayment) * 100
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{paymentLabels[type]}</span>
                        <span className="font-medium text-gray-800">{fmt(val)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent sales */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Últimas Vendas</h2>
              {!data?.recentSales.length ? (
                <p className="text-gray-500 text-sm">Nenhuma venda hoje.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm text-gray-800">#{sale.id.slice(-6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="font-semibold text-gray-800 text-sm">{fmt(sale.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Low stock alert */}
          {(data?.lowStockProducts.length ?? 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-amber-600" />
                <h2 className="font-semibold text-amber-800">Estoque Baixo</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data?.lowStockProducts.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-amber-200">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-amber-600">{p.stock_qty} {p.unit} / mín {p.min_stock} {p.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-50',
    indigo: 'bg-indigo-50',
    amber: 'bg-amber-50',
    blue: 'bg-blue-50',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{title}</span>
        <div className={`w-8 h-8 ${bgMap[color] ?? 'bg-gray-50'} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
