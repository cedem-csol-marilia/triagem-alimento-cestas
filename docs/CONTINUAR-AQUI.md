# Continuar aqui — estado do projeto

> Arquivo de retomada. Numa conversa NOVA, peça pro Claude ler este arquivo
> primeiro. Assim ele recupera o contexto sem precisar do histórico todo do chat.

## Como retomar (cole numa conversa nova)
"Continue o projeto triagem-alimento-cestas. Leia docs/CONTINUAR-AQUI.md,
docs/ROADMAP.md e supabase/ARQUITETURA.md para pegar o contexto, e vamos
seguir a partir das pendências."

## Sessão 19/jun — dashboard, ciclo e fila de não-casadas
Mudanças de interface + 1 migration. **Build (tsc --noEmit) passou limpo.**
- **Dashboard** (`app/(dashboard)/dashboard/page.tsx`) reescrito:
  - Banner único de **Pendências** (triagem + cadastro incompleto + não-casadas).
  - Cards de cestas do mês: **Programadas** (todas), **Solicitadas**
    (pedido_confirmado OU pedido_loja), **Entregues** (status='entregue').
  - Card **Não casadas** (conta `entregas_nao_casadas` abertas) → leva a `/nao-casadas`.
  - **Ciclo lido do banco**: `lib/ciclo.ts` calcula a janela de 3 meses ancorada
    no MENOR `data_inicio` dos ciclos. Mostra "mês N de 3" + janela real. Para
    travar um mês fixo, setar `CICLO_ANCORA` em `lib/ciclo.ts` (1 linha).
- **Página `/nao-casadas`** (de-para): liga cada linha a uma família + entrega
  e grava via RPC. Sugere família por whatsapp. Sidebar/layout com badge.
- **Migration `20260619120000_resolver_nao_casada.sql`** (RPC idempotente,
  SECURITY DEFINER, grant authenticated). Snapshot em `schema/functions/`.

PENDENTE AO RETOMAR:
1. **Aplicar a migration `20260619120000` no Supabase vivo** (a página /nao-casadas
   depende da RPC `resolver_nao_casada`). Rodar e conferir `notify pgrst, 'reload schema'`.
2. Conferir a contagem "Programadas = 9" bate com `painel_entregas` do mês.
3. NF: decisão da Marília — **não** construir o fluxo de NF no Make por ora
   (consumo de créditos); o estágio 'nf' da RPC fica pronto mas inativo.

## O que já está pronto (jun/2026)
- Build + deploy (Vercel) OK; auth com login, reset e convite por e-mail (SMTP Gmail).
- Triagem de duplicatas: score configurável (Config → Regra de duplicatas), corte 30,
  sinal de composição, endereço graduado (gate 0.7 + mesmo CEP).
- Score de priorização: monoparental (coluna criada), renda per capita por faixa
  (rótulos novos e antigos), auxílio sem depender de acento, per capita usando
  num_total_pessoas do raw quando o inteiro falta.
- Ficha da Família (drawer 360º) ao clicar no nome em Famílias e Fila.
- Remover do ciclo (antes da 1ª entrega) → volta pra fila.
- Form reestruturado (endereço em campos separados, renda em faixas, auxílio Sim/Não).
- Apps Script lê por NOME de coluna (à prova de reordenação) — docs/apps-script/ingestao-forms.gs
- importar_resposta_forms cria família na fila quando NÃO há duplicata.
- supabase/ versionado: migrations + snapshots em schema/.

## Sessão 12/jun — saga das duplicatas (LER ANTES DE MEXER NA REGRA)
Fila explodiu de 11 → 47. Causa: composição familiar (+20) contava sem gate de
endereço; combinada com sobrenome (+15) passava do corte 30. Iteramos:
- 20260612120000: composição exige sinal de endereço → 39 (gate fraco demais: CEP).
- 20260612130000: "mesma casa" = CEP + rua 0.7 + TODOS os números iguais → 6.
  CONFERIDO NA MÃO (query 20–29 pts): dos 12 logo abaixo do corte, 11 eram
  vizinhança (correto excluir) e 1 era real (Grace x Tauane Elchin, nº 644,
  "casa 18" no complemento quebra o match de números).
- 20260612140000: tentativa de pegar o 644 via word_similarity + número
  principal → fila foi a 20. REVERTIDA.
- 20260612150000: volta à regra da 130000 (validada) + insere o par 644
  manualmente. Estado esperado: fila = 7.

PENDENTE AO RETOMAR:
1. Confirmar que a 20260612150000 foi aplicada e a fila está em 7.
2. Commitar tudo (migrations 120000–150000 + snapshot).
3. REGRA SUSTENTÁVEL (pedido da Marília): a regex no endereço livre é frágil
   por construção. O caminho durável já estava mapeado abaixo ("DEDUP por CEP
   + número exato"): colunas separadas `numero` e `complemento` no form e na
   tabela familias → match exato de número, sem regex, e o caso 644 entra
   naturalmente. Calibrar contra o gabarito desta sessão: os 6 + Grace/Tauane
   devem entrar; os 11 vizinhos da query 20–29 NÃO devem.

## Pendências imediatas
1. COMMITAR as últimas mudanças:
   git add . ; git commit -m "wip melhorias" ; git push origin main
2. ROTACIONAR a service_role do Supabase (apareceu em chat) — Settings → API → Reset,
   e atualizar no Apps Script.

## Próximos passos (escolher na retomada)
- MAKE (automações): 1ª = cadastro incompleto → WhatsApp.
  Pré-requisitos: campo `contatado_em` (anti-spam), acesso só-leitura pro Make
  (chave restrita/RPC, nunca service_role), provedor de WhatsApp (Z-API/Twilio).
  Detalhes em docs/PLANO-FORM-E-AUTOMACOES.md (seção 3).
- POLIMENTO app (independente):
  - Clareza da Triagem: destacar campos que casam + agrupar pares do mesmo lar.
  - Breakdown do score na Ficha (mostrar +15 renda, +10 sem auxílio…). A função
    calcular_score está em supabase/schema/functions/calcular_score.sql.
- DEDUP por CEP + número exato: hoje o número é juntado no endereço; criar coluna
  `numero` própria permite match exato e subir o gate.

## Mapa de arquivos úteis
- docs/ROADMAP.md — melhorias priorizadas.
- docs/PLANO-FORM-E-AUTOMACOES.md — plano do Form + Make.
- supabase/ARQUITETURA.md — fluxo de dados e tabelas.
- supabase/migrations/ — histórico de mudanças no banco.
- supabase/schema/ — estado atual de funções/tabelas/views.
- docs/apps-script/ingestao-forms.gs — script de ingestão (por nome de coluna).
