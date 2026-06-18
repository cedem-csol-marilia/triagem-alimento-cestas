-- ============================================================
-- MIGRATION: RPCs da automação de entregas (chamadas pelo Make / Edge Function)
--
-- A automação SÓ escreve em `entregas` por estas funções — nunca UPDATE cru.
-- Toda função é IDEMPOTENTE (rodar 2x não duplica) e, quando não casa,
-- grava em `entregas_nao_casadas` em vez de escrever no escuro.
--
-- Chave de match: whatsapp normalizado (familias.whatsapp_norm).
-- Números de pedido/NF entram só como auditoria.
--
-- SEGURANÇA: dar EXECUTE destas 5 funções a um papel/chave restrito do
-- Make — e NENHUM acesso direto às tabelas. Ver docs/AUTOMACAO-ENTREGAS.md.
-- ============================================================

-- Helper: acha a família pelo whatsapp normalizado.
create or replace function public.casar_familia_por_whatsapp(p_whatsapp text)
returns jsonb language plpgsql as $function$
declare
  v_norm    text;
  v_count   int;
  v_familia uuid;
begin
  if p_whatsapp is null or btrim(p_whatsapp) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'whatsapp_ausente');
  end if;
  v_norm := normalizar_telefone(p_whatsapp);
  if v_norm is null or v_norm = '' then
    return jsonb_build_object('ok', false, 'motivo', 'whatsapp_ausente');
  end if;
  select count(*) into v_count from familias where whatsapp_norm = v_norm;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'familia_nao_encontrada');
  elsif v_count > 1 then
    return jsonb_build_object('ok', false, 'motivo', 'multiplas_familias');
  end if;
  select id into v_familia from familias where whatsapp_norm = v_norm limit 1;
  return jsonb_build_object('ok', true, 'familia_id', v_familia);
end;
$function$;

-- ESTÁGIO 1 — pedido realizado (e-mail da loja "está em processamento")
create or replace function public.registrar_pedido_loja(
  p_whatsapp text, p_pedido_loja text, p_data date,
  p_nome text default null, p_endereco text default null,
  p_cep text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid;
  v_mes date := date_trunc('month', coalesce(p_data, current_date))::date;
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
    pedido_enviado_em = coalesce(p_data::timestamptz, now()),
    pedido_loja = p_pedido_loja, whatsapp_pedido = p_whatsapp,
    origem = 'make', atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'familia_id', v_familia);
end;
$function$;

-- ESTÁGIO 2 — NF emitida (e-mail nfe-calvo; dados do PDF/DANFE) — best-effort
create or replace function public.registrar_nf(
  p_whatsapp text, p_nfe_numero text, p_nfe_serie text, p_nfe_emitida_em date,
  p_pedido_fiscal text default null, p_pedido_mae text default null,
  p_nome text default null, p_endereco text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid;
  v_mes date := date_trunc('month', coalesce(p_nfe_emitida_em, current_date))::date;
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
    nfe_numero = p_nfe_numero, nfe_serie = p_nfe_serie, nfe_emitida_em = p_nfe_emitida_em,
    pedido_fiscal = coalesce(p_pedido_fiscal, pedido_fiscal),
    pedido_mae = coalesce(p_pedido_mae, pedido_mae),
    origem = case when origem = 'manual' then 'make' else origem end,
    atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'familia_id', v_familia);
end;
$function$;

-- ESTÁGIO 3 — entregue (e-mail da loja "foi entregue e concluído")
create or replace function public.registrar_entrega_concluida(
  p_whatsapp text, p_pedido_loja text, p_data date,
  p_nome text default null, p_endereco text default null,
  p_cep text default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid; v_status text;
  v_mes date := date_trunc('month', coalesce(p_data, current_date))::date;
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
    status = 'entregue', data_entrega = coalesce(p_data, current_date),
    pedido_loja = coalesce(pedido_loja, p_pedido_loja),
    origem = 'make', atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega);
end;
$function$;

-- ESTÁGIO 4 (GANCHO) — falha na entrega (e-mail/critério a definir)
create or replace function public.registrar_falha_entrega(
  p_whatsapp text, p_pedido_loja text, p_motivo text,
  p_data date default null, p_payload jsonb default null)
returns jsonb language plpgsql as $function$
declare
  v_match jsonb; v_familia uuid; v_entrega uuid;
  v_mes date := date_trunc('month', coalesce(p_data, current_date))::date;
begin
  if p_pedido_loja is not null then
    select id into v_entrega from entregas where pedido_loja = p_pedido_loja;
  end if;
  if v_entrega is null then
    v_match := casar_familia_por_whatsapp(p_whatsapp);
    if not (v_match->>'ok')::boolean then
      insert into entregas_nao_casadas(estagio, motivo, whatsapp, pedido_loja, payload)
        values ('falha', v_match->>'motivo', p_whatsapp, p_pedido_loja, p_payload);
      return jsonb_build_object('ok', false, 'motivo', v_match->>'motivo', 'pendencia', true);
    end if;
    v_familia := (v_match->>'familia_id')::uuid;
    select id into v_entrega from entregas
      where familia_id = v_familia and mes_referencia = v_mes
      order by atualizado_em desc limit 1;
  end if;
  if v_entrega is null then
    insert into entregas_nao_casadas(estagio, motivo, whatsapp, pedido_loja, payload)
      values ('falha', 'sem_entrega_no_mes', p_whatsapp, p_pedido_loja, p_payload);
    return jsonb_build_object('ok', false, 'motivo', 'sem_entrega_no_mes', 'pendencia', true);
  end if;
  update entregas set
    status = 'nao_entregue', motivo_falha = p_motivo,
    origem = 'make', atualizado_em = now()
  where id = v_entrega;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega);
end;
$function$;
