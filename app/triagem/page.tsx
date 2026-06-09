'use client'
// app/triagem/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TriagemPendente, DecisaoTriagem, Familia } from '@/types'

const DECISOES: {
  id: DecisaoTriagem
  label: string
  sub: string
  style: React.CSSProperties
}[] = [
  {
    id: 'mesma_casa',
    label: 'Mesma casa',
    sub: 'mesclar registros',
    style: { background: 'var(--musgo-700)', color: 'var(--musgo-100)', border: '1.5px solid var(--musgo-700)' },
  },
  {
    id: 'casas_separadas',
    label: 'Casas separadas',
    sub: 'dois cadastros',
    style: { background: 'var(--terra-100)', color: 'var(--terra-800)', border: '1.5px solid var(--terra-300)' },
  },
  {
    id: 'recadastro',
    label: 'Recadastro',
    sub: 'já está no sistema',
    style: { background: '#FDF6D3', color: 'var(--ocre-600)', border: '1.5px solid var(--ocre-200)' },
  },
  {
    id: 'ignorar',
    label: 'Ignorar',
    sub: 'dado inválido',
    style: { background: 'var(--mogno-100)', color: 'var(--mogno-500)', border: '1.5px solid var(--mogno-300)' },
  },
]

interface TriagemItem {
  resposta_id: string
  // Dados da resposta original (pode ser null se veio de comparação família×família)
  nome_raw: string | null
  whatsapp_raw: string | null
  endereco_raw: string | null
  cep_raw: string | null
  bairro_raw: string | null
  ponto_referencia_raw: string | null
  num_pessoas_raw: string | null
  num_criancas_raw: number | null
  num_idosos_raw: number | null
  renda_raw: string | null
  tem_pcd_raw: string | null
  pode_buscar_cedem_raw: string | null
  confianca_match: number | null
  candidata_motivos: string[] | null
  candidata_familia_id: string | null
  familia_id: string | null
  // Dados da família candidata (lado direito)
  cand_nome: string | null
  cand_whatsapp: string | null
  cand_endereco: string | null
  cand_cep: string | null
  cand_bairro: string | null
  cand_ponto_ref: string | null
  cand_score: number | null
  cand_status: string | null
  cand_ciclos_anteriores: number
  // Dados da família do lado esquerdo (quando veio de comparação)
  familia_esquerda?: Familia | null
}

export default function TriagemPage() {
  const supabase = createClient()
  const [items,     setItems]     = useState<TriagemItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [decidindo, setDecidindo] = useState<string | null>(null)
  const [obs,       setObs]       = useState<Record<string, string>>({})
  const [feedback,  setFeedback]  = useState<{ id: string; msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)

    const { data: rawItems } = await supabase
      .from('triagem_pendente')
      .select('*')
      .order('confianca_match', { ascending: false })

    if (!rawItems) { setLoading(false); return }

    // Para itens que vieram de comparação família×família (nome_raw vazio),
    // busca os dados da família do lado esquerdo
    const enriched = await Promise.all(
      rawItems.map(async (item: any) => {
        if (!item.nome_raw && item.familia_id) {
          const { data: fam } = await supabase
            .from('familias')
            .select('*')
            .eq('id', item.familia_id)
            .single()
          return { ...item, familia_esquerda: fam }
        }
        return { ...item, familia_esquerda: null }
      })
    )

    setItems(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  // Dados do lado esquerdo — prefere dados raw, cai back para família
  function dadoEsquerdo(item: TriagemItem, campo: string): string | null {
    const raw = (item as any)[campo + '_raw']
    if (raw) return raw
    if (item.familia_esquerda) {
      const mapa: Record<string, string> = {
        nome: 'nome_responsavel',
        whatsapp: 'whatsapp',
        endereco: 'endereco',
        cep: 'cep',
        bairro: 'bairro',
        ponto_referencia: 'ponto_referencia',
      }
      return (item.familia_esquerda as any)[mapa[campo]] ?? null
    }
    return null
  }

  async function decidir(item: TriagemItem, decisao: DecisaoTriagem) {
    setDecidindo(item.resposta_id)

    const { error } = await supabase
      .from('respostas_forms')
      .update({
        dedup_status: decisao === 'mesma_casa'      ? 'mesma_casa'  :
                      decisao === 'casas_separadas' ? 'separado'    :
                      decisao === 'recadastro'      ? 'recadastro'  : 'ignorado',
        decisao,
        decidido_em:  new Date().toISOString(),
        decidido_obs: obs[item.resposta_id] ?? null,
        familia_id:   decisao === 'mesma_casa' ? item.candidata_familia_id : undefined,
      })
      .eq('id', item.resposta_id)

    // Se casas separadas e veio de comparação família×família,
    // não precisa criar nova família — já existe
    if (!error && decisao === 'casas_separadas' && !item.nome_raw && !item.familia_id) {
      // Família já existe, só registra a decisão
    }

    // Se casas separadas e veio de resposta original sem família
    if (!error && decisao === 'casas_separadas' && item.nome_raw && !item.familia_id) {
      await supabase.from('familias').insert({
        nome_responsavel:      item.nome_raw,
        whatsapp:              item.whatsapp_raw,
        endereco:              item.endereco_raw,
        bairro:                item.bairro_raw,
        cep:                   item.cep_raw,
        ponto_referencia:      item.ponto_referencia_raw,
        num_total_pessoas_raw: item.num_pessoas_raw,
        num_criancas:          item.num_criancas_raw ?? 0,
        num_idosos:            item.num_idosos_raw ?? 0,
        renda_faixa:           item.renda_raw,
        tem_pcd:               item.tem_pcd_raw?.toLowerCase() === 'sim',
        pode_buscar_cedem:     item.pode_buscar_cedem_raw?.toLowerCase() === 'sim',
        status:                'fila',
        ids_respostas_forms:   [item.resposta_id],
      })
    }

    // Se mesma casa, marca a família do lado esquerdo como inativa
    if (!error && decisao === 'mesma_casa' && item.familia_id) {
      await supabase
        .from('familias')
        .update({ status: 'inativa', observacao: 'Mesclada com outra família na triagem' })
        .eq('id', item.familia_id)
    }

    setFeedback({
      id:   item.resposta_id,
      msg:  error ? 'Erro ao salvar decisão.' : 'Decisão registrada.',
      tipo: error ? 'erro' : 'ok',
    })

    setTimeout(() => {
      setFeedback(null)
      setDecidindo(null)
      carregar()
    }, 1200)
  }

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Triagem</h1>
        <p className="page-subtitle">Revisão de possíveis duplicatas</p>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Triagem</h1>
        <p className="page-subtitle">
          {items.length === 0
            ? 'Nenhuma resposta pendente'
            : `${items.length} resposta${items.length !== 1 ? 's' : ''} aguardam sua decisão`}
        </p>
      </div>

      <div className="page-content">

        {items.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">Tudo triado</div>
              <div className="empty-state-desc">
                Nenhuma duplicata pendente. Novas aparecerão aqui automaticamente.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {items.map(item => (
            <div key={item.resposta_id} className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>

              {/* Header */}
              <div style={{ background: 'var(--terra-800)', padding: 'var(--space-4) var(--space-5)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 500, color: 'var(--palha)' }}>
                  Possível duplicata detectada
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--terra-300)', marginTop: 2 }}>
                  Confiança {item.confianca_match ?? 0}% · {(item.candidata_motivos ?? []).join(' · ')}
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', marginTop: 'var(--space-3)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: (item.confianca_match ?? 0) >= 80 ? 'var(--musgo-500)' : 'var(--ocre-400)',
                    width: `${Math.min(item.confianca_match ?? 0, 100)}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>

              <div style={{ padding: 'var(--space-5)' }}>

                {/* Comparação lado a lado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>

                  {/* Lado esquerdo — nova resposta ou família 1 */}
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 6 }}>
                      {item.nome_raw ? 'Nova resposta' : 'Família 1'}
                    </div>
                    {[
                      ['Nome',     dadoEsquerdo(item, 'nome')],
                      ['WhatsApp', dadoEsquerdo(item, 'whatsapp')],
                      ['Endereço', dadoEsquerdo(item, 'endereco')],
                      ['CEP',      dadoEsquerdo(item, 'cep')],
                      ['Bairro',   dadoEsquerdo(item, 'bairro')],
                      ['Ref.',     dadoEsquerdo(item, 'ponto_referencia')],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ fontSize: '0.72rem', color: 'var(--terra-600)', padding: '4px 0', borderBottom: '1px solid var(--terra-100)', display: 'flex', gap: 4 }}>
                        <span style={{ color: 'var(--terra-400)', minWidth: 60 }}>{lbl}:</span>
                        <strong style={{ color: 'var(--terra-900)' }}>{val ?? '—'}</strong>
                      </div>
                    ))}
                  </div>

                  {/* Lado direito — família candidata */}
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 6 }}>
                      {item.nome_raw ? 'Cadastro existente' : 'Família 2'}
                    </div>
                    {[
                      ['Nome',     item.cand_nome],
                      ['WhatsApp', item.cand_whatsapp],
                      ['Endereço', item.cand_endereco],
                      ['CEP',      item.cand_cep],
                      ['Bairro',   item.cand_bairro],
                      ['Ref.',     item.cand_ponto_ref],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ fontSize: '0.72rem', color: 'var(--terra-600)', padding: '4px 0', borderBottom: '1px solid var(--terra-100)', display: 'flex', gap: 4 }}>
                        <span style={{ color: 'var(--terra-400)', minWidth: 60 }}>{lbl}:</span>
                        <strong style={{ color: 'var(--terra-900)' }}>{val ?? '—'}</strong>
                      </div>
                    ))}
                    <div style={{ fontSize: '0.72rem', color: 'var(--terra-600)', padding: '4px 0', display: 'flex', gap: 4 }}>
                      <span style={{ color: 'var(--terra-400)', minWidth: 60 }}>Score:</span>
                      <strong style={{ color: 'var(--terra-900)' }}>
                        {item.cand_score ?? '—'} pts · {item.cand_status ?? '—'}
                        {(item.cand_ciclos_anteriores ?? 0) > 0 && ` · ${item.cand_ciclos_anteriores} ciclo(s) anterior(es)`}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Observação */}
                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Observação (opcional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Ex: mãe e filha da mesma casa, números diferentes..."
                    value={obs[item.resposta_id] ?? ''}
                    onChange={e => setObs(prev => ({ ...prev, [item.resposta_id]: e.target.value }))}
                  />
                </div>

                {/* Feedback */}
                {feedback?.id === item.resposta_id && (
                  <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginBottom: 'var(--space-4)' }}>
                    {feedback.msg}
                  </div>
                )}

                {/* Botões */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  {DECISOES.map(d => (
                    <button
                      key={d.id}
                      onClick={() => decidir(item, d.id)}
                      disabled={decidindo === item.resposta_id}
                      style={{
                        ...d.style,
                        padding: 'var(--space-3) var(--space-2)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        lineHeight: 1.3,
                        transition: 'opacity var(--transition)',
                        opacity: decidindo === item.resposta_id ? 0.6 : 1,
                      }}
                    >
                      {d.label}<br />
                      <span style={{ fontSize: '0.62rem', fontWeight: 300 }}>{d.sub}</span>
                    </button>
                  ))}
                </div>

              </div>
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
