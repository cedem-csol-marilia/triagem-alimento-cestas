-- ============================================================
-- FIX: restaurar SECURITY DEFINER nas RPCs recriadas em 20260702120000
--
-- Sintoma: Make falha com 42501 "new row violates row-level security
-- policy for table entregas_nao_casadas" ao chamar registrar_pedido_loja.
--
-- Causa: a migration 20260702120000 (pedido pega entrega mais antiga)
-- usou CREATE OR REPLACE FUNCTION, que RESETA as propriedades da função.
-- As RPCs perderam o SECURITY DEFINER aplicado em 20260617160000 e
-- passaram a rodar com a permissão da chave anon — que não tem acesso
-- direto às tabelas (RLS bloqueia).
--
-- Correção: reaplicar SECURITY DEFINER + search_path + GRANT nas duas
-- funções recriadas. Mesma receita da 20260617160000.
--
-- LIÇÃO para migrations futuras: toda vez que recriar uma RPC da
-- automação com CREATE OR REPLACE, incluir `security definer set
-- search_path = public` na definição ou reaplicar este bloco.
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
        'registrar_pedido_loja',
        'registrar_entrega_concluida'
      )
  loop
    execute format('alter function %s security definer set search_path = public', r.sig);
    execute format('grant execute on function %s to anon', r.sig);
  end loop;
end $$;
