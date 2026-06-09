'use client'
// app/entregas/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PainelEntrega, StatusEntrega } from '@/types'

export default function EntregasPage() {
  const supabase = createClient()
  const [entregas,  setEntregas]  = useState<PainelEntrega[]>([])
  const [loading,   setLoading]   = useState(true)
  const [mesAtual,  setMesAtual]  = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [salvando,  setSalvando]  = useState<string | null>(null)
  const [feedback,  setFeedback]  = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

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

  async function atualizarEntrega(id: string, campos: Partial<PainelEntrega>) {
    setSalvando(id)
    const { error } = await supabase
      .from('entregas')
      .update({
        ...campos,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      setFeedback({ msg: 'Erro ao salvar.', tipo: 'erro' })
    } else {
      // Atualiza localmente sem recarregar tudo
      setEntregas(prev => prev.map(e => e.id === id ? { ...e, ...campos } : e))
    }
    setSalvando(null)
  }

  // Formata "2026-07-01" → "Julho 2026"
  function formatarMes(str: string) {
    const [ano, mes] = str.split('-')
    return new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  // Navegar entre meses
  function mudarMes(delta: number) {
    const [ano, mes] = mesAtual.split('-').map(Number)
    const d = new Date(ano, mes - 1 + delta, 1)
    setMesAtual(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }

  const totalEntregues = entregas.filter(e => e.status === 'entregue').length
  const totalPendentes = entregas.filter(e => e.status === 'pendente').length

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Entregas</h1>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Entregas</h1>
          <p className="page-subtitle">
            {formatarMes(mesAtual)} · {totalEntregues} entregues · {totalPendentes} pendentes
          </p>
        </div>

        {/* Navegação de meses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => mudarMes(-1)}>← Mês anterior</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--terra-600)', fontWeight: 500, padding: '0 var(--space-2)' }}>
            {formatarMes(mesAtual)}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => mudarMes(1)}>Próximo mês →</button>
        </div>
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>
            {feedback.msg}
          </div>
        )}

        {entregas.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🚚</div>
              <div className="empty-state-title">Nenhuma entrega neste mês</div>
              <div className="empty-state-desc">
                As entregas aparecem aqui quando um ciclo é confirmado na página de Fila.
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
                      <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{e.nome_responsavel}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{e.endereco}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{e.bairro} · {e.ponto_referencia}</div>
                    </td>
                    <td>
                      {e.whatsapp ? (
                        <a
                          href={`https://wa.me/55${e.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--musgo-500)', fontSize: '0.8rem', display: 'block' }}
                        >
                          📱 {e.whatsapp}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem' }}>
                        {e.pode_buscar_cedem ? '✓ Busca no CEDEM' : '🚚 Precisa entrega'}
                      </span>
                    </td>

                    {/* Pedido à empresa */}
                    <td>
                      <input
                        type="checkbox"
                        checked={e.pedido_confirmado}
                        onChange={ev => atualizarEntrega(e.id, { pedido_confirmado: ev.target.checked })}
                        style={{ accentColor: 'var(--musgo-500)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--terra-500)' }}>
                        {e.pedido_confirmado ? 'Confirmado' : 'Pendente'}
                      </span>
                    </td>

                    {/* Status entrega */}
                    <td>
                      <select
                        className="form-input"
                        value={e.status}
                        onChange={ev => atualizarEntrega(e.id, { status: ev.target.value as StatusEntrega })}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, width: 'auto' }}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="entregue">Entregue</option>
                        <option value="nao_entregue">Não entregue</option>
                      </select>
                    </td>

                    {/* Data de entrega */}
                    <td>
                      <input
                        type="date"
                        className="form-input"
                        value={e.data_entrega ?? ''}
                        onChange={ev => atualizarEntrega(e.id, { data_entrega: ev.target.value || null })}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, width: 'auto' }}
                      />
                    </td>

                    {/* Observação */}
                    <td>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="obs..."
                        defaultValue={e.observacao ?? ''}
                        onBlur={ev => {
                          if (ev.target.value !== (e.observacao ?? '')) {
                            atualizarEntrega(e.id, { observacao: ev.target.value || null })
                          }
                        }}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', marginBottom: 0, minWidth: 120 }}
                      />
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
