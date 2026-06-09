// app/dashboard/layout.tsx
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ count: triagemCount }, { count: filaCount }] = await Promise.all([
    supabase
      .from('respostas_forms')
      .select('*', { count: 'exact', head: true })
      .eq('dedup_status', 'novo'),
    supabase
      .from('familias')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'fila'),
  ])

  return (
    <div className="app-layout">
      <Sidebar
        triagemCount={triagemCount ?? 0}
        filaCount={filaCount ?? 0}
      />
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}