import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import { Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCw, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../contexts/auth-context'
import { createSupabaseServerClient } from '../../lib/auth'
import type { Product, StockMovement } from '../../lib/database.types'

const getStockDataFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: establishmentId }) => {
    const supabase = createSupabaseServerClient()
    const [prodsRes, movesRes] = await Promise.all([
      supabase.from('products').select('*').eq('establishment_id', establishmentId).eq('active', true).order('name'),
      supabase.from('stock_movements')
        .select('*, products(name)')
        .eq('establishment_id', establishmentId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    return {
      products: (prodsRes.data ?? []) as Product[],
      movements: (movesRes.data ?? []) as (StockMovement & { products: { name: string } | null })[],
    }
  })

const createMovementFn = createServerFn({ method: 'POST' })
  .validator((d: { establishmentId: string; productId: string; type: 'in' | 'out' | 'adjustment'; qty: number; reason: string; employeeId: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: prod } = await supabase.from('products').select('stock_qty').eq('id', data.productId).single()
    if (!prod) throw new Error('Produto não encontrado')

    let newQty = prod.stock_qty
    if (data.type === 'in') newQty += data.qty
    else if (data.type === 'out') newQty = Math.max(0, newQty - data.qty)
    else newQty = data.qty

    await supabase.from('products').update({ stock_qty: newQty }).eq('id', data.productId)
    await supabase.from('stock_movements').insert({
      establishment_id: data.establishmentId,
      product_id: data.productId,
      type: data.type,
      qty: data.qty,
      reason: data.reason,
      reference_type: 'manual',
      employee_id: data.employeeId,
    })
  })

interface MovForm { type: 'in' | 'out' | 'adjustment'; qty: string; reason: string }

export const Route = createFileRoute('/app/estoque')({
  component: EstoquePage,
})

function EstoquePage() {
  const { currentEstablishment, user } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof getStockDataFn>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<MovForm>({
    defaultValues: { type: 'in' }
  })

  const load = useCallback(async () => {
    if (!currentEstablishment) return
    setLoading(true)
    const res = await getStockDataFn({ data: currentEstablishment.id })
    setData(res)
    setLoading(false)
  }, [currentEstablishment])

  useEffect(() => { load() }, [load])

  const onMove = async (form: MovForm) => {
    if (!selectedProduct || !currentEstablishment || !user) return
    setError(null)
    try {
      await createMovementFn({
        data: {
          establishmentId: currentEstablishment.id,
          productId: selectedProduct.id,
          type: form.type,
          qty: Number(form.qty),
          reason: form.reason,
          employeeId: user.id,
        },
      })
      setSelectedProduct(null)
      reset()
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro')
    }
  }

  const products = data?.products ?? []
  const lowStock = products.filter((p) => p.stock_qty <= p.min_stock && p.min_stock > 0)
  const outOfStock = products.filter((p) => p.stock_qty <= 0)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          <p className="text-sm text-gray-500 mt-1">Produtos ativos</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{lowStock.length}</p>
          <p className="text-sm text-amber-600 mt-1">Estoque baixo</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{outOfStock.length}</p>
          <p className="text-sm text-red-600 mt-1">Sem estoque</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Products table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-800">Produtos</div>
          {loading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Produto</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Estoque</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Mín</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => {
                    const low = p.stock_qty <= p.min_stock && p.min_stock > 0
                    const out = p.stock_qty <= 0
                    return (
                      <tr key={p.id} className={`hover:bg-gray-50 ${low ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {out ? <AlertTriangle size={13} className="text-red-500" /> : low ? <AlertTriangle size={13} className="text-amber-500" /> : <Package size={13} className="text-gray-300" />}
                            <span className="text-gray-800 truncate max-w-[140px]">{p.name}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${out ? 'text-red-600' : low ? 'text-amber-600' : 'text-gray-800'}`}>
                          {p.stock_qty} {p.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{p.min_stock}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setSelectedProduct(p)}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            Movimentar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Movement history */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-800">Movimentações Recentes</div>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {(data?.movements ?? []).length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">Nenhuma movimentação</p>
            ) : (
              data?.movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${m.type === 'in' ? 'bg-green-100' : m.type === 'out' ? 'bg-red-100' : 'bg-blue-100'}`}>
                    {m.type === 'in' ? <ArrowUp size={13} className="text-green-600" /> : m.type === 'out' ? <ArrowDown size={13} className="text-red-600" /> : <RefreshCw size={13} className="text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{(m as any).products?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{m.reason ?? '—'} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <span className={`text-sm font-bold ${m.type === 'in' ? 'text-green-600' : m.type === 'out' ? 'text-red-600' : 'text-blue-600'}`}>
                    {m.type === 'in' ? '+' : m.type === 'out' ? '-' : '='}{m.qty}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Movement modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{selectedProduct.name}</h2>
              <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Estoque atual: <span className="font-semibold text-gray-800">{selectedProduct.stock_qty} {selectedProduct.unit}</span></p>
            <form onSubmit={handleSubmit(onMove)} className="space-y-4">
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select {...register('type')} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="in">Entrada</option>
                  <option value="out">Saída</option>
                  <option value="adjustment">Ajuste (definir valor absoluto)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
                <input {...register('qty', { required: true })} type="number" step="0.001" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <input {...register('reason')} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Compra fornecedor, Avaria..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setSelectedProduct(null); reset() }} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-semibold">
                  {isSubmitting ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
