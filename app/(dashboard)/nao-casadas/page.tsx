'use client'
// app/(dashboard)/nao-casadas/page.tsx
//
// Fila de exceções da automação (entregas_nao_casadas): o Make recebeu o
// e-mail mas não conseguiu casar a entrega. Aqui a operadora faz o DE-PARA —
// liga a linha a uma FAMÍLIA e a uma ENTREGA — e a RPC resolver_nao_casada
// escreve o efeito no banco e fecha a linha.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EntregaNaoCasada } from '@/types'

interface FamiliaOpcao {
  id: string
  nome_responsavel: string
  whatsapp: string | null
  whatsapp_norm: string | null
}

interface EntregaOpcao {
  id: string
  mes_referencia: string
  status: string
  tipo: string
  pedido_loja: string | null
}

// Só dígitos — para casar o whatsapp cru da linha com o da família.
const digitos = (s: string | null) => (s ?? '').replace(/\D/g, '')

const ESTAGIO_ROTULO: Record<string, string> = {
  pedido: 'Pedido', nf: 'NF', entregue: 'Entregue', falha: 'Falha',
}

const MOTIVO_INSTRUCAO: Record<string, string> = {
  whatsapp_ausente:      'A automação não extraiu o WhatsApp. Pegue o número no e-mail/payload, ache a família e case manualmente.',
  familia_nao_encontrada:'O WhatsApp não bate com nenhuma família (típico das entregas antigas). Cadastre/corrija a família, ou feche sem casar se ela não deve existir.',
  multiplas_familias:    'Há duas ou mais famílias com o mesmo WhatsApp. Deduplique (mesclar famílias) antes e depois case.',
  sem_entrega_no_mes:    'A família existe, mas não há entrega pendente nesse mês. Case criando uma entrega avulsa no mês.',
  sem_entrega_disponivel:'Todas as entregas pendentes do mês já têm pedido. Crie uma entrega adicional, ou confira se é pedido duplicado.',
}

function mesAtualStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function NaoCasadasPage() {
  const supabase = createClient()
  const [linhas,   setLinhas]   = useState<EntregaNaoCasada[]>([])
  const [familias, setFamilias] = useState<FamiliaOpcao[]>([])
  const [loading,  setLoading]  = useState(true)
  const [feedback, setFeedback] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: ls }, { data: fs }] = await Promise.all([
      supabase.from('entregas_nao_casadas').select('*').eq('resolvido', false).order('recebido_em', { ascending: false }),
      supabase.from('familias').select('id, nome_responsavel, whatsapp, whatsapp_norm').neq('status', 'inativa').order('nome_responsavel', { ascending: true }),
    ])
    setLinhas((ls as EntregaNaoCasada[]) ?? [])
    setFamilias((fs as FamiliaOpcao[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  function flash(msg: string, tipo: 'ok' | 'erro') {
    setFeedback({ msg, tipo })
    setTimeout(() => setFeedback(null), 3500)
  }

  if (loading) return (
    <>
      <div className="page-header"><h1 className="page-title">Entregas não casadas</h1></div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Entregas não casadas</h1>
        <p className="page-subtitle">
          {linhas.length === 0 ? 'Nada pendente' : `${linhas.length} linha${linhas.length !== 1 ? 's' : ''} para revisar`}
        </p>
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>{feedback.msg}</div>
        )}

        {/* Instruções */}
        <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)', background: 'var(--terra-50)' }}>
          <div style={{ fontWeight: 500, color: 'var(--terra-800)', marginBottom: 'var(--space-2)' }}>
            O que é isto e o que fazer
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--terra-600)', lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
            A automação leu um e-mail da empresa mas <strong>não soube a qual família/entrega ele pertence</strong>.
            Cada linha tem dois lados: o <strong>pedido</strong> (nº da loja, NF, dados crus do e-mail) e a <strong>família</strong>.
            Para resolver, escolha a <strong>família</strong> dona da linha e a <strong>entrega</strong> onde o efeito entra
            (uma existente ou uma avulsa nova). Ao resolver, o sistema grava no banco e fecha a linha.
          </p>
          <div style={{ fontSize: '0.74rem', color: 'var(--terra-500)', lineHeight: 1.7 }}>
            <strong>Por motivo:</strong> <em>família não encontrada</em> → cadastre/corrija a família (ou feche sem casar);
            {' '}<em>sem entrega no mês</em> → case criando uma avulsa; <em>múltiplas famílias</em> → mescle as duplicatas antes;
            {' '}<em>whatsapp ausente</em> → confira o número no e-mail e ache a família.
          </div>
        </div>

        {linhas.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">Nada para casar</div>
              <div className="empty-state-desc">Todas as entregas da automação foram conciliadas.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {linhas.map(l => (
              <LinhaNaoCasada
                key={l.id}
                linha={l}
                familias={familias}
                onResolvido={() => { carregar(); flash('Linha resolvida e gravada.', 'ok') }}
                onErro={(m) => flash(m, 'erro')}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------
// Uma linha da fila, com seu próprio estado de de-para.
// ------------------------------------------------------------------
function LinhaNaoCasada({
  linha, familias, onResolvido, onErro,
}: {
  linha: EntregaNaoCasada
  familias: FamiliaOpcao[]
  onResolvido: () => void
  onErro: (msg: string) => void
}) {
  const supabase = createClient()

  // Sugestão de família por whatsapp (dígitos batendo).
  const alvo = digitos(linha.whatsapp)
  const sugerida = alvo
    ? familias.find(f => {
        const d = digitos(f.whatsapp)
        return d.length >= 8 && (d === alvo || d.endsWith(alvo) || alvo.endsWith(d))
      })
    : undefined

  const [familiaId, setFamiliaId] = useState<string>(sugerida?.id ?? '')
  const [entregas,  setEntregas]  = useState<EntregaOpcao[]>([])
  const [entregaId, setEntregaId] = useState<string>('')          // '' = criar avulsa
  const [mes,       setMes]       = useState<string>(mesAtualStr())
  const [dataEntrega, setDataEntrega] = useState<string>('')
  const [salvando,  setSalvando]  = useState(false)

  // Ao escolher família, carrega as entregas dela (pendentes primeiro).
  useEffect(() => {
    if (!familiaId) { setEntregas([]); setEntregaId(''); return }
    supabase.from('painel_entregas')
      .select('id, mes_referencia, status, tipo, pedido_loja')
      .eq('familia_id', familiaId)
      .order('mes_referencia', { ascending: false })
      .then(({ data }) => setEntregas((data as EntregaOpcao[]) ?? []))
  }, [familiaId, supabase])

  async function resolver() {
    if (!familiaId) { onErro('Escolha a família primeiro.'); return }
    setSalvando(true)
    const { data, error } = await supabase.rpc('resolver_nao_casada', {
      p_id:             linha.id,
      p_familia_id:     familiaId,
      p_entrega_id:     entregaId || null,
      p_mes_referencia: entregaId ? null : mes,
      p_data_entrega:   linha.estagio === 'entregue' ? (dataEntrega || null) : null,
    })
    setSalvando(false)
    if (error) { onErro('Erro ao resolver: ' + error.message); return }
    const r = data as { ok?: boolean; motivo?: string; detalhe?: string }
    if (r && r.ok === false) { onErro(r.detalhe || r.motivo || 'Não foi possível casar.'); return }
    onResolvido()
  }

  async function fecharSemCasar() {
    setSalvando(true)
    const { error } = await supabase.from('entregas_nao_casadas')
      .update({ resolvido: true, resolvido_em: new Date().toISOString() })
      .eq('id', linha.id)
    setSalvando(false)
    if (error) { onErro('Erro ao fechar: ' + error.message); return }
    onResolvido()
  }

  const pendentes = entregas.filter(e => e.status === 'pendente')

  return (
    <div className="card" style={{ padding: 'var(--space-5)', opacity: salvando ? 0.6 : 1 }}>
      {/* Cabeçalho da linha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <span style={{ background: 'var(--terra-700)', color: 'var(--palha)', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
          {ESTAGIO_ROTULO[linha.estagio] ?? linha.estagio}
        </span>
        <span style={{ background: 'var(--mogno-100, #F6E5DF)', color: 'var(--mogno-500)', fontSize: '0.62rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
          {linha.motivo}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>
          recebido em {new Date(linha.recebido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {MOTIVO_INSTRUCAO[linha.motivo] && (
        <div style={{ fontSize: '0.76rem', color: 'var(--terra-600)', background: 'var(--areia)', borderLeft: '2px solid var(--ocre-400)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)' }}>
          {MOTIVO_INSTRUCAO[linha.motivo]}
        </div>
      )}

      {/* Dados crus do e-mail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-2)', fontSize: '0.78rem', marginBottom: 'var(--space-4)' }}>
        {[
          ['Nome',      linha.nome],
          ['WhatsApp',  linha.whatsapp],
          ['Endereço',  linha.endereco],
          ['CEP',       linha.cep],
          ['Nº pedido', linha.pedido_loja],
          ['NF',        linha.nfe_numero],
        ].filter(([, v]) => v).map(([lbl, val]) => (
          <div key={lbl as string} style={{ color: 'var(--terra-600)' }}>
            <span style={{ color: 'var(--terra-400)' }}>{lbl}: </span>
            <strong style={{ color: 'var(--terra-800)' }}>{val}</strong>
          </div>
        ))}
      </div>

      {/* De-para */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            Família {sugerida && <span style={{ color: 'var(--musgo-500)', fontWeight: 600 }}>· ★ provável: {sugerida.nome_responsavel}</span>}
          </label>
          <select className="form-input" value={familiaId} onChange={e => { setFamiliaId(e.target.value); setEntregaId('') }} style={{ marginBottom: 0 }}>
            <option value="">Selecione a família…</option>
            {familias.map(f => (
              <option key={f.id} value={f.id}>
                {f.nome_responsavel}{sugerida?.id === f.id ? ' ★' : ''}{f.whatsapp ? ` — ${f.whatsapp}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Entrega-alvo</label>
          <select className="form-input" value={entregaId} onChange={e => setEntregaId(e.target.value)} disabled={!familiaId} style={{ marginBottom: 0 }}>
            <option value="">+ Criar entrega avulsa no mês</option>
            {pendentes.length > 0 && <optgroup label="Pendentes">
              {pendentes.map(e => (
                <option key={e.id} value={e.id}>
                  {fmtMes(e.mes_referencia)} · {e.tipo}{e.pedido_loja ? ` · pedido ${e.pedido_loja}` : ''}
                </option>
              ))}
            </optgroup>}
            {entregas.filter(e => e.status !== 'pendente').length > 0 && <optgroup label="Outras">
              {entregas.filter(e => e.status !== 'pendente').map(e => (
                <option key={e.id} value={e.id}>
                  {fmtMes(e.mes_referencia)} · {e.status}{e.pedido_loja ? ` · pedido ${e.pedido_loja}` : ''}
                </option>
              ))}
            </optgroup>}
          </select>
        </div>
      </div>

      {/* Mês da avulsa (quando não escolheu entrega existente) */}
      {!entregaId && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Mês da nova entrega</label>
            <input type="month" className="form-input" value={mes.slice(0, 7)} onChange={e => setMes(e.target.value + '-01')} style={{ marginBottom: 0 }} />
          </div>
        </div>
      )}

      {/* Data, só quando o estágio é "entregue" */}
      {linha.estagio === 'entregue' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 220 }}>
            <label className="form-label">Data da entrega (opcional)</label>
            <input type="date" className="form-input" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} style={{ marginBottom: 0 }} />
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button className="btn btn-musgo" onClick={resolver} disabled={salvando || !familiaId}>
          {salvando ? 'Salvando…' : 'Resolver e gravar'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={fecharSemCasar} disabled={salvando}
          title="Fecha a linha sem alterar entregas — para casos que não devem existir.">
          Fechar sem casar
        </button>
      </div>
    </div>
  )
}

function fmtMes(s: string) {
  const [ano, mes] = s.split('-')
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}
