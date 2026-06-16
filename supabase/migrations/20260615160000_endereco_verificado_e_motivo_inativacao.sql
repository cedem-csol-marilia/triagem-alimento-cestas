-- ============================================================
-- MIGRATION: endereço verificado + motivo de inativação
--
-- Item 2: famílias que mandam endereço completo são conferidas pela operação.
--   familias.endereco_verificado_em — carimbo de "endereço conferido".
--
-- Item 3: desqualificar / tirar da fila reutiliza o status 'inativa' (decisão
--   da Marília), distinguindo o porquê em motivo_inativacao:
--     'mesclada'     — saiu por merge de duplicata
--     'desqualificada' — desqualificada pela operação
--     'incompleto'   — inativada por cadastro incompleto sem contato
--   (texto livre; sem enum rígido pra não travar evoluções)
-- ============================================================

alter table familias add column if not exists endereco_verificado_em timestamptz;
alter table familias add column if not exists motivo_inativacao       text;
