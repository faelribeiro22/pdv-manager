import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { ArrowLeft, Copy, CheckCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../../contexts/auth-context'
import { createSupabaseServerClient } from '../../../lib/auth'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/supabase'
import { createClient } from '@supabase/supabase-js'

const inviteEmployeeFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { establishmentId: string; name: string; email: string; role: string }) => d)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient()

    // Generate a random password
    const password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + '!'

    // Use admin client if available, otherwise use regular signUp
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: authData, error: signUpErr } = await adminClient.auth.signUp({
      email: data.email,
      password,
      options: { data: { name: data.name } },
    })
    if (signUpErr) throw new Error(signUpErr.message)
    const userId = authData.user?.id
    if (!userId) throw new Error('Erro ao criar usuário')

    // Create profile if trigger didn't run
    await supabase.from('profiles').upsert({ id: userId, name: data.name })

    // Add as member
    const { error: memberErr } = await supabase.from('establishment_members').insert({
      establishment_id: data.establishmentId,
      user_id: userId,
      role: data.role,
    })
    if (memberErr) throw new Error(memberErr.message)

    return { email: data.email, password, name: data.name }
  })

interface InviteForm {
  name: string
  email: string
  role: string
}

export const Route = createFileRoute('/app/funcionarios/novo')({
  component: NovoFuncionarioPage,
})

function NovoFuncionarioPage() {
  const navigate = useNavigate()
  const { currentEstablishment } = useAuth()
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<InviteForm>({
    defaultValues: { role: 'cashier' }
  })

  const onSubmit = async (data: InviteForm) => {
    if (!currentEstablishment) return
    setError(null)
    try {
      const result = await inviteEmployeeFn({
        data: {
          establishmentId: currentEstablishment.id,
          name: data.name,
          email: data.email,
          role: data.role,
        },
      })
      setCredentials(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao convidar funcionário')
    }
  }

  const copyCredentials = () => {
    if (!credentials) return
    navigator.clipboard.writeText(`E-mail: ${credentials.email}\nSenha: ${credentials.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (credentials) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Funcionário Criado!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Compartilhe as credenciais abaixo com <strong>{credentials.name}</strong></p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left mb-4 font-mono text-sm">
            <p className="text-gray-600 dark:text-gray-400">E-mail: <span className="text-gray-900 dark:text-white font-semibold">{credentials.email}</span></p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Senha: <span className="text-gray-900 dark:text-white font-semibold">{credentials.password}</span></p>
          </div>
          <button onClick={copyCredentials} className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 mb-3">
            {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? 'Copiado!' : 'Copiar credenciais'}
          </button>
          <button onClick={() => navigate({ to: '/app/funcionarios' })} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold">
            Ver funcionários
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate({ to: '/app/funcionarios' })} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Convidar Funcionário</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-3 text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
          <input
            {...register('name', { required: 'Nome é obrigatório' })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Nome completo"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-mail *</label>
          <input
            {...register('email', { required: 'E-mail é obrigatório' })}
            type="email"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="funcionario@email.com"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo *</label>
          <select
            {...register('role')}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="cashier">Caixa</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">Uma senha aleatória será gerada e exibida após a criação.</p>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate({ to: '/app/funcionarios' })}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-semibold">
            {isSubmitting ? 'Criando...' : 'Criar Funcionário'}
          </button>
        </div>
      </form>
    </div>
  )
}
