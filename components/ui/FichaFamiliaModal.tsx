'use client'
// components/ui/FichaFamiliaModal.tsx
// Drawer lateral com a visão 360º de uma família.
// Reutilizável em Famílias, Fila e Triagem. Recebe só o familiaId.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarData as fmtData } from '@/lib/formatarData'
import type { Familia } from '@/types'

interface Props {
  familiaId: string
  onClose: () => void
  onEditar?: (f: Familia) => void
}

const LABELS_STATUS: Record<string, string> = {
  fila: 'Na fila', confirmada: 'Confirmada', ativa: 'Ativa', concluida: 'Concluída', inativa: 'Inativa',
}
const LABELS_ENTREGA: Record<string, string> = {
  pendente: 'Pendente', entregue: 'Entregue', nao_entregue: 'Não entregue',
}
const LABELS_CICLO: Record<string, string> = {
  confirmado: 'Confirmado', em_curso: 'Em curso', encerrado: 'Encerrado',
}

export default function FichaFamiliaModal({ familiaId, onClose, onEditar }: Props) {
  const supabase = createClient()
  const [fam,       setFam]       = useState<Familia | null>(null)
  const [ciclos,    setCiclos]    = useState<any[]>([])
  const [entregas,  setEntregas]  = useState<any[]>([])
  const [dups,      setDups]      = useState<any[]>([])
  const [respostas, setRespostas] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const [f, c, e, d, r] = await Promise.all([
        supabase.from('familias').select('*').eq('id', familiaId).maybeSingle(),
        supabase.from('ciclos').select('*').eq('familia_id', familiaId).order('data_inicio', { ascending: false }),
        supabase.from('entregas').select('*').eq('familia_id', familiaId).order('mes_referencia', { ascending: false }),
        supabase.from('duplicatas_detectadas')
          .select('id, familia_id_1, familia_id_2, score, status, f1:familias!familia_id_1(nome_responsavel), f2:familias!familia_id_2(nome_responsavel)')
          .or(`familia_id_1.eq.${familiaId},familia_id_2.eq.${familiaId}`),
        supabase.from('respostas_forms').select('id, timestamp_forms, nome_raw, endereco_raw, whatsapp_raw')
          .eq('familia_id', familiaId).order('timestamp_forms', { ascending: false }),
      ])
      setFam((f.data as Familia) ?? null)
      setCiclos(c.data ?? [])
      setEntregas(e.data ?? [])
      setDups((d.data as any[]) ?? [])
      setRespostas(r.data ?? [])
      setLoading(false)
    }
    carregar()
  }, [supabase, familiaId])

  const perfil: string[] = []
  if (fam) {
    if (fam.renda_faixa) perfil.push(fam.renda_faixa)
    if (fam.num_criancas > 0) perfil.push(`${fam.num_criancas} criança(s)`)
    if (fam.num_idosos > 0) perfil.push(`${fam.num_idosos} idoso(s)`)
    if (fam.tem_pcd) perfil.push('PCD')
    if (fam.monoparental) perfil.push('Monoparental')
    if (!fam.auxilio_renda_gov) perfil.push('Sem auxílio do governo')
    if (!fam.pode_buscar_cedem) perfil.push('Não pode buscar no CEDEM')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(44,26,14,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, height: '100%', background: 'white', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        {loading || !fam ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            {loading ? <div className="spinner" /> : <p style={{ color: 'var(--terra-500)' }}>Família não encontrada.</p>}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ background: 'var(--terra-800)', padding: 'var(--space-5)', color: 'var(--palha)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 500 }}>{fam.nome_responsavel}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <span className={`badge badge-${fam.status}`}>{LABELS_STATUS[fam.status] ?? fam.status}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--terra-200)' }}>Score <strong style={{ color: 'var(--palha)' }}>{fam.score}</strong></span>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--terra-200)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

              {/* Perfil (influencia o score) */}
              {perfil.length > 0 && (
                <Secao titulo="Perfil (influencia o score)">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {perfil.map(p => (
                      <span key={p} style={{ fontSize: '0.72rem', background: 'var(--terra-100)', color: 'var(--terra-700)', padding: '3px 10px', borderRadius: 'var(--radius-pill)' }}>{p}</span>
                    ))}
                  </div>
                </Secao>
              )}

              {/* Contato e endereço */}
              <Secao titulo="Contato e endereço">
                <Linha rotulo="WhatsApp" valor={fam.whatsapp ? (
                  <a href={`https://wa.me/55${fam.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--musgo-500)' }}>{fam.whatsapp}</a>
                ) : '—'} />
                <Linha rotulo="Endereço" valor={fam.endereco ?? '—'} />
                <Linha rotulo="Bairro" valor={fam.bairro ?? '—'} />
                <Linha rotulo="CEP" valor={fam.cep ?? '—'} />
                <Linha rotulo="Referência" valor={fam.ponto_referencia ?? '—'} />
                <Linha rotulo="Composição" valor={`${fam.num_total_pessoas_raw ?? fam.num_total_pessoas ?? '—'} pessoas · ${fam.num_criancas} cr. · ${fam.num_idosos} id.`} />
              </Secao>

              {/* Duplicatas ligadas */}
              {dups.length > 0 && (
                <Secao titulo={`Possíveis duplicatas (${dups.length})`}>
                  {dups.map(d => {
                    const outra = d.familia_id_1 === familiaId ? d.f2?.nome_responsavel : d.f1?.nome_responsavel
                    return (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '6px 0', borderBottom: '1px solid var(--terra-100)' }}>
                        <span style={{ color: 'var(--terra-800)' }}>{outra ?? '—'}</span>
                        <span style={{ color: 'var(--terra-500)' }}>{d.score}% · {d.status}</span>
                      </div>
                    )
                  })}
                </Secao>
              )}

              {/* Histórico de ciclos */}
              <Secao titulo={`Ciclos (${ciclos.length})`}>
                {ciclos.length === 0 ? <Vazio texto="Nunca participou de um ciclo." /> : ciclos.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '6px 0', borderBottom: '1px solid var(--terra-100)' }}>
                    <span style={{ color: 'var(--terra-800)' }}>{fmtData(c.data_inicio)} → {fmtData(c.data_fim)}</span>
                    <span style={{ color: 'var(--terra-500)' }}>{LABELS_CICLO[c.status] ?? c.status}</span>
                  </div>
                ))}
              </Secao>

              {/* Entregas */}
              <Secao titulo={`Entregas (${entregas.length})`}>
                {entregas.length === 0 ? <Vazio texto="Nenhuma entrega registrada." /> : entregas.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '6px 0', borderBottom: '1px solid var(--terra-100)' }}>
                    <span style={{ color: 'var(--terra-800)' }}>{fmtData(e.mes_referencia)}{e.data_entrega ? ` · entregue ${fmtData(e.data_entrega)}` : ''}</span>
                    <span style={{ color: e.status === 'entregue' ? 'var(--musgo-700)' : 'var(--terra-500)' }}>{LABELS_ENTREGA[e.status] ?? e.status}</span>
                  </div>
                ))}
              </Secao>

              {/* Respostas do Forms */}
              {respostas.length > 0 && (
                <Secao titulo={`Respostas do Forms (${respostas.length})`}>
                  {respostas.map(r => (
                    <div key={r.id} style={{ fontSize: '0.74rem', color: 'var(--terra-500)', padding: '4px 0', borderBottom: '1px solid var(--terra-100)' }}>
                      {fmtData(r.timestamp_forms)} — {r.nome_raw ?? '—'}
                    </div>
                  ))}
                </Secao>
              )}

              {onEditar && fam.status !== 'inativa' && (
                <button className="btn btn-secondary btn-full" onClick={() => onEditar(fam)}>Editar cadastro</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terra-400)', marginBottom: 8 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--terra-100)' }}>
      <span style={{ color: 'var(--terra-400)', minWidth: 90, flexShrink: 0 }}>{rotulo}</span>
      <span style={{ color: 'var(--terra-900)' }}>{valor}</span>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: '0.78rem', color: 'var(--terra-400)', fontStyle: 'italic' }}>{texto}</p>
}
