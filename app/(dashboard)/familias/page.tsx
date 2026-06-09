'use client'
// app/familias/page.tsx
// Página em construção — será expandida em breve

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Familia } from '@/types'

export default function FamiliasPage() {
  const supabase = createClient()
  const [familias, setFamilias] = useState<Familia[]>([])
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('familias')
        .select('*')
        .order('nome_responsavel', { ascending: true })
      setFamilias((data as Familia[]) ?? [])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  const filtradas = familias.filter(f =>
    f.nome_responsavel.toLowerCase().includes(busca.toLowerCase()) ||
    (f.bairro ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (f.whatsapp ?? '').includes(busca)
  )

  if (loading) return (
    <>
      <div className="page-header">
        <h1 className="page-title">Famílias</h1>
      </div>
      <div className="page-content"><div className="spinner" /></div>
    </>
  )

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Famílias</h1>
          <p className="page-subtitle">{familias.length} cadastros · {filtradas.length} exibidos</p>
        </div>
        <input
          className="form-input"
          type="search"
          placeholder="Buscar por nome, bairro ou WhatsApp..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ width: 280, marginBottom: 0 }}
        />
      </div>

      <div className="page-content">
        {filtradas.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">👩‍👧</div>
              <div className="empty-state-title">Nenhuma família encontrada</div>
              <div className="empty-state-desc">Tente outro termo de busca.</div>
            </div>
          </div>
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
                </tr>
              </thead>
              <tbody>
                {filtradas.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--terra-900)' }}>{f.nome_responsavel}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--terra-400)' }}>{f.endereco}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{f.bairro ?? '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {f.whatsapp ? (
                        <a href={`https://wa.me/55${f.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--musgo-500)' }}>
                          {f.whatsapp}
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {f.num_total_pessoas_raw ?? f.num_total_pessoas ?? '—'} pessoas
                      {f.num_criancas > 0 && <span style={{ color: 'var(--terra-500)' }}> · {f.num_criancas} cr.</span>}
                      {f.num_idosos  > 0 && <span style={{ color: 'var(--terra-500)' }}> · {f.num_idosos} id.</span>}
                      {f.tem_pcd        && <span style={{ color: 'var(--mogno-500)' }}> · PCD</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', maxWidth: 140 }}>
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
                        {f.status === 'fila' ? 'Na fila' : f.status === 'confirmada' ? 'Confirmada' : f.status === 'ativa' ? 'Ativa' : f.status === 'concluida' ? 'Concluída' : 'Inativa'}
                      </span>
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
