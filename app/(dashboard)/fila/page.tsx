'use client'
// app/(dashboard)/fila/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FilaPriorizada } from '@/types'

interface FamiliaRecebeu {
  id: string
  nome_responsavel: string
  whatsapp: string | null
  endereco: string | null
  bairro: string | null
  score: number
  status: string
  apta_em: string | null
  ciclos_anteriores: number
  ultimo_ciclo_encerrado: string | null
}

type Aba = 'fila' | 'receberam'

export default function FilaPage() {
  const supabase = createClient()
  const [aba,          setAba]          = useState<Aba>('fila')
  const [familias,     setFamilias]     = useState<FilaPriorizada[]>([])
  const [receberam,    setReceberam]    = useState<FamiliaRecebeu[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [confirmando,  setConfirmando]  = useState(false)
  const [dataInicio,   setDataInicio]   = useState('')
  const [feedback,     setFeedback]     = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: fila }, { data: concluidas }] = await Promise.all([
      supabase.from('fila_priorizada').select('*').order('posicao_fila', { ascending: true }),
      supabase.from('familias').select(`
        id, nome_responsavel, whatsapp, endereco, bairro, score, status, apta_em
      `).eq('status', 'concluida').order('apta_em', { ascending: true }),
    ])

    setFamilias((fila as FilaPriorizada[]) ?? [])

    // Busca ciclos para cada família concluída
    const concluidasComCiclos = await Promise.all(
      (concluidas ?? []).map(async (f: any) => {
        const { count, data: ciclos } = await supabase
          .from('ciclos')
          .select('data_fim', { count: 'exact' })
          .eq('familia_id', f.id)
          .order('data_fim', { ascending: false })
          .limit(1)
        return {
          ...f,
          ciclos_anteriores:       count ?? 0,
          ultimo_ciclo_encerrado:  ciclos?.[0]?.data_fim ?? null,
        }
      })
    )
    setReceberam(concluidasComCiclos)
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  function toggleSelecionada(id: string) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 10) next.add(id)
      return next
    })
  }

  async function confirmarCiclo() {
    if (selecionadas.size === 0 || !dataInicio) return
    setConfirmando(true)
    const { error } = await supabase.rpc('confirmar_ciclo', {
      p_familia_ids:    Array.from(selecionadas),
      p_data_inicio:    dataInicio,
      p_confirmado_por: 'app',
    })
    if (error) {
      setFeedback({ msg: 'Erro ao confirmar: ' + error.message, tipo: 'erro' })
    } else {
      setFeedback({ msg: `${selecionadas.size} famílias confirmadas. Entregas criadas automaticamente.`, tipo: 'ok' })
      setSelecionadas(new Set())
      carregar()
    }
    setConfirmando(false)
  }

  // Dias até poder voltar
  function diasParaVoltar(aptaEm: string | null): string {
    if (!aptaEm) return '—'
    const hoje = new Date()
    const apta = new Date(aptaEm)
    const diff = Math.ceil((apta.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 0) return 'Apta para voltar'
    if (diff < 30) return `${diff} dias`
    const meses = Math.ceil(diff / 30)
    return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  }

  function formatarData(d: string | null): string {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loading) return (
    <><div className="page-header"><h1 className="page-title">Fila</h1></div>
    <div className="page-content"><div className="spinner" /></div></>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Fila de Prioridade</h1>
          <p className="page-subtitle">
            {aba === 'fila'
              ? `${familias.length} famílias · ordenadas por score · selecione até 10 para o próximo ciclo`
              : `${receberam.length} famílias que já receberam`}
          </p>
        </div>

        {/* Painel de confirmação */}
        {aba === 'fila' && selecionadas.size > 0 && (
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selecionadas</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--terra-800)' }}>{selecionadas.size}/10</div>
            </div>
            <div>
              <label className="form-label">Início do ciclo</label>
              <input className="form-input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ marginBottom: 0 }} />
            </div>
            <button className="btn btn-ocre" onClick={confirmarCiclo} disabled={confirmando || !dataInicio}>
              {confirmando ? 'Confirmando...' : `Confirmar ciclo (${selecionadas.size})`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelecionadas(new Set())}>Limpar</button>
          </div>
        )}
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginBottom: 'var(--space-4)' }}>
            {feedback.msg}
          </div>
        )}

        {/* Abas */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--terra-200)' }}>
          {[
            { id: 'fila' as Aba, label: 'Na fila', count: familias.length },
            { id: 'receberam' as Aba, label: 'Já receberam', count: receberam.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAba(tab.id)}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                background: 'none',
                border: 'none',
                borderBottom: aba === tab.id ? '2px solid var(--terra-800)' : '2px solid transparent',
                color: aba === tab.id ? 'var(--terra-900)' : 'var(--terra-400)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                fontWeight: aba === tab.id ? 500 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: -1,
                transition: 'all var(--transition)',
              }}
            >
              {tab.label}
              <span style={{
                background: aba === tab.id ? 'var(--terra-800)' : 'var(--terra-200)',
                color: aba === tab.id ? 'var(--palha)' : 'var(--terra-600)',
                fontSize: '0.62rem',
                fontWeight: 500,
                padding: '1px 7px',
                borderRadius: 'var(--radius-pill)',
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Aba: Na fila ── */}
        {aba === 'fila' && (
          familias.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-state-icon">🏆</div>
              <div className="empty-state-title">Fila vazia</div>
              <div className="empty-state-desc">Novas respostas aparecem aqui após a triagem.</div>
            </div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>#</th>
                    <th>Família</th>
                    <th>Bairro</th>
                    <th>Composição</th>
                    <th>Renda</th>
                    <th>Score</th>
                    <th>Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {familias.map(f => {
                    const sel = selecionadas.has(f.id)
                    return (
                      <tr key={f.id} onClick={() => toggleSelecionada(f.id)} style={{ cursor: 'pointer', background: sel ? 'rgba(212,160,23,0.08)' : undefined, outline: sel ? '2px solid var(--ocre-400)' : undefined, outlineOffset: -2 }}>
                        <td>
                          <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? 'var(--ocre-400)' : 'var(--terra-300)'}`, background: sel ? 'var(--ocre-400)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--terra-900)' }}>
                            {sel ? '✓' : ''}
                          </div>
                        </td>
                        <td style={{ color: 'var(--terra-400)', fontWeight: 500 }}>{f.posicao_fila}</td>
                        <td>
                          <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{f.nome_responsavel}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>
                            {f.whatsapp ?? '—'}
                            {f.pode_buscar_cedem && <span style={{ marginLeft: 6, color: 'var(--musgo-500)' }}>• busca no CEDEM</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{f.bairro ?? '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {f.num_total_pessoas_raw ?? f.num_total_pessoas ?? '—'} pessoas
                          {f.num_criancas > 0 && <span style={{ color: 'var(--terra-500)' }}> · {f.num_criancas} cr.</span>}
                          {f.num_idosos > 0  && <span style={{ color: 'var(--terra-500)' }}> · {f.num_idosos} id.</span>}
                          {f.tem_pcd         && <span style={{ color: 'var(--mogno-500)' }}> · PCD</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem', maxWidth: 140 }}>
                          <span style={{ display: 'inline-block', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.renda_faixa ?? '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: f.score >= 70 ? 'var(--mogno-500)' : f.score >= 50 ? 'var(--terra-700)' : 'var(--terra-400)' }}>
                            {f.score}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${f.ciclos_anteriores > 0 ? 'badge-concluida' : 'badge-fila'}`}>
                            {f.ciclos_anteriores > 0 ? `${f.ciclos_anteriores}º ciclo` : 'Nunca recebeu'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Aba: Já receberam ── */}
        {aba === 'receberam' && (
          receberam.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-title">Nenhum histórico</div>
              <div className="empty-state-desc">Famílias que concluírem um ciclo aparecerão aqui.</div>
            </div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Família</th>
                    <th>Bairro</th>
                    <th>Ciclos</th>
                    <th>Último ciclo</th>
                    <th>Apta em</th>
                    <th>Tempo restante</th>
                  </tr>
                </thead>
                <tbody>
                  {receberam.map(f => {
                    const diasRestantes = diasParaVoltar(f.apta_em)
                    const jaApta = f.apta_em && new Date(f.apta_em) <= new Date()
                    return (
                      <tr key={f.id}>
                        <td>
                          <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{f.nome_responsavel}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{f.whatsapp ?? '—'}</div>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{f.bairro ?? '—'}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--terra-600)' }}>
                            {f.ciclos_anteriores}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--terra-500)' }}>
                          {formatarData(f.ultimo_ciclo_encerrado)}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {formatarData(f.apta_em)}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 'var(--radius-pill)',
                            fontSize: '0.72rem',
                            fontWeight: 500,
                            background: jaApta ? 'var(--musgo-100)' : 'var(--terra-100)',
                            color: jaApta ? 'var(--musgo-700)' : 'var(--terra-600)',
                            border: `1px solid ${jaApta ? 'var(--musgo-300)' : 'var(--terra-200)'}`,
                          }}>
                            {diasRestantes}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </>
  )
}