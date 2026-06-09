-- ============================================================
-- FUNÇÃO: detectar_duplicatas()
-- Chamada por: botão "🔍 Detectar duplicatas" na tela de Triagem.
-- Papel: compara cadastros EXISTENTES entre si (familia x familia) e
--        registra pares suspeitos em duplicatas_detectadas para revisão.
--
-- Versão CORRIGIDA (canônica). Ver migration:
--   migrations/20260609120000_fix_detectar_duplicatas.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.detectar_duplicatas()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_count int := 0;
  rec     record;
begin
  for rec in
    select f1.id as id1, f2.id as id2, s.score, s.motivos
    from familias f1
    join familias f2 on f1.id < f2.id
    cross join lateral calcular_similaridade_familias(f1.id, f2.id) s
    where s.score >= 40
  loop
    insert into duplicatas_detectadas
      (familia_id_1, familia_id_2, score, motivos, status)
    values
      (least(rec.id1, rec.id2), greatest(rec.id1, rec.id2),
       rec.score, rec.motivos, 'pendente')
    on conflict (familia_id_1, familia_id_2) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;
