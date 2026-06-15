-- ============================================================
-- MIGRATION: blindar detectar_duplicatas()
--
-- Objetivo (pedido da Marília): a detecção nunca deve "ressuscitar"
-- trabalho de triagem já feito. Duas travas:
--   1. Ignora famílias status = 'inativa' (já mescladas/absorvidas).
--   2. Não repropõe pares JÁ DECIDIDOS — qualquer par que tenha uma
--      linha em duplicatas_detectadas com status <> 'pendente'
--      (mesma_casa | separadas | ignorado) fica fora da varredura,
--      mesmo que os pendentes sejam apagados para recalcular.
--
-- O 'on conflict do nothing' já evitava duplicar a linha; aqui a regra
-- de negócio passa a ser explícita e sobrevive ao "apagar pendentes".
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
    where s.score >= 30
      -- trava 1: famílias já mescladas não entram em par novo
      and f1.status <> 'inativa'
      and f2.status <> 'inativa'
      -- trava 2: par já decidido (qualquer status != pendente) não volta
      and not exists (
        select 1 from duplicatas_detectadas d
        where d.familia_id_1 = least(f1.id, f2.id)
          and d.familia_id_2 = greatest(f1.id, f2.id)
          and d.status <> 'pendente'
      )
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
