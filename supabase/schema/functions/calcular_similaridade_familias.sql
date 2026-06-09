-- ============================================================
-- FUNÇÃO: calcular_similaridade_familias(id1, id2)
-- Papel: dá uma nota 0–100 de chance de dois cadastros serem a MESMA casa.
--        Lê os pesos de config_pesos_duplicacao (via peso_dup).
--        Usada por detectar_duplicatas() e buscar_candidatas_dedup().
--
-- Sinais (pesos editáveis na tabela config_pesos_duplicacao):
--   - WhatsApp idêntico
--   - CEP + endereço com número idêntico / sem número
--   - Composição familiar igual (pessoas/crianças/idosos)
--   - Ponto de referência coincide
--   - Sobrenome incomum compartilhado
-- Resultado é limitado a 100 (escala 0–100%).
-- ============================================================
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

  v_peso := peso_dup('whatsapp_identico');
  if v_peso > 0 and f1.whatsapp_norm is not null and f1.whatsapp_norm = f2.whatsapp_norm then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'WhatsApp idêntico (+' || v_peso || ')');
  end if;

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

  v_peso := peso_dup('composicao_igual');
  if v_peso > 0
     and f1.num_total_pessoas is not null
     and f1.num_total_pessoas = f2.num_total_pessoas
     and f1.num_criancas = f2.num_criancas
     and f1.num_idosos   = f2.num_idosos then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'Mesma composição familiar (+' || v_peso || ')');
  end if;

  v_peso := peso_dup('ponto_referencia');
  if v_peso > 0 and f1.ponto_referencia is not null and f2.ponto_referencia is not null
     and similarity(normalizar_texto(f1.ponto_referencia), normalizar_texto(f2.ponto_referencia)) >= 0.8 then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'Ponto de referência coincide (+' || v_peso || ')');
  end if;

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

  return query select least(round(v_score, 1), 100), v_motivos;
end;
$function$;
