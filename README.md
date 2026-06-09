# triagem-alimento-cestas

Sistema de gestão de cestas básicas — CEDEM  
Stack: Next.js 14 · Supabase · Vercel · GitHub

---

## Setup local (primeira vez)

### 1. Clone o repositório
```bash
git clone https://github.com/SEU_USUARIO/triagem-alimento-cestas.git
cd triagem-alimento-cestas
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
Renomeie `.env.local` e preencha com seus valores do Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://cxzyujfksierpujwzjad.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```
> A `anon key` está em Supabase → Settings → API

### 4. Rode localmente
```bash
npm run dev
```
Acesse: http://localhost:3000

---

## Deploy na Vercel

1. Acesse vercel.com → New Project → importe o repositório do GitHub
2. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Clique em Deploy

Após o deploy, todo push na branch `main` faz redeploy automático.

---

## Estrutura do projeto

```
app/
  layout.tsx          — Layout raiz
  page.tsx            — Redireciona para /dashboard
  login/page.tsx      — Tela de login
  dashboard/
    layout.tsx        — Layout com sidebar (protegido por auth)
    page.tsx          — Dashboard com resumo e stats
  triagem/page.tsx    — Triagem de duplicatas (human in the loop)
  fila/page.tsx       — Fila de prioridade + confirmar ciclo
  entregas/page.tsx   — Controle de entregas mês a mês
  familias/page.tsx   — Cadastro completo de famílias

components/
  layout/Sidebar.tsx  — Navegação lateral

lib/supabase/
  client.ts           — Cliente browser
  server.ts           — Cliente servidor

types/index.ts        — Tipos TypeScript do schema
styles/globals.css    — Axé Design System tokens
middleware.ts         — Proteção de rotas por autenticação
```

---

## Arquivos externos

- `001_schema_inicial.sql` — Schema do Supabase (já executado)
- `002_apps_script_webhook.js` — Script Google Apps Script (já configurado)
