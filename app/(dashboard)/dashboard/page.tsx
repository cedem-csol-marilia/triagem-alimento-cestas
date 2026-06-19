'use client'
// app/(dashboard)/dashboard/page.tsx

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { janelaCicloAtual, mesesDaJanela, formatarDataBR, type JanelaCiclo } from '@/lib/ciclo'

interface Stats {
  naFila: number
  confirmadas: number
  ativas: number
  triagem: number
  totalFamilias: number
  cadastroIncompleto: number
  duplicatasPendentes: number
  // cestas do mês
  programadas: number
  solicitadas: number
  entregues: number
  // exceções
  naoCasadas: number
}

interface CicloAtivo {
  familia_id: string
  nome_responsavel: string
  status: string
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

interface ResumoCiclo {
  programadas: number
  entregues: number
}

export default function DashboardPage() {
  const supabase = createClient()
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [ciclosAtivos, setCiclosAtivos] = useState<CicloAtivo[]>([])
  const [entregas,     setEntregas]     = useState<EntregaResumo[]>([])
  const [janela,       setJanela]       = useState<JanelaCiclo | null>(null)
  const [resumoCiclo,  setResumoCiclo]  = useState<ResumoCiclo>({ programadas: 0, entregues: 0 })
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
        { count: totalFamilias },
        { count: cadastroIncompleto },
        { count: duplicatasPendentes },
        { count: programadas },
        { count: solicitadas },
        { count: entregues },
        { count: naoCasadas },
        { data: ciclos },
        { data: proximasEntregas },
        { data: ancoraRow },
      ] = await Promise.all([
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'confirmada'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'ativa'),
        supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).neq('status', 'inativa'),
        supabase.from('cadastro_incompleto').select('*', { count: 'exact', head: true }),
        supabase.from('duplicatas_detectadas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        // Programadas = TODAS as entregas do mês (ciclo + avulsa)
        supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).eq('mes_referencia', mesAtual),
        // Solicitadas = têm pedido (confirmado OU nº da loja preenchido)
        supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).eq('mes_referencia', mesAtual).or('pedido_confirmado.eq.true,pedido_loja.not.is.null'),
        // Entregues = status entregue
        supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).eq('mes_referencia', mesAtual).eq('status', 'entregue'),
        // Exceções da automação ainda abertas
        supabase.from('entregas_nao_casadas').select('*', { count: 'exact', head: true }).eq('resolvido', false),
        supabase.from('ciclos').select('familia_id, status, familias(nome_responsavel)').in('status', ['confirmado', 'em_curso']).order('data_inicio', { ascending: false }),
        supabase.from('painel_entregas').select('id, nome_responsavel, whatsapp, endereco, bairro, ponto_referencia, pode_buscar_cedem, status').eq('mes_referencia', mesAtual).eq('status', 'pendente').limit(5),
        // Âncora do ciclo: menor data_inicio existente no banco
        supabase.from('ciclos').select('data_inicio').order('data_inicio', { ascending: true }).limit(1),
      ])

      setStats({
        naFila:              naFila              ?? 0,
        confirmadas:         confirmadas         ?? 0,
        ativas:              ativas              ?? 0,
        triagem:             (triagem ?? 0) + (duplicatasPendentes ?? 0),
        totalFamilias:       totalFamilias       ?? 0,
        cadastroIncompleto:  cadastroIncompleto  ?? 0,
        duplicatasPendentes: duplicatasPendentes ?? 0,
        programadas:         programadas         ?? 0,
        solicitadas:         solicitadas         ?? 0,
        entregues:           entregues           ?? 0,
        naoCasadas:          naoCasadas          ?? 0,
      })

      setCiclosAtivos((ciclos ?? []).map((c: any) => ({
        familia_id:       c.familia_id,
        nome_responsavel: c.familias?.nome_responsavel ?? '—',
        status:           c.status,
      })))
      setEntregas((proximasEntregas as EntregaResumo[]) ?? [])

      // Janela do ciclo vinda do banco (âncora = menor data_inicio)
      const ancora = (ancoraRow as { data_inicio: string }[] | null)?.[0]?.data_inicio ?? null
      const j = janelaCicloAtual(ancora, hoje)
      setJanela(j)

      // Resumo de cestas DENTRO da janela do ciclo (3 meses)
      if (j) {
        const meses = mesesDaJanela(j)
        const [{ count: prog }, { count: entr }] = await Promise.all([
          supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).in('mes_referencia', meses),
          supabase.from('painel_entregas').select('*', { count: 'exact', head: true }).in('mes_referencia', meses).eq('status', 'entregue'),
        ])
        setResumoCiclo({ programadas: prog ?? 0, entregues: entr ?? 0 })
      }

      setLoading(false)
    }
    carregar()
  }, [supabase])

  const hoje = new Date()
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return (
    <><div className="page-header"><h1 className="page-title">Dashboard</h1><p className="page-subtitle">{dataFormatada}</p></div>
    <div className="page-content"><div className="spinner" /></div></>
  )

  // Linhas do banner de pendências (triagem, incompletos, não-casadas)
  const pendencias = [
    stats!.triagem > 0 && {
      icon: '⚠️', href: '/triagem', cor: 'var(--mogno-500)',
      texto: <><strong>{stats!.triagem} item{stats!.triagem !== 1 ? 's' : ''}</strong> aguarda{stats!.triagem === 1 ? '' : 'm'} triagem.</>,
    },
    stats!.cadastroIncompleto > 0 && {
      icon: '📋', href: '/incompletos', cor: 'var(--ocre-600)',
      texto: <><strong>{stats!.cadastroIncompleto} família{stats!.cadastroIncompleto !== 1 ? 's' : ''}</strong> com cadastro incompleto.</>,
    },
    stats!.naoCasadas > 0 && {
      icon: '🔗', href: '/nao-casadas', cor: 'var(--terra-600)',
      texto: <><strong>{stats!.naoCasadas} entrega{stats!.naoCasadas !== 1 ? 's' : ''} não casada{stats!.naoCasadas !== 1 ? 's' : ''}</strong> para revisar.</>,
    },
  ].filter(Boolean) as { icon: string; href: string; cor: string; texto: React.ReactNode }[]

  const statCards = [
    { label: 'Na fila',             value: stats!.naFila,            sub: 'aguardando seleção',  color: 'var(--terra-400)',  href: '/fila' },
    { label: 'Confirmadas',         value: stats!.confirmadas,       sub: 'próximo ciclo',        color: 'var(--ocre-400)',   href: '/fila' },
    { label: 'Recebendo',           value: stats!.ativas,            sub: 'ciclo em andamento',   color: 'var(--musgo-500)',  href: '/entregas' },
    { label: 'Triagem pendente',    value: stats!.triagem,           sub: 'aguardam decisão',     color: stats!.triagem ? 'var(--mogno-500)' : 'var(--terra-300)', href: '/triagem' },
    { label: 'Cadastro incompleto', value: stats!.cadastroIncompleto,sub: 'dados faltando',       color: stats!.cadastroIncompleto ? 'var(--ocre-600)' : 'var(--terra-300)', href: '/incompletos' },
    { label: 'Não casadas',         value: stats!.naoCasadas,        sub: 'automação · revisar',  color: stats!.naoCasadas ? 'var(--terra-600)' : 'var(--terra-300)', href: '/nao-casadas' },
  ]

  // Cards de cestas do mês
  const cestaCards = [
    { label: 'Programadas',  value: stats!.programadas, sub: 'entregas do mês',          color: 'var(--terra-600)' },
    { label: 'Solicitadas',  value: stats!.solicitadas, sub: 'pedido feito à empresa',   color: 'var(--ocre-400)' },
    { label: 'Entregues',    value: stats!.entregues,   sub: 'confirmadas no mês',       color: 'var(--musgo-500)' },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{dataFormatada}</p>
      </div>

      <div className="page-content">

        {/* Banner único de pendências */}
        {pendencias.length > 0 && (
          <div className="card" style={{ padding: 0, marginBottom: 'var(--space-6)', overflow: 'hidden', borderLeft: '3px solid var(--ocre-400)' }}>
            <div style={{ padding: '10px var(--space-5)', background: 'var(--ocre-200)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ocre-600)' }}>
              Pendências
            </div>
            {pendencias.map((p, i) => (
              <Link key={i} href={p.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-4) var(--space-5)', cursor: 'pointer',
                  borderTop: i > 0 ? '1px solid var(--terra-100)' : 'none',
                  color: 'var(--terra-800)', fontSize: '0.85rem',
                }}>
                  <span style={{ fontSize: '1rem' }}>{p.icon}</span>
                  <span style={{ flex: 1 }}>{p.texto}</span>
                  <span style={{ color: p.cor, fontSize: '0.8rem' }}>Resolver →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Stats operacionais */}
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

        {/* Cestas do mês */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 'var(--space-3)' }}>
            Cestas deste mês
          </div>
          <div className="stats-grid">
            {cestaCards.map(s => (
              <div key={s.label} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ciclo atual — janela vinda do banco */}
        <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          {janela ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 4 }}>
                    Ciclo atual · mês {janela.mesAtual} de 3
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--terra-500)' }}>
                    {formatarDataBR(janela.inicio)} → {formatarDataBR(janela.fim)} · <span style={{ textTransform: 'capitalize' }}>{janela.rotulo}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--terra-600)', lineHeight: 1 }}>
                      {resumoCiclo.programadas}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      programadas
                    </div>
                  </div>
                  <div style={{ width: 1, height: 40, background: 'var(--terra-200)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--musgo-500)', lineHeight: 1 }}>
                      {resumoCiclo.entregues}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      entregues
                    </div>
                  </div>
                  <Link href="/entregas" className="btn btn-ocre btn-sm">Ver entregas →</Link>
                </div>
              </div>

              {/* progresso do ciclo (mês 1→3) */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-4)' }}>
                {[1, 2, 3].map(m => (
                  <div key={m} style={{
                    flex: 1, height: 6, borderRadius: 'var(--radius-pill)',
                    background: m <= janela.mesAtual ? 'var(--musgo-500)' : 'var(--terra-200)',
                  }} />
                ))}
              </div>

              {stats!.confirmadas > 0 && ciclosAtivos.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--terra-100)' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 'var(--space-2)' }}>
                    Famílias do ciclo
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {ciclosAtivos.map(c => (
                      <span key={c.familia_id} style={{ background: 'var(--ocre-200)', color: 'var(--ocre-600)', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--ocre-200)' }}>
                        {c.nome_responsavel}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 4 }}>
                  Nenhum ciclo iniciado ainda
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--terra-500)' }}>
                  Confirme um ciclo na Fila para a janela aparecer aqui.
                </div>
              </div>
              <Link href="/fila" className="btn btn-ocre btn-sm">Selecionar famílias →</Link>
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
