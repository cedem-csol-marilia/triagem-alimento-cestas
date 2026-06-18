-- ============================================================
-- MIGRATION: blindar as RPCs contra data vazia/inválida
--
-- Problema: o Make manda p_data como TEXTO; quando vem "" (vazio) ou
-- num formato inesperado, o tipo `date` derruba a chamada com 22007.
-- Solução: receber a data como TEXT e converter por dentro com um
-- parser tolerante (vazio/ inválido -> null). v_mes cai pro mês atual.
--
-- Troca o tipo de p_data (pedido/entregue) e p_nfe_emitida_em (nf) de
-- date -> text. Precisa DROP + CREATE porque muda o tipo do parâmetro.
-- ============================================================

-- Parser de data tolerante: '' ou lixo -> null
create or replace function public._txt_to_date(p text)
returns date language plpgsql immutable as $function$
begin
  return nullif(btrim(coalesce(p,'')), '')::date;
exception when others then
  return null;
end;
$function$;

drop function if exists public.registrar_pedido_loja(text,text,date,text,text,text,jsonb);
drop function if exists public.registrar_entrega_concluida(text,text,date,text,text,text,jsonb);
drop function if exists public.registrar_nf(text,text,text,date,text,text,text,text,jsonb);

-- ESTÁGIO 1 — pedido realizado (p_data agora é text)
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
  select id into v_entrega from entregas
    where familia_id = v_familia and mes_referencia = v_mes and status = 'pendente'
    order by atualizado_em desc limit 1;
  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
      values ('pedido', 'sem_entrega_no_mes', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_no_mes', 'familia_id', v_familia, 'pendencia', true);
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

-- ESTÁGIO 3 — entregue (p_data agora é text)
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
      where familia_id = v_familia and mes_referencia = v_mes and status = 'pendente'
      order by atualizado_em desc limit 1;
  end if;
  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, cep, pedido_loja, payload)
      values ('entregue', 'sem_entrega_no_mes', p_whatsapp, p_nome, p_endereco, p_cep, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_no_mes', 'pendencia', true);
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

-- ESTÁGIO 2 — NF (p_nfe_emitida_em agora é text)
create or replace function public.registrar_nf(
  p_whatsapp text, p_nfe_numero text, p_nfe_serie text, p_nfe_emitida_em text,
  p_pedido_fiscal text default null, p_pedido_mae text default null,
  p_nome text default null, p_endereco text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid;
  v_emit date := _txt_to_date(p_nfe_emitida_em);
  v_mes  date := date_trunc('month', coalesce(_txt_to_date(p_nfe_emitida_em), current_date))::date;
begin
  select id into v_entrega from entregas where nfe_numero = p_nfe_numero;
  if v_entrega is not null then
    return jsonb_build_object('ok', true, 'duplicado', true, 'entrega_id', v_entrega);
  end if;
  v_match := casar_familia_por_whatsapp(p_whatsapp);
  if not (v_match->>'ok')::boolean then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, pedido_fiscal, nfe_numero, payload)
      values ('nf', v_match->>'motivo', p_whatsapp, p_nome, p_endereco, p_pedido_fiscal, p_nfe_numero, p_payload);
    return jsonb_build_object('ok', false, 'motivo', v_match->>'motivo', 'pendencia', true);
  end if;
  v_familia := (v_match->>'familia_id')::uuid;
  select id into v_entrega from entregas
    where familia_id = v_familia and mes_referencia = v_mes
    order by (pedido_loja is not null) desc, atualizado_em desc limit 1;
  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, nome, endereco, pedido_fiscal, nfe_numero, payload)
      values ('nf', 'sem_entrega_no_mes', p_whatsapp, p_nome, p_endereco, p_pedido_fiscal, p_nfe_numero, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_no_mes', 'familia_id', v_familia, 'pendencia', true);
  end if;
  update entregas set
    nfe_numero = p_nfe_numero, nfe_serie = p_nfe_serie, nfe_emitida_em = v_emit,
    pedido_fiscal = coalesce(p_pedido_fiscal, pedido_fiscal),
    pedido_mae = coalesce(p_pedido_mae, pedido_mae),
    origem = case when origem = 'manual' then 'make' else origem end,
    atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'familia_id', v_familia);
end;
$function$;
