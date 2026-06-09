-- ============================================================
-- Migration: baixa o corte de similaridade de 40 para 30
-- Data: 2026-06-09
--
-- MOTIVO
--   Diagnóstico mostrou que duplicatas reais de MESMO endereço
--   pontuam exatamente 30 ("CEP + endereço com número idêntico (+30)"),
--   logo abaixo do corte anterior de 40 — por isso não apareciam.
--   Ex.: Erika x Tauane (general irulegui cunha 644), cluster da
--   secundino 364, cluster do CEP 03152150 (jacaraipe).
--
--   Endereço idêntico sozinho já é sinal suficiente para REVISÃO manual
--   (a pessoa decide "mesma casa" ou "casas separadas" na tela).
--
-- EFEITO COLATERAL ESPERADO
--   Vão aparecer também famílias diferentes no mesmo prédio/número.
--   Isso é intencional: é uma fila de revisão. Marcar "Casas separadas"
--   quando não houver parentesco.
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
    where s.score >= 30          -- antes: 40
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
