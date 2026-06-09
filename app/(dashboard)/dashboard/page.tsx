'use client'
// app/dashboard/page.tsx

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Stats {
  naFila: number
  confirmadas: number
  ativas: number
  triagem: number
  entregasPendentes: number
  totalFamilias: number
  cadastroIncompleto: number
}

interface EntregaResumo {
  id: string
  nome_responsavel: string
  whatsapp: string | null
  endereco: string | null
  bairro: string | null
  ponto_referencia: string | null
  pode_buscar_cedem: boolean
  status: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [entregas, setEntregas] = useState<EntregaResumo[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function carregar() {
      const hoje = new Date()
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`

      const [
        { count: naFila },
        { count: confirmadas },
        { count: ativas },
        { count: triagem },
        { count: entregasPendentes },
        { count: totalFamilias },
        { count: cadastroIncompleto },
        { data: proximasEntregas },
      ] = await Promise.all([
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'confirmada'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'ativa'),
        supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
        supabase.from('entregas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('familias').select('*', { count: 'exact', head: true }),
        supabase.from('cadastro_incompleto').select('*', { count: 'exact', head: true }),
        supabase.from('painel_entregas').select('id, nome_responsavel, whatsapp, endereco, bairro, ponto_referencia, pode_buscar_cedem, status').eq('mes_referencia', mesAtual).eq('status', 'pendente').limit(5),
      ])

      setStats({
        naFila:             naFila ?? 0,
        confirmadas:        confirmadas ?? 0,
        ativas:             ativas ?? 0,
        triagem:            triagem ?? 0,
        entregasPendentes:  entregasPendentes ?? 0,
        totalFamilias:      totalFamilias ?? 0,
        cadastroIncompleto: cadastroIncompleto ?? 0,
      })
      setEntregas((proximasEntregas as EntregaResumo[]) ?? [])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  const hoje = new Date()
  const dataFormatada = hoje.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{dataFormatada}</p>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  const statCards = [
    { label: 'Na fila',              value: stats!.naFila,             sub: 'aguardando seleção',    color: 'var(--terra-400)',  href: '/fila' },
    { label: 'Confirmadas',          value: stats!.confirmadas,        sub: 'próximo ciclo',          color: 'var(--ocre-400)',   href: '/fila' },
    { label: 'Recebendo',            value: stats!.ativas,             sub: 'ciclo em andamento',     color: 'var(--musgo-500)',  href: '/entregas' },
    { label: 'Triagem pendente',     value: stats!.triagem,            sub: 'aguardam sua decisão',   color: stats!.triagem ? 'var(--mogno-500)' : 'var(--terra-300)', href: '/triagem' },
    { label: 'Entregas do mês',      value: stats!.entregasPendentes,  sub: 'a confirmar este mês',   color: 'var(--terra-600)',  href: '/entregas' },
    { label: 'Total de famílias',    value: stats!.totalFamilias,      sub: 'cadastros ativos',       color: 'var(--terra-300)',  href: '/familias' },
    { label: 'Cadastro incompleto',  value: stats!.cadastroIncompleto, sub: 'endereço sem número',    color: stats!.cadastroIncompleto ? 'var(--ocre-600)' : 'var(--terra-300)', href: '/incompletos' },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{dataFormatada}</p>
      </div>

      <div className="page-content">

        {/* Alertas */}
        {stats!.triagem > 0 && (
          <Link href="/triagem" style={{ textDecoration: 'none' }}>
            <div className="alert alert-warning" style={{ cursor: 'pointer' }}>
              <span>⚠️</span>
              <span>
                <strong>{stats!.triagem} resposta{stats!.triagem !== 1 ? 's' : ''}</strong> aguarda{stats!.triagem === 1 ? '' : 'm'} triagem — possíveis duplicatas identificadas.
              </span>
            </div>
          </Link>
        )}

        {stats!.cadastroIncompleto > 0 && (
          <Link href="/incompletos" style={{ textDecoration: 'none' }}>
            <div className="alert alert-warning" style={{ cursor: 'pointer', marginTop: stats!.triagem > 0 ? 0 : undefined }}>
              <span>📋</span>
              <span>
                <strong>{stats!.cadastroIncompleto} família{stats!.cadastroIncompleto !== 1 ? 's' : ''}</strong> com cadastro incompleto — endereço sem número.
              </span>
            </div>
          </Link>
        )}

        {/* Stats */}
        <div className="stats-grid">
          {statCards.map(stat => (
            <Link key={stat.label} href={stat.href} style={{ textDecoration: 'none' }}>
              <div className="stat-card" style={{ borderTop: `3px solid ${stat.color}`, cursor: 'pointer' }}>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
                <div className="stat-sub">{stat.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Próximas entregas */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--terra-800)' }}>
              Entregas pendentes este mês
            </h2>
            <Link href="/entregas" className="btn btn-ghost btn-sm">Ver todas →</Link>
          </div>

          {entregas.length === 0 ? (
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
                    <th>Logística</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.map(e => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{e.nome_responsavel}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--terra-400)' }}>{e.endereco}</div>
                      </td>
                      <td>{e.bairro ?? '—'}</td>
                      <td>
                        {e.whatsapp ? (
                          <a href={`https://wa.me/55${e.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--musgo-500)', fontSize: '0.8rem' }}>
                            {e.whatsapp}
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {e.pode_buscar_cedem ? '✓ Busca no CEDEM' : '🚚 Precisa entrega'}
                      </td>
                      <td>
                        <span className={`badge badge-${e.status}`}>
                          {e.status === 'pendente' ? 'Pendente' : e.status === 'entregue' ? 'Entregue' : 'Não entregue'}
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
