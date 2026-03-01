import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

interface RegisterForm {
  name: string
  email: string
  password: string
  establishmentName: string
  address: string
  phone: string
}

function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, getValues, formState: { isSubmitting, errors } } = useForm<RegisterForm>()

  const goToStep2 = () => {
    const { name, email, password } = getValues()
    if (!name || !email || !password) return
    setStep(2)
  }

  const onSubmit = async (data: RegisterForm) => {
    setError(null)
    try {
      // Create auth user
      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { name: data.name } },
      })
      if (signUpErr) throw signUpErr
      const userId = authData.user?.id
      if (!userId) throw new Error('Falha ao criar usuário')

      // Create establishment
      const slug = data.establishmentName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)

      const { error: estabErr } = await supabase
        .from('establishments')
        .insert({
          name: data.establishmentName,
          slug,
          address: data.address || null,
          phone: data.phone || null,
          owner_id: userId,
        })
      if (estabErr) throw estabErr

      // Membership is auto-created by DB trigger on establishment insert

      navigate({ to: '/app' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">PDV Manager</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Criar nova conta</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          {/* Step indicator */}
          <div className="flex items-center mb-6">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>1</div>
            <div className={`flex-1 h-1 mx-2 rounded ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>2</div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            {step === 1 && (
              <>
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">Dados pessoais</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome completo</label>
                  <input
                    {...register('name', { required: 'Nome é obrigatório' })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Seu nome"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
                  <input
                    {...register('email', { required: 'E-mail é obrigatório' })}
                    type="email"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="seu@email.com"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                  <input
                    {...register('password', { required: 'Senha é obrigatória', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })}
                    type="password"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={goToStep2}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  Próximo
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">Dados do estabelecimento</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do estabelecimento *</label>
                  <input
                    {...register('establishmentName', { required: 'Nome do estabelecimento é obrigatório' })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Ex: Loja do João"
                  />
                  {errors.establishmentName && <p className="text-red-500 text-xs mt-1">{errors.establishmentName.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço (opcional)</label>
                  <input
                    {...register('address')}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Rua, número, bairro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone (opcional)</label>
                  <input
                    {...register('phone')}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                  >
                    {isSubmitting ? 'Criando...' : 'Criar conta'}
                  </button>
                </div>
              </>
            )}
          </form>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Já tem conta?{' '}
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
