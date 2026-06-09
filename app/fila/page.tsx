'use client'
// app/fila/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FilaPriorizada } from '@/types'

export default function FilaPage() {
  const supabase = createClient()
  const [familias,    setFamilias]    = useState<FilaPriorizada[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selecionadas,setSelecionadas]= useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [dataInicio,  setDataInicio]  = useState('')
  const [feedback,    setFeedback]    = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('fila_priorizada')
      .select('*')
      .order('posicao_fila', { ascending: true })
    setFamilias((data as FilaPriorizada[]) ?? [])
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
      setFeedback({ msg: `${selecionadas.size} famílias confirmadas para o ciclo. Entregas criadas automaticamente.`, tipo: 'ok' })
      setSelecionadas(new Set())
      carregar()
    }
    setConfirmando(false)
  }

  const labelStatus = (f: FilaPriorizada) => {
    if (f.ciclos_anteriores > 0) return `${f.ciclos_anteriores}º ciclo`
    return 'Nunca recebeu'
  }

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Fila de Prioridade</h1>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Fila de Prioridade</h1>
          <p className="page-subtitle">
            {familias.length} famílias · ordenadas por score · selecione até 10 para o próximo ciclo
          </p>
        </div>

        {/* Painel de confirmação */}
        {selecionadas.size > 0 && (
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--terra-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selecionadas</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--terra-800)' }}>
                {selecionadas.size}/10
              </div>
            </div>
            <div>
              <label className="form-label">Início do ciclo</label>
              <input
                className="form-input"
                type="date"
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <button
              className="btn btn-ocre"
              onClick={confirmarCiclo}
              disabled={confirmando || !dataInicio}
            >
              {confirmando ? 'Confirmando...' : `Confirmar ciclo (${selecionadas.size})`}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelecionadas(new Set())}
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>
            {feedback.msg}
          </div>
        )}

        {familias.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🏆</div>
              <div className="empty-state-title">Fila vazia</div>
              <div className="empty-state-desc">
                Nenhuma família na fila. Novas respostas aparecem aqui após a triagem.
              </div>
            </div>
          </div>
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
                    <tr
                      key={f.id}
                      onClick={() => toggleSelecionada(f.id)}
                      style={{
                        cursor: 'pointer',
                        background: sel ? 'rgba(212, 160, 23, 0.08)' : undefined,
                        outline: sel ? '2px solid var(--ocre-400)' : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      <td>
                        <div style={{
                          width: 18, height: 18,
                          borderRadius: 4,
                          border: `2px solid ${sel ? 'var(--ocre-400)' : 'var(--terra-300)'}`,
                          background: sel ? 'var(--ocre-400)' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', color: 'var(--terra-900)',
                        }}>
                          {sel ? '✓' : ''}
                        </div>
                      </td>
                      <td style={{ color: 'var(--terra-400)', fontWeight: 500 }}>
                        {f.posicao_fila}
                      </td>
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
                        <span style={{
                          display: 'inline-block',
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {f.renda_faixa ?? '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: f.score >= 70 ? 'var(--mogno-500)' :
                                 f.score >= 50 ? 'var(--terra-700)' : 'var(--terra-400)',
                        }}>
                          {f.score}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${f.ciclos_anteriores > 0 ? 'badge-concluida' : 'badge-fila'}`}>
                          {labelStatus(f)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
