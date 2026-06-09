# supabase/ — lógica do banco versionada

Esta pasta é a **fonte da verdade** da estrutura do banco (tabelas, views,
funções) e o **histórico** das mudanças. Hoje ela é de **referência**: você
continua aplicando o SQL colando no **SQL Editor** do Supabase. A pasta não
sincroniza sozinha com o banco.

## Estrutura

```
supabase/
├── ARQUITETURA.md          ← mapa do fluxo de dados (leia primeiro)
├── README.md               ← este arquivo
├── migrations/             ← mudanças aplicadas, em ordem cronológica
│   ├── 20260609120000_fix_detectar_duplicatas.sql
│   └── 20260609121000_persistir_normalizacao_respostas.sql   (opcional)
└── schema/                 ← snapshot do estado atual de cada objeto
    ├── tables/
    ├── views/
    └── functions/
```

## Como aplicar uma migration

1. Abra o Supabase → **SQL Editor**.
2. Abra o arquivo `.sql` em `migrations/` na ordem (do mais antigo ao mais novo).
3. Antes de qualquer `delete`, rode o `SELECT` de conferência que está comentado no próprio arquivo.
4. Cole e execute.
5. Rode as queries de verificação (também comentadas no arquivo).

## Ordem recomendada agora

1. `20260609120000_fix_detectar_duplicatas.sql` — corrige o bug das duplicatas.
2. `20260609121000_persistir_normalizacao_respostas.sql` — opcional, quando quiser.

## Quando criar uma nova migration

Toda vez que mudar uma função/tabela/view no Supabase:
1. Crie um arquivo `migrations/AAAAMMDDHHMMSS_descricao.sql` com o SQL.
2. Atualize o snapshot correspondente em `schema/`.
3. Se mudar o fluxo, atualize `ARQUITETURA.md`.

## Evolução futura (opcional)

Quando quiser que a pasta aplique mudanças automaticamente, dá para adotar o
**Supabase CLI** (`supabase link` + `supabase db push`). Aí as migrations
viram o jeito oficial de subir mudanças, sem colar no SQL Editor. Não é
necessário agora.
