import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  
  // Usa getSession em vez de getUser para consistência com o middleware
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

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