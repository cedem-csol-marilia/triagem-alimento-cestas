'use client'
// app/(dashboard)/dashboard/page.tsx

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
  duplicatasPendentes: number
}

interface CicloAtivo {
  familia_id: string
  nome_responsavel: string
  data_inicio: string
  data_fim: string
  status: string
  entregas_feitas: number
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
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [ciclosAtivos, setCiclosAtivos] = useState<CicloAtivo[]>([])
  const [entregas,     setEntregas]     = useState<EntregaResumo[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    async function carregar() {
      const hoje     = new Date()
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`

      const [
        { count: naFila },
        { count: confirmadas },
        { count: ativas },
        { count: triagem },
        { count: entregasPendentes },
        { count: totalFamilias },
        { count: cadastroIncompleto },
        { count: duplicatasPendentes },
        { data: ciclos },
        { data: proximasEntregas },
      ] = await Promise.all([
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'confirmada'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'ativa'),
        supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
        supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).eq('status', 'pendente').eq('mes_referencia', mesAtual),
        supabase.from('familias').select('*', { count: 'exact', head: true }).neq('status', 'inativa'),
        supabase.from('cadastro_incompleto').select('*', { count: 'exact', head: true }),
        supabase.from('duplicatas_detectadas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('ciclos').select('id, familia_id, data_inicio, data_fim, status, familias(nome_responsavel)').in('status', ['confirmado', 'em_curso']).order('data_inicio', { ascending: false }),
        supabase.from('painel_entregas').select('id, nome_responsavel, whatsapp, endereco, bairro, ponto_referencia, pode_buscar_cedem, status').eq('mes_referencia', mesAtual).eq('status', 'pendente').limit(5),
      ])

      setStats({
        naFila:              naFila             ?? 0,
        confirmadas:         confirmadas        ?? 0,
        ativas:              ativas             ?? 0,
        triagem:             (triagem ?? 0) + (duplicatasPendentes ?? 0),
        entregasPendentes:   entregasPendentes  ?? 0,
        totalFamilias:       totalFamilias      ?? 0,
        cadastroIncompleto:  cadastroIncompleto ?? 0,
        duplicatasPendentes: duplicatasPendentes ?? 0,
      })

      const ciclosFormatados = (ciclos ?? []).map((c: any) => ({
        familia_id:      c.familia_id,
        nome_responsavel: c.familias?.nome_responsavel ?? '—',
        data_inicio:     c.data_inicio,
        data_fim:        c.data_fim,
        status:          c.status,
        entregas_feitas: 0,
      }))

      setCiclosAtivos(ciclosFormatados)
      setEntregas((proximasEntregas as EntregaResumo[]) ?? [])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  const hoje = new Date()
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Próximo ciclo: 3 meses a partir de hoje
  const proximoCicloInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const proximoCicloFim    = new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0)
  const formatarData       = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (loading) return (
    <><div className="page-header"><h1 className="page-title">Dashboard</h1><p className="page-subtitle">{dataFormatada}</p></div>
    <div className="page-content"><div className="spinner" /></div></>
  )

  const statCards = [
    { label: 'Na fila',             value: stats!.naFila,            sub: 'aguardando seleção',  color: 'var(--terra-400)',  href: '/fila' },
    { label: 'Confirmadas',         value: stats!.confirmadas,       sub: 'próximo ciclo',        color: 'var(--ocre-400)',   href: '/fila' },
    { label: 'Recebendo',           value: stats!.ativas,            sub: 'ciclo em andamento',   color: 'var(--musgo-500)',  href: '/entregas' },
    { label: 'Triagem pendente',    value: stats!.triagem,           sub: 'aguardam decisão',     color: stats!.triagem ? 'var(--mogno-500)' : 'var(--terra-300)', href: '/triagem' },
    { label: 'Entregas do mês',     value: stats!.entregasPendentes, sub: 'a confirmar',          color: 'var(--terra-600)',  href: '/entregas' },
    { label: 'Cadastro incompleto', value: stats!.cadastroIncompleto,sub: 'endereço sem número',  color: stats!.cadastroIncompleto ? 'var(--ocre-600)' : 'var(--terra-300)', href: '/incompletos' },
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
              <span><strong>{stats!.triagem} item{stats!.triagem !== 1 ? 's' : ''}</strong> aguarda{stats!.triagem === 1 ? '' : 'm'} triagem.</span>
            </div>
          </Link>
        )}

        {stats!.cadastroIncompleto > 0 && (
          <Link href="/incompletos" style={{ textDecoration: 'none' }}>
            <div className="alert alert-warning" style={{ cursor: 'pointer' }}>
              <span>📋</span>
              <span><strong>{stats!.cadastroIncompleto} família{stats!.cadastroIncompleto !== 1 ? 's' : ''}</strong> com cadastro incompleto.</span>
            </div>
          </Link>
        )}

        {/* Stats */}
        <div className="stats-grid">
          {statCards.map(s => (
            <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
              <div className="stat-card" style={{ borderTop: `3px solid ${s.color}`, cursor: 'pointer' }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Próximo ciclo */}
        <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 4 }}>
                Próximo ciclo
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--terra-500)' }}>
                {formatarData(proximoCicloInicio)} → {formatarData(proximoCicloFim)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--ocre-400)', lineHeight: 1 }}>
                  {stats!.confirmadas}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  confirmadas
                </div>
              </div>
              <div style={{ width: 1, height: 40, background: 'var(--terra-200)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: stats!.confirmadas >= 10 ? 'var(--musgo-500)' : 'var(--terra-400)', lineHeight: 1 }}>
                  {10 - stats!.confirmadas < 0 ? 0 : 10 - stats!.confirmadas}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  vagas restantes
                </div>
              </div>
            </div>
            <Link href="/fila" className="btn btn-ocre btn-sm">
              {stats!.confirmadas >= 10 ? 'Ver fila' : 'Selecionar famílias →'}
            </Link>
          </div>

          {stats!.confirmadas > 0 && (
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--terra-100)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 'var(--space-2)' }}>
                Famílias confirmadas
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {ciclosAtivos.filter(c => c.status === 'confirmado').map(c => (
                  <span key={c.familia_id} style={{ background: 'var(--ocre-200)', color: 'var(--ocre-600)', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--ocre-200)' }}>
                    {c.nome_responsavel}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Entregas pendentes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--terra-800)' }}>
              Entregas pendentes este mês
            </h2>
            <Link href="/entregas" className="btn btn-ghost btn-sm">Ver todas →</Link>
          </div>

          {entregas.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">Tudo em dia</div>
              <div className="empty-state-desc">Nenhuma entrega pendente este mês.</div>
            </div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Família</th><th>Bairro</th><th>WhatsApp</th><th>Logística</th><th>Status</th></tr></thead>
                <tbody>
                  {entregas.map(e => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{e.nome_responsavel}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--terra-400)' }}>{e.endereco}</div>
                      </td>
                      <td>{e.bairro ?? '—'}</td>
                      <td>{e.whatsapp ? <a href={`https://wa.me/55${e.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--musgo-500)', fontSize: '0.8rem' }}>{e.whatsapp}</a> : '—'}</td>
                      <td style={{ fontSize: '0.78rem' }}>{e.pode_buscar_cedem ? '✓ Busca no CEDEM' : '🚚 Precisa entrega'}</td>
                      <td><span className={`badge badge-${e.status}`}>{e.status === 'pendente' ? 'Pendente' : e.status === 'entregue' ? 'Entregue' : 'Não entregue'}</span></td>
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
