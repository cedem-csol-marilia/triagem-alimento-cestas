# Continuar aqui — estado do projeto

> Arquivo de retomada. Numa conversa NOVA, peça pro Claude ler este arquivo
> primeiro. Assim ele recupera o contexto sem precisar do histórico todo do chat.

## Como retomar (cole numa conversa nova)
"Continue o projeto triagem-alimento-cestas. Leia docs/CONTINUAR-AQUI.md,
docs/ROADMAP.md e supabase/ARQUITETURA.md para pegar o contexto, e vamos
seguir a partir das pendências."

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
