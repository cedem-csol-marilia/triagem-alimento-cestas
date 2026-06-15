-- ============================================================
-- MIGRATION: marca "Contatada" no Cadastro Incompleto
--
-- Enquanto não há automação de WhatsApp, a operação precisa registrar
-- que já entrou em contato com a família para pedir o complemento.
-- "Contatada" NÃO é status de família (ela segue na fila, incompleta) —
-- é um carimbo de data em familias.contatada_em.
--
-- A view cadastro_incompleto é recriada para expor a coluna.
-- ============================================================

alter table familias
  add column if not exists contatada_em timestamptz;

CREATE OR REPLACE VIEW public.cadastro_incompleto AS
 SELECT id,
    nome_responsavel,
    whatsapp,
    endereco,
    endereco_norm,
    bairro,
    cep,
    ponto_referencia,
    num_total_pessoas_raw,
    num_criancas,
    num_idosos,
    renda_faixa,
    score,
    criado_em,
        CASE
            WHEN endereco_norm IS NULL OR endereco_norm = ''::text THEN 'Endereço não informado'::text
            WHEN NOT endereco_norm ~ '\d'::text THEN 'Endereço sem número'::text
            WHEN whatsapp_norm IS NULL OR length(whatsapp_norm) < 10 THEN 'WhatsApp inválido ou ausente'::text
            ELSE 'Dados incompletos'::text
        END AS motivo_incompleto,
    contatada_em
   FROM familias f
  WHERE status = 'fila'::status_familia
    AND (endereco_norm IS NOT NULL AND NOT endereco_norm ~ '\d'::text
         OR endereco_norm IS NULL OR endereco_norm = ''::text
         OR whatsapp_norm IS NULL OR length(whatsapp_norm) < 10)
  ORDER BY criado_em;
