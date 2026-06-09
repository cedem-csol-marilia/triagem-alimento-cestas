'use client'
// app/configuracoes/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Peso {
  id: number
  criterio: string
  label: string
  descricao: string | null
  peso: number
  ativo: boolean
  ordem: number
}

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [pesos,    setPesos]    = useState<Peso[]>([])
  const [loading,  setLoading]  = useState(true)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)
  const [recalc,   setRecalc]   = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('config_pesos_priorizacao')
      .select('*')
      .order('ordem', { ascending: true })
    setPesos((data as Peso[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function salvarPeso(id: number, novoPeso: number, ativo: boolean) {
    setSalvando(id)
    const { error } = await supabase
      .from('config_pesos_priorizacao')
      .update({ peso: novoPeso, ativo, atualizado_em: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      setPesos(prev => prev.map(p => p.id === id ? { ...p, peso: novoPeso, ativo } : p))
    }

    setFeedback({ msg: error ? 'Erro ao salvar.' : 'Peso salvo.', tipo: error ? 'erro' : 'ok' })
    setTimeout(() => { setFeedback(null); setSalvando(null) }, 1500)
  }

  async function recalcularTodos() {
    setRecalc(true)
    const { data, error } = await supabase.rpc('recalcular_scores_fila')
    setFeedback({
      msg: error ? 'Erro ao recalcular.' : `${data} famílias recalculadas com sucesso.`,
      tipo: error ? 'erro' : 'ok',
    })
    setRecalc(false)
    setTimeout(() => setFeedback(null), 3000)
  }

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Pesos de priorização da fila — altere e recalcule</p>
        </div>
        <button
          className="btn btn-ocre"
          onClick={recalcularTodos}
          disabled={recalc}
        >
          {recalc ? 'Recalculando...' : '↻ Recalcular scores da fila'}
        </button>
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>
            {feedback.msg}
          </div>
        )}

        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-6)' }}>
          <span>⚠️</span>
          <span>
            Alterar os pesos não muda automaticamente a fila — clique em <strong>Recalcular scores da fila</strong> após salvar as mudanças.
            Famílias confirmadas ou em ciclo ativo <strong>não são afetadas</strong>.
          </span>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--terra-100)', background: 'var(--terra-50)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px', gap: 'var(--space-4)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-500)' }}>
              <span>Critério</span>
              <span>Pontos</span>
              <span>Ativo</span>
              <span></span>
            </div>
          </div>

          {pesos.map(p => (
            <PesoRow
              key={p.id}
              peso={p}
              salvando={salvando === p.id}
              onSalvar={salvarPeso}
            />
          ))}
        </div>

      </div>
    </>
  )
}

function PesoRow({
  peso,
  salvando,
  onSalvar,
}: {
  peso: Peso
  salvando: boolean
  onSalvar: (id: number, novoPeso: number, ativo: boolean) => void
}) {
  const [valor, setValor] = useState(peso.peso)
  const [ativo, setAtivo] = useState(peso.ativo)
  const changed = valor !== peso.peso || ativo !== peso.ativo

  return (
    <div style={{
      padding: 'var(--space-4) var(--space-5)',
      borderTop: '1px solid var(--terra-100)',
      opacity: ativo ? 1 : 0.5,
      transition: 'opacity var(--transition)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px', gap: 'var(--space-4)', alignItems: 'center' }}>

        {/* Label + descrição */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--terra-800)' }}>{peso.label}</div>
          {peso.descricao && (
            <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)', marginTop: 2 }}>{peso.descricao}</div>
          )}
        </div>

        {/* Input de pontos */}
        <input
          type="number"
          min={0}
          max={100}
          value={valor}
          onChange={e => setValor(Number(e.target.value))}
          className="form-input"
          style={{ marginBottom: 0, width: 80, textAlign: 'center', fontWeight: 500 }}
          disabled={!ativo}
        />

        {/* Toggle ativo */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ativo}
            onChange={e => setAtivo(e.target.checked)}
            style={{ accentColor: 'var(--musgo-500)', width: 16, height: 16 }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--terra-500)' }}>
            {ativo ? 'Ativo' : 'Inativo'}
          </span>
        </label>

        {/* Botão salvar */}
        <button
          className={`btn btn-sm ${changed ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onSalvar(peso.id, valor, ativo)}
          disabled={!changed || salvando}
        >
          {salvando ? '...' : changed ? 'Salvar' : 'Salvo'}
        </button>
      </div>
    </div>
  )
}
