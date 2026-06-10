-- ============================================================
-- Migration: corrige renda e auxílio na calcular_score
-- Data: 2026-06-09
--
-- PROBLEMAS (texto do Form vs código)
--   1. Renda: faixas reais ("sem nenhum tipo de renda", "menos que R$500",
--      "Entre R$ 500,00 e R$ 1000,00", "...1000 e 1500", "...1000 e 2000")
--      não casavam com os padrões antigos → 0 ponto de renda em muitas famílias.
--      Além disso, as faixas são de renda TOTAL, mas o critério é PER CAPITA.
--   2. Auxílio: condição usava like '%nao%', mas a resposta mais comum é
--      "Não" (com til) → não casava (37 famílias). Só "Nao" sem acento entrava.
--
-- CORREÇÃO
--   - Renda: estima a renda total pela faixa, divide pelo nº de pessoas
--     (per capita) e aplica as faixas <300/<600/<1000. Usa renda_per_capita
--     real quando existir.
--   - Auxílio: detecta quem RECEBE (tem 'bolsa' ou começa com 'sim');
--     todo o resto conta como sem auxílio. Sem depender de acento.
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  s               int := 0;
  renda_lower     text;
  v_est           numeric;   -- renda total estimada pela faixa
  v_pc            numeric;   -- renda per capita
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

  renda_lower := lower(coalesce(new.renda_faixa, ''));
  v_pessoas   := greatest(coalesce(new.num_total_pessoas, 1), 1);

  -- Renda per capita: usa a real se existir; senão estima pela faixa do Form
  if new.renda_per_capita is not null then
    v_pc := new.renda_per_capita;
  else
    if    renda_lower like '%sem%renda%' or renda_lower like '%nenhum%' then v_est := 0;
    elsif renda_lower like '%2000%' then v_est := 1500;   -- 1000–2000
    elsif renda_lower like '%1500%' then v_est := 1250;   -- 1000–1500
    elsif renda_lower like '%menos%' then v_est := 250;   -- menos que 500
    elsif renda_lower like '%1000%' then v_est := 750;    -- 500–1000
    elsif renda_lower like '%500%'  then v_est := 250;
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

  -- Sem auxílio: credita quem NÃO recebe (sem 'bolsa' e sem 'sim'), e sem auxílio do governo
  v_aux := lower(coalesce(new.auxilio_acao_social, ''));
  v_recebe_aux := (new.auxilio_renda_gov = true)
                  or v_aux like '%bolsa%'
                  or v_aux like 'sim%';
  if not v_recebe_aux then
    s := s + coalesce(p_sem_aux, 10);
  end if;

  -- Crianças
  if    new.num_criancas >= 4 then s := s + coalesce(p_cri_4, 28);
  elsif new.num_criancas =  3 then s := s + coalesce(p_cri_3, 22);
  elsif new.num_criancas =  2 then s := s + coalesce(p_cri_2, 15);
  elsif new.num_criancas =  1 then s := s + coalesce(p_cri_1,  8);
  end if;

  -- Idosos
  if    new.num_idosos >= 2 then s := s + coalesce(p_ido_2, 18);
  elsif new.num_idosos =  1 then s := s + coalesce(p_ido_1, 12);
  end if;

  -- Vulnerabilidades
  if new.tem_pcd                   then s := s + coalesce(p_pcd,      12); end if;
  if new.monoparental              then s := s + coalesce(p_mono,     12); end if;
  if new.pode_buscar_cedem = false then s := s + coalesce(p_nao_busca, 3); end if;
  if coalesce(new.num_total_pessoas, 0) >= 5 then s := s + coalesce(p_grande, 5); end if;

  new.score := s;
  return new;
end;
$function$;
