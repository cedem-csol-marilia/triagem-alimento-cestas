-- ============================================================
-- Migration: score de duplicação configurável + sinal de composição
-- Data: 2026-06-09
--
-- OBJETIVO
--   1. Tirar os pesos da duplicação de dentro do código e colocá-los
--      numa tabela editável (config_pesos_duplicacao), espelhando o
--      modelo de config_pesos_priorizacao. Assim dá pra ajustar os
--      critérios pelo dashboard, sem mexer em SQL.
--   2. Adicionar o sinal de COMPOSIÇÃO FAMILIAR: se dois cadastros no
--      mesmo endereço reportam o mesmo tamanho de casa (pessoas,
--      crianças, idosos), provavelmente são a MESMA casa se cadastrando
--      em duplicidade — o caso "5 pessoas da mesma família" que a gente
--      quer pegar pra não mandar 5 cestas pro mesmo lar.
--
-- LEMBRETE: este é o score de SIMILARIDADE (chance de ser a mesma casa),
-- diferente do score de PRIORIZAÇÃO (familias.score, mede necessidade).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de pesos da duplicação (editável)
-- ------------------------------------------------------------
-- Mesmo formato de config_pesos_priorizacao (id, label, descricao, ordem)
-- + a coluna 'criterio' que peso_dup() usa para buscar o peso.
create table if not exists config_pesos_duplicacao (
  id             serial primary key,
  criterio       text unique not null,
  label          text not null,
  descricao      text,
  peso           numeric(5,1) not null default 0,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  atualizado_em  timestamptz default now()
);

alter table config_pesos_duplicacao enable row level security;

create policy "auth_config_pesos_dup"
  on config_pesos_duplicacao for all
  to authenticated
  using (true) with check (true);

insert into config_pesos_duplicacao (criterio, label, descricao, peso, ordem) values
  ('whatsapp_identico',        'Mesmo WhatsApp',               'Os dois cadastros têm o mesmo número de WhatsApp',          50, 1),
  ('endereco_numero_identico', 'Endereço com número idêntico', 'Mesmo CEP e mesmo endereço, com o número batendo',          30, 2),
  ('composicao_igual',         'Mesma composição familiar',    'Mesmo total de pessoas, crianças e idosos reportados',      20, 3),
  ('sobrenome_incomum',        'Sobrenome incomum',            'Compartilham um sobrenome pouco comum (sinal de parentesco)',15, 4),
  ('endereco_sem_numero',      'Endereço sem número',          'Mesmo CEP e endereço, mas sem número identificável',        10, 5),
  ('ponto_referencia',         'Ponto de referência coincide', 'Descrevem o mesmo ponto de referência',                     10, 6)
on conflict (criterio) do nothing;

-- ------------------------------------------------------------
-- 2) Helper: lê o peso de um critério (0 se inativo/inexistente)
-- ------------------------------------------------------------
create or replace function public.peso_dup(p_criterio text)
 returns numeric
 language sql
 stable
as $$
  select coalesce(
    (select peso from config_pesos_duplicacao
     where criterio = p_criterio and ativo), 0);
$$;

-- ------------------------------------------------------------
-- 3) calcular_similaridade_familias lendo pesos da tabela
--    + sinal de composição + teto de 100 (vira escala 0–100%)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_similaridade_familias(p_id1 uuid, p_id2 uuid)
 RETURNS TABLE(score numeric, motivos text[])
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  f1 familias%rowtype; f2 familias%rowtype;
  v_score   numeric := 0;
  v_motivos text[]  := array[]::text[];
  v_sob1 text[]; v_sob2 text[]; v_sob_comum text;
  v_sim_end numeric; v_end1_tem_num boolean; v_end2_tem_num boolean; v_mesmo_cep boolean;
  v_peso numeric;
begin
  select * into f1 from familias where id = p_id1;
  select * into f2 from familias where id = p_id2;

  -- WhatsApp idêntico
  v_peso := peso_dup('whatsapp_identico');
  if v_peso > 0 and f1.whatsapp_norm is not null and f1.whatsapp_norm = f2.whatsapp_norm then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'WhatsApp idêntico (+' || v_peso || ')');
  end if;

  -- Endereço
  v_sim_end      := similarity(coalesce(f1.endereco_norm,''), coalesce(f2.endereco_norm,''));
  v_end1_tem_num := coalesce(f1.endereco_norm,'') ~ '\d';
  v_end2_tem_num := coalesce(f2.endereco_norm,'') ~ '\d';
  v_mesmo_cep    := f1.cep_norm is not null and f1.cep_norm = f2.cep_norm;

  if v_mesmo_cep and v_sim_end >= 0.99 and v_end1_tem_num and v_end2_tem_num then
    v_peso := peso_dup('endereco_numero_identico');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'CEP + endereço com número idêntico (+' || v_peso || ')');
    end if;
  elsif v_mesmo_cep and v_sim_end >= 0.99 then
    v_peso := peso_dup('endereco_sem_numero');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'CEP + endereço sem número (+' || v_peso || ')');
    end if;
  end if;

  -- Composição familiar igual (NOVO sinal)
  v_peso := peso_dup('composicao_igual');
  if v_peso > 0
     and f1.num_total_pessoas is not null
     and f1.num_total_pessoas = f2.num_total_pessoas
     and f1.num_criancas = f2.num_criancas
     and f1.num_idosos   = f2.num_idosos then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'Mesma composição familiar (+' || v_peso || ')');
  end if;

  -- Ponto de referência
  v_peso := peso_dup('ponto_referencia');
  if v_peso > 0 and f1.ponto_referencia is not null and f2.ponto_referencia is not null
     and similarity(normalizar_texto(f1.ponto_referencia), normalizar_texto(f2.ponto_referencia)) >= 0.8 then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'Ponto de referência coincide (+' || v_peso || ')');
  end if;

  -- Sobrenome incomum compartilhado
  v_sob1 := extrair_sobrenomes(f1.nome_responsavel);
  v_sob2 := extrair_sobrenomes(f2.nome_responsavel);
  select s into v_sob_comum
  from unnest(v_sob1) s
  where s = any(v_sob2) and length(s) > 4 and not sobrenome_e_comum(s)
  limit 1;
  v_peso := peso_dup('sobrenome_incomum');
  if v_peso > 0 and v_sob_comum is not null then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'Sobrenome incomum coincide: ' || v_sob_comum || ' (+' || v_peso || ')');
  end if;

  -- Teto de 100: o resultado vira uma escala 0–100%
  return query select least(round(v_score, 1), 100), v_motivos;
end;
$function$;

-- ------------------------------------------------------------
-- 4) (opcional) Re-pontuar os pares PENDENTES com a nova regra.
--    Só apaga os ainda NÃO decididos; os decididos ficam intactos.
--
--    delete from duplicatas_detectadas where status = 'pendente';
--    select detectar_duplicatas();
-- ------------------------------------------------------------
