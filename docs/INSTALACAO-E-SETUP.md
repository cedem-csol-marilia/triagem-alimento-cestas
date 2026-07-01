# Instalação e Setup — triagem-alimento-cestas

Guia completo do que precisa estar instalado e de **tudo que foi rodado no terminal**
para montar o projeto do zero, mais a estrutura de como o Supabase foi organizado.
Serve como referência de reprodução (montar de novo numa máquina nova) e como anexo
técnico da apresentação do projeto.

> Stack: **Next.js 14 · TypeScript · Supabase (Postgres) · Vercel**.
> Ingestão: **Google Forms → Apps Script**. Automação: **Make**.

---

## 1. Pré-requisitos (instalar uma vez por máquina)

| Ferramenta | Para quê | Como verificar |
|---|---|---|
| **Node.js LTS** (18+ ou 20+) | rodar o Next.js e o `npm`/`npx` | `node -v` e `npm -v` |
| **Git** | versionar e dar push pro GitHub | `git --version` |
| **Editor** (VS Code) | escrever o código | — |
| **Conta Supabase** | banco Postgres + auth (painel web) | supabase.com |
| **Conta Vercel** | deploy do site | vercel.com |
| **Conta Google** | Form + Planilha + Apps Script | — |
| **Conta Make** | automação de entregas | make.com |

```bash
# Conferir se Node e Git já estão instalados
node -v      # deve mostrar v18+ ou v20+
npm -v
git --version
```

> Se o Node não estiver instalado: baixar o **LTS** em nodejs.org (o instalador já traz o `npm` e o `npx`).
> No Windows, instalar também o **Git for Windows** (git-scm.com).

---

## 2. Criar o projeto Next.js

```bash
# Cria o app já com TypeScript, ESLint e App Router
npx create-next-app@latest triagem-alimento-cestas

# Respostas usadas no assistente:
#   TypeScript? ............ Yes
#   ESLint? ................ Yes
#   Tailwind CSS? .......... No   (o projeto usa CSS próprio — Axé Design System)
#   src/ directory? ........ No
#   App Router? ............ Yes
#   import alias (@/*)? .... Yes

cd triagem-alimento-cestas
```

---

## 3. Instalar as dependências do Supabase

```bash
# Cliente do Supabase + helper de auth para Server Components (SSR)
npm install @supabase/supabase-js @supabase/ssr
```

Versões que ficaram no `package.json`:

```jsonc
"dependencies": {
  "next": "14.2.3",
  "react": "^18",
  "react-dom": "^18",
  "@supabase/supabase-js": "^2.43.1",
  "@supabase/ssr": "^0.3.0"
},
"devDependencies": {
  "typescript": "^5",
  "@types/node": "^20",
  "@types/react": "^18",
  "@types/react-dom": "^18",
  "eslint": "^8",
  "eslint-config-next": "14.2.3"
}
```

> O `create-next-app` já instala `next`, `react`, `react-dom`, `typescript`, os `@types/*`,
> `eslint` e `eslint-config-next`. O único `npm install` manual foi o do Supabase acima.

---

## 4. Variáveis de ambiente

Criar um arquivo **`.env.local`** na raiz (nunca commitar — já está no `.gitignore`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

> A `anon key` fica em **Supabase → Settings → API**.
> A `service_role` **não** entra no app nem na automação (é chave de admin). Use só a `anon` no front.

---

## 5. Rodar localmente

```bash
npm run dev      # sobe em http://localhost:3000
npm run build    # build de produção (checa erros de TypeScript)
npm run start    # roda o build localmente
npm run lint     # ESLint
```

---

## 6. Versionar e subir pro GitHub

```bash
git init
git add .
git commit -m "deploy inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/triagem-alimento-cestas.git
git push -u origin main
```

> `.gitignore` já ignora `node_modules/`, `.next/`, `.env*` e arquivos de chave.

---

## 7. Deploy na Vercel

1. vercel.com → **New Project** → importar o repositório do GitHub.
2. Em **Environment Variables**, adicionar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Deploy.**
4. A partir daí, todo `git push` na branch `main` faz **redeploy automático**.

---

## 8. Supabase — como o banco foi montado

O Supabase **não** foi gerenciado por CLI local. Foi montado pelo **painel web**, e o
**SQL Editor** é onde cada mudança foi aplicada. A pasta `supabase/` do repositório é a
**fonte da verdade versionada** — cada alteração no banco virou um arquivo SQL numerado.

### 8.1 Passos no painel

1. supabase.com → **New Project** (escolher região e senha do Postgres).
2. **Settings → API** → copiar a `URL` e a `anon key` para o `.env.local` e para a Vercel.
3. **Authentication → Providers** → e-mail ligado; SMTP do Gmail configurado para os
   e-mails de convite / reset de senha.
4. **SQL Editor** → colar e rodar cada migration, em ordem de timestamp.
5. Depois de criar/alterar uma função (RPC), rodar `notify pgrst, 'reload schema';`
   para o PostgREST recarregar a API.

### 8.2 Convenção de migrations

Cada mudança no banco é um arquivo em `supabase/migrations/` com nome:

```
AAAAMMDDHHMMSS_descricao_curta.sql
# ex.: 20260617121000_rpcs_automacao_entregas.sql
```

São aplicados em ordem no SQL Editor. Funções, tabelas e views "estáveis" também têm
um **snapshot** do estado atual em `supabase/schema/` (para leitura rápida, sem precisar
reconstruir mentalmente a partir do histórico).

### 8.3 Estrutura da pasta `supabase/`

```
supabase/
├── ARQUITETURA.md          — mapa do fluxo de dados (ler primeiro)
├── README.md
├── migrations/             — histórico real, 1 arquivo por mudança (ordem = timestamp)
│   └── AAAAMMDDHHMMSS_*.sql
└── schema/                 — snapshot do estado atual
    ├── tables/             — config_pesos_duplicacao, duplicatas_detectadas, ...
    ├── views/              — triagem_pendente, painel_entregas, cadastro_incompleto, ...
    └── functions/          — importar_resposta_forms, detectar_duplicatas, ...
```

### 8.4 Tabelas principais

| Tabela | Papel |
|---|---|
| `respostas_forms` | input cru do Google Form (só o Apps Script escreve) |
| `familias` | cadastros consolidados — o registro "oficial" de cada família |
| `duplicatas_detectadas` | pares de cadastros suspeitos de serem a mesma casa |
| `ciclos` | ciclos de entrega por família (janela de 3 meses) |
| `entregas` | entregas individuais dentro de um ciclo (núcleo da automação) |
| `entregas_nao_casadas` | fila de exceções: o que a automação recebeu mas não casou |
| `config_pesos_priorizacao` | pesos do score (renda, crianças, monoparental, PCD...) |
| `config_pesos_duplicacao` | pesos e corte da regra de duplicata |
| `sobrenomes_comuns` | apoio à dedup (sobrenome comum vale menos) |
| `triagem_log` | histórico de decisões de triagem |

### 8.5 Views

| View | Para quê |
|---|---|
| `triagem_pendente` | respostas novas com candidata → tela "Novas respostas do Forms" |
| `fila_priorizada` | fila ordenada por score |
| `painel_entregas` | entregas com dados da família |
| `cadastro_incompleto` | cadastros faltando dados |

### 8.6 Funções (RPCs) principais

| Função | Papel |
|---|---|
| `importar_resposta_forms` | normaliza + insere a resposta do Form + acha duplicata candidata |
| `detectar_duplicatas` | compara cadastros existentes dois a dois |
| `calcular_score` | pontua a prioridade da família |
| `mesclar_familias` / `reativar_familia` | juntar duplicatas / desfazer mescla |
| `registrar_entrega_avulsa` | entrega fora do ciclo |
| `casar_familia_por_whatsapp` | acha a família pelo WhatsApp (chave da automação) |
| `registrar_pedido_loja` / `registrar_nf` / `registrar_entrega_concluida` | estágios da automação (idempotentes) |
| `resolver_nao_casada` | liga manualmente uma entrega não casada a uma família |

> Todas as RPCs são **idempotentes** e usam `SECURITY DEFINER`. A automação só escreve
> **via RPC** — nunca `UPDATE` cru. O que não casa vai para `entregas_nao_casadas`.

---

## 9. Ingestão do Google Form (Apps Script)

1. Google Form → respostas vinculadas a uma **Planilha** (via `IMPORTRANGE` / vínculo nativo).
2. Na Planilha: **Extensões → Apps Script**.
3. Colar o script `docs/apps-script/ingestao-forms.gs` (lê por **nome de coluna**, à prova
   de reordenação) e configurar o **gatilho** (trigger) para rodar a cada nova resposta.
4. O script chama a RPC `importar_resposta_forms` no Supabase (HTTP POST com a `anon key`),
   que normaliza, deduplica e insere.

---

## 10. Automação de entregas (Make)

- **Dois fluxos no Make**, casados pelo **WhatsApp** da família:
  1. **Pedido** — lê o e-mail de pedido da loja → chama `registrar_pedido_loja`.
  2. **Entrega** — lê o e-mail de entrega/NF → chama `registrar_entrega_concluida` / `registrar_nf`.
- Cada fluxo faz **POST** numa RPC do Supabase (`/rest/v1/rpc/<funcao>`).
- Regras: só escreve via RPC; RPC idempotente (retry não duplica); o que não casa cai em
  `entregas_nao_casadas` para revisão manual na tela `/nao-casadas`.
- **Nunca** usar a `service_role` no Make — usar chave restrita / RPC.

Detalhes do parsing dos e-mails em `docs/AUTOMACAO-ENTREGAS.md`.

---

## 11. Resumo — sequência de comandos do terminal

```bash
# 1. pré-requisitos (conferir)
node -v ; npm -v ; git --version

# 2. criar o app
npx create-next-app@latest triagem-alimento-cestas
cd triagem-alimento-cestas

# 3. dependências do Supabase
npm install @supabase/supabase-js @supabase/ssr

# 4. criar .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

# 5. rodar local
npm run dev

# 6. versionar e subir
git init
git add .
git commit -m "deploy inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/triagem-alimento-cestas.git
git push -u origin main

# 7. Vercel: importar repo + env vars + deploy
# 8. Supabase: rodar as migrations no SQL Editor, em ordem de timestamp
```

> O banco (tabelas, views, RPCs) **não** se monta por `npm` — monta-se aplicando os
> arquivos de `supabase/migrations/` no SQL Editor do painel, em ordem.
