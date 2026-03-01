import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Edit2, Trash2, AlertTriangle, Package } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { Product, Category } from '../../../lib/database.types'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const getProductsFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { establishmentId: string; query?: string; categoryId?: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    let q = supabase
      .from('products')
      .select('*, categories(name, color)')
      .eq('establishment_id', data.establishmentId)

    if (data.query) {
      q = q.or(`name.ilike.%${data.query}%,barcode.ilike.%${data.query}%`)
    }
    if (data.categoryId) q = q.eq('category_id', data.categoryId)

    const { data: products } = await q.order('name')
    return (products ?? []) as (Product & { categories: { name: string; color: string } | null })[]
  })

const getCategoriesFn = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: cats } = await supabase.from('categories').select('*').eq('establishment_id', data).order('name')
    return cats ?? []
  })

const deleteProductFn = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    await supabase.from('products').delete().eq('id', data)
  })

export const Route = createFileRoute('/app/produtos/')({
  component: ProdutosPage,
})

function ProdutosPage() {
  const { currentEstablishment } = useAuth()
  const navigate = useNavigate()
  const [products, setProducts] = useState<Awaited<ReturnType<typeof getProductsFn>>>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentEstablishment) return
    setLoading(true)
    const [prods, cats] = await Promise.all([
      getProductsFn({ data: { establishmentId: currentEstablishment.id, query, categoryId } }),
      getCategoriesFn({ data: currentEstablishment.id }),
    ])
    setProducts(prods)
    setCategories(cats)
    setLoading(false)
  }, [currentEstablishment, query, categoryId])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir produto?')) return
    await deleteProductFn({ data: id })
    load()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Produtos</h1>
        <Link
          to="/app/produtos/novo"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />Novo Produto
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou código de barras..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value || undefined)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Produto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 hidden sm:table-cell">Categoria</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Preço</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estoque</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((p) => {
                const lowStock = p.stock_qty <= p.min_stock && p.min_stock > 0
                const outOfStock = p.stock_qty <= 0
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${lowStock ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                          <Package size={14} className="text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{p.name}</p>
                          {p.barcode && <p className="text-xs text-gray-400">{p.barcode}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {p.categories ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: p.categories.color + '20', color: p.categories.color }}>
                          {p.categories.name}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{fmt(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${outOfStock ? 'text-red-600 dark:text-red-400' : lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-200'}`}>
                        {p.stock_qty} {p.unit}
                        {lowStock && !outOfStock && <AlertTriangle size={12} className="inline ml-1" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => navigate({ to: '/app/produtos/$productId', params: { productId: p.id } })}
                          className="text-gray-400 hover:text-indigo-600"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
