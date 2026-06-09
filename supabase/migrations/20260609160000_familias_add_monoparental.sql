-- ============================================================
-- Migration: adiciona a coluna monoparental em familias
-- Data: 2026-06-09
--
-- PROBLEMA
--   O código (tipo Familia, EditarFamiliaModal, critério de
--   priorização "Família monoparental" e o trigger calcular_score)
--   já referenciava `monoparental`, mas a COLUNA nunca foi criada na
--   tabela familias. Por isso recalcular_scores_fila() quebrava com:
--     ERROR: record "new" has no field "monoparental"
--   (o trigger calcular_score lê new.monoparental ao atualizar familias)
--
-- CORREÇÃO
--   Cria a coluna. Default false; pode ser marcada por família no
--   modal de edição. Depois disso o recálculo e a pontuação funcionam.
-- ============================================================
alter table familias
  add column if not exists monoparental boolean not null default false;
