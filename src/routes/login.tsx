import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

interface LoginForm {
  email: string
  password: string
}

function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : err.message)
      return
    }
    navigate({ to: '/app' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">PDV Manager</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Acesse sua conta</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
              <input
                {...register('email', { required: true })}
                type="email"
                placeholder="seu@email.com"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
              <input
                {...register('password', { required: true })}
                type="password"
                placeholder="••••••••"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Não tem conta?{' '}
            <Link to="/register" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              Criar estabelecimento
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
