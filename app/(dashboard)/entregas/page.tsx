'use client'
// app/entregas/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PainelEntrega, StatusEntrega } from '@/types'

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// "2026-05-01" (1º dia do mês) a partir de ano + mês (1-12)
const primeiroDia = (ano: number, mes1a12: number) =>
  `${ano}-${String(mes1a12).padStart(2, '0')}-01`

interface FamiliaOpcao { id: string; nome_responsavel: string }

export default function EntregasPage() {
  const supabase = createClient()
  const [entregas, setEntregas] = useState<PainelEntrega[]>([])
  const [meses,    setMeses]    = useState<string[]>([])   // meses com entregas (1º dia)
  const [loading,  setLoading]  = useState(true)
  const [mesAtual, setMesAtual] = useState(() => {
    const d = new Date()
    return primeiroDia(d.getFullYear(), d.getMonth() + 1)
  })
  const [salvando, setSalvando] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  // Estado do formulário de entrega avulsa
  const [mostrarAvulsa, setMostrarAvulsa] = useState(false)
  const [familias,      setFamilias]      = useState<FamiliaOpcao[]>([])
  const [avFamilia,     setAvFamilia]     = useState('')
  const [avData,        setAvData]        = useState('')
  const [avObs,         setAvObs]         = useState('')
  const [avSalvando,    setAvSalvando]    = useState(false)

  const anoAtual = Number(mesAtual.slice(0, 4))
  const mesNum   = Number(mesAtual.slice(5, 7))

  // Carrega a lista de meses que têm entregas (para montar as abas)
  const carregarMeses = useCallback(async () => {
    const { data } = await supabase.from('painel_entregas').select('mes_referencia')
    const unicos = Array.from(new Set((data ?? []).map(d => d.mes_referencia as string)))
    setMeses(unicos.sort().reverse())
  }, [supabase])

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('painel_entregas')
      .select('*')
      .eq('mes_referencia', mesAtual)
      .order('nome_responsavel', { ascending: true })
    setEntregas((data as PainelEntrega[]) ?? [])
    setLoading(false)
  }, [supabase, mesAtual])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarMeses() }, [carregarMeses])
  useEffect(() => {
    supabase.from('familias').select('id, nome_responsavel').neq('status', 'inativa')
      .order('nome_responsavel', { ascending: true })
      .then(({ data }) => setFamilias((data as FamiliaOpcao[]) ?? []))
  }, [supabase])

  async function atualizarEntrega(id: string, campos: Partial<PainelEntrega>) {
    setSalvando(id)
    const { error } = await supabase.from('entregas')
      .update({ ...campos, atualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      setFeedback({ msg: 'Erro ao salvar.', tipo: 'erro' })
    } else {
      setEntregas(prev => prev.map(e => e.id === id ? { ...e, ...campos } : e))
    }
    setSalvando(null)
  }

  async function salvarAvulsa() {
    if (!avFamilia) { setFeedback({ msg: 'Escolha a família.', tipo: 'erro' }); return }
    setAvSalvando(true)
    const { error } = await supabase.rpc('registrar_entrega_avulsa', {
      p_familia_id:     avFamilia,
      p_mes_referencia: mesAtual,
      p_data_entrega:   avData || null,
      p_obs:            avObs || null,
    })
    setAvSalvando(false)
    if (error) {
      setFeedback({ msg: 'Erro ao registrar: ' + error.message, tipo: 'erro' })
      return
    }
    setFeedback({ msg: 'Entrega avulsa registrada.', tipo: 'ok' })
    setMostrarAvulsa(false)
    setAvFamilia(''); setAvData(''); setAvObs('')
    carregar(); carregarMeses()
  }

  function formatarMes(str: string) {
    const [ano, mes] = str.split('-')
    return new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  // Anos com entregas + o ano que está selecionado (para sempre aparecer)
  const anos = Array.from(new Set([...meses.map(m => Number(m.slice(0, 4))), anoAtual]))
    .sort((a, b) => b - a)
  // Meses (1-12) que têm entregas no ano selecionado
  const mesesComDadosNoAno = new Set(
    meses.filter(m => Number(m.slice(0, 4)) === anoAtual).map(m => Number(m.slice(5, 7))))

  const total       = entregas.length
  const totalCiclo  = entregas.filter(e => e.tipo === 'ciclo').length
  const totalAvulsa = entregas.filter(e => e.tipo === 'avulsa').length
  const totalEntregues = entregas.filter(e => e.status === 'entregue').length
  const totalPendentes = entregas.filter(e => e.status === 'pendente').length

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Entregas</h1>
          <p className="page-subtitle">
            {formatarMes(mesAtual)} · {total} cesta{total !== 1 ? 's' : ''}
            {' '}({totalCiclo} do ciclo · {totalAvulsa} avulsa{totalAvulsa !== 1 ? 's' : ''})
            {' '}· {totalEntregues} entregues · {totalPendentes} pendentes
          </p>
        </div>
        <button className="btn btn-ocre" onClick={() => setMostrarAvulsa(v => !v)}>
          {mostrarAvulsa ? 'Cancelar' : '+ Entrega avulsa'}
        </button>
      </div>

      <div className="page-content">

        {/* Abas de ano */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          {anos.map(a => (
            <button key={a} onClick={() => setMesAtual(primeiroDia(a, mesNum))}
              className="btn btn-sm"
              style={{
                background: a === anoAtual ? 'var(--terra-700)' : 'var(--terra-50)',
                color:      a === anoAtual ? 'var(--palha)' : 'var(--terra-600)',
                border: '1px solid var(--terra-200)', fontWeight: 500,
              }}>
              {a}
            </button>
          ))}
        </div>

        {/* Abas de mês (do ano selecionado) */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
          {MESES_CURTOS.map((rotulo, i) => {
            const m = i + 1
            const selecionado = m === mesNum
            const temDados = mesesComDadosNoAno.has(m)
            return (
              <button key={m} onClick={() => setMesAtual(primeiroDia(anoAtual, m))}
                title={temDados ? 'Tem entregas' : 'Sem entregas'}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontSize: '0.72rem', fontWeight: selecionado ? 600 : 400,
                  background: selecionado ? 'var(--musgo-700)' : temDados ? 'var(--musgo-100)' : 'transparent',
                  color:      selecionado ? 'var(--musgo-100)' : temDados ? 'var(--musgo-700)' : 'var(--terra-300)',
                  border: '1px solid ' + (selecionado ? 'var(--musgo-700)' : temDados ? 'var(--musgo-300)' : 'var(--terra-100)'),
                }}>
                {rotulo}
              </button>
            )
          })}
        </div>

        {/* Formulário de entrega avulsa */}
        {mostrarAvulsa && (
          <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-5)', background: 'var(--terra-50)' }}>
            <div style={{ fontWeight: 500, color: 'var(--terra-800)', marginBottom: 'var(--space-3)' }}>
              Registrar entrega avulsa — {formatarMes(mesAtual)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--terra-500)', marginBottom: 'var(--space-4)' }}>
              Cesta fora do ciclo. A família continua na fila normalmente.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 'var(--space-3)', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Família</label>
                <select className="form-input" value={avFamilia} onChange={e => setAvFamilia(e.target.value)} style={{ marginBottom: 0 }}>
                  <option value="">Selecione…</option>
                  {familias.map(f => <option key={f.id} value={f.id}>{f.nome_responsavel}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Data (opcional)</label>
                <input type="date" className="form-input" value={avData} onChange={e => setAvData(e.target.value)} style={{ marginBottom: 0 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observação (opcional)</label>
                <input type="text" className="form-input" placeholder="Ex: emergência, doação pontual…" value={avObs} onChange={e => setAvObs(e.target.value)} style={{ marginBottom: 0 }} />
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn-musgo" onClick={salvarAvulsa} disabled={avSalvando || !avFamilia}>
                {avSalvando ? 'Salvando…' : 'Registrar avulsa'}
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>{feedback.msg}</div>
        )}

        {loading ? (
          <div className="spinner" />
        ) : entregas.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🚚</div>
              <div className="empty-state-title">Nenhuma entrega neste mês</div>
              <div className="empty-state-desc">
                As entregas do ciclo aparecem quando um ciclo é confirmado na Fila.
                Para uma cesta fora do ciclo, use “+ Entrega avulsa”.
              </div>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Família</th>
                  <th>Contato</th>
                  <th>Logística</th>
                  <th>Pedido à empresa</th>
                  <th>Status entrega</th>
                  <th>Data entrega</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {entregas.map(e => (
                  <tr key={e.id} style={{ opacity: salvando === e.id ? 0.6 : 1 }}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--terra-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {e.nome_responsavel}
                        {e.tipo === 'avulsa' && (
                          <span style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ocre-600)', background: '#FDF6D3', border: '1px solid var(--ocre-200)', borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>
                            avulsa
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{e.endereco}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{e.bairro} · {e.ponto_referencia}</div>
                    </td>
                    <td>
                      {e.whatsapp ? (
                        <a href={`https://wa.me/55${e.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--musgo-500)', fontSize: '0.8rem', display: 'block' }}>
                          📱 {e.whatsapp}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem' }}>
                        {e.pode_buscar_cedem ? '✓ Busca no CEDEM' : '🚚 Precisa entrega'}
                      </span>
                    </td>
                    <td>
                      <input type="checkbox" checked={e.pedido_confirmado}
                        onChange={ev => atualizarEntrega(e.id, { pedido_confirmado: ev.target.checked })}
                        style={{ accentColor: 'var(--musgo-500)', width: 16, height: 16, cursor: 'pointer' }} />
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--terra-500)' }}>
                        {e.pedido_confirmado ? 'Confirmado' : 'Pendente'}
                      </span>
                    </td>
                    <td>
                      <select className="form-input" value={e.status}
                        onChange={ev => atualizarEntrega(e.id, { status: ev.target.value as StatusEntrega })}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, width: 'auto' }}>
                        <option value="pendente">Pendente</option>
                        <option value="entregue">Entregue</option>
                        <option value="nao_entregue">Não entregue</option>
                      </select>
                    </td>
                    <td>
                      <input type="date" className="form-input" value={e.data_entrega ?? ''}
                        onChange={ev => atualizarEntrega(e.id, { data_entrega: ev.target.value || null })}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, width: 'auto' }} />
                    </td>
                    <td>
                      <input type="text" className="form-input" placeholder="obs..." defaultValue={e.observacao ?? ''}
                        onBlur={ev => {
                          if (ev.target.value !== (e.observacao ?? '')) {
                            atualizarEntrega(e.id, { observacao: ev.target.value || null })
                          }
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, minWidth: 120 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
