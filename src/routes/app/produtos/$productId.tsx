import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect } from 'react'
import { ArrowLeft, Barcode } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { Category } from '../../../lib/database.types'

const getProductFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: p } = await supabase.from('products').select('*').eq('id', data).single()
    return p
  })

const getCategoriesFn = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: cats } = await supabase.from('categories').select('*').eq('establishment_id', data).order('name')
    return cats ?? []
  })

const updateProductFn = createServerFn({ method: 'POST' })
  .validator((d: {
    id: string; name: string; barcode?: string; categoryId?: string
    price: number; cost: number; stockQty: number; minStock: number
    unit: string; active: boolean; description?: string
  }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('products').update({
      name: data.name,
      barcode: data.barcode || null,
      category_id: data.categoryId || null,
      price: data.price,
      cost: data.cost,
      stock_qty: data.stockQty,
      min_stock: data.minStock,
      unit: data.unit as never,
      active: data.active,
      description: data.description || null,
      updated_at: new Date().toISOString(),
    }).eq('id', data.id)
    if (error) throw new Error(error.message)
  })

interface ProductForm {
  name: string; barcode: string; categoryId: string
  price: string; cost: string; stockQty: string; minStock: string
  unit: string; active: boolean; description: string
}

export const Route = createFileRoute('/app/produtos/$productId')({
  component: EditProductPage,
})

function EditProductPage() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const { currentEstablishment } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<ProductForm>()

  useEffect(() => {
    Promise.all([
      getProductFn({ data: productId }),
      currentEstablishment ? getCategoriesFn({ data: currentEstablishment.id }) : Promise.resolve([]),
    ]).then(([prod, cats]) => {
      setCategories(cats as Category[])
      if (prod) {
        reset({
          name: prod.name,
          barcode: prod.barcode ?? '',
          categoryId: prod.category_id ?? '',
          price: String(prod.price),
          cost: String(prod.cost),
          stockQty: String(prod.stock_qty),
          minStock: String(prod.min_stock),
          unit: prod.unit,
          active: prod.active,
          description: prod.description ?? '',
        })
      }
      setLoading(false)
    })
  }, [productId, currentEstablishment, reset])

  const onSubmit = async (data: ProductForm) => {
    setError(null)
    try {
      await updateProductFn({
        data: {
          id: productId,
          name: data.name,
          barcode: data.barcode,
          categoryId: data.categoryId,
          price: Number(data.price),
          cost: Number(data.cost) || 0,
          stockQty: Number(data.stockQty) || 0,
          minStock: Number(data.minStock) || 0,
          unit: data.unit,
          active: data.active,
          description: data.description,
        },
      })
      navigate({ to: '/app/produtos' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar produto')
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate({ to: '/app/produtos' })} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Editar Produto</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input {...register('name', { required: 'Nome é obrigatório' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras</label>
            <div className="relative">
              <input {...register('barcode')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
              <Barcode size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select {...register('categoryId')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Venda *</label>
            <input {...register('price', { required: true })} type="number" step="0.01" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Custo</label>
            <input {...register('cost')} type="number" step="0.01" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Atual</label>
            <input {...register('stockQty')} type="number" step="0.001" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Mínimo</label>
            <input {...register('minStock')} type="number" step="0.001" min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
            <select {...register('unit')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {['un', 'kg', 'g', 'l', 'ml', 'cx', 'm'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input {...register('active')} type="checkbox" id="active" className="rounded text-indigo-600" />
            <label htmlFor="active" className="text-sm font-medium text-gray-700">Produto ativo</label>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea {...register('description')} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate({ to: '/app/produtos' })}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-semibold">
            {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
