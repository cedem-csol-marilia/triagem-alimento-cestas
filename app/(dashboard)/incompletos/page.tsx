'use client'
// app/incompletos/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import EditarFamiliaModal from '@/components/ui/EditarFamiliaModal'
import type { Familia } from '@/types'

interface CadastroIncompleto {
  id: string
  nome_responsavel: string
  whatsapp: string | null
  endereco: string | null
  endereco_norm: string | null
  bairro: string | null
  cep: string | null
  ponto_referencia: string | null
  num_total_pessoas_raw: string | null
  num_criancas: number
  num_idosos: number
  renda_faixa: string | null
  score: number
  criado_em: string
  contatada_em: string | null
  motivo_incompleto: string
}

export default function IncompletosPage() {
  const supabase = createClient()
  const [familias,  setFamilias]  = useState<CadastroIncompleto[]>([])
  const [loading,   setLoading]   = useState(true)
  const [acao,      setAcao]      = useState<string | null>(null)
  const [editando,  setEditando]  = useState<Familia | null>(null)
  const [feedback,  setFeedback]  = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('cadastro_incompleto')
      .select('*')
      .order('criado_em', { ascending: true })
    setFamilias((data as CadastroIncompleto[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function moverParaFila(id: string) {
    setAcao(id)
    const { error } = await supabase
      .from('familias')
      .update({ status: 'fila' })
      .eq('id', id)
    setFeedback({ msg: error ? 'Erro ao mover.' : 'Família movida para a fila.', tipo: error ? 'erro' : 'ok' })
    setTimeout(() => { setFeedback(null); setAcao(null); carregar() }, 1200)
  }

  async function marcarContatada(id: string) {
    setAcao(id)
    const { error } = await supabase
      .from('familias')
      .update({ contatada_em: new Date().toISOString() })
      .eq('id', id)
    setFeedback({ msg: error ? 'Erro.' : 'Marcada como contatada.', tipo: error ? 'erro' : 'ok' })
    setTimeout(() => { setFeedback(null); setAcao(null); carregar() }, 1200)
  }

  async function abrirEdicao(id: string) {
    const { data, error } = await supabase.from('familias').select('*').eq('id', id).single()
    if (error || !data) {
      setFeedback({ msg: 'Erro ao abrir o cadastro.', tipo: 'erro' })
      return
    }
    setEditando(data as Familia)
  }

  function formatarDiaMes(s: string) {
    return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  async function marcarInativa(id: string) {
    setAcao(id)
    const { error } = await supabase
      .from('familias')
      .update({ status: 'inativa', observacao: 'Cadastro incompleto — sem contato para solicitar complemento' })
      .eq('id', id)
    setFeedback({ msg: error ? 'Erro.' : 'Família marcada como inativa.', tipo: error ? 'erro' : 'ok' })
    setTimeout(() => { setFeedback(null); setAcao(null); carregar() }, 1200)
  }

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Cadastro Incompleto</h1>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Cadastro Incompleto</h1>
        <p className="page-subtitle">
          {familias.length === 0
            ? 'Nenhum cadastro incompleto'
            : `${familias.length} família${familias.length !== 1 ? 's' : ''} com dados faltando`}
        </p>
      </div>

      <div className="page-content">

        {feedback && (
          <div className={`alert alert-${feedback.tipo === 'ok' ? 'success' : 'error'}`}>
            {feedback.msg}
          </div>
        )}

        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-6)' }}>
          <span>📋</span>
          <span>
            Famílias abaixo têm cadastro incompleto — geralmente endereço sem número ou WhatsApp inválido.
            Você pode entrar em contato pelo WhatsApp para pedir o complemento, mover para a fila mesmo assim, ou marcar como inativa.
          </span>
        </div>

        {familias.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">Tudo completo</div>
              <div className="empty-state-desc">Nenhum cadastro incompleto no momento.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {familias.map(f => (
              <div key={f.id} className="card" style={{ padding: 'var(--space-5)', opacity: acao === f.id ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>

                  {/* Dados */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--terra-900)' }}>
                        {f.nome_responsavel}
                      </div>
                      <span style={{
                        background: 'var(--ocre-200)',
                        color: 'var(--ocre-600)',
                        fontSize: '0.62rem',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--ocre-200)',
                      }}>
                        {f.motivo_incompleto}
                      </span>
                      {f.contatada_em && (
                        <span style={{
                          background: 'var(--musgo-100)',
                          color: 'var(--musgo-700)',
                          fontSize: '0.62rem',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          border: '1px solid var(--musgo-300)',
                        }}>
                          ✓ Contatada em {formatarDiaMes(f.contatada_em)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: '0.78rem' }}>
                      {[
                        ['WhatsApp',  f.whatsapp],
                        ['Endereço',  f.endereco],
                        ['Bairro',    f.bairro],
                        ['CEP',       f.cep],
                        ['Ref.',      f.ponto_referencia],
                        ['Pessoas',   f.num_total_pessoas_raw],
                        ['Crianças',  f.num_criancas > 0 ? String(f.num_criancas) : null],
                        ['Idosos',    f.num_idosos > 0 ? String(f.num_idosos) : null],
                        ['Renda',     f.renda_faixa],
                      ].filter(([, v]) => v).map(([lbl, val]) => (
                        <div key={lbl} style={{ color: 'var(--terra-600)' }}>
                          <span style={{ color: 'var(--terra-400)' }}>{lbl}: </span>
                          <strong style={{ color: 'var(--terra-800)' }}>{val}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 180 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => abrirEdicao(f.id)}
                      disabled={acao === f.id}
                    >
                      ✏️ Completar cadastro
                    </button>
                    {f.whatsapp && (
                      <a
                        href={`https://wa.me/55${f.whatsapp.replace(/\D/g, '')}?text=Olá! Recebemos seu cadastro para as cestas básicas do CEDEM. Para continuar, precisamos do seu endereço completo com número. Pode nos informar?`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-musgo btn-sm"
                        style={{ textAlign: 'center', textDecoration: 'none' }}
                      >
                        📱 Contatar no WhatsApp
                      </a>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => marcarContatada(f.id)}
                      disabled={acao === f.id}
                    >
                      {f.contatada_em ? 'Contatada ✓' : 'Marcar como contatada'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => moverParaFila(f.id)}
                      disabled={acao === f.id}
                    >
                      Mover para a fila mesmo assim
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => marcarInativa(f.id)}
                      disabled={acao === f.id}
                    >
                      Marcar como inativa
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <EditarFamiliaModal
          familia={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}
    </>
  )
}
