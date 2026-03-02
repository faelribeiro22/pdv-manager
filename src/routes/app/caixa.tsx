import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, Minus, Trash2, X, CheckCircle, Package, ShoppingCart, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/auth-context'
import { createSupabaseServerClient } from '../../lib/auth'
import type { Product, Category } from '../../lib/database.types'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// Server functions
const searchProductsFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { establishmentId: string; query: string; categoryId?: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()
    let q = supabase
      .from('products')
      .select('*, categories(name, color)')
      .eq('establishment_id', data.establishmentId)
      .eq('active', true)
      .limit(40)

    if (data.query) {
      q = q.or(`name.ilike.%${data.query}%,barcode.eq.${data.query}`)
    }
    if (data.categoryId) {
      q = q.eq('category_id', data.categoryId)
    }

    const { data: products } = await q.order('name')
    return products ?? []
  })

const getCategoriesFn = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => id)
  .handler(async ({ data: establishmentId }) => {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('name')
    return data ?? []
  })

const createSaleFn = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    establishmentId: string
    employeeId: string
    items: Array<{ productId: string; qty: number; unitPrice: number; subtotal: number }>
    payments: Array<{ type: string; amount: number; receivedAmount?: number; changeAmount?: number }>
    subtotal: number
    discount: number
    total: number
  }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        establishment_id: data.establishmentId,
        employee_id: data.employeeId,
        subtotal: data.subtotal,
        discount: data.discount,
        total: data.total,
        status: 'completed',
      })
      .select()
      .single()

    if (error || !sale) throw new Error(error?.message ?? 'Erro ao criar venda')

    await supabase.from('sale_items').insert(
      data.items.map((item) => ({
        sale_id: sale.id,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
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
    for (const item of data.items) {
      await supabase.rpc('rpc_decrement_stock' as never, {
        p_product_id: item.productId,
        p_qty: item.qty,
      }).then(() => {})
      // Fallback: direct update
      const { data: prod } = await supabase
        .from('products')
        .select('stock_qty')
        .eq('id', item.productId)
        .single()
      if (prod) {
        await supabase
          .from('products')
          .update({ stock_qty: Math.max(0, prod.stock_qty - item.qty) })
          .eq('id', item.productId)
      }
      await supabase.from('stock_movements').insert({
        establishment_id: data.establishmentId,
        product_id: item.productId,
        type: 'out',
        qty: item.qty,
        reason: 'Venda',
        reference_type: 'sale',
        reference_id: sale.id,
        employee_id: data.employeeId,
      })
    }

    return sale
  })

interface CartItem {
  product: Product & { categories?: { name: string; color: string } | null }
  qty: number
  unitPrice: number
  subtotal: number
}

interface Payment {
  type: 'cash' | 'pix' | 'debit' | 'credit'
  amount: number
  receivedAmount?: number
  changeAmount?: number
}

const paymentLabels = { cash: 'Dinheiro', pix: 'PIX', debit: 'Débito', credit: 'Crédito' }

export const Route = createFileRoute('/app/caixa')({
  component: CaixaPage,
})

function CaixaPage() {
  const { currentEstablishment, user } = useAuth()
  const [products, setProducts] = useState<ReturnType<typeof searchProductsFn> extends Promise<infer T> ? T : never>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [payments, setPayments] = useState<Payment[]>([])
  const [activePaymentType, setActivePaymentType] = useState<Payment['type']>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [successSale, setSuccessSale] = useState<{ id: string; total: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeBuffer = useRef('')
  const barcodeTimer = useRef<ReturnType<typeof setTimeout>>()

  const loadProducts = useCallback(async (q: string, catId?: string) => {
    if (!currentEstablishment) return
    const res = await searchProductsFn({ data: { establishmentId: currentEstablishment.id, query: q, categoryId: catId } })
    setProducts(res as typeof products)
  }, [currentEstablishment])

  useEffect(() => {
    if (!currentEstablishment) return
    getCategoriesFn({ data: currentEstablishment.id }).then(setCategories)
    loadProducts('', undefined)
  }, [currentEstablishment, loadProducts])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(query, categoryId)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, categoryId, loadProducts])

  // Barcode scanner support: rapid keyboard input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement === searchRef.current) return
      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 3) {
          setQuery(barcodeBuffer.current)
        }
        barcodeBuffer.current = ''
        clearTimeout(barcodeTimer.current)
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = ''
        }, 100)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const addToCart = (product: typeof products[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.unitPrice }
            : i
        )
      }
      return [...prev, { product, qty: 1, unitPrice: product.price, subtotal: product.price }]
    })
  }

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => i.product.id === productId
          ? { ...i, qty: i.qty + delta, subtotal: (i.qty + delta) * i.unitPrice }
          : i
        )
        .filter((i) => i.qty > 0)
    )
  }

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, qty, subtotal: qty * i.unitPrice }
          : i
      )
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const total = Math.max(0, subtotal - discount)
  const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = total - paymentsTotal

  const addPayment = () => {
    if (remaining <= 0) return
    const inputAmount = paymentAmount ? Number(paymentAmount.replace(',', '.')) : remaining
    const amount = Math.min(Math.max(0, inputAmount), remaining)
    if (amount <= 0) return

    const received = activePaymentType === 'cash' && cashReceived ? Number(cashReceived.replace(',', '.')) : undefined
    const change = received && received > amount ? received - amount : undefined

    setPayments((prev) => [...prev, {
      type: activePaymentType,
      amount,
      receivedAmount: received,
      changeAmount: change,
    }])
    setPaymentAmount('')
    setCashReceived('')
  }

  const removePayment = (i: number) => {
    setPayments((prev) => prev.filter((_, idx) => idx !== i))
  }

  const finishSale = async () => {
    if (!currentEstablishment || !user || cart.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const sale = await createSaleFn({
        data: {
          establishmentId: currentEstablishment.id,
          employeeId: user.id,
          items: cart.map((i) => ({
            productId: i.product.id,
            qty: i.qty,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
          })),
          payments: payments.map((p) => ({
            type: p.type,
            amount: p.amount,
            receivedAmount: p.receivedAmount,
            changeAmount: p.changeAmount,
          })),
          subtotal,
          discount,
          total,
        },
      })
      setSuccessSale({ id: sale.id, total })
      setCart([])
      setDiscount(0)
      setPayments([])
      setPaymentAmount('')
      setCashReceived('')
      loadProducts('', undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar venda')
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentEstablishment) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Nenhum estabelecimento selecionado.</div>
  }

  const CartContent = () => (
    <>
      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ShoppingCart size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Carrinho vazio</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{fmt(item.unitPrice)} / un</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.product.id, -1)} className="w-7 h-7 sm:w-6 sm:h-6 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center">
                    <Minus size={10} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (val > 0) setQty(item.product.id, val)
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || parseInt(e.target.value) <= 0) setQty(item.product.id, 1)
                    }}
                    className="text-sm font-semibold w-10 text-center border border-gray-200 dark:border-gray-700 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button onClick={() => updateQty(item.product.id, 1)} className="w-7 h-7 sm:w-6 sm:h-6 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center">
                    <Plus size={10} />
                  </button>
                </div>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 w-16 text-right">{fmt(item.subtotal)}</span>
                <button onClick={() => removeFromCart(item.product.id)} className="text-gray-300 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + Payment */}
      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-500 dark:text-gray-400">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
            <span>Desconto</span>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.min(Number(e.target.value), subtotal))}
                className="w-20 text-right border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="0,00"
              />
            </div>
          </div>
          <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-gray-200 dark:border-gray-700">
            <span>Total</span><span className="text-indigo-600 dark:text-indigo-400">{fmt(total)}</span>
          </div>
        </div>

        {/* Payment methods */}
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Forma de Pagamento</p>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {(Object.keys(paymentLabels) as Payment['type'][]).map((type) => (
              <button
                key={type}
                onClick={() => setActivePaymentType(type)}
                className={`py-1.5 rounded text-xs font-medium transition-colors ${activePaymentType === type ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              >
                {paymentLabels[type]}
              </button>
            ))}
          </div>
          <div className="space-y-2 mb-2">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                <input
                  type="text"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={remaining.toFixed(2).replace('.', ',')}
                  className="w-full pl-7 pr-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {remaining > 0.01 && payments.length > 0 && (
                <button
                  onClick={() => setPaymentAmount(remaining.toFixed(2).replace('.', ','))}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-medium whitespace-nowrap px-2 border border-indigo-200 dark:border-indigo-800 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                >
                  Restante
                </button>
              )}
            </div>
            {activePaymentType === 'cash' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="Valor recebido (troco)"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {cashReceived && (() => {
                  const payAmt = paymentAmount ? Number(paymentAmount.replace(',', '.')) : remaining
                  const recv = Number(cashReceived.replace(',', '.'))
                  return recv > payAmt ? (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium self-center whitespace-nowrap">
                      Troco: {fmt(recv - payAmt)}
                    </span>
                  ) : null
                })()}
              </div>
            )}
          </div>
          {payments.length > 0 && (
            <div className="space-y-1 mb-2">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                  <span>{paymentLabels[p.type]}</span>
                  <span className="font-medium">{fmt(p.amount)}</span>
                  <button onClick={() => removePayment(i)} className="text-gray-400 hover:text-red-400 ml-2">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {remaining > 0.01 && (
                <div className="flex justify-between text-xs font-medium text-amber-600 dark:text-amber-400 px-2">
                  <span>Faltam</span><span>{fmt(remaining)}</span>
                </div>
              )}
            </div>
          )}
          {remaining > 0.01 && (
            <button
              onClick={addPayment}
              disabled={cart.length === 0}
              className="w-full py-2 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 transition-colors"
            >
              + Adicionar pagamento
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <button
          onClick={finishSale}
          disabled={cart.length === 0 || remaining > 0.01 || submitting}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {submitting ? 'Finalizando...' : 'Finalizar Venda'}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-full relative">
      {/* Left: products */}
      <div className="flex-1 flex flex-col md:border-r border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search + category filter */}
        <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produto ou código de barras..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-400">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setCategoryId(undefined)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!categoryId ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id === categoryId ? undefined : cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${categoryId === cat.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 md:pb-4">
          {products.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-40" />
              <p>Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {products.map((product) => {
                const lowStock = product.stock_qty <= product.min_stock && product.min_stock > 0
                const outOfStock = product.stock_qty <= 0
                return (
                  <button
                    key={product.id}
                    onClick={() => !outOfStock && addToCart(product)}
                    disabled={outOfStock}
                    className={`text-left bg-white dark:bg-gray-900 border rounded-xl p-2.5 sm:p-3 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${lowStock ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    <div className="w-full aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg mb-2 flex items-center justify-center">
                      <Package size={24} className="text-gray-300 sm:hidden" />
                      <Package size={28} className="text-gray-300 hidden sm:block" />
                    </div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{product.name}</p>
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">{fmt(product.price)}</p>
                    <div className={`mt-1 text-xs px-1.5 py-0.5 rounded inline-block ${outOfStock ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : lowStock ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
                      {outOfStock ? 'Sem estoque' : `${product.stock_qty} ${product.unit}`}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop cart sidebar */}
      <div className="hidden md:flex w-80 lg:w-96 flex-col bg-white dark:bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Carrinho {cart.length > 0 && <span className="text-indigo-600 dark:text-indigo-400">({cart.length})</span>}</h2>
        </div>
        <CartContent />
      </div>

      {/* Mobile: floating cart button */}
      {!mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="md:hidden fixed bottom-4 right-4 z-30 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3.5 transition-colors"
        >
          <ShoppingCart size={20} />
          {cart.length > 0 && (
            <>
              <span className="font-semibold">{cart.length}</span>
              <span className="text-indigo-200">|</span>
              <span className="font-bold">{fmt(total)}</span>
            </>
          )}
          {cart.length === 0 && <span className="text-sm font-medium">Carrinho</span>}
        </button>
      )}

      {/* Mobile: cart slide-over */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileCartOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white dark:bg-gray-900 flex flex-col shadow-xl">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button onClick={() => setMobileCartOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                <ArrowLeft size={20} />
              </button>
              <h2 className="font-semibold text-gray-800 dark:text-gray-200 flex-1">Carrinho {cart.length > 0 && <span className="text-indigo-600 dark:text-indigo-400">({cart.length})</span>}</h2>
            </div>
            <CartContent />
          </div>
        </div>
      )}

      {/* Success modal */}
      {successSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
            <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Venda Finalizada!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">#{successSale.id.slice(-8).toUpperCase()}</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-6">{fmt(successSale.total)}</p>
            <button
              onClick={() => { setSuccessSale(null); setMobileCartOpen(false) }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Nova Venda
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

