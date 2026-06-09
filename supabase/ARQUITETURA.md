# Arquitetura de dados — triagem-alimento-cestas

Mapa de como os dados andam, do formulário até a tela. Mantenha este
arquivo atualizado quando mexer em tabelas ou funções do Supabase.

## Fluxo completo

```
┌─────────────┐   IMPORTRANGE   ┌──────────────┐   Apps Script    ┌────────────────────────────┐
│ Google Form │ ──────────────► │  Planilha    │ ───────────────► │ RPC importar_resposta_forms │
└─────────────┘                 │  (Sheets)    │   (dados crus)   └────────────┬───────────────┘
                                └──────────────┘                               │
                                                                               │ normaliza + dedup
                                                                               ▼
                                                              ┌──────────────────────────────┐
                                                              │ respostas_forms (INPUT)        │
                                                              │  + dedup_status='novo'         │
                                                              │  + candidata_familia_id        │
                                                              └────────────┬───────────────────┘
                                                                           │
                                          view triagem_pendente            │
                                          (dedup_status='novo' e           ▼
                                           candidata_familia_id IS NOT NULL)
                                                                  ┌────────────────────────┐
                                                                  │ Tela: "Novas respostas │
                                                                  │  do Forms"             │
                                                                  └────────────────────────┘

┌────────────┐  botão "Detectar duplicatas"  ┌──────────────────────┐   grava em   ┌───────────────────────┐
│ familias   │ ────────────────────────────► │ detectar_duplicatas()│ ───────────► │ duplicatas_detectadas │
│ (cadastros)│   compara cada par (f1 x f2)  └──────────────────────┘  status=     └──────────┬────────────┘
└────────────┘                                                          'pendente'              │
                                                                                                ▼
                                                                          ┌──────────────────────────────┐
                                                                          │ Tela: "Duplicatas entre       │
                                                                          │  cadastros existentes"        │
                                                                          └──────────────────────────────┘
```

## As duas deduplicações (não confundir)

| Pergunta | Quem responde | Onde grava | Aparece em |
|----------|---------------|------------|------------|
| "Esta resposta nova já é uma família que existe?" | `buscar_candidatas_dedup` (dentro de `importar_resposta_forms`) | campos de `respostas_forms` (`candidata_familia_id`, `confianca_match`) | "Novas respostas do Forms" (view `triagem_pendente`) |
| "Estes dois cadastros são a mesma casa?" | `detectar_duplicatas` | tabela `duplicatas_detectadas` | "Duplicatas entre cadastros existentes" |

Regra de ouro: **`respostas_forms` é só input do Forms.** Só o Apps Script
escreve nela. Nenhuma função de duplicata deve gravar ali.

## Tabelas principais

- **`respostas_forms`** — input cru do Google Forms (1 linha por resposta). Alimentada só pelo Apps Script via `importar_resposta_forms`.
- **`familias`** — cadastros consolidados. É o registro "oficial" de cada família.
- **`duplicatas_detectadas`** — pares de cadastros existentes suspeitos de serem a mesma casa.
- **`ciclos`** — ciclos de entrega por família.
- **`entregas`** — entregas individuais dentro de um ciclo.
- **`config_pesos_priorizacao`** — pesos dos critérios de score (renda, nº crianças, monoparental, PCD, etc.).
- **`sobrenomes_comuns`** — apoio à dedup (sobrenome comum vale menos no match).
- **`triagem_log`** — histórico de decisões de triagem.

## Views

- **`triagem_pendente`** — respostas novas com candidata → "Novas respostas do Forms".
- **`fila_priorizada`** — fila ordenada por score.
- **`painel_entregas`** — entregas com dados da família.
- **`cadastro_incompleto`** — cadastros faltando dados.

## Funções

| Função | Papel | Versionada aqui? |
|--------|-------|------------------|
| `importar_resposta_forms` | normaliza + insere resposta + acha candidata | ✅ `schema/functions/` |
| `detectar_duplicatas` | compara cadastros existentes 2 a 2 | ✅ `schema/functions/` (versão corrigida) |
| `calcular_similaridade_familias` | dá nota de similaridade entre 2 famílias | ❌ falta colar |
| `buscar_candidatas_dedup` | acha cadastro parecido com uma resposta | ❌ falta colar |
| `normalizar_telefone` / `normalizar_endereco` / `normalizar_cep` | limpam os campos para o match | ❌ falta colar |

> Para versionar as que faltam, rode no SQL Editor
> `select pg_get_functiondef('<nome>'::regproc);` e salve em `schema/functions/`.

## Histórico de correções (migrations)

- `20260609120000_fix_detectar_duplicatas.sql` — corrige a função para gravar em `duplicatas_detectadas` (e não em `respostas_forms`) e comparar todos os cadastros, não só os da fila. Inclui limpeza do lixo antigo.
- `20260609121000_persistir_normalizacao_respostas.sql` — (opcional) faz `importar_resposta_forms` salvar as colunas `*_norm` + backfill.

## Pontos de atenção conhecidos

1. **Segurança:** a `service_role key` e o token do GitHub já apareceram em texto puro — rotacionar ambos.
2. **Normalização não persistida:** resolvido pela migration opcional acima.
3. **Versionamento:** algumas funções ainda não estão neste repo (ver tabela acima).
