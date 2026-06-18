-- ============================================================
-- MIGRATION: pedido distribui 1:1 quando a família tem várias entregas no mês
--
-- Cenário: mesma família com até N pedidos no MESMO mês (datas de pedido
-- garantidas no mês). Cada pedido deve cair numa entrega pendente DIFERENTE.
--
-- Ajuste: ao casar o pedido, escolher uma entrega pendente que ainda
-- NÃO tem pedido_loja (não atribuída). Se todas as pendentes do mês já
-- têm pedido, vira pendência (não sobrescreve).
--
-- Entrega (registrar_entrega_concluida) NÃO muda: já casa pelo número
-- do pedido primeiro (independente de mês).
-- ============================================================

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

  -- escolhe uma entrega pendente do mês que AINDA NÃO tem pedido (distribui 1:1)
  select id into v_entrega from entregas
    where familia_id = v_familia and mes_referencia = v_mes
      and status = 'pendente' and pedido_loja is null
    order by atualizado_em
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
