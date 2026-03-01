import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect } from 'react'
import { ArrowLeft, Barcode } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import type { Category } from '../../../lib/database.types'

const getCategoriesFn = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: cats } = await supabase.from('categories').select('*').eq('establishment_id', data).order('name')
    return cats ?? []
  })

const createCategoryFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { establishmentId: string; name: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: cat } = await supabase.from('categories').insert({ establishment_id: data.establishmentId, name: data.name }).select().single()
    return cat
  })

const createProductFn = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    establishmentId: string
    name: string; barcode?: string; categoryId?: string
    price: number; cost: number; stockQty: number; minStock: number
    unit: string; active: boolean; description?: string
  }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    const { data: p, error } = await supabase.from('products').insert({
      establishment_id: data.establishmentId,
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
    }).select().single()
    if (error) throw new Error(error.message)
    return p
  })

interface ProductForm {
  name: string; barcode: string; categoryId: string
  price: string; cost: string; stockQty: string; minStock: string
  unit: string; active: boolean; description: string
}

export const Route = createFileRoute('/app/produtos/novo')({
  component: NovoProdutoPage,
})

function NovoProdutoPage() {
  const navigate = useNavigate()
  const { currentEstablishment } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const barcodeBuffer = { current: '' }

  const { register, handleSubmit, setValue, watch, formState: { isSubmitting, errors } } = useForm<ProductForm>({
    defaultValues: { unit: 'un', active: true }
  })

  useEffect(() => {
    if (!currentEstablishment) return
    getCategoriesFn({ data: currentEstablishment.id }).then(setCategories)
  }, [currentEstablishment])

  const handleCreateCategory = async () => {
    if (!currentEstablishment || !newCatName.trim()) return
    const cat = await createCategoryFn({ data: { establishmentId: currentEstablishment.id, name: newCatName } })
    if (cat) {
      setCategories((prev) => [...prev, cat])
      setValue('categoryId', cat.id)
    }
    setNewCatName('')
    setShowNewCat(false)
  }

  const onSubmit = async (data: ProductForm) => {
    if (!currentEstablishment) return
    setError(null)
    try {
      await createProductFn({
        data: {
          establishmentId: currentEstablishment.id,
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
      setError(err instanceof Error ? err.message : 'Erro ao criar produto')
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate({ to: '/app/produtos' })} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Novo Produto</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-3 text-sm">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input {...register('name', { required: 'Nome é obrigatório' })}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código de Barras</label>
            <div className="relative">
              <input {...register('barcode')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                placeholder="EAN, QR, etc." />
              <Barcode size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
            <div className="flex gap-2">
              <select {...register('categoryId')}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewCat(!showNewCat)}
                className="px-3 py-2 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
                + Nova
              </button>
            </div>
            {showNewCat && (
              <div className="flex gap-2 mt-2">
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nome da categoria" />
                <button type="button" onClick={handleCreateCategory}
                  className="px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg font-medium">Criar</button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço de Venda *</label>
            <input {...register('price', { required: 'Preço é obrigatório' })} type="number" step="0.01" min="0"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0,00" />
            {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço de Custo</label>
            <input {...register('cost')} type="number" step="0.01" min="0"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0,00" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estoque Atual</label>
            <input {...register('stockQty')} type="number" step="0.001" min="0"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estoque Mínimo</label>
            <input {...register('minStock')} type="number" step="0.001" min="0"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidade</label>
            <select {...register('unit')}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {['un', 'kg', 'g', 'l', 'ml', 'cx', 'm'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input {...register('active')} type="checkbox" id="active" className="rounded text-indigo-600 dark:text-indigo-400" />
            <label htmlFor="active" className="text-sm font-medium text-gray-700 dark:text-gray-300">Produto ativo</label>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <textarea {...register('description')} rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Descrição do produto (opcional)" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate({ to: '/app/produtos' })}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-semibold">
            {isSubmitting ? 'Salvando...' : 'Criar Produto'}
          </button>
        </div>
      </form>
    </div>
  )
}
