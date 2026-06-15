'use client'
// components/ui/EditarFamiliaModal.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Familia } from '@/types'

interface Props {
  familia: Familia
  onClose: () => void
  onSalvo: () => void
}

export default function EditarFamiliaModal({ familia, onClose, onSalvo }: Props) {
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')

  const [form, setForm] = useState({
    endereco:            familia.endereco            ?? '',
    complemento:         familia.complemento         ?? '',
    bairro:              familia.bairro              ?? '',
    cep:                 familia.cep                 ?? '',
    ponto_referencia:    familia.ponto_referencia    ?? '',
    num_total_pessoas:   familia.num_total_pessoas   ?? '',
    num_total_pessoas_raw: familia.num_total_pessoas_raw ?? '',
    num_criancas:        familia.num_criancas        ?? 0,
    num_idosos:          familia.num_idosos          ?? 0,
    tem_pcd:             familia.tem_pcd             ?? false,
    monoparental:        familia.monoparental        ?? false,
  })

  function set(campo: string, valor: any) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function salvar() {
    setSalvando(true)
    setErro('')

    const { error } = await supabase
      .from('familias')
      .update({
        endereco:              form.endereco              || null,
        complemento:           form.complemento           || null,
        bairro:                form.bairro               || null,
        cep:                   form.cep                  || null,
        ponto_referencia:      form.ponto_referencia     || null,
        num_total_pessoas:     form.num_total_pessoas ? Number(form.num_total_pessoas) : null,
        num_total_pessoas_raw: form.num_total_pessoas_raw || null,
        num_criancas:          Number(form.num_criancas),
        num_idosos:            Number(form.num_idosos),
        tem_pcd:               form.tem_pcd,
        monoparental:          form.monoparental,
        atualizado_em:         new Date().toISOString(),
      })
      .eq('id', familia.id)

    if (error) {
      setErro('Erro ao salvar: ' + error.message)
      setSalvando(false)
      return
    }

    onSalvo()
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(44,26,14,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-6)',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', borderRadius: 'var(--radius-xl)',
        width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--terra-800)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--palha)' }}>
              Editar família
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--terra-300)', marginTop: 2 }}>
              {familia.nome_responsavel}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--terra-300)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 'var(--space-6)' }}>

          {/* Endereço */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--terra-100)' }}>
              Endereço
            </div>

            <div className="form-group">
              <label className="form-label">Endereço (rua e número)</label>
              <input className="form-input" type="text" value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Ex: Rua das Flores, 123" />
            </div>

            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-input" type="text" value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Ex: apto 2, fundos, casa B" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Bairro</label>
                <input className="form-input" type="text" value={form.bairro} onChange={e => set('bairro', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">CEP</label>
                <input className="form-input" type="text" value={form.cep} onChange={e => set('cep', e.target.value)} placeholder="00000-000" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ponto de referência</label>
              <input className="form-input" type="text" value={form.ponto_referencia} onChange={e => set('ponto_referencia', e.target.value)} placeholder="Ex: Próximo ao mercado X" />
            </div>
          </div>

          {/* Composição */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--terra-800)', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--terra-100)' }}>
              Composição familiar
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Total de pessoas</label>
                <input className="form-input" type="number" min={1} max={20} value={form.num_total_pessoas} onChange={e => set('num_total_pessoas', e.target.value)} />
                <span className="form-hint">Original: {form.num_total_pessoas_raw || '—'}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Crianças (&lt;12 anos)</label>
                <input className="form-input" type="number" min={0} max={20} value={form.num_criancas} onChange={e => set('num_criancas', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Idosos (60+)</label>
                <input className="form-input" type="number" min={0} max={20} value={form.num_idosos} onChange={e => set('num_idosos', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--terra-700)' }}>
                <input type="checkbox" checked={form.tem_pcd} onChange={e => set('tem_pcd', e.target.checked)} style={{ accentColor: 'var(--musgo-500)', width: 16, height: 16 }} />
                Pessoa com deficiência
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--terra-700)' }}>
                <input type="checkbox" checked={form.monoparental} onChange={e => set('monoparental', e.target.checked)} style={{ accentColor: 'var(--musgo-500)', width: 16, height: 16 }} />
                Família monoparental
              </label>
            </div>
          </div>

          {/* Aviso sobre score */}
          <div className="alert alert-warning" style={{ marginBottom: 'var(--space-5)' }}>
            <span>💡</span>
            <span style={{ fontSize: '0.78rem' }}>
              Após editar, vá em <strong>Configurações → Recalcular scores</strong> para atualizar a posição na fila.
            </span>
          </div>

          {erro && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{erro}</div>}

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}