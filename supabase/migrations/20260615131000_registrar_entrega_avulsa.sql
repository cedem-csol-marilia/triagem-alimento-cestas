-- ============================================================
-- FUNÇÃO: registrar_entrega_avulsa(familia, mes, data, obs)
-- Chamada por: botão "Registrar entrega avulsa" na tela de Entregas.
-- Papel: cria UMA entrega fora de ciclo (tipo='avulsa', sem ciclo_id).
--        NÃO mexe no status da família — ela continua na fila.
--   - mes_referencia: 1º dia do mês (ex.: '2026-05-01'), igual ao ciclo.
--   - status: 'entregue' se veio com data; senão 'pendente'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_entrega_avulsa(
  p_familia_id     uuid,
  p_mes_referencia date,
  p_data_entrega   date DEFAULT NULL,
  p_obs            text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  if p_familia_id is null or p_mes_referencia is null then
    raise exception 'registrar_entrega_avulsa: família e mês de referência são obrigatórios';
  end if;
  if not exists (select 1 from familias where id = p_familia_id) then
    raise exception 'registrar_entrega_avulsa: família % não existe', p_familia_id;
  end if;

  insert into entregas (
    ciclo_id, familia_id, mes_referencia, tipo, status,
    data_entrega, observacao, atualizado_em
  ) values (
    null, p_familia_id, date_trunc('month', p_mes_referencia)::date, 'avulsa',
    case when p_data_entrega is not null then 'entregue' else 'pendente' end,
    p_data_entrega, p_obs, now()
  )
  returning id into v_id;

  return jsonb_build_object('entrega_id', v_id, 'tipo', 'avulsa', 'ok', true);
end;
$function$;
