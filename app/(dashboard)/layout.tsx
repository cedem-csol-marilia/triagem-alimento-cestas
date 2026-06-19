'use client'
// app/(dashboard)/layout.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const supabase = createClient()

  const [loading,         setLoading]         = useState(true)
  const [triagemCount,    setTriagemCount]    = useState(0)
  const [filaCount,       setFilaCount]       = useState(0)
  const [incompletoCount, setIncompletoCount] = useState(0)
  const [naoCasadasCount, setNaoCasadasCount] = useState(0)

  useEffect(() => {
    async function verificar() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      const [{ count: t }, { count: f }, { count: i }, { count: nc }] = await Promise.all([
        supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
        supabase.from('cadastro_incompleto').select('*', { count: 'exact', head: true }),
        supabase.from('entregas_nao_casadas').select('*', { count: 'exact', head: true }).eq('resolvido', false),
      ])

      setTriagemCount(t ?? 0)
      setFilaCount(f ?? 0)
      setIncompletoCount(i ?? 0)
      setNaoCasadasCount(nc ?? 0)
      setLoading(false)
    }
    verificar()
  }, [supabase, router])

  if (loading) return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--areia)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="app-layout">
      <Sidebar
        triagemCount={triagemCount}
        filaCount={filaCount}
        incompletoCount={incompletoCount}
        naoCasadasCount={naoCasadasCount}
      />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}