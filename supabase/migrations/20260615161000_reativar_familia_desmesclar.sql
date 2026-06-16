-- ============================================================
-- MIGRATION: reativar família (desfaz o merge de duplicata)
--
-- Às vezes a operação conversa com a família e descobre que NÃO era a mesma
-- casa. Precisa desfazer o merge e devolver à fila.
--
--   1. duplicatas_detectadas.respostas_movidas — guarda quais respostas o merge
--      moveu da absorvida para a mantida (pra poder devolver com precisão).
--   2. mesclar_familias passa a gravar essas respostas e marca a absorvida com
--      motivo_inativacao = 'mesclada'.
--   3. reativar_familia(p_familia_id, p_obs):
--        - se a família foi absorvida num merge → devolve as respostas movidas
--          e reverte o par para 'separadas';
--        - volta o status para 'fila' e limpa o motivo de inativação.
--      Funciona também para famílias desqualificadas (só volta pra fila).
--
-- Limitação: merges feitos ANTES desta migration não têm respostas_movidas
-- registrado; nesses casos a reativação só volta o status (não move respostas
-- de volta, pois não há o registro do que foi movido).
-- ============================================================

alter table duplicatas_detectadas add column if not exists respostas_movidas uuid[];

-- ---- mesclar_familias v2: registra as respostas movidas + motivo ----
CREATE OR REPLACE FUNCTION public.mesclar_familias(
  p_manter   uuid,
  p_absorver uuid,
  p_obs      text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status_manter   text;
  v_status_absorver text;
  v_ciclo_status    constant text[] := array['confirmada','ativa','concluida'];
  v_movidas         uuid[];
begin
  if p_manter is null or p_absorver is null then
    raise exception 'mesclar_familias: id da mantida e da absorvida são obrigatórios';
  end if;
  if p_manter = p_absorver then
    raise exception 'mesclar_familias: não dá para mesclar uma família nela mesma';
  end if;

  select status into v_status_manter   from familias where id = p_manter   for update;
  select status into v_status_absorver from familias where id = p_absorver for update;

  if v_status_manter is null then
    raise exception 'mesclar_familias: família mantida % não existe', p_manter;
  end if;
  if v_status_absorver is null then
    raise exception 'mesclar_familias: família absorvida % não existe', p_absorver;
  end if;
  if v_status_absorver = any(v_ciclo_status) then
    raise exception
      'mesclar_familias: a família a absorver está em ciclo (%) e não pode ser desativada — ela deve ser a mantida',
      v_status_absorver;
  end if;
  if v_status_manter = 'inativa' then
    raise exception 'mesclar_familias: a família mantida está inativa';
  end if;

  -- registra quais respostas serão movidas (pra permitir desmesclar)
  select array_agg(id) into v_movidas from respostas_forms where familia_id = p_absorver;

  update respostas_forms set familia_id = p_manter where familia_id = p_absorver;

  update familias m
  set ids_respostas_forms = (
        select array_agg(distinct r.id order by r.id)
        from respostas_forms r where r.familia_id = p_manter),
      atualizado_em = now()
  where m.id = p_manter;

  update familias
  set status              = 'inativa',
      motivo_inativacao   = 'mesclada',
      ids_respostas_forms = null,
      observacao          = coalesce(p_obs, 'Mesclada — duplicata confirmada'),
      atualizado_em       = now()
  where id = p_absorver;

  update duplicatas_detectadas
  set status             = 'mesma_casa',
      familia_mantida_id = p_manter,
      decidido_em        = now(),
      decidido_obs       = p_obs,
      respostas_movidas  = v_movidas
  where familia_id_1 = least(p_manter, p_absorver)
    and familia_id_2 = greatest(p_manter, p_absorver);

  return jsonb_build_object('mantida', p_manter, 'absorvida', p_absorver,
    'movidas', coalesce(array_length(v_movidas, 1), 0), 'ok', true);
end;
$function$;

-- ---- reativar_familia: desfaz merge (se houver) e volta pra fila ----
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

  -- Esta família foi a ABSORVIDA de um merge?
  select * into d from duplicatas_detectadas
  where status = 'mesma_casa'
    and familia_mantida_id is not null
    and familia_mantida_id <> p_familia_id
    and (familia_id_1 = p_familia_id or familia_id_2 = p_familia_id)
  order by decidido_em desc nulls last
  limit 1;
  v_era_merge := found;

  if v_era_merge then
    -- devolve as respostas movidas (quando registradas)
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
