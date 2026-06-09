-- ============================================================
-- Migration: corrige detectar_duplicatas()
-- Data: 2026-06-09
-- Autor: time CEDEM
--
-- PROBLEMA QUE ISTO RESOLVE
--   A versão antiga de detectar_duplicatas():
--     1. Gravava os pares duplicados DENTRO de respostas_forms
--        (a tabela de INPUT do Forms), preenchendo familia_id +
--        candidata_familia_id sem nome_raw/endereco_raw. Isso poluía
--        o input e gerava cards de triagem "vazios" (lado esquerdo "—").
--     2. Só comparava cadastros onde um dos dois estava na 'fila'
--        (where f1.status='fila' or f2.status='fila'), então pares
--        envolvendo cadastros 'ativa'/'inativa'/'concluida'
--        (ex.: Érika x Tauane, com Tauane inativa) NUNCA eram detectados.
--
-- O QUE MUDA
--   - Passa a gravar na tabela dedicada duplicatas_detectadas.
--   - Compara TODOS os pares de familias (qualquer status).
--   - 'on conflict do nothing' impede reabrir pares já decididos.
--
-- NÃO MUDA NENHUMA TABELA. Só substitui a função + limpa lixo antigo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Substitui a função
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2) Limpa o lixo que a versão antiga deixou em respostas_forms
--    (linhas sem timestamp e sem nome = não vieram do Forms).
--    Rode o SELECT primeiro para conferir o que será apagado:
--
--    select id, timestamp_forms, nome_raw, familia_id,
--           candidata_familia_id, dedup_status
--    from respostas_forms
--    where dedup_status = 'novo'
--      and timestamp_forms is null
--      and familia_id is not null
--      and candidata_familia_id is not null;
-- ------------------------------------------------------------
delete from respostas_forms
where dedup_status = 'novo'
  and timestamp_forms is null
  and familia_id is not null
  and candidata_familia_id is not null;

-- ------------------------------------------------------------
-- 3) Verificação (rode manualmente após aplicar)
--
--    select detectar_duplicatas();   -- nº de pares NOVOS
--
--    select f1.nome_responsavel, f2.nome_responsavel, d.score, d.status
--    from duplicatas_detectadas d
--    join familias f1 on f1.id = d.familia_id_1
--    join familias f2 on f2.id = d.familia_id_2
--    where d.status = 'pendente';
-- ------------------------------------------------------------
