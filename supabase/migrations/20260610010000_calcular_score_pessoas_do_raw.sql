-- ============================================================
-- Migration: per capita robusto + backfill de num_total_pessoas
-- Data: 2026-06-10
--
-- PROBLEMA: famílias antigas (e as criadas via triagem) têm
-- num_total_pessoas (int) NULL, só com num_total_pessoas_raw ("2").
-- A calcular_score assumia 1 pessoa → per capita alto → 0 de renda.
--
-- CORREÇÃO:
--   1. calcular_score usa o número do raw quando o inteiro falta.
--   2. Backfill preenche num_total_pessoas a partir do raw (dispara recálculo).
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  s               int := 0;
  rl              text;
  v_est           numeric;
  v_pc            numeric;
  v_pessoas       int;
  v_aux           text;
  v_recebe_aux    boolean;
  p_renda_300     int; p_renda_600   int; p_renda_1000  int;
  p_cri_4         int; p_cri_3       int; p_cri_2       int; p_cri_1 int;
  p_ido_2         int; p_ido_1       int;
  p_sem_aux       int; p_mono        int; p_pcd         int;
  p_grande        int; p_nao_busca   int;
begin
  if new.status <> 'fila' then return new; end if;

  select peso into p_renda_300   from config_pesos_priorizacao where criterio = 'renda_menos_300'  and ativo;
  select peso into p_renda_600   from config_pesos_priorizacao where criterio = 'renda_300_600'    and ativo;
  select peso into p_renda_1000  from config_pesos_priorizacao where criterio = 'renda_600_1000'   and ativo;
  select peso into p_cri_4       from config_pesos_priorizacao where criterio = 'criancas_4_mais'  and ativo;
  select peso into p_cri_3       from config_pesos_priorizacao where criterio = 'criancas_3'       and ativo;
  select peso into p_cri_2       from config_pesos_priorizacao where criterio = 'criancas_2'       and ativo;
  select peso into p_cri_1       from config_pesos_priorizacao where criterio = 'criancas_1'       and ativo;
  select peso into p_ido_2       from config_pesos_priorizacao where criterio = 'idosos_2_mais'    and ativo;
  select peso into p_ido_1       from config_pesos_priorizacao where criterio = 'idosos_1'         and ativo;
  select peso into p_sem_aux     from config_pesos_priorizacao where criterio = 'sem_auxilio'      and ativo;
  select peso into p_mono        from config_pesos_priorizacao where criterio = 'monoparental'     and ativo;
  select peso into p_pcd         from config_pesos_priorizacao where criterio = 'pcd'              and ativo;
  select peso into p_grande      from config_pesos_priorizacao where criterio = 'familia_grande'   and ativo;
  select peso into p_nao_busca   from config_pesos_priorizacao where criterio = 'nao_busca_cedem'  and ativo;

  rl := lower(coalesce(new.renda_faixa, ''));
  -- nº de pessoas: usa o inteiro; se nulo, extrai dígitos do raw; senão 1
  v_pessoas := greatest(coalesce(
                 new.num_total_pessoas,
                 nullif(regexp_replace(coalesce(new.num_total_pessoas_raw, ''), '[^0-9]', '', 'g'), '')::int,
                 1), 1);

  if new.renda_per_capita is not null then
    v_pc := new.renda_per_capita;
  else
    if    rl like '%sem%renda%' or rl like '%nenhum%'        then v_est := 0;
    elsif rl like '%acima%'                                  then v_est := 2500;
    elsif rl like '%1.501%' or rl like '%1501%'              then v_est := 1750;
    elsif rl like '%2.000%' or rl like '%2000%'              then v_est := 1500;
    elsif rl like '%1.001%' or rl like '%1001%'              then v_est := 1250;
    elsif rl like '%1.500%' or rl like '%1500%'              then v_est := 1250;
    elsif rl like '%501%'                                    then v_est := 750;
    elsif rl like '%menos%'                                  then v_est := 250;
    elsif rl like '%1.000%' or rl like '%1000%'              then v_est := 750;
    elsif rl like '%ate%' or rl like '%500%'                 then v_est := 250;
    else  v_est := null;
    end if;
    if v_est is not null then v_pc := v_est / v_pessoas; else v_pc := null; end if;
  end if;

  if v_pc is not null then
    if    v_pc < 300  then s := s + coalesce(p_renda_300,  35);
    elsif v_pc < 600  then s := s + coalesce(p_renda_600,  25);
    elsif v_pc < 1000 then s := s + coalesce(p_renda_1000, 15);
    end if;
  end if;

  v_aux := lower(coalesce(new.auxilio_acao_social, ''));
  v_recebe_aux := (new.auxilio_renda_gov = true) or v_aux like '%bolsa%' or v_aux like 'sim%';
  if not v_recebe_aux then s := s + coalesce(p_sem_aux, 10); end if;

  if    new.num_criancas >= 4 then s := s + coalesce(p_cri_4, 28);
  elsif new.num_criancas =  3 then s := s + coalesce(p_cri_3, 22);
  elsif new.num_criancas =  2 then s := s + coalesce(p_cri_2, 15);
  elsif new.num_criancas =  1 then s := s + coalesce(p_cri_1,  8);
  end if;

  if    new.num_idosos >= 2 then s := s + coalesce(p_ido_2, 18);
  elsif new.num_idosos =  1 then s := s + coalesce(p_ido_1, 12);
  end if;

  if new.tem_pcd                   then s := s + coalesce(p_pcd,      12); end if;
  if new.monoparental              then s := s + coalesce(p_mono,     12); end if;
  if new.pode_buscar_cedem = false then s := s + coalesce(p_nao_busca, 3); end if;
  if v_pessoas >= 5                then s := s + coalesce(p_grande,    5); end if;

  new.score := s;
  return new;
end;
$function$;

-- Backfill: preenche o inteiro a partir do raw (dispara recálculo via trigger)
update familias
set num_total_pessoas = nullif(regexp_replace(coalesce(num_total_pessoas_raw, ''), '[^0-9]', '', 'g'), '')::int
where num_total_pessoas is null
  and num_total_pessoas_raw ~ '\d';
