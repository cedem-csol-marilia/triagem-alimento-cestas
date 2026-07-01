-- ============================================================
-- FIX: registrar_entrega_avulsa — cast do status para o enum.
--
-- Sintoma: "column \"status\" is of type status_entrega but
-- expression is of type text" ao registrar entrega avulsa.
--
-- Causa: o CASE WHEN ... THEN 'entregue' ELSE 'pendente' END
-- resolve os dois literais como `text`. Inserir text numa coluna
-- enum falha sem cast explícito. (Um literal solto ficaria `unknown`
-- e seria convertido automaticamente; dentro do CASE vira `text`.)
--
-- Correção: ::status_entrega no resultado do CASE.
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
    (case when p_data_entrega is not null then 'entregue' else 'pendente' end)::status_entrega,
    p_data_entrega, p_obs, now()
  )
  returning id into v_id;

  return jsonb_build_object('entrega_id', v_id, 'tipo', 'avulsa', 'ok', true);
end;
$function$;
