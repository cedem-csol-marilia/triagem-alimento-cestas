'use client'
// app/(dashboard)/dashboard/page.tsx
// Dashboard operacional em 3 blocos: pendências → grade do ciclo mês a mês → ação agora.
// A grade conta por MÊS DE REFERÊNCIA da cesta (não mês do calendário): cesta de
// junho pedida em julho continua aparecendo na coluna de junho.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { janelaCicloReal, formatarDataBR, type JanelaCicloReal } from '@/lib/ciclo'

// ── Tipos locais ──────────────────────────────────────────────

interface CicloRow {
  id: string
  familia_id: string
  data_inicio: string
  data_fim: string
  status: string
  familias: { nome_responsavel: string } | null
}

interface EntregaRow {
  id: string
  ciclo_id: string | null
  familia_id: string
  nome_responsavel: string
  mes_referencia: string
  status: string
  pedido_confirmado: boolean
  pedido_loja: string | null
  tipo: string
}

// Entrega concluída (histórico) — alimenta gráfico e KPIs.
interface EntregaFeita {
  familia_id: string
  mes_referencia: string
  pedido_enviado_em: string | null
  data_entrega: string | null
}

// Estado de uma cesta na grade, do mais urgente ao mais tranquilo.
type EstadoCesta = 'sem_pedido' | 'nao_entregue' | 'pedida' | 'futuro' | 'pulada' | 'entregue'

interface Lote {
  chave: string
  janela: JanelaCicloReal
  meses: string[]                 // 'AAAA-MM-01' de cada mês do lote
  ciclos: CicloRow[]              // 1 por família, ordenado por nome
}

// ── Helpers ───────────────────────────────────────────────────

const primeiroDiaHoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const temPedido = (e: EntregaRow) => e.pedido_confirmado || !!e.pedido_loja

function estadoCesta(e: EntregaRow, mesHoje: string): EstadoCesta {
  if (e.status === 'entregue') return 'entregue'
  if (e.status === 'pulada') return 'pulada'
  if (e.status === 'nao_entregue') return 'nao_entregue'
  if (temPedido(e)) return 'pedida'
  return e.mes_referencia > mesHoje ? 'futuro' : 'sem_pedido'
}

// Quando a família tem mais de uma cesta no mesmo mês, a célula mostra a mais urgente.
const URGENCIA: EstadoCesta[] = ['sem_pedido', 'nao_entregue', 'pedida', 'futuro', 'pulada', 'entregue']

const ESTILO_CESTA: Record<EstadoCesta, { rotulo: string; bg: string; cor: string; borda: string }> = {
  entregue:     { rotulo: 'entregue',     bg: 'var(--musgo-100)', cor: 'var(--musgo-700)', borda: 'var(--musgo-300)' },
  pedida:       { rotulo: 'pedida',       bg: '#FDF6D3',          cor: 'var(--ocre-600)',  borda: 'var(--ocre-200)' },
  sem_pedido:   { rotulo: 'sem pedido',   bg: 'var(--mogno-100)', cor: 'var(--mogno-500)', borda: 'var(--mogno-300)' },
  nao_entregue: { rotulo: 'não entregue', bg: 'var(--mogno-100)', cor: 'var(--mogno-500)', borda: 'var(--mogno-300)' },
  pulada:       { rotulo: 'pulada',       bg: 'var(--terra-50)',  cor: 'var(--terra-500)', borda: 'var(--terra-200)' },
  futuro:       { rotulo: '—',            bg: 'transparent',      cor: 'var(--terra-300)', borda: 'transparent' },
}

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function nomeMes(mes: string) {
  return NOMES_MESES[Number(mes.slice(5, 7)) - 1] ?? mes
}

function nomeMesCurto(mes: string) {
  const n = nomeMes(mes)
  return n.slice(0, 3).charAt(0).toUpperCase() + n.slice(1, 3) + ' ' + mes.slice(0, 4)
}

// Lista nomes com limite: "Ana, Bia, Carla +2"
function listarNomes(nomes: string[], max = 5) {
  const curtos = nomes.map(n => n.split(' ')[0] + ' ' + (n.split(' ')[1] ?? '')).map(n => n.trim())
  if (curtos.length <= max) return curtos.join(', ')
  return curtos.slice(0, max).join(', ') + ` +${curtos.length - max}`
}

// Célula da grade: pill com o estado mais urgente + marcação de avulsa.
function CelulaCesta({ mes, entregas, mesHoje }: { mes: string; entregas: EntregaRow[]; mesHoje: string }) {
  if (entregas.length === 0) return <td style={{ textAlign: 'center', color: 'var(--terra-300)' }}>—</td>
  const estado = entregas.map(e => estadoCesta(e, mesHoje)).sort((a, b) => URGENCIA.indexOf(a) - URGENCIA.indexOf(b))[0]
  const st = ESTILO_CESTA[estado]
  const temAvulsa = entregas.some(e => e.tipo === 'avulsa')
  return (
    <td style={{ textAlign: 'center' }}>
      <Link href={`/entregas?mes=${mes}`} style={{ textDecoration: 'none' }}>
        <span style={{
          display: 'inline-block', fontSize: '0.68rem', padding: '2px 10px',
          borderRadius: 'var(--radius-pill)', background: st.bg, color: st.cor,
          border: `1px solid ${st.borda}`, whiteSpace: 'nowrap',
        }}>
          {st.rotulo}{entregas.length > 1 ? ` ×${entregas.length}` : ''}
        </span>
        {temAvulsa && (
          <div style={{ fontSize: '0.55rem', color: 'var(--ocre-600)', marginTop: 1 }}>
            {entregas.length > 1 ? 'inclui avulsa' : 'avulsa'}
          </div>
        )}
      </Link>
    </td>
  )
}

// ── Página ────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()
  const [loading,   setLoading]   = useState(true)
  const [triagem,   setTriagem]   = useState(0)
  const [incompletos, setIncompletos] = useState(0)
  const [naoCasadas,  setNaoCasadas]  = useState(0)
  const [naFila,      setNaFila]      = useState(0)
  const [confirmadas, setConfirmadas] = useState(0)
  const [lotes,       setLotes]       = useState<Lote[]>([])
  const [loteAtivo,   setLoteAtivo]   = useState<string | null>(null)
  const [entregasCiclo, setEntregasCiclo] = useState<EntregaRow[]>([])
  const [pendentes,     setPendentes]     = useState<EntregaRow[]>([])
  const [atendidas,     setAtendidas]     = useState<EntregaFeita[]>([])
  const [avulsas,       setAvulsas]       = useState<EntregaRow[]>([])
  const [familiasInfo,  setFamiliasInfo]  = useState<{ id: string; num_total_pessoas: number | null; status: string }[]>([])
  const [anoGrafico,    setAnoGrafico]    = useState(new Date().getFullYear())

  const mesHoje = primeiroDiaHoje()

  useEffect(() => {
    async function carregar() {
      const [
        { count: fila },
        { count: conf },
        { count: novas },
        { count: dups },
        { count: incomp },
        { count: nc },
        { data: ciclos },
        { data: pend },
        { data: entregues },
        { data: avulsasData },
        { data: fams },
      ] = await Promise.all([
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'fila'),
        supabase.from('familias').select('*', { count: 'exact', head: true }).eq('status', 'confirmada'),
        supabase.from('respostas_forms').select('*', { count: 'exact', head: true }).eq('dedup_status', 'novo'),
        supabase.from('duplicatas_detectadas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('cadastro_incompleto').select('*', { count: 'exact', head: true }),
        supabase.from('entregas_nao_casadas').select('*', { count: 'exact', head: true }).eq('resolvido', false),
        supabase.from('ciclos')
          .select('id, familia_id, data_inicio, data_fim, status, familias(nome_responsavel)')
          .in('status', ['confirmado', 'em_curso'])
          .order('data_inicio', { ascending: false }),
        // Todas as entregas pendentes (ciclo + avulsas) — alimenta o "Ação agora".
        supabase.from('painel_entregas')
          .select('id, ciclo_id, familia_id, nome_responsavel, mes_referencia, status, pedido_confirmado, pedido_loja, tipo')
          .eq('status', 'pendente'),
        // Entregas concluídas de todos os tempos — alimenta o gráfico e os KPIs.
        supabase.from('entregas').select('familia_id, mes_referencia, pedido_enviado_em, data_entrega').eq('status', 'entregue'),
        // Avulsas (qualquer status) — aparecem na grade do ciclo.
        supabase.from('painel_entregas')
          .select('id, ciclo_id, familia_id, nome_responsavel, mes_referencia, status, pedido_confirmado, pedido_loja, tipo')
          .eq('tipo', 'avulsa'),
        // Famílias (id, tamanho, status) — KPIs de inscritas e pessoas alcançadas.
        supabase.from('familias').select('id, num_total_pessoas, status'),
      ])

      setNaFila(fila ?? 0)
      setConfirmadas(conf ?? 0)
      setTriagem((novas ?? 0) + (dups ?? 0))
      setIncompletos(incomp ?? 0)
      setNaoCasadas(nc ?? 0)
      setPendentes((pend as unknown as EntregaRow[]) ?? [])
      setAtendidas((entregues as EntregaFeita[]) ?? [])
      setAvulsas((avulsasData as unknown as EntregaRow[]) ?? [])
      setFamiliasInfo((fams as { id: string; num_total_pessoas: number | null; status: string }[]) ?? [])

      // Agrupa os ciclos ativos em lotes (mesma data_inicio + data_fim).
      const rows = ((ciclos ?? []) as unknown as CicloRow[])
      const porLote = new Map<string, CicloRow[]>()
      for (const c of rows) {
        const chave = `${c.data_inicio}|${c.data_fim}`
        porLote.set(chave, [...(porLote.get(chave) ?? []), c])
      }
      const hoje = new Date()
      const lotesCalc: Lote[] = Array.from(porLote.entries()).map(([chave, cs]) => {
        const janela = janelaCicloReal(cs[0].data_inicio, cs[0].data_fim, hoje)
        const meses = Array.from({ length: janela.totalMeses }, (_, i) => {
          const d = new Date(janela.inicio.getFullYear(), janela.inicio.getMonth() + i, 1)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        })
        const ordenados = [...cs].sort((a, b) =>
          (a.familias?.nome_responsavel ?? '').localeCompare(b.familias?.nome_responsavel ?? ''))
        return { chave, janela, meses, ciclos: ordenados }
      })
      // Lote mais recente primeiro; ele começa selecionado.
      lotesCalc.sort((a, b) => b.chave.localeCompare(a.chave))
      setLotes(lotesCalc)
      setLoteAtivo(lotesCalc[0]?.chave ?? null)

      // Entregas dos lotes ativos (qualquer status) — alimentam a grade.
      const cicloIds = rows.map(c => c.id)
      if (cicloIds.length > 0) {
        const { data: ent } = await supabase.from('painel_entregas')
          .select('id, ciclo_id, familia_id, nome_responsavel, mes_referencia, status, pedido_confirmado, pedido_loja, tipo')
          .in('ciclo_id', cicloIds)
        setEntregasCiclo((ent as unknown as EntregaRow[]) ?? [])
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

  // ── Bloco 1: pendências ─────────────────────────────────────
  const pendencias = [
    triagem > 0 && {
      icon: '⚠️', href: '/triagem',
      texto: <><strong>{triagem} item{triagem !== 1 ? 's' : ''}</strong> aguarda{triagem === 1 ? '' : 'm'} triagem.</>,
    },
    incompletos > 0 && {
      icon: '📋', href: '/incompletos',
      texto: <><strong>{incompletos} família{incompletos !== 1 ? 's' : ''}</strong> com cadastro incompleto.</>,
    },
    naoCasadas > 0 && {
      icon: '🔗', href: '/nao-casadas',
      texto: <><strong>{naoCasadas} entrega{naoCasadas !== 1 ? 's' : ''} não casada{naoCasadas !== 1 ? 's' : ''}</strong> para revisar.</>,
    },
  ].filter(Boolean) as { icon: string; href: string; texto: React.ReactNode }[]

  // ── Bloco 3: ação agora (derivado das pendentes) ────────────
  const aguardandoEntrega = pendentes.filter(temPedido)
  const semPedidoAtrasadas = pendentes.filter(e => !temPedido(e) && e.mes_referencia <= mesHoje)
  const semPedidoPorMes = new Map<string, EntregaRow[]>()
  for (const e of semPedidoAtrasadas) {
    semPedidoPorMes.set(e.mes_referencia, [...(semPedidoPorMes.get(e.mes_referencia) ?? []), e])
  }
  const mesesSemPedido = Array.from(semPedidoPorMes.keys()).sort()

  // ── Bloco 4: famílias atendidas por mês (contagem única por família,
  //    pelo mês de referência da cesta) ──
  const anosDisponiveis = Array.from(new Set([
    ...atendidas.map(a => Number(a.mes_referencia.slice(0, 4))),
    new Date().getFullYear(),
  ])).sort((a, b) => b - a)
  const familiasPorMes = Array.from({ length: 12 }, (_, i) => {
    const prefixo = `${anoGrafico}-${String(i + 1).padStart(2, '0')}`
    return new Set(atendidas.filter(a => a.mes_referencia.startsWith(prefixo)).map(a => a.familia_id)).size
  })
  const maxFamiliasMes = Math.max(1, ...familiasPorMes)
  const totalAnoGrafico = new Set(
    atendidas.filter(a => a.mes_referencia.startsWith(String(anoGrafico))).map(a => a.familia_id)).size

  // Índice das entregas por célula (família + mês) — cestas do ciclo E avulsas.
  const porCelula = new Map<string, EntregaRow[]>()
  for (const e of [...entregasCiclo, ...avulsas]) {
    const k = `${e.familia_id}|${e.mes_referencia}`
    porCelula.set(k, [...(porCelula.get(k) ?? []), e])
  }
  // Cestas de uma linha da grade: as do ciclo daquela família + avulsas do mês.
  const cestasDe = (c: CicloRow, mes: string) =>
    (porCelula.get(`${c.familia_id}|${mes}`) ?? []).filter(e => e.ciclo_id === c.id || e.tipo === 'avulsa')

  // ── KPIs do projeto ─────────────────────────────────────────
  const inscritas = familiasInfo.filter(f => f.status !== 'inativa').length
  const idsAtendidas = new Set(atendidas.map(a => a.familia_id))
  const pessoasAlcancadas = familiasInfo
    .filter(f => idsAtendidas.has(f.id))
    .reduce((s, f) => s + (f.num_total_pessoas ?? 0), 0)
  const cestasAno = atendidas.filter(a => a.mes_referencia.startsWith(String(anoGrafico))).length
  const prazos = atendidas
    .filter(a => a.pedido_enviado_em && a.data_entrega)
    .map(a => (new Date(a.data_entrega!).getTime() - new Date(a.pedido_enviado_em!).getTime()) / 86400000)
    .filter(d => d >= 0)
  const prazoMedio = prazos.length > 0 ? Math.round(prazos.reduce((s, d) => s + d, 0) / prazos.length) : null
  const kpis = [
    { label: 'Famílias inscritas',  valor: String(inscritas),           sub: 'cadastros ativos' },
    { label: 'Famílias atendidas',  valor: String(idsAtendidas.size),   sub: 'desde o início' },
    { label: 'Pessoas alcançadas',  valor: String(pessoasAlcancadas),   sub: 'nas famílias atendidas' },
    { label: 'Cestas entregues',    valor: String(atendidas.length),    sub: `${cestasAno} em ${anoGrafico}` },
    { label: 'Pedido → entrega',    valor: prazoMedio !== null ? `${prazoMedio}d` : '—', sub: 'tempo médio' },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{dataFormatada}</p>
      </div>

      <div className="page-content">

        {/* ── 1. Pendências ── */}
        {pendencias.length > 0 && (
          <div className="card" style={{ padding: 0, marginBottom: 'var(--space-5)', overflow: 'hidden', borderLeft: '3px solid var(--ocre-400)' }}>
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
                  <span style={{ color: 'var(--terra-600)', fontSize: '0.8rem' }}>Resolver →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Linha da fila (atalho discreto) */}
        <Link href="/fila" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
            padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-5)',
            fontSize: '0.8rem', color: 'var(--terra-600)', cursor: 'pointer',
            background: 'var(--terra-50)', border: '1px solid var(--terra-100)', borderRadius: 'var(--radius-md)',
          }}>
            <span><strong style={{ color: 'var(--terra-800)' }}>{naFila}</strong> família{naFila !== 1 ? 's' : ''} na fila</span>
            <span style={{ color: 'var(--terra-300)' }}>·</span>
            <span><strong style={{ color: 'var(--terra-800)' }}>{confirmadas}</strong> confirmada{confirmadas !== 1 ? 's' : ''} para o próximo ciclo</span>
            <span style={{ marginLeft: 'auto' }}>Ver fila →</span>
          </div>
        </Link>

        {/* ── 2. Grade do ciclo, mês a mês ── */}
        {lotes.length === 0 ? (
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="empty-state">
              <div className="empty-state-icon">🌱</div>
              <div className="empty-state-title">Nenhum ciclo ativo</div>
              <div className="empty-state-desc">Confirme um ciclo na Fila para a grade aparecer aqui.</div>
            </div>
          </div>
        ) : (
          <>
            {/* Seletor de lote (só aparece se houver mais de um ciclo ativo) */}
            {lotes.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                {lotes.map(l => (
                  <button key={l.chave} onClick={() => setLoteAtivo(l.chave)} className="btn btn-sm"
                    style={{
                      background: l.chave === loteAtivo ? 'var(--terra-700)' : 'var(--terra-50)',
                      color:      l.chave === loteAtivo ? 'var(--palha)' : 'var(--terra-600)',
                      border: '1px solid var(--terra-200)', fontWeight: 500,
                    }}>
                    Ciclo {l.janela.rotulo}
                  </button>
                ))}
              </div>
            )}
            {lotes.filter(l => l.chave === loteAtivo).map(lote => {
          // Totais por mês (cabeçalho das colunas)
          const totaisMes = lote.meses.map(mes => {
            const estados = lote.ciclos.map(c => {
              const es = cestasDe(c, mes)
              if (es.length === 0) return null
              return es.map(e => estadoCesta(e, mesHoje)).sort((a, b) => URGENCIA.indexOf(a) - URGENCIA.indexOf(b))[0]
            }).filter(Boolean) as EstadoCesta[]
            const conta = (s: EstadoCesta) => estados.filter(e => e === s).length
            return { entregues: conta('entregue'), pedidas: conta('pedida'), semPedido: conta('sem_pedido'), puladas: conta('pulada'), naoEntregues: conta('nao_entregue'), futuras: conta('futuro') }
          })

          // Avulsas de famílias que NÃO estão no lote, nos meses do lote → linhas extras.
          const familiasDoLote = new Set(lote.ciclos.map(c => c.familia_id))
          const avulsasExtras = new Map<string, EntregaRow[]>()
          for (const e of avulsas) {
            if (familiasDoLote.has(e.familia_id) || !lote.meses.includes(e.mes_referencia)) continue
            avulsasExtras.set(e.familia_id, [...(avulsasExtras.get(e.familia_id) ?? []), e])
          }

          return (
            <div key={lote.chave} className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)' }}>
                    Ciclo {lote.janela.rotulo} · mês {lote.janela.mesAtual} de {lote.janela.totalMeses}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--terra-500)' }}>
                    {formatarDataBR(lote.janela.inicio)} → {formatarDataBR(lote.janela.fim)} · {lote.ciclos.length} famílias
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--terra-500)' }}>
                  {(['entregue', 'pedida', 'sem_pedido', 'pulada'] as EstadoCesta[]).map(s => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: ESTILO_CESTA[s].cor, display: 'inline-block' }} />
                      {ESTILO_CESTA[s].rotulo}
                    </span>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '32%' }}>Família</th>
                      {lote.meses.map((mes, i) => {
                        const t = totaisMes[i]
                        const partes: string[] = []
                        if (t.entregues) partes.push(`${t.entregues} entregue${t.entregues !== 1 ? 's' : ''}`)
                        if (t.pedidas) partes.push(`${t.pedidas} pedida${t.pedidas !== 1 ? 's' : ''}`)
                        if (t.semPedido) partes.push(`${t.semPedido} sem pedido`)
                        if (t.naoEntregues) partes.push(`${t.naoEntregues} não entregue${t.naoEntregues !== 1 ? 's' : ''}`)
                        if (t.puladas) partes.push(`${t.puladas} pulada${t.puladas !== 1 ? 's' : ''}`)
                        return (
                          <th key={mes} style={{ textAlign: 'center' }}>
                            <Link href={`/entregas?mes=${mes}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {nomeMesCurto(mes)}
                              <div style={{ fontSize: '0.62rem', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: t.semPedido > 0 && mes <= mesHoje ? 'var(--mogno-500)' : 'var(--terra-400)' }}>
                                {partes.length > 0 ? partes.join(' · ') : (mes > mesHoje ? 'ainda não começou' : 'sem cestas')}
                              </div>
                            </Link>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {lote.ciclos.map(c => (
                      <tr key={c.id}>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--terra-900)' }}>
                          {c.familias?.nome_responsavel ?? '—'}
                        </td>
                        {lote.meses.map(mes => (
                          <CelulaCesta key={mes} mes={mes} entregas={cestasDe(c, mes)} mesHoje={mesHoje} />
                        ))}
                      </tr>
                    ))}
                    {/* Avulsas de famílias fora do lote */}
                    {Array.from(avulsasExtras.entries()).map(([fid, es]) => (
                      <tr key={fid}>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--terra-900)' }}>
                          {es[0].nome_responsavel}
                          <span style={{ marginLeft: 6, fontSize: '0.58rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ocre-600)', background: '#FDF6D3', border: '1px solid var(--ocre-200)', borderRadius: 'var(--radius-pill)', padding: '1px 6px' }}>
                            avulsa
                          </span>
                        </td>
                        {lote.meses.map(mes => (
                          <CelulaCesta key={mes} mes={mes} entregas={es.filter(e => e.mes_referencia === mes)} mesHoje={mesHoje} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
            })}
          </>
        )}

        {/* ── 3. Ação agora ── */}
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 'var(--space-3)' }}>
            🎯 Ação agora
          </div>
          {mesesSemPedido.length === 0 && aguardandoEntrega.length === 0 && naoCasadas === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--musgo-700)' }}>✅ Tudo em dia — nenhuma cesta esperando providência.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {mesesSemPedido.map(mes => {
                const es = semPedidoPorMes.get(mes)!
                return (
                  <Link key={mes} href={`/entregas?mes=${mes}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', fontSize: '0.85rem', color: 'var(--terra-800)', cursor: 'pointer' }}>
                      <span style={{ background: 'var(--mogno-100)', color: 'var(--mogno-500)', border: '1px solid var(--mogno-300)', borderRadius: 'var(--radius-pill)', padding: '1px 9px', fontSize: '0.75rem', fontWeight: 600 }}>{es.length}</span>
                      <span>cesta{es.length !== 1 ? 's' : ''} de {nomeMes(mes)} ainda sem pedido — {listarNomes(es.map(e => e.nome_responsavel))}</span>
                    </div>
                  </Link>
                )
              })}
              {aguardandoEntrega.length > 0 && (
                <Link href="/entregas" style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', fontSize: '0.85rem', color: 'var(--terra-800)', cursor: 'pointer' }}>
                    <span style={{ background: '#FDF6D3', color: 'var(--ocre-600)', border: '1px solid var(--ocre-200)', borderRadius: 'var(--radius-pill)', padding: '1px 9px', fontSize: '0.75rem', fontWeight: 600 }}>{aguardandoEntrega.length}</span>
                    <span>pedido{aguardandoEntrega.length !== 1 ? 's' : ''} feito{aguardandoEntrega.length !== 1 ? 's' : ''} aguardando entrega — {listarNomes(aguardandoEntrega.map(e => e.nome_responsavel))}</span>
                  </div>
                </Link>
              )}
              {naoCasadas > 0 && (
                <Link href="/nao-casadas" style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', fontSize: '0.85rem', color: 'var(--terra-800)', cursor: 'pointer' }}>
                    <span style={{ background: 'var(--terra-100)', color: 'var(--terra-700)', border: '1px solid var(--terra-200)', borderRadius: 'var(--radius-pill)', padding: '1px 9px', fontSize: '0.75rem', fontWeight: 600 }}>{naoCasadas}</span>
                    <span>entrega{naoCasadas !== 1 ? 's' : ''} não casada{naoCasadas !== 1 ? 's' : ''} para revisar</span>
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── 4. Números do projeto: KPIs + famílias atendidas por mês ── */}
        <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 'var(--space-4)' }}>
            Números do projeto
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: 'var(--terra-50)', border: '1px solid var(--terra-100)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--terra-400)' }}>{k.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--terra-800)', lineHeight: 1.2 }}>{k.valor}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--terra-500)' }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--terra-800)' }}>
                Famílias atendidas por mês
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--terra-500)' }}>
                Cestas entregues, pelo mês de referência · {totalAnoGrafico} família{totalAnoGrafico !== 1 ? 's' : ''} atendida{totalAnoGrafico !== 1 ? 's' : ''} em {anoGrafico}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {anosDisponiveis.map(a => (
                <button key={a} onClick={() => setAnoGrafico(a)} className="btn btn-sm"
                  style={{
                    background: a === anoGrafico ? 'var(--terra-700)' : 'var(--terra-50)',
                    color:      a === anoGrafico ? 'var(--palha)' : 'var(--terra-600)',
                    border: '1px solid var(--terra-200)', fontWeight: 500,
                  }}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
            {familiasPorMes.map((qtd, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                {qtd > 0 && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--musgo-700)' }}>{qtd}</span>
                )}
                <div style={{
                  width: '100%', maxWidth: 42,
                  height: qtd > 0 ? `${Math.max(6, Math.round((qtd / maxFamiliasMes) * 80))}%` : 3,
                  background: qtd > 0 ? 'var(--musgo-500)' : 'var(--terra-100)',
                  borderRadius: '4px 4px 0 0',
                }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--terra-400)' }}>{MESES_CURTOS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
