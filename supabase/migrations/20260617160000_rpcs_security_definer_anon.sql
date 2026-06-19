-- ============================================================
-- MIGRATION: deixar as RPCs da automação seguras pra chave restrita (anon)
--
-- Objetivo: o Make deixa de usar a service_role (chave mestra) e passa a usar
-- a chave `anon` (pública). Pra isso as funções precisam:
--   - SECURITY DEFINER: rodam com a permissão do dono (gravam em entregas
--     mesmo chamadas por uma chave sem acesso direto às tabelas).
--   - SET search_path = public: trava o caminho (boa prática de segurança).
--   - GRANT EXECUTE to anon: a chave anon pode chamar — e SÓ isso.
--
-- Não muda a lógica das funções, só as propriedades. Roda depois das
-- migrations 121000/130000/140000 (as funções já têm que existir).
-- ============================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'casar_familia_por_whatsapp',
        'registrar_pedido_loja',
        'registrar_nf',
        'registrar_entrega_concluida',
        'registrar_falha_entrega'
      )
  loop
    execute format('alter function %s security definer set search_path = public', r.sig);
    execute format('grant execute on function %s to anon', r.sig);
  end loop;
end $$;
