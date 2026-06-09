'use client'
// app/auth/atualizar-senha/page.tsx
// Define uma nova senha. Usada tanto pelo convite (1ª senha) quanto
// pelo "Esqueci minha senha". Exige uma sessão criada pelo /auth/callback.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AtualizarSenhaPage() {
  const supabase = createClient()

  const [senha,    setSenha]    = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro,     setErro]     = useState('')
  const [ok,       setOk]       = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [temSessao, setTemSessao] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setTemSessao(!!data.session))
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) { setErro('A senha precisa ter ao menos 8 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não coincidem.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro('Não foi possível salvar a senha. O link pode ter expirado — peça um novo.')
      setLoading(false)
      return
    }
    setOk(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1500)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terra-900)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
      <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', padding: 'var(--space-10)', width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--terra-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)', fontSize: '1.4rem' }}>🌿</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 500, color: 'var(--terra-900)', marginBottom: 'var(--space-1)' }}>Definir senha</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--terra-500)' }}>Escolha uma senha para acessar o sistema</p>
        </div>

        {temSessao === false ? (
          <div className="alert alert-error">
            Link inválido ou expirado. Volte ao <a href="/login" style={{ color: 'var(--mogno-500)', fontWeight: 500 }}>login</a> e use &quot;Esqueci minha senha&quot; para receber um novo.
          </div>
        ) : ok ? (
          <div className="alert alert-success">Senha salva! Redirecionando...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <input className="form-input" type="password" placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar senha</label>
              <input className="form-input" type="password" placeholder="••••••••" value={confirma} onChange={e => setConfirma(e.target.value)} required autoComplete="new-password" />
            </div>
            {erro && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{erro}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || temSessao === null}>
              {loading ? 'Salvando...' : 'Salvar senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
