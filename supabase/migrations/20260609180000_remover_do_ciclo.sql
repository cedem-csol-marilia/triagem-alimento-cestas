-- ============================================================
-- Migration: remover_do_ciclo(familia_id)
-- Data: 2026-06-09
--
-- OBJETIVO
--   Permitir tirar uma família de um ciclo confirmado/em curso ANTES
--   de ela receber a primeira cesta. Devolve a família para a fila
--   (com o score) e libera a vaga. Depois que recebeu ao menos uma
--   cesta, não pode mais ser removida (mantém integridade do histórico).
--
-- REGRA
--   - Só remove se NÃO houver nenhuma entrega 'entregue' no ciclo.
--   - Apaga as entregas e o ciclo daquela família.
--   - Família volta para status 'fila'.
-- ============================================================
create or replace function public.remover_do_ciclo(p_familia_id uuid)
 returns void
 language plpgsql
as $function$
declare
  v_ciclo_id uuid;
  v_entregue int;
begin
  -- ciclo ativo/confirmado da família
  select id into v_ciclo_id
  from ciclos
  where familia_id = p_familia_id
    and status in ('confirmado', 'em_curso')
  order by data_inicio desc
  limit 1;

  if v_ciclo_id is null then
    raise exception 'Esta família não está em um ciclo confirmado ou em curso.';
  end if;

  -- bloqueia se já recebeu alguma cesta neste ciclo
  select count(*) into v_entregue
  from entregas
  where ciclo_id = v_ciclo_id and status = 'entregue';

  if v_entregue > 0 then
    raise exception 'Família já recebeu cesta neste ciclo — não pode ser removida.';
  end if;

  -- remove entregas e ciclo, devolve à fila
  delete from entregas where ciclo_id = v_ciclo_id;
  delete from ciclos   where id = v_ciclo_id;
  update familias set status = 'fila', atualizado_em = now() where id = p_familia_id;
end;
$function$;
