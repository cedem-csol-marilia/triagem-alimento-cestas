-- ============================================================
-- MIGRATION: pedido casa com a entrega pendente MAIS ANTIGA (não só o mês atual)
--
-- Cenário real: das cestas de junho, 4 de 9 foram pedidas em junho;
-- as demais serão pedidas em julho, mas continuam sendo cestas DE JUNHO.
-- A regra antiga (`mes_referencia = mês da data do pedido`) fazia o
-- pedido de julho cair na entrega de julho, deixando junho para trás.
--
-- Regra nova: o pedido casa com a entrega pendente sem pedido de mês
-- de referência MAIS ANTIGO (limitado ao mês do pedido — nunca consome
-- entrega de mês futuro). Entregas com status 'pulada' ficam de fora
-- automaticamente (só 'pendente' entra), então pular junho de uma
-- família faz o próximo pedido dela cair em julho.
--
-- Mesma regra aplicada ao fallback de registrar_entrega_concluida
-- (quando a entrega chega sem nº de pedido conhecido): a entrega feita
-- em julho pode ser da cesta de junho.
-- ============================================================

-- ESTÁGIO 1 — pedido realizado
create or replace function public.registrar_pedido_loja(
  p_whatsapp text, p_pedido_loja text, p_data text,
  p_nome text default null, p_endereco text default null,
  p_cep text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid;
  v_data date := _txt_to_date(p_data);
  v_mes  date := date_trunc('month', coalesce(_txt_to_date(p_data), current_date))::date;
begin
  -- idempotência: esse pedido já foi registrado?
  select id into v_entrega from entregas where pedido_loja = p_pedido_loja;
  if v_entrega is not null then
    return jsonb_build_object('ok', true, 'duplicado', true, 'entrega_id', v_entrega);
  end if;

  v_match := casar_familia_por_whatsapp(p_whatsapp);
  if not (v_match->>'ok')::boolean then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
      values ('pedido', v_match->>'motivo', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', v_match->>'motivo', 'pendencia', true);
  end if;
  v_familia := (v_match->>'familia_id')::uuid;

  -- entrega pendente sem pedido, do mês de referência MAIS ANTIGO até o mês
  -- do pedido (distribui 1:1; nunca pega mês futuro)
  select id into v_entrega from entregas
    where familia_id = v_familia
      and mes_referencia <= v_mes
      and status = 'pendente'
      and pedido_loja is null
    order by mes_referencia, atualizado_em
    limit 1;

  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
      values ('pedido', 'sem_entrega_disponivel', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_disponivel', 'familia_id', v_familia, 'pendencia', true);
  end if;

  update entregas set
    pedido_confirmado = true,
    pedido_enviado_em = coalesce(v_data::timestamptz, now()),
    pedido_loja = p_pedido_loja, whatsapp_pedido = p_whatsapp,
    origem = 'make', atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'familia_id', v_familia);
end;
$function$;

-- ESTÁGIO 3 — entregue: fallback (sem nº de pedido) também pega a mais antiga
create or replace function public.registrar_entrega_concluida(
  p_whatsapp text, p_pedido_loja text, p_data text,
  p_nome text default null, p_endereco text default null,
  p_cep text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid; v_status text;
  v_data date := _txt_to_date(p_data);
  v_mes  date := date_trunc('month', coalesce(_txt_to_date(p_data), current_date))::date;
begin
  if p_pedido_loja is not null then
    select id into v_entrega from entregas where pedido_loja = p_pedido_loja;
  end if;
  if v_entrega is null then
    v_match := casar_familia_por_whatsapp(p_whatsapp);
    if not (v_match->>'ok')::boolean then
      insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
        values ('entregue', v_match->>'motivo', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
      return jsonb_build_object('ok', false, 'motivo', v_match->>'motivo', 'pendencia', true);
    end if;
    v_familia := (v_match->>'familia_id')::uuid;
    select id into v_entrega from entregas
      where familia_id = v_familia
        and mes_referencia <= v_mes
        and status = 'pendente'
      order by mes_referencia, atualizado_em
      limit 1;
  end if;
  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
      values ('entregue', 'sem_entrega_disponivel', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_disponivel', 'pendencia', true);
  end if;
  select status into v_status from entregas where id = v_entrega;
  if v_status = 'entregue' then
    return jsonb_build_object('ok', true, 'duplicado', true, 'entrega_id', v_entrega);
  end if;
  update entregas set
    status = 'entregue', data_entrega = coalesce(v_data, current_date),
    pedido_loja = coalesce(pedido_loja, p_pedido_loja),
    origem = 'make', atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega);
end;
$function$;
