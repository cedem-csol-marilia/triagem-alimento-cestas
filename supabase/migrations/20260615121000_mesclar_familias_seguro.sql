-- ============================================================
-- MIGRATION: mesclar_familias(p_manter, p_absorver, p_obs)
--
-- Centraliza a regra de merge no banco para que a tela NÃO possa
-- burlá-la. Regras (pedido da Marília):
--   - Família em ciclo (status 'confirmada' | 'ativa' | 'concluida')
--     NUNCA pode ser absorvida — ela tem que ser a mantida.
--   - A mantida não pode estar inativa.
--   - As respostas do Forms da absorvida passam para a mantida
--     (respostas_forms.familia_id = FK é a fonte da verdade), então a
--     família mantida acumula os answer_id — sem órfãos.
--   - A absorvida vira 'inativa'.
--   - O par em duplicatas_detectadas é marcado 'mesma_casa' com a
--     familia_mantida_id e o carimbo de decisão.
--
-- SECURITY DEFINER para rodar sob as policies de forma consistente.
-- ============================================================

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

  -- Trava de ciclo: a absorvida não pode estar em ciclo
  if v_status_absorver = any(v_ciclo_status) then
    raise exception
      'mesclar_familias: a família a absorver está em ciclo (%) e não pode ser desativada — ela deve ser a mantida',
      v_status_absorver;
  end if;
  -- Não absorver para dentro de uma família já inativa
  if v_status_manter = 'inativa' then
    raise exception 'mesclar_familias: a família mantida está inativa';
  end if;

  -- Move as respostas (FK é a fonte da verdade)
  update respostas_forms
  set familia_id = p_manter
  where familia_id = p_absorver;

  -- Espelha o array derivado na mantida
  update familias m
  set ids_respostas_forms = (
        select array_agg(distinct r.id order by r.id)
        from respostas_forms r
        where r.familia_id = p_manter),
      atualizado_em = now()
  where m.id = p_manter;

  -- Inativa a absorvida
  update familias
  set status              = 'inativa',
      ids_respostas_forms = null,
      observacao          = coalesce(p_obs, 'Mesclada — duplicata confirmada'),
      atualizado_em       = now()
  where id = p_absorver;

  -- Carimba a decisão no par (se o par existir em duplicatas_detectadas)
  update duplicatas_detectadas
  set status             = 'mesma_casa',
      familia_mantida_id = p_manter,
      decidido_em        = now(),
      decidido_obs       = p_obs
  where familia_id_1 = least(p_manter, p_absorver)
    and familia_id_2 = greatest(p_manter, p_absorver);

  return jsonb_build_object(
    'mantida',   p_manter,
    'absorvida', p_absorver,
    'ok',        true);
end;
$function$;
