-- ============================================================
-- MIGRATION: campos de automação em `entregas` + fila de não-casados
--
-- Contexto: automação que lê os e-mails da Calvo e atualiza a entrega
-- em 3 estágios (+ 1 gancho):
--   1) pedido realizado  — e-mail da loja ("está em processamento")
--   2) NF emitida         — e-mail nfe-calvo (dado vem do PDF/DANFE)
--   3) entregue           — e-mail da loja ("foi entregue e concluído")
--   4) falha na entrega   — gancho, e-mail/critério ainda a definir
--
-- Decisões (alinhadas com a Marília):
--   - 1 NF : 1 família (sem rateio de lote por ora).
--   - Match NUNCA escreve no escuro: o que não casar (família não
--     achada, whatsapp em branco, mais de uma família, sem entrega no
--     mês) vai pra `entregas_nao_casadas` pra revisão manual.
--   - Números de pedido (loja, fiscal, mãe) e NFe são gravados só como
--     AUDITORIA/reconciliação — NÃO são chave de match. A chave de match
--     é o whatsapp normalizado (vide RPCs na migration seguinte).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colunas novas em `entregas`
-- ------------------------------------------------------------
alter table entregas add column if not exists pedido_loja      text;  -- ex.: 209683 (loja virtual)
alter table entregas add column if not exists pedido_fiscal    text;  -- "Nosso Pedido" ex.: 1810114 (GNFe)
alter table entregas add column if not exists pedido_mae       text;  -- "Ped.Mae" ex.: 1809488
alter table entregas add column if not exists nfe_numero       text;  -- ex.: 002632574
alter table entregas add column if not exists nfe_serie        text;  -- ex.: 2
alter table entregas add column if not exists nfe_emitida_em   date;
alter table entregas add column if not exists whatsapp_pedido  text;  -- whatsapp como veio no pedido (auditoria)
alter table entregas add column if not exists motivo_falha     text;  -- preenchido quando status='nao_entregue'
alter table entregas add column if not exists origem           text not null default 'manual'; -- 'manual' | 'make'

-- Garante 1 entrega por número de pedido da loja e por NF (idempotência
-- na raiz: a 2ª chamada com o mesmo pedido/NF não duplica).
create unique index if not exists entregas_pedido_loja_uidx
  on entregas (pedido_loja) where pedido_loja is not null;
create unique index if not exists entregas_nfe_numero_uidx
  on entregas (nfe_numero) where nfe_numero is not null;

-- ------------------------------------------------------------
-- 2) Fila de não-casados
-- Tudo que a automação recebeu mas não conseguiu (ou não deve) gravar
-- direto em `entregas`. É a "caixa de entrada" de exceções pra revisar.
-- ------------------------------------------------------------
create table if not exists entregas_nao_casadas (
  id            uuid primary key default gen_random_uuid(),
  recebido_em   timestamptz not null default now(),
  estagio       text not null check (estagio in ('pedido','nf','entregue','falha')),
  motivo        text not null,  -- whatsapp_ausente | familia_nao_encontrada | multiplas_familias | sem_entrega_no_mes
  whatsapp      text,
  nome          text,
  endereco      text,
  cep           text,
  pedido_loja   text,
  pedido_fiscal text,
  nfe_numero    text,
  payload       jsonb,          -- campos crus extraídos do e-mail/PDF (pra reprocessar)
  resolvido     boolean not null default false,
  entrega_id    uuid references entregas(id),
  resolvido_em  timestamptz
);

create index if not exists entregas_nao_casadas_pendentes_idx
  on entregas_nao_casadas (recebido_em desc) where resolvido = false;

-- Verificação:
--   select column_name from information_schema.columns
--    where table_name='entregas' and column_name like 'pedido_%';
--   select count(*) from entregas_nao_casadas where resolvido = false;
