-- ============================================================
-- MIGRATION: novo status de entrega 'pulada'
--
-- Uso: quando a família não vai receber a cesta daquele mês (ex.: pular
-- junho da Dayane), marca-se 'pulada'. A entrega sai da fila do pedido
-- automático (que só considera status 'pendente'), então o próximo
-- pedido da família cai no mês seguinte — sem precisar de nº de pedido
-- nem ficar 'pendente' para sempre.
--
-- ATENÇÃO: rode esta migration SOZINHA no SQL Editor (ALTER TYPE ...
-- ADD VALUE não pode ser usado no mesmo comando/transação que já usa
-- o valor novo).
-- ============================================================

alter type public.status_entrega add value if not exists 'pulada';
