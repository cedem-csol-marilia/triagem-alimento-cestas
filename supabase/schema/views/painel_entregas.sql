-- Snapshot de painel_entregas (entregas com dados da família).
-- LEFT JOIN em ciclos para incluir entregas avulsas (ciclo_id null) e
-- expõe a coluna `tipo` ('ciclo' | 'avulsa').
-- Canônico: migrations/20260615132000_painel_entregas_left_join_tipo.sql

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
