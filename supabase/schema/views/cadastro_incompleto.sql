-- Snapshot de cadastro_incompleto (famílias na fila com dados faltando).
-- Expõe contatada_em (carimbo de "Contatada" feito na tela de Incompletos).
-- Canônico: migrations/20260615140000_contatada_em_cadastro_incompleto.sql

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
