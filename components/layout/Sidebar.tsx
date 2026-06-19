'use client'
// components/layout/Sidebar.tsx

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard',   icon: '📊', label: 'Dashboard' },
  { href: '/triagem',     icon: '🔍', label: 'Triagem',             badge: 'triagem' },
  { href: '/incompletos', icon: '📋', label: 'Cadastro incompleto', badge: 'incompleto' },
  { href: '/fila',        icon: '🏆', label: 'Fila',                badge: 'fila' },
  { href: '/entregas',    icon: '🚚', label: 'Entregas' },
  { href: '/nao-casadas', icon: '🔗', label: 'Não casadas',          badge: 'naoCasadas' },
  { href: '/familias',    icon: '👩‍👧', label: 'Famílias' },
  { href: '/configuracoes',  icon: '⚙️', label: 'Configurações' },
  { href: '/como-funciona',  icon: '📖', label: 'Como funciona' },
]

interface SidebarProps {
  triagemCount?:    number
  filaCount?:       number
  incompletoCount?: number
  naoCasadasCount?: number
}

export default function Sidebar({
  triagemCount    = 0,
  filaCount       = 0,
  incompletoCount = 0,
  naoCasadasCount = 0,
}: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const counts: Record<string, number> = {
    triagem:     triagemCount,
    fila:        filaCount,
    incompleto:  incompletoCount,
    naoCasadas:  naoCasadasCount,
  }

  return (
    <aside className="app-sidebar">

      {/* Logo */}
      <div style={{
        padding: 'var(--space-6) var(--space-5)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          fontWeight: 500,
          color: 'var(--palha)',
          lineHeight: 1.3,
        }}>
          🌿 Cestas<br />
          <span style={{
            fontSize: '0.7rem',
            color: 'var(--terra-400)',
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
          }}>
            CEDEM · Gestão
          </span>
        </div>
      </div>

      {/* Navegação */}
      <nav style={{ flex: 1, padding: 'var(--space-4) var(--space-3)', overflowY: 'auto' }}>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const count  = item.badge ? counts[item.badge] : 0

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-1)',
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? 'var(--palha)' : 'var(--terra-400)',
                fontSize: '0.85rem',
                fontWeight: active ? 500 : 400,
                transition: 'all var(--transition)',
                textDecoration: 'none',
                borderLeft: active ? '2px solid var(--ocre-400)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {count > 0 && (
                <span style={{
                  background: 'var(--ocre-400)',
                  color: 'var(--terra-900)',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-pill)',
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{
        padding: 'var(--space-4) var(--space-3)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            border: 'none',
            color: 'var(--terra-500)',
            fontSize: '0.82rem',
            cursor: 'pointer',
            transition: 'all var(--transition)',
          }}
        >
          <span>↩</span>
          Sair
        </button>
      </div>
    </aside>
  )
}