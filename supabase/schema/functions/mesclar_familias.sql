-- Snapshot mesclar_familias (merge seguro de duplicata).
-- v2: registra respostas_movidas (pra permitir desmesclar) e marca a absorvida
-- com motivo_inativacao='mesclada'. Família em ciclo nunca é absorvida.
-- Canônico: migrations/20260615161000_reativar_familia_desmesclar.sql

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
