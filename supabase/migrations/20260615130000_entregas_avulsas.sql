-- ============================================================
-- MIGRATION: entregas avulsas (fora do ciclo)
--
-- Objetivo: registrar cestas extras/emergenciais que NÃO pertencem a um
-- ciclo. A família que recebe uma avulsa NÃO sai da fila.
--
--   - ciclo_id passa a ser opcional (avulsa não tem ciclo).
--   - coluna tipo ('ciclo' | 'avulsa') com DEFAULT 'ciclo': toda entrega
--     criada por confirmar_ciclo() já entra como 'ciclo' sem mudança no fluxo;
--     o ADD COLUMN com default também marca as linhas existentes como 'ciclo'.
--   - CHECK: entrega de ciclo precisa ter ciclo_id; avulsa não pode ter ciclo_id.
-- ============================================================

alter table entregas
  alter column ciclo_id drop not null;

alter table entregas
  add column if not exists tipo text not null default 'ciclo';

alter table entregas
  drop constraint if exists entregas_tipo_check;
alter table entregas
  add constraint entregas_tipo_check
  check (
    (tipo = 'ciclo'  and ciclo_id is not null) or
    (tipo = 'avulsa' and ciclo_id is null)
  );
