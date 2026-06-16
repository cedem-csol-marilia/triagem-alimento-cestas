-- Snapshot reativar_familia (desfaz merge de duplicata e volta pra fila).
-- Se a família foi absorvida num merge, devolve as respostas movidas e reverte
-- o par para 'separadas'. Serve também para reativar desqualificadas.
-- Canônico: migrations/20260615161000_reativar_familia_desmesclar.sql

CREATE OR REPLACE FUNCTION public.reativar_familia(
  p_familia_id uuid,
  p_obs        text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status     text;
  v_era_merge  boolean := false;
  d            duplicatas_detectadas%rowtype;
begin
  select status into v_status from familias where id = p_familia_id for update;
  if v_status is null then
    raise exception 'reativar_familia: família % não existe', p_familia_id;
  end if;
  if v_status <> 'inativa' then
    raise exception 'reativar_familia: só dá para reativar família inativa (atual: %)', v_status;
  end if;

  select * into d from duplicatas_detectadas
  where status = 'mesma_casa'
    and familia_mantida_id is not null
    and familia_mantida_id <> p_familia_id
    and (familia_id_1 = p_familia_id or familia_id_2 = p_familia_id)
  order by decidido_em desc nulls last
  limit 1;
  v_era_merge := found;

  if v_era_merge then
    if d.respostas_movidas is not null then
      update respostas_forms set familia_id = p_familia_id
      where id = any(d.respostas_movidas);

      update familias m
      set ids_respostas_forms = (
            select array_agg(distinct r.id order by r.id)
            from respostas_forms r where r.familia_id = d.familia_mantida_id),
          atualizado_em = now()
      where m.id = d.familia_mantida_id;
    end if;

    update duplicatas_detectadas
    set status       = 'separadas',
        familia_mantida_id = null,
        decidido_em  = now(),
        decidido_obs = trim(both ' ' from coalesce(decidido_obs, '') || ' | Reativada: não era a mesma casa.')
    where id = d.id;
  end if;

  update familias
  set status              = 'fila',
      motivo_inativacao   = null,
      observacao          = p_obs,
      ids_respostas_forms = (
        select array_agg(distinct r.id order by r.id)
        from respostas_forms r where r.familia_id = p_familia_id),
      atualizado_em       = now()
  where id = p_familia_id;

  return jsonb_build_object('familia_id', p_familia_id, 'reativada', true,
    'desmesclada', v_era_merge,
    'respostas_devolvidas', case when v_era_merge then coalesce(array_length(d.respostas_movidas, 1), 0) else 0 end);
end;
$function$;
