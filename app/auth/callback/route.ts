import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type OtpType = 'invite' | 'recovery' | 'signup' | 'email' | 'email_change'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code       = requestUrl.searchParams.get('code')
  const tokenHash  = requestUrl.searchParams.get('token_hash')
  const type       = requestUrl.searchParams.get('type') as OtpType | null
  const next       = requestUrl.searchParams.get('next') ?? '/dashboard'

  const response = NextResponse.redirect(new URL(next, request.url))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options ?? {})
          )
        },
      },
    }
  )

  // Fluxo PKCE (login social / magic link / reset via resetPasswordForEmail)
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    return response
  }

  // Fluxo token_hash (convite e recuperação via template de e-mail)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return response
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
