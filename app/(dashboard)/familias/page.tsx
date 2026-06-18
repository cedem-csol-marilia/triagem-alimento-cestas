'use client'
// app/(dashboard)/familias/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Familia } from '@/types'
import EditarFamiliaModal from '@/components/ui/EditarFamiliaModal'
import FichaFamiliaModal from '@/components/ui/FichaFamiliaModal'

type FiltroStatus = 'todos' | 'fila' | 'confirmada' | 'ativa' | 'concluida' | 'inativa'

const LABELS_STATUS: Record<string, string> = {
  fila:       'Na fila',
  confirmada: 'Confirmada',
  ativa:      'Ativa',
  concluida:  'Concluída',
  inativa:    'Inativa',
}

export default function FamiliasPage() {
  const supabase = createClient()
  const [familias,   setFamilias]   = useState<Familia[]>([])
  const [loading,    setLoading]    = useState(true)
  const [busca,      setBusca]      = useState('')
  const [filtro,     setFiltro]     = useState<FiltroStatus>('todos')
  const [editando,   setEditando]   = useState<Familia | null>(null)
  const [fichaId,    setFichaId]    = useState<string | null>(null)
  const [feedback,   setFeedback]   = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('familias')
      .select('*')
      .order('nome_responsavel', { ascending: true })
    setFamilias((data as Familia[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function removerDoCiclo(f: Familia) {
    if (!confirm(`Remover ${f.nome_responsavel} do ciclo? Ela volta para a fila.`)) return
    const { error } = await supabase.rpc('remover_do_ciclo', { p_familia_id: f.id })
    if (error) {
      setFeedback({ msg: error.message, tipo: 'erro' })
    } else {
      setFeedback({ msg: `${f.nome_responsavel} voltou para a fila.`, tipo: 'ok' })
      carregar()
    }
    setTimeout(() => setFeedback(null), 4000)
  }

  const filtradas = familias.filter(f => {
    const matchBusca = !busca ||
      f.nome_responsavel.toLowerCase().includes(busca.toLowerCase()) ||
      (f.bairro ?? '').toLowerCase().includes(busca.toLowerCase()) ||
      (f.whatsapp ?? '').includes(busca) ||
      (f.endereco ?? '').toLowerCase().includes(busca.toLowerCase())
    const matchFiltro = filtro === 'todos' || f.status === filtro
    return matchBusca && matchFiltro
  })

  // Contagem por status
  const contagens = familias.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Exportar confirmadas para pedido
  function exportarConfirmadas() {
    const confirmadas = familias.filter(f => f.status === 'confirmada')
    if (confirmadas.length === 0) {
      alert('Nenhuma família confirmada para o próximo ciclo.')
      return
    }
    // Ordem espelha a etapa de Entrega do site. A coluna "Notas do pedido" já vem
    // montada (whatsapp só-dígitos + ponto de referência): cole EXATAMENTE essa
    // célula no campo "Notas no pedido (opcional)" do site — assim o whatsapp sempre
    // chega na Observação do e-mail e a automação casa por ele.
    const cabecalho = ['Nome', 'CEP', 'Endereço', 'Bairro', 'Cidade', 'Ponto de referência', 'WhatsApp', 'Notas do pedido (colar exatamente no site)', 'Total pessoas', 'Crianças', 'Idosos', 'Pode buscar CEDEM']
    const linhas = [
      cabecalho.join(';'),
      ...confirmadas.map(f => {
        const wpp = (f.whatsapp ?? '').replace(/[^0-9]/g, '')
        const notas = [wpp, f.ponto_referencia ?? ''].filter(Boolean).join(' · ')
        return [
          f.nome_responsavel,
          f.cep ?? '',
          f.endereco ?? '',
          f.bairro ?? '',
          'São Paulo',
          f.ponto_referencia ?? '',
          f.whatsapp ?? '',
          notas,
          f.num_total_pessoas_raw ?? f.num_total_pessoas ?? '',
          f.num_criancas,
          f.num_idosos,
          f.pode_buscar_cedem ? 'Sim' : 'Não',
        ].join(';')
      })
    ]
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `pedido-cestas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <><div className="page-header"><h1 className="page-title">Famílias</h1></div>
    <div className="page-content"><div className="spinner" /></div></>
  )

  return (
    <>
      {editando && (
        <EditarFamiliaModal
          familia={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      {fichaId && (
        <FichaFamiliaModal
          familiaId={fichaId}
          onClose={() => setFichaId(null)}
          onEditar={(f) => { setFichaId(null); setEditando(f) }}
          onMudou={carregar}
        />
      )}

      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Famílias</h1>
          <p className="page-subtitle">{filtradas.length} de {familias.length} cadastros</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            type="search"
            placeholder="Buscar por nome, bairro, WhatsApp..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ width: 260, marginBottom: 0 }}
          />
          <button className="btn btn-secondary btn-sm" onClick={exportarConfirmadas}>
            ⬇ Exportar pedido
          </button>
        </div>
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginBottom: 'var(--space-4)' }}>
            {feedback.msg}
          </div>
        )}

        {/* Filtros por status */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          {([
            { id: 'todos',     label: 'Todos',      count: familias.length },
            { id: 'fila',      label: 'Na fila',    count: contagens.fila      ?? 0 },
            { id: 'confirmada',label: 'Confirmadas', count: contagens.confirmada ?? 0 },
            { id: 'ativa',     label: 'Ativas',     count: contagens.ativa     ?? 0 },
            { id: 'concluida', label: 'Concluídas', count: contagens.concluida ?? 0 },
            { id: 'inativa',   label: 'Inativas',   count: contagens.inativa   ?? 0 },
          ] as { id: FiltroStatus; label: string; count: number }[]).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              style={{
                padding: '5px 14px',
                borderRadius: 'var(--radius-pill)',
                border: `1.5px solid ${filtro === f.id ? 'var(--terra-800)' : 'var(--terra-200)'}`,
                background: filtro === f.id ? 'var(--terra-800)' : 'white',
                color: filtro === f.id ? 'var(--palha)' : 'var(--terra-600)',
                fontSize: '0.78rem',
                fontWeight: filtro === f.id ? 500 : 400,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                transition: 'all var(--transition)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {f.label}
              <span style={{
                background: filtro === f.id ? 'rgba(255,255,255,0.2)' : 'var(--terra-100)',
                color: filtro === f.id ? 'var(--palha)' : 'var(--terra-500)',
                fontSize: '0.62rem', fontWeight: 600,
                padding: '0 5px', borderRadius: 10,
              }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <div className="card"><div className="empty-state">
            <div className="empty-state-icon">👩‍👧</div>
            <div className="empty-state-title">Nenhuma família encontrada</div>
            <div className="empty-state-desc">Tente outro termo de busca ou filtro.</div>
          </div></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Bairro</th>
                  <th>WhatsApp</th>
                  <th>Composição</th>
                  <th>Renda</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(f => (
                  <tr key={f.id} style={{ opacity: f.status === 'inativa' ? 0.6 : 1 }}>
                    <td>
                      <button onClick={() => setFichaId(f.id)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontWeight: 500, color: 'var(--terra-900)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                        {f.nome_responsavel}
                        {f.endereco_verificado_em && <span title="Endereço verificado" style={{ marginLeft: 6, color: 'var(--musgo-700)' }}>✓</span>}
                      </button>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{f.endereco ?? '—'}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{f.bairro ?? '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {f.whatsapp ? (
                        <a href={`https://wa.me/55${f.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--musgo-500)' }}>
                          {f.whatsapp}
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {f.num_total_pessoas_raw ?? f.num_total_pessoas ?? '—'} pessoas
                      {f.num_criancas > 0 && <span style={{ color: 'var(--terra-500)' }}> · {f.num_criancas} cr.</span>}
                      {f.num_idosos  > 0 && <span style={{ color: 'var(--terra-500)' }}> · {f.num_idosos} id.</span>}
                      {f.tem_pcd        && <span style={{ color: 'var(--mogno-500)' }}> · PCD</span>}
                      {f.monoparental   && <span style={{ color: 'var(--terra-500)' }}> · mono</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', maxWidth: 130 }}>
                      <span style={{ display: 'inline-block', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.renda_faixa ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: f.score >= 70 ? 'var(--mogno-500)' : f.score >= 50 ? 'var(--terra-700)' : 'var(--terra-400)' }}>
                        {f.score}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${f.status}`}>
                        {LABELS_STATUS[f.status] ?? f.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {(f.status === 'confirmada' || f.status === 'ativa') && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => removerDoCiclo(f)}
                            style={{ fontSize: '0.72rem', color: 'var(--mogno-500)' }}
                            title="Remove do ciclo e devolve à fila (só antes de receber a 1ª cesta)"
                          >
                            Remover do ciclo
                          </button>
                        )}
                        {f.status !== 'inativa' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditando(f)}
                            style={{ fontSize: '0.72rem' }}
                          >
                            Editar
                          </button>
                        )}
                      </div>
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
