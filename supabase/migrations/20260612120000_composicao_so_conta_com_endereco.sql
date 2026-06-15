-- ============================================================
-- Migration: composição familiar só conta quando há sinal de endereço
-- Data: 2026-06-12
--
-- BUG
--   O sinal "Mesma composição familiar" (+20) estava sendo somado para
--   QUALQUER par de famílias com o mesmo nº de pessoas/crianças/idosos,
--   mesmo morando em endereços totalmente diferentes. Combinado com
--   "Sobrenome incomum" (+15), qualquer par assim fazia 35 >= corte 30
--   e entrava na Triagem. Resultado: a fila saltou de ~11 para 47 pares,
--   quase todos falsos (35% só com composição + sobrenome).
--
--   A intenção original (migration 20260609140000) sempre foi:
--   "se dois cadastros NO MESMO ENDEREÇO reportam o mesmo tamanho de
--   casa" — o gate de endereço só não foi implementado.
--
-- CORREÇÃO
--   Composição familiar agora só soma quando o par já tem algum sinal
--   de endereço (mesmo CEP ou endereço >= 0.7 de similaridade).
--
-- LIMPEZA
--   Apaga apenas os pares PENDENTES (nenhuma decisão é perdida) e
--   roda a detecção de novo com a regra corrigida.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Função corrigida
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
  v_tem_sinal_endereco boolean;
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
  v_tem_sinal_endereco := v_mesmo_cep or v_sim_end >= 0.7;

  -- Endereço: gate relaxado (0.7) + fallback de mesmo CEP
  if v_mesmo_cep and v_sim_end >= 0.7 and v_end1_tem_num and v_end2_tem_num then
    v_peso := peso_dup('endereco_numero_identico');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Mesmo CEP + endereço com número (+' || v_peso || ')');
    end if;
  elsif v_mesmo_cep then
    v_peso := peso_dup('endereco_sem_numero');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Mesmo CEP (+' || v_peso || ')');
    end if;
  elsif v_sim_end >= 0.7 then
    v_peso := peso_dup('endereco_sem_numero');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Endereço muito parecido (+' || v_peso || ')');
    end if;
  end if;

  -- Composição familiar: só conta com sinal de endereço (CORREÇÃO)
  v_peso := peso_dup('composicao_igual');
  if v_peso > 0
     and v_tem_sinal_endereco
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

-- ------------------------------------------------------------
-- 2) CONFERÊNCIA (rode antes do delete): quantos pares pendentes
--    sobreviveriam com a regra nova? Deve ficar perto dos ~11 originais.
--
--    select count(*) as vao_continuar
--    from duplicatas_detectadas d
--    cross join lateral calcular_similaridade_familias(d.familia_id_1, d.familia_id_2) s
--    where d.status = 'pendente' and s.score >= 30;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) Limpeza: apaga só os PENDENTES (decisões já tomadas ficam)
--    e re-detecta com a regra corrigida.
-- ------------------------------------------------------------
delete from duplicatas_detectadas where status = 'pendente';
select detectar_duplicatas();

-- ------------------------------------------------------------
-- 4) VERIFICAÇÃO (depois): a fila deve voltar ao tamanho esperado.
--
--    select count(*) from duplicatas_detectadas where status = 'pendente';
-- ------------------------------------------------------------
