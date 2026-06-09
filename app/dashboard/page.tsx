// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const revalidate = 60 // revalida a cada 60s

export default async function DashboardPage() {
  const supabase = createClient()

  const [
    { count: naFila },
    { count: confirmadas },
    { count: ativas },
    { count: triagem },
    { count: entregasPendentes },
    { count: totalRespostas },
  ] = await Promise.all([
    supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
    supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'confirmada'),
    supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'ativa'),
    supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
    supabase.from('entregas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    supabase.from('respostas_forms').select('*', { count: 'exact', head: true }),
  ])

  // Próximas entregas (este mês)
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const { data: proximasEntregas } = await supabase
    .from('painel_entregas')
    .select('*')
    .eq('mes_referencia', mesAtual)
    .eq('status', 'pendente')
    .limit(5)

  const stats = [
    { label: 'Na fila',         value: naFila ?? 0,           sub: 'aguardando seleção',    color: 'var(--terra-400)', href: '/fila' },
    { label: 'Confirmadas',     value: confirmadas ?? 0,      sub: 'próximo ciclo',          color: 'var(--ocre-400)',  href: '/fila' },
    { label: 'Recebendo',       value: ativas ?? 0,           sub: 'ciclo em andamento',     color: 'var(--musgo-500)', href: '/entregas' },
    { label: 'Triagem pendente',value: triagem ?? 0,          sub: 'aguardam sua decisão',   color: triagem ? 'var(--mogno-500)' : 'var(--terra-300)', href: '/triagem' },
    { label: 'Entregas do mês', value: entregasPendentes ?? 0,sub: 'a confirmar este mês',   color: 'var(--terra-600)', href: '/entregas' },
    { label: 'Total respostas', value: totalRespostas ?? 0,   sub: 'respostas recebidas',    color: 'var(--terra-300)', href: '/familias' },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="page-content">

        {/* Alerta de triagem pendente */}
        {(triagem ?? 0) > 0 && (
          <Link href="/triagem" style={{ textDecoration: 'none' }}>
            <div className="alert alert-warning" style={{ cursor: 'pointer' }}>
              <span>⚠️</span>
              <span>
                <strong>{triagem} resposta{triagem !== 1 ? 's' : ''}</strong> aguarda{triagem === 1 ? '' : 'm'} triagem —
                possíveis duplicatas identificadas. Clique para revisar.
              </span>
            </div>
          </Link>
        )}

        {/* Stats */}
        <div className="stats-grid">
          {stats.map(stat => (
            <Link key={stat.label} href={stat.href} style={{ textDecoration: 'none' }}>
              <div className="stat-card" style={{
                borderTop: `3px solid ${stat.color}`,
                transition: 'transform var(--transition), box-shadow var(--transition)',
                cursor: 'pointer',
              }}>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
                <div className="stat-sub">{stat.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Próximas entregas */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-4)',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 500,
              color: 'var(--terra-800)',
            }}>
              Entregas pendentes este mês
            </h2>
            <Link href="/entregas" className="btn btn-ghost btn-sm">Ver todas →</Link>
          </div>

          {!proximasEntregas || proximasEntregas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-title">Tudo em dia</div>
                <div className="empty-state-desc">Nenhuma entrega pendente este mês.</div>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Família</th>
                    <th>Bairro</th>
                    <th>WhatsApp</th>
                    <th>Busca no CEDEM</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {proximasEntregas.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>
                          {e.nome_responsavel}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--terra-400)' }}>
                          {e.endereco}
                        </div>
                      </td>
                      <td>{e.bairro ?? '—'}</td>
                      <td>
                        {e.whatsapp ? (
                          <a
                            href={`https://wa.me/55${e.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--musgo-500)', fontSize: '0.8rem' }}
                          >
                            {e.whatsapp}
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem' }}>
                          {e.pode_buscar_cedem ? '✓ Pode buscar' : '🚚 Precisa entrega'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${e.status}`}>
                          {e.status === 'pendente' ? 'Pendente' :
                           e.status === 'entregue' ? 'Entregue' : 'Não entregue'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
