'use client'
// app/login/page.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  const [email,   setEmail]   = useState('')
  const [senha,   setSenha]   = useState('')
  const [erro,    setErro]    = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
  e.preventDefault()
  setErro('')
  setLoading(true)

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setErro('Erro Supabase: ' + error.message + ' | Código: ' + error.status)
      setLoading(false)
      return
    }

    if (!data.session) {
      setErro('Login ok mas sem sessão — tente novamente')
      setLoading(false)
      return
    }

    setErro('✅ Login ok! Redirecionando...')
    setTimeout(() => {
      window.location.replace('/dashboard')
    }, 1000)

  } catch (err: any) {
    setErro('Exceção: ' + err.message)
    setLoading(false)
  }
}

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--terra-900)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-10)',
        width: '100%',
        maxWidth: '400px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--terra-800)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-4)',
            fontSize: '1.4rem',
          }}>🌿</div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.4rem',
            fontWeight: 500,
            color: 'var(--terra-900)',
            marginBottom: 'var(--space-1)',
          }}>
            Triagem de Alimentos
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--terra-500)' }}>
            CEDEM — Gestão de cestas básicas
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {erro && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          color: 'var(--terra-400)',
          marginTop: 'var(--space-6)',
        }}>
          Acesso restrito — apenas colaboradoras autorizadas
        </p>
      </div>
    </div>
  )
}
