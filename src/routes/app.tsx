import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Package, Warehouse,
  Users, BarChart2, Settings, Menu, X, ChevronDown, LogOut, Building2
} from 'lucide-react'
import { useAuth } from '../contexts/auth-context'

export const Route = createFileRoute('/app')({
  component: AppLayout,
})

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/caixa', label: 'Caixa / PDV', icon: ShoppingCart },
  { to: '/app/comandas', label: 'Comandas', icon: ClipboardList },
  { to: '/app/produtos', label: 'Produtos', icon: Package },
  { to: '/app/estoque', label: 'Estoque', icon: Warehouse },
  { to: '/app/funcionarios', label: 'Funcionários', icon: Users, adminOnly: true },
  { to: '/app/relatorios', label: 'Relatórios', icon: BarChart2 },
  { to: '/app/configuracoes', label: 'Configurações', icon: Settings },
]

function AppLayout() {
  const { user, profile, establishments, currentEstablishment, currentMembership, loading, setCurrentEstablishment, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [estabMenuOpen, setEstabMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const location = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: '/login' })
    }
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin'
  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin)

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <ShoppingCart size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">PDV Manager</span>
        </div>
      </div>

      {/* Establishment selector */}
      {establishments.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-200">
          <div className="relative">
            <button
              onClick={() => setEstabMenuOpen(!estabMenuOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-left"
            >
              <Building2 size={16} className="text-indigo-600 shrink-0" />
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                {currentEstablishment?.name ?? 'Selecionar'}
              </span>
              {establishments.length > 1 && <ChevronDown size={14} className="text-gray-400" />}
            </button>
            {estabMenuOpen && establishments.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {establishments.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setCurrentEstablishment(e.id); setEstabMenuOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${e.id === currentEstablishment?.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map(({ to, label, icon: Icon }) => {
          const active = location.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User menu bottom */}
      <div className="px-3 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-sm">
            {profile?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{profile?.name}</p>
            <p className="text-xs text-gray-500 truncate">{currentMembership?.role}</p>
          </div>
          <button
            onClick={signOut}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-800 flex-1">{currentEstablishment?.name ?? 'PDV Manager'}</span>
          <button onClick={signOut} className="text-gray-400 hover:text-red-500">
            <LogOut size={18} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
