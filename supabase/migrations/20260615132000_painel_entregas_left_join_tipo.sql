-- ============================================================
-- MIGRATION: painel_entregas com LEFT JOIN + coluna tipo
--
-- Antes a view fazia JOIN normal com ciclos, então entregas avulsas
-- (ciclo_id null) sumiriam da tela. Troca para LEFT JOIN e expõe `tipo`.
-- Para entregas avulsas, ciclo_id/ciclo_inicio/ciclo_fim/ciclo_status vêm null.
-- `tipo` é adicionado no FINAL para permitir CREATE OR REPLACE VIEW.
-- ============================================================

CREATE OR REPLACE VIEW public.painel_entregas AS
SELECT e.id,
    e.mes_referencia,
    e.status,
    e.data_entrega,
    e.pedido_confirmado,
    e.pedido_enviado_em,
    e.observacao AS entrega_obs,
    e.atualizado_em,
    f.id AS familia_id,
    f.nome_responsavel,
    f.whatsapp,
    f.endereco,
    f.bairro,
    f.ponto_referencia,
    f.pode_buscar_cedem,
    f.num_total_pessoas,
    c.id AS ciclo_id,
    c.data_inicio AS ciclo_inicio,
    c.data_fim AS ciclo_fim,
    c.status AS ciclo_status,
    e.tipo
   FROM entregas e
     LEFT JOIN ciclos c ON c.id = e.ciclo_id
     JOIN familias f ON f.id = e.familia_id
  ORDER BY e.mes_referencia DESC, f.nome_responsavel;
