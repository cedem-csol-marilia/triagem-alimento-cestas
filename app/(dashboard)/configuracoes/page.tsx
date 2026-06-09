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

type Aba = 'priorizacao' | 'duplicatas'

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const [aba,      setAba]      = useState<Aba>('priorizacao')
  const [pesos,    setPesos]    = useState<Peso[]>([])
  const [pesosDup, setPesosDup] = useState<Peso[]>([])
  const [loading,  setLoading]  = useState(true)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)
  const [recalc,   setRecalc]   = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: prio }, { data: dup }] = await Promise.all([
      supabase.from('config_pesos_priorizacao').select('*').order('ordem', { ascending: true }),
      supabase.from('config_pesos_duplicacao').select('*').order('ordem', { ascending: true }),
    ])
    setPesos((prio as Peso[]) ?? [])
    setPesosDup((dup as Peso[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  function mostrarFeedback(msg: string, tipo: 'ok' | 'erro') {
    setFeedback({ msg, tipo })
    setTimeout(() => { setFeedback(null); setSalvando(null) }, 1500)
  }

  async function salvarPeso(tabela: 'config_pesos_priorizacao' | 'config_pesos_duplicacao', id: number, novoPeso: number, ativo: boolean) {
    setSalvando(id)
    const { error } = await supabase
      .from(tabela)
      .update({ peso: novoPeso, ativo, atualizado_em: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      const setter = tabela === 'config_pesos_priorizacao' ? setPesos : setPesosDup
      setter(prev => prev.map(p => p.id === id ? { ...p, peso: novoPeso, ativo } : p))
    }
    mostrarFeedback(error ? 'Erro ao salvar.' : 'Peso salvo.', error ? 'erro' : 'ok')
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
          <p className="page-subtitle">
            {aba === 'priorizacao'
              ? 'Pesos de priorização da fila — altere e recalcule'
              : 'Regra de duplicatas — pesos do score de similaridade entre cadastros'}
          </p>
        </div>
        {aba === 'priorizacao' && (
          <button className="btn btn-ocre" onClick={recalcularTodos} disabled={recalc}>
            {recalc ? 'Recalculando...' : '↻ Recalcular scores da fila'}
          </button>
        )}
      </div>

      <div className="page-content">

        {/* Abas */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          {([
            { id: 'priorizacao', label: 'Priorização da fila' },
            { id: 'duplicatas',  label: 'Regra de duplicatas' },
          ] as { id: Aba; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius-pill)',
                border: `1.5px solid ${aba === t.id ? 'var(--terra-800)' : 'var(--terra-200)'}`,
                background: aba === t.id ? 'var(--terra-800)' : 'white',
                color: aba === t.id ? 'var(--palha)' : 'var(--terra-600)',
                fontSize: '0.8rem',
                fontWeight: aba === t.id ? 500 : 400,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                transition: 'all var(--transition)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>
            {feedback.msg}
          </div>
        )}

        {aba === 'priorizacao' ? (
          <>
            <div className="alert alert-warning" style={{ marginBottom: 'var(--space-6)' }}>
              <span>⚠️</span>
              <span>
                Alterar os pesos não muda automaticamente a fila — clique em <strong>Recalcular scores da fila</strong> após salvar as mudanças.
                Famílias confirmadas ou em ciclo ativo <strong>não são afetadas</strong>.
              </span>
            </div>

            <TabelaPesos
              titulo="Critério"
              pesos={pesos}
              salvando={salvando}
              onSalvar={(id, p, a) => salvarPeso('config_pesos_priorizacao', id, p, a)}
            />
          </>
        ) : (
          <>
            <div className="alert alert-warning" style={{ marginBottom: 'var(--space-5)' }}>
              <span>ℹ️</span>
              <span>
                Estes pesos definem o <strong>score de similaridade</strong> (chance de dois cadastros serem a mesma casa).
                É diferente do score de priorização. Após alterar, vá em <strong>Triagem → Detectar duplicatas</strong> para
                aplicar a nova regra. Pares já decididos não são reabertos.
              </span>
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4) var(--space-5)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-500)', marginBottom: 'var(--space-3)' }}>
                Faixas de decisão (score final, 0–100)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', fontSize: '0.78rem', color: 'var(--terra-700)' }}>
                <span><strong style={{ color: 'var(--mogno-500)' }}>≥ 80</strong> · duplicata muito provável</span>
                <span><strong style={{ color: 'var(--terra-700)' }}>50–79</strong> · provável, revisar</span>
                <span><strong style={{ color: 'var(--ocre-600)' }}>30–49</strong> · possível, revisar</span>
                <span><strong style={{ color: 'var(--terra-400)' }}>&lt; 30</strong> · famílias distintas</span>
              </div>
            </div>

            <TabelaPesos
              titulo="Sinal"
              pesos={pesosDup}
              salvando={salvando}
              onSalvar={(id, p, a) => salvarPeso('config_pesos_duplicacao', id, p, a)}
            />
          </>
        )}

      </div>
    </>
  )
}

function TabelaPesos({
  titulo,
  pesos,
  salvando,
  onSalvar,
}: {
  titulo: string
  pesos: Peso[]
  salvando: number | null
  onSalvar: (id: number, novoPeso: number, ativo: boolean) => void
}) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--terra-100)', background: 'var(--terra-50)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px', gap: 'var(--space-4)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-500)' }}>
          <span>{titulo}</span>
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
          onSalvar={onSalvar}
        />
      ))}
    </div>
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

        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--terra-800)' }}>{peso.label}</div>
          {peso.descricao && (
            <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)', marginTop: 2 }}>{peso.descricao}</div>
          )}
        </div>

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
