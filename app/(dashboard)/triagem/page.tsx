'use client'
// app/(dashboard)/triagem/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DecisaoTriagem } from '@/types'

interface RespostaNova {
  resposta_id: string
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
  cand_nome: string | null
  cand_whatsapp: string | null
  cand_endereco: string | null
  cand_cep: string | null
  cand_bairro: string | null
  cand_ponto_ref: string | null
  cand_score: number | null
  cand_status: string | null
  cand_ciclos_anteriores: number
}

interface DuplicataDetectada {
  id: string
  familia_id_1: string
  familia_id_2: string
  score: number
  motivos: string[]
  f1: { nome_responsavel: string; whatsapp: string | null; endereco: string | null; cep: string | null; bairro: string | null; ponto_referencia: string | null; score: number; status: string }
  f2: { nome_responsavel: string; whatsapp: string | null; endereco: string | null; cep: string | null; bairro: string | null; ponto_referencia: string | null; score: number; status: string }
}

const DECISOES: { id: DecisaoTriagem; label: string; sub: string; style: React.CSSProperties }[] = [
  { id: 'mesma_casa',      label: 'Mesma casa',      sub: 'mesclar com cadastro', style: { background: 'var(--musgo-700)', color: 'var(--musgo-100)', border: '1.5px solid var(--musgo-700)' } },
  { id: 'casas_separadas', label: 'Casas separadas', sub: 'novo cadastro',        style: { background: 'var(--terra-100)', color: 'var(--terra-800)', border: '1.5px solid var(--terra-300)' } },
  { id: 'recadastro',      label: 'Recadastro',      sub: 'já está no sistema',  style: { background: '#FDF6D3', color: 'var(--ocre-600)', border: '1.5px solid var(--ocre-200)' } },
  { id: 'ignorar',         label: 'Ignorar',         sub: 'dado inválido',       style: { background: 'var(--mogno-100)', color: 'var(--mogno-500)', border: '1.5px solid var(--mogno-300)' } },
]

export default function TriagemPage() {
  const supabase = createClient()
  const [respostas,  setRespostas]  = useState<RespostaNova[]>([])
  const [duplicatas, setDuplicatas] = useState<DuplicataDetectada[]>([])
  const [loading,    setLoading]    = useState(true)
  const [decidindo,  setDecidindo]  = useState<string | null>(null)
  const [obs,        setObs]        = useState<Record<string, string>>({})
  const [feedback,   setFeedback]   = useState<{ id: string; msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: resp }, { data: dups }] = await Promise.all([
      supabase.from('triagem_pendente').select('*').order('confianca_match', { ascending: false }),
      supabase.from('duplicatas_detectadas').select('id, familia_id_1, familia_id_2, score, motivos, f1:familias!familia_id_1(nome_responsavel,whatsapp,endereco,cep,bairro,ponto_referencia,score,status), f2:familias!familia_id_2(nome_responsavel,whatsapp,endereco,cep,bairro,ponto_referencia,score,status)').eq('status', 'pendente').order('score', { ascending: false }),
    ])
    setRespostas((resp as RespostaNova[]) ?? [])
    setDuplicatas((dups as unknown as DuplicataDetectada[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function decidirResposta(item: RespostaNova, decisao: DecisaoTriagem) {
    setDecidindo(item.resposta_id)
    const { error } = await supabase.from('respostas_forms').update({
      dedup_status: decisao === 'mesma_casa' ? 'mesma_casa' : decisao === 'casas_separadas' ? 'separado' : decisao === 'recadastro' ? 'recadastro' : 'ignorado',
      decisao, decidido_em: new Date().toISOString(), decidido_obs: obs[item.resposta_id] ?? null,
      familia_id: decisao === 'mesma_casa' ? item.candidata_familia_id : undefined,
    }).eq('id', item.resposta_id)

    if (!error && decisao === 'casas_separadas') {
      await supabase.from('familias').insert({
        nome_responsavel: item.nome_raw, whatsapp: item.whatsapp_raw,
        endereco: item.endereco_raw, bairro: item.bairro_raw, cep: item.cep_raw,
        ponto_referencia: item.ponto_referencia_raw, num_total_pessoas_raw: item.num_pessoas_raw,
        num_criancas: item.num_criancas_raw ?? 0, num_idosos: item.num_idosos_raw ?? 0,
        renda_faixa: item.renda_raw, tem_pcd: item.tem_pcd_raw?.toLowerCase() === 'sim',
        pode_buscar_cedem: item.pode_buscar_cedem_raw?.toLowerCase() === 'sim',
        status: 'fila', ids_respostas_forms: [item.resposta_id],
      })
    }
    mostrarFeedback(item.resposta_id, error)
  }

  async function decidirDuplicata(dup: DuplicataDetectada, decisao: 'mesma_casa' | 'separadas', inativaId?: string) {
    setDecidindo(dup.id)
    const mantidaId = inativaId === dup.familia_id_1 ? dup.familia_id_2 : dup.familia_id_1
    const { error } = await supabase.from('duplicatas_detectadas').update({
      status: decisao, decidido_em: new Date().toISOString(),
      decidido_obs: obs[dup.id] ?? null,
      familia_mantida_id: decisao === 'mesma_casa' ? mantidaId : null,
    }).eq('id', dup.id)

    if (!error && decisao === 'mesma_casa' && inativaId) {
      await supabase.from('familias').update({
        status: 'inativa', observacao: 'Mesclada na triagem — duplicata confirmada'
      }).eq('id', inativaId)
    }
    mostrarFeedback(dup.id, error)
  }

  function mostrarFeedback(id: string, error: any) {
    setFeedback({ id, msg: error ? 'Erro ao salvar.' : 'Decisão registrada.', tipo: error ? 'erro' : 'ok' })
    setTimeout(() => { setFeedback(null); setDecidindo(null); carregar() }, 1200)
  }

  const total = respostas.length + duplicatas.length

  if (loading) return (
    <><div className="page-header"><h1 className="page-title">Triagem</h1></div>
    <div className="page-content"><div className="spinner" /></div></>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Triagem</h1>
          <p className="page-subtitle">
            {total === 0 ? 'Tudo triado' : `${total} item${total !== 1 ? 's' : ''} aguardam decisão`}
            {respostas.length > 0 && ` · ${respostas.length} resposta${respostas.length !== 1 ? 's' : ''} nova${respostas.length !== 1 ? 's' : ''}`}
            {duplicatas.length > 0 && ` · ${duplicatas.length} duplicata${duplicatas.length !== 1 ? 's' : ''} entre cadastros`}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
          <BotaoDetectarDuplicatas onDetectou={carregar} />
          <div style={{ background: 'var(--terra-50)', border: '1px solid var(--terra-200)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', maxWidth: 300, fontSize: '0.72rem', color: 'var(--terra-600)', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 500, color: 'var(--terra-800)', marginBottom: 4 }}>Como usar</div>
            <div><strong style={{ color: 'var(--musgo-700)' }}>Mesma casa</strong> — mescla os registros</div>
            <div><strong style={{ color: 'var(--terra-700)' }}>Casas separadas</strong> — famílias distintas</div>
            <div><strong style={{ color: 'var(--ocre-600)' }}>Recadastro</strong> — já existe, sem penalidade</div>
            <div><strong style={{ color: 'var(--mogno-500)' }}>Ignorar</strong> — dado inválido</div>
          </div>
        </div>
      </div>

      <div className="page-content">
        {total === 0 && (
          <div className="card"><div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">Tudo triado</div>
            <div className="empty-state-desc">Nenhuma duplicata pendente.</div>
          </div></div>
        )}

        {respostas.length > 0 && (
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <SectionTitle title="Novas respostas do Forms" count={respostas.length} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {respostas.map(item => (
                <div key={item.resposta_id} className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
                  <CardHeader titulo="Nova resposta — possível duplicata" confianca={item.confianca_match ?? 0} motivos={item.candidata_motivos ?? []} />
                  <div style={{ padding: 'var(--space-5)' }}>
                    <ComparacaoLados
                      esq={{ label: 'Nova resposta', dados: [['Nome', item.nome_raw], ['WhatsApp', item.whatsapp_raw], ['Endereço', item.endereco_raw], ['CEP', item.cep_raw], ['Bairro', item.bairro_raw], ['Ref.', item.ponto_referencia_raw]] }}
                      dir={{ label: 'Cadastro existente', dados: [['Nome', item.cand_nome], ['WhatsApp', item.cand_whatsapp], ['Endereço', item.cand_endereco], ['CEP', item.cand_cep], ['Bairro', item.cand_bairro], ['Ref.', item.cand_ponto_ref], ['Score', item.cand_score ? `${item.cand_score} pts · ${item.cand_status}` : null]] }}
                    />
                    <CampoObs value={obs[item.resposta_id] ?? ''} onChange={v => setObs(p => ({ ...p, [item.resposta_id]: v }))} />
                    {feedback?.id === item.resposta_id && <FeedbackAlert feedback={feedback} />}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                      {DECISOES.map(d => <BotaoDecisao key={d.id} {...d} onClick={() => decidirResposta(item, d.id)} disabled={decidindo === item.resposta_id} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {duplicatas.length > 0 && (
          <div>
            <SectionTitle title="Duplicatas entre cadastros existentes" count={duplicatas.length} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {duplicatas.map(dup => (
                <div key={dup.id} className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
                  <CardHeader titulo="Dois cadastros — mesma casa?" confianca={dup.score} motivos={dup.motivos ?? []} cor="var(--terra-700)" />
                  <div style={{ padding: 'var(--space-5)' }}>
                    <ComparacaoLados
                      esq={{ label: 'Família 1', dados: [['Nome', dup.f1?.nome_responsavel], ['WhatsApp', dup.f1?.whatsapp], ['Endereço', dup.f1?.endereco], ['CEP', dup.f1?.cep], ['Bairro', dup.f1?.bairro], ['Ref.', dup.f1?.ponto_referencia], ['Score', `${dup.f1?.score} pts · ${dup.f1?.status}`]] }}
                      dir={{ label: 'Família 2', dados: [['Nome', dup.f2?.nome_responsavel], ['WhatsApp', dup.f2?.whatsapp], ['Endereço', dup.f2?.endereco], ['CEP', dup.f2?.cep], ['Bairro', dup.f2?.bairro], ['Ref.', dup.f2?.ponto_referencia], ['Score', `${dup.f2?.score} pts · ${dup.f2?.status}`]] }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--terra-500)', marginBottom: 'var(--space-3)', background: 'var(--terra-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                      Se for mesma casa, escolha qual família <strong style={{ color: 'var(--terra-800)' }}>manter</strong> — a outra será marcada como inativa.
                    </div>
                    <CampoObs value={obs[dup.id] ?? ''} onChange={v => setObs(p => ({ ...p, [dup.id]: v }))} />
                    {feedback?.id === dup.id && <FeedbackAlert feedback={feedback} />}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
                      <BotaoDecisao label={`Manter ${dup.f1?.nome_responsavel?.split(' ')[0]}`} sub="família 1 fica" style={{ background: 'var(--musgo-700)', color: 'var(--musgo-100)', border: '1.5px solid var(--musgo-700)' }} onClick={() => decidirDuplicata(dup, 'mesma_casa', dup.familia_id_2)} disabled={decidindo === dup.id} />
                      <BotaoDecisao label={`Manter ${dup.f2?.nome_responsavel?.split(' ')[0]}`} sub="família 2 fica" style={{ background: 'var(--musgo-500)', color: 'var(--musgo-100)', border: '1.5px solid var(--musgo-500)' }} onClick={() => decidirDuplicata(dup, 'mesma_casa', dup.familia_id_1)} disabled={decidindo === dup.id} />
                      <BotaoDecisao label="São separadas" sub="manter os dois" style={{ background: 'var(--terra-100)', color: 'var(--terra-800)', border: '1.5px solid var(--terra-300)' }} onClick={() => decidirDuplicata(dup, 'separadas')} disabled={decidindo === dup.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function BotaoDetectarDuplicatas({ onDetectou }: { onDetectou: () => void }) {
  const supabase = createClient()
  const [rodando,   setRodando]   = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  async function detectar() {
    setRodando(true)
    setResultado(null)
    const { data, error } = await supabase.rpc('detectar_duplicatas')
    if (error) {
      setResultado('Erro: ' + error.message)
    } else {
      setResultado(data === 0 ? 'Nenhuma duplicata nova encontrada.' : `${data} par${data !== 1 ? 'es' : ''} encontrado${data !== 1 ? 's' : ''} — recarregando...`)
      if (data > 0) setTimeout(onDetectou, 1500)
    }
    setRodando(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button className="btn btn-secondary btn-sm" onClick={detectar} disabled={rodando}>
        {rodando ? '🔍 Analisando...' : '🔍 Detectar duplicatas'}
      </button>
      {resultado && (
        <span style={{ fontSize: '0.68rem', color: 'var(--terra-500)' }}>{resultado}</span>
      )}
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-800)' }}>{title}</h2>
      <span style={{ background: 'var(--terra-200)', color: 'var(--terra-700)', fontSize: '0.65rem', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>{count}</span>
    </div>
  )
}

function CardHeader({ titulo, confianca, motivos, cor = 'var(--terra-800)' }: { titulo: string; confianca: number; motivos: string[]; cor?: string }) {
  return (
    <div style={{ background: cor, padding: 'var(--space-4) var(--space-5)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 500, color: 'var(--palha)' }}>{titulo}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--terra-300)', marginTop: 2 }}>{confianca}% · {motivos.join(' · ')}</div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', marginTop: 'var(--space-3)', borderRadius: 2 }}>
        <div style={{ height: '100%', borderRadius: 2, background: confianca >= 80 ? 'var(--musgo-500)' : confianca >= 60 ? 'var(--ocre-400)' : 'var(--terra-400)', width: `${Math.min(confianca, 100)}%`, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function ComparacaoLados({ esq, dir }: { esq: { label: string; dados: [string, string | null | undefined][] }; dir: { label: string; dados: [string, string | null | undefined][] } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      {[esq, dir].map(lado => (
        <div key={lado.label}>
          <div style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 6 }}>{lado.label}</div>
          {lado.dados.map(([lbl, val]) => (
            <div key={lbl} style={{ fontSize: '0.72rem', color: 'var(--terra-600)', padding: '4px 0', borderBottom: '1px solid var(--terra-100)', display: 'flex', gap: 4 }}>
              <span style={{ color: 'var(--terra-400)', minWidth: 60, flexShrink: 0 }}>{lbl}:</span>
              <strong style={{ color: 'var(--terra-900)' }}>{val ?? '—'}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function CampoObs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
      <label className="form-label">Observação (opcional)</label>
      <textarea className="form-input" rows={2} placeholder="Ex: mãe e filha da mesma casa, confirmado por ligação..." value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function FeedbackAlert({ feedback }: { feedback: { msg: string; tipo: 'ok' | 'erro' } }) {
  return <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`} style={{ marginBottom: 'var(--space-4)' }}>{feedback.msg}</div>
}

function BotaoDecisao({ label, sub, style, onClick, disabled }: { label: string; sub: string; style: React.CSSProperties; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...style, padding: 'var(--space-3) var(--space-2)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer', lineHeight: 1.3, transition: 'opacity var(--transition)', opacity: disabled ? 0.6 : 1 }}>
      {label}<br /><span style={{ fontSize: '0.62rem', fontWeight: 300 }}>{sub}</span>
    </button>
  )
}
