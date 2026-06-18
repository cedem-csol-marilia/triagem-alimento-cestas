-- ============================================================
-- MIGRATION: expor pedido_loja / nfe_numero / nfe_emitida_em na view painel_entregas
--
-- Objetivo: a tela de Entregas (lê de painel_entregas) precisa enxergar o
-- número do pedido pra mostrar/editar a coluna "Nº pedido". Colunas novas
-- entram no FIM da view (requisito do CREATE OR REPLACE VIEW).
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
    e.tipo,
    e.pedido_loja,     -- <<< novo: nº do pedido da loja
    e.nfe_numero,      -- <<< novo: nº da NF
    e.nfe_emitida_em   -- <<< novo: data de emissão da NF
   FROM entregas e
     LEFT JOIN ciclos c ON c.id = e.ciclo_id
     JOIN familias f ON f.id = e.familia_id
  ORDER BY e.mes_referencia DESC, f.nome_responsavel;
