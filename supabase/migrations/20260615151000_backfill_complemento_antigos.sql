-- ============================================================
-- MIGRATION: backfill do complemento nos cadastros antigos
--
-- Os antigos têm o complemento grudado no endereco no formato "... - comp"
-- (era assim que o Apps Script concatenava). Aqui separamos:
--   complemento <- texto depois do " - "
--   endereco    <- texto antes do " - "  (fica só rua + número)
-- endereco_norm é GENERATED, então recalcula sozinho ao mudar o endereco.
--
-- Best-effort: só toca em linhas que têm " - " e ainda não têm complemento.
-- Endereços sem esse separador ficam intactos. Revisar casos estranhos no
-- modal de Editar família (campo Complemento já separado).
-- ============================================================

update familias
set complemento = nullif(trim(split_part(endereco, ' - ', 2)), ''),
    endereco    = nullif(trim(split_part(endereco, ' - ', 1)), '')
where endereco like '% - %'
  and (complemento is null or complemento = '');
