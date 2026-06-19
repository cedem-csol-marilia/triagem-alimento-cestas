-- ============================================================
-- MIGRATION: resolver_nao_casada(...) — de-para manual da fila de exceções
--
-- Contexto: a automação (Make) estaciona em `entregas_nao_casadas` tudo que
-- recebeu mas não casou (família não achada, whatsapp ausente, sem entrega no
-- mês…). Até aqui a resolução era 100% manual no SQL. Esta RPC fecha o ciclo
-- pela TELA, com segurança e de forma idempotente.
--
-- A resolução tem DOIS lados (alinhado com a Marília):
--   1) FAMÍLIA — qual família é o dono da linha (escolhida na tela: por
--      whatsapp/nome, ou cadastrada na hora). Vem em p_familia_id.
--   2) PEDIDO  — em qual ENTREGA o efeito é aplicado. Pode ser uma entrega
--      existente (p_entrega_id) ou uma avulsa criada na hora para o mês.
--
-- Efeito por estágio da linha:
--   'pedido'   → marca pedido_confirmado + grava pedido_loja
--   'nf'       → grava nfe_numero / pedido_fiscal (auditoria)
--   'entregue' → status='entregue' + data_entrega (+ pedido_loja se veio)
--   'falha'    → status='nao_entregue' + motivo_falha
--
-- Idempotência:
--   - Linha já resolvida → retorna {ok:true, duplicado:true}.
--   - Conflito do índice único de pedido_loja (outra entrega já tem esse nº) →
--     retorna {ok:false} sem quebrar; o operador decide na tela.
--
-- SEGURANÇA: SECURITY DEFINER + GRANT a `authenticated` (é a tela logada que
-- chama, não o Make). NÃO dar a `anon`.
-- ============================================================

create or replace function public.resolver_nao_casada(
  p_id             uuid,                 -- linha de entregas_nao_casadas
  p_familia_id     uuid,                 -- família escolhida (de-para)
  p_entrega_id     uuid  default null,   -- entrega-alvo; null = cria avulsa
  p_mes_referencia date  default null,   -- mês da avulsa quando p_entrega_id é null
  p_data_entrega   date  default null    -- data para o estágio 'entregue'
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_linha   entregas_nao_casadas%rowtype;
  v_entrega uuid;
  v_mes     date;
begin
  -- 1) Carrega a linha
  select * into v_linha from entregas_nao_casadas where id = p_id;
  if not found then
    raise exception 'resolver_nao_casada: linha % não existe', p_id;
  end if;
  if v_linha.resolvido then
    return jsonb_build_object('ok', true, 'duplicado', true, 'entrega_id', v_linha.entrega_id);
  end if;

  -- 2) Valida a família escolhida
  if p_familia_id is null or not exists (select 1 from familias where id = p_familia_id) then
    raise exception 'resolver_nao_casada: família inválida (%).', p_familia_id;
  end if;

  -- 3) Define a entrega-alvo (existente ou avulsa nova)
  if p_entrega_id is not null then
    select id into v_entrega from entregas where id = p_entrega_id and familia_id = p_familia_id;
    if v_entrega is null then
      raise exception 'resolver_nao_casada: entrega % não pertence à família %.', p_entrega_id, p_familia_id;
    end if;
  else
    v_mes := date_trunc('month', coalesce(p_mes_referencia, v_linha.recebido_em::date, current_date))::date;
    insert into entregas (ciclo_id, familia_id, mes_referencia, tipo, status, observacao, origem, atualizado_em)
      values (null, p_familia_id, v_mes, 'avulsa', 'pendente',
              'Criada ao resolver não-casada ' || left(p_id::text, 8), 'make', now())
      returning id into v_entrega;
  end if;

  -- 4) Aplica o efeito por estágio (best-effort, tolerando conflito de pedido_loja)
  begin
    if v_linha.estagio = 'pedido' then
      update entregas set
        pedido_confirmado = true,
        pedido_loja       = coalesce(pedido_loja, v_linha.pedido_loja),
        pedido_fiscal     = coalesce(pedido_fiscal, v_linha.pedido_fiscal),
        whatsapp_pedido   = coalesce(whatsapp_pedido, v_linha.whatsapp),
        pedido_enviado_em = coalesce(pedido_enviado_em, now()),
        origem = 'make', atualizado_em = now()
      where id = v_entrega;

    elsif v_linha.estagio = 'nf' then
      update entregas set
        nfe_numero    = coalesce(nfe_numero, v_linha.nfe_numero),
        pedido_fiscal = coalesce(pedido_fiscal, v_linha.pedido_fiscal),
        pedido_loja   = coalesce(pedido_loja, v_linha.pedido_loja),
        origem = 'make', atualizado_em = now()
      where id = v_entrega;

    elsif v_linha.estagio = 'entregue' then
      update entregas set
        status        = 'entregue',
        data_entrega  = coalesce(p_data_entrega, data_entrega, current_date),
        pedido_loja   = coalesce(pedido_loja, v_linha.pedido_loja),
        pedido_confirmado = true,
        origem = 'make', atualizado_em = now()
      where id = v_entrega;

    elsif v_linha.estagio = 'falha' then
      update entregas set
        status       = 'nao_entregue',
        motivo_falha = coalesce(motivo_falha, v_linha.motivo, 'falha registrada manualmente'),
        origem = 'make', atualizado_em = now()
      where id = v_entrega;
    end if;
  exception when unique_violation then
    -- Outra entrega já tem esse pedido_loja/NF: não força. Devolve sem fechar.
    return jsonb_build_object(
      'ok', false,
      'motivo', 'pedido_ja_associado',
      'detalhe', 'Esse número de pedido/NF já está em outra entrega. Confira na tela de Entregas.'
    );
  end;

  -- 5) Fecha a linha
  update entregas_nao_casadas
    set resolvido = true, entrega_id = v_entrega, resolvido_em = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'familia_id', p_familia_id);
end;
$function$;

-- App logada chama via JWT do usuário (role `authenticated`).
grant execute on function public.resolver_nao_casada(uuid, uuid, uuid, date, date) to authenticated;

-- Recarrega o cache do PostgREST para a função aparecer na API.
notify pgrst, 'reload schema';

-- Verificação:
--   select proname from pg_proc where proname = 'resolver_nao_casada';
--   select count(*) from entregas_nao_casadas where resolvido = false;
