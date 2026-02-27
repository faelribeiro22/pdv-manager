import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Plus, Minus, Trash2, Search, X, CheckCircle, Clock } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { Tab, TabItem, Product } from '../../../lib/database.types'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const getTabFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: tabId }) => {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('tabs')
      .select('*, tab_items(*, products(id, name, price, unit, stock_qty))')
      .eq('id', tabId)
      .single()
    return data as Tab & { tab_items: (TabItem & { products: Product })[] } | null
  })

const searchProductsForTab = createServerFn({ method: 'GET' })
  .validator((d: { establishmentId: string; query: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, unit, stock_qty, barcode')
      .eq('establishment_id', data.establishmentId)
      .eq('active', true)
      .or(`name.ilike.%${data.query}%,barcode.eq.${data.query}`)
      .limit(20)
    return products ?? []
  })

const addTabItemFn = createServerFn({ method: 'POST' })
  .validator((d: { tabId: string; productId: string; qty: number; unitPrice: number; subtotal: number; addedBy: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('tab_items').insert({
      tab_id: data.tabId,
      product_id: data.productId,
      qty: data.qty,
      unit_price: data.unitPrice,
      subtotal: data.subtotal,
      added_by: data.addedBy,
    })
    if (error) throw new Error(error.message)
    // Update tab total
    const { data: items } = await supabase
      .from('tab_items')
      .select('subtotal')
      .eq('tab_id', data.tabId)
    const total = (items ?? []).reduce((s, i) => s + i.subtotal, 0)
    await supabase.from('tabs').update({ subtotal: total, total }).eq('id', data.tabId)
  })

const removeTabItemFn = createServerFn({ method: 'POST' })
  .validator((d: { tabItemId: string; tabId: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    await supabase.from('tab_items').delete().eq('id', data.tabItemId)
    const { data: items } = await supabase
      .from('tab_items')
      .select('subtotal')
      .eq('tab_id', data.tabId)
    const total = (items ?? []).reduce((s, i) => s + i.subtotal, 0)
    await supabase.from('tabs').update({ subtotal: total, total }).eq('id', data.tabId)
  })

const closeTabFn = createServerFn({ method: 'POST' })
  .validator((d: {
    tabId: string; establishmentId: string; employeeId: string
    payments: Array<{ type: string; amount: number; receivedAmount?: number; changeAmount?: number }>
    total: number
  }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: tab } = await supabase
      .from('tabs')
      .select('*, tab_items(*, products(id, name, stock_qty))')
      .eq('id', data.tabId)
      .single()
    if (!tab) throw new Error('Comanda não encontrada')

    const items = (tab as any).tab_items ?? []
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        establishment_id: data.establishmentId,
        employee_id: data.employeeId,
        tab_id: data.tabId,
        subtotal: tab.subtotal,
        total: data.total,
        status: 'completed',
      })
      .select()
      .single()
    if (saleErr || !sale) throw new Error(saleErr?.message ?? 'Erro ao criar venda')

    await supabase.from('sale_items').insert(
      items.map((i: any) => ({
        sale_id: sale.id,
        product_id: i.product_id,
        qty: i.qty,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      }))
    )
    await supabase.from('sale_payments').insert(
      data.payments.map((p) => ({
        sale_id: sale.id,
        payment_type: p.type,
        amount: p.amount,
        received_amount: p.receivedAmount ?? null,
        change_amount: p.changeAmount ?? null,
      }))
    )

    // Update stock
    for (const item of items) {
      const prod = item.products
      if (prod) {
        await supabase
          .from('products')
          .update({ stock_qty: Math.max(0, prod.stock_qty - item.qty) })
          .eq('id', prod.id)
        await supabase.from('stock_movements').insert({
          establishment_id: data.establishmentId,
          product_id: prod.id,
          type: 'out',
          qty: item.qty,
          reason: 'Fechamento de comanda',
          reference_type: 'sale',
          reference_id: sale.id,
          employee_id: data.employeeId,
        })
      }
    }

    await supabase.from('tabs').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      sale_id: sale.id,
    }).eq('id', data.tabId)

    return sale
  })

interface Payment { type: 'cash' | 'pix' | 'debit' | 'credit'; amount: number; receivedAmount?: number; changeAmount?: number }
const paymentLabels = { cash: 'Dinheiro', pix: 'PIX', debit: 'Débito', credit: 'Crédito' }

export const Route = createFileRoute('/app/comandas/$tabId')({
  component: TabDetailPage,
})

function TabDetailPage() {
  const { tabId } = Route.useParams()
  const navigate = useNavigate()
  const { currentEstablishment, user } = useAuth()
  const [tab, setTab] = useState<Awaited<ReturnType<typeof getTabFn>>>(null)
  const [loading, setLoading] = useState(true)
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Awaited<ReturnType<typeof searchProductsForTab>>>([])
  const [showPayModal, setShowPayModal] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [activeType, setActiveType] = useState<Payment['type']>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [closed, setClosed] = useState(false)

  const load = useCallback(async () => {
    const res = await getTabFn({ data: tabId })
    setTab(res)
    setLoading(false)
  }, [tabId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!productQuery.trim() || !currentEstablishment) {
      setProductResults([])
      return
    }
    const t = setTimeout(async () => {
      const res = await searchProductsForTab({ data: { establishmentId: currentEstablishment.id, query: productQuery } })
      setProductResults(res)
    }, 300)
    return () => clearTimeout(t)
  }, [productQuery, currentEstablishment])

  const addProduct = async (product: typeof productResults[0]) => {
    if (!tab || !user) return
    await addTabItemFn({
      data: {
        tabId: tab.id,
        productId: product.id,
        qty: 1,
        unitPrice: product.price,
        subtotal: product.price,
        addedBy: user.id,
      },
    })
    setProductQuery('')
    setProductResults([])
    load()
  }

  const removeItem = async (itemId: string) => {
    if (!tab) return
    await removeTabItemFn({ data: { tabItemId: itemId, tabId: tab.id } })
    load()
  }

  const total = tab?.total ?? 0
  const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = total - paymentsTotal

  const addPayment = () => {
    if (remaining <= 0) return
    const amount = activeType === 'cash' && cashReceived
      ? Math.min(Number(cashReceived.replace(',', '.')), remaining + 0.01)
      : remaining
    const received = activeType === 'cash' && cashReceived ? Number(cashReceived.replace(',', '.')) : undefined
    const change = received && received > remaining ? received - remaining : undefined
    setPayments((prev) => [...prev, { type: activeType, amount: Math.min(amount, remaining), receivedAmount: received, changeAmount: change }])
    setCashReceived('')
  }

  const handleClose = async () => {
    if (!tab || !currentEstablishment || !user) return
    setSubmitting(true)
    try {
      await closeTabFn({
        data: {
          tabId: tab.id,
          establishmentId: currentEstablishment.id,
          employeeId: user.id,
          payments,
          total,
        },
      })
      setClosed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>
  if (!tab) return <div className="p-8 text-center text-gray-500">Comanda não encontrada.</div>

  const items = tab.tab_items ?? []
  const elapsedMin = Math.floor((Date.now() - new Date(tab.opened_at).getTime()) / 60000)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate({ to: '/app/comandas' })} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{tab.customer_name}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
            {tab.table_number && <span>Mesa {tab.table_number}</span>}
            <span className="flex items-center gap-1"><Clock size={12} />{elapsedMin < 60 ? `${elapsedMin}min` : `${Math.floor(elapsedMin / 60)}h`}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tab.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {tab.status === 'open' ? 'Aberta' : 'Fechada'}
            </span>
          </div>
        </div>
        {tab.status === 'open' && (
          <button
            onClick={() => setShowPayModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Fechar Comanda
          </button>
        )}
      </div>

      {/* Add product search */}
      {tab.status === 'open' && (
        <div className="relative">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Adicionar produto..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {productResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex justify-between items-center"
                >
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="text-sm font-bold text-indigo-600">{fmt(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Itens ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">Nenhum item na comanda</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{(item as any).products?.name ?? '—'}</p>
                  <p className="text-xs text-gray-500">{item.qty}x {fmt(item.unit_price)}</p>
                </div>
                <span className="font-bold text-gray-800">{fmt(item.subtotal)}</span>
                {tab.status === 'open' && (
                  <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-200 flex justify-between font-bold text-gray-900">
          <span>Total</span>
          <span className="text-indigo-600">{fmt(tab.total)}</span>
        </div>
      </div>

      {/* Payment modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            {closed ? (
              <div className="text-center py-4">
                <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-gray-900 mb-1">Comanda Fechada!</h2>
                <p className="text-3xl font-bold text-indigo-600 mb-6">{fmt(total)}</p>
                <button
                  onClick={() => navigate({ to: '/app/comandas' })}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold"
                >
                  Voltar às Comandas
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Pagamento</h2>
                <p className="text-2xl font-bold text-indigo-600 mb-4">{fmt(total)}</p>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(Object.keys(paymentLabels) as Payment['type'][]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveType(type)}
                      className={`py-2 rounded-lg text-xs font-medium transition-colors ${activeType === type ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {paymentLabels[type]}
                    </button>
                  ))}
                </div>

                {activeType === 'cash' && (
                  <input
                    type="text"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="Valor recebido"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}

                {payments.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-green-50 rounded px-3 py-1.5">
                        <span className="text-gray-600">{paymentLabels[p.type]}</span>
                        <span className="font-medium">{fmt(p.amount)}</span>
                        <button onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 ml-2">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {remaining > 0.01 && (
                      <p className="text-xs text-amber-600 font-medium px-1">Faltam {fmt(remaining)}</p>
                    )}
                  </div>
                )}

                {remaining > 0.01 && (
                  <button onClick={addPayment} className="w-full py-2 border border-indigo-300 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 mb-3">
                    + Adicionar pagamento
                  </button>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setShowPayModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">
                    Cancelar
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={remaining > 0.01 || submitting}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold"
                  >
                    {submitting ? 'Fechando...' : 'Fechar Comanda'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
