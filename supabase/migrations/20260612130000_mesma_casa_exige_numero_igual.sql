-- ============================================================
-- Migration: "mesma casa" exige número igual; composição só conta
--            quando é a mesma casa de verdade
-- Data: 2026-06-12
--
-- CONTEXTO (por que ainda havia 39 pares após 20260612120000)
--   1. O tier forte "+30 endereço com número" usava só similaridade 0.7,
--      então "rua jacaraipe 210" x "rua jacaraipe 14" contava como
--      endereço idêntico — números DIFERENTES passavam.
--   2. A composição familiar (+20) contava com qualquer sinal fraco de
--      endereço (mesmo CEP ou rua parecida). CEP cobre a rua inteira:
--      duas famílias de 4 pessoas na mesma rua somavam 10+20 = 30 e
--      entravam na fila.
--
-- REGRA NOVA
--   v_mesma_casa = mesmo CEP + endereço >= 0.7 + MESMOS NÚMEROS no
--   endereço (extraídos por regex; tolera typo no nome da rua, mas o
--   número tem que bater).
--   - Tier +30 só com v_mesma_casa e número presente.
--   - Composição familiar (+20) só com v_mesma_casa.
--   - Mesmo CEP ou rua parecida sem número igual: só +10, como sempre.
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
  v_sim_end numeric; v_mesmo_cep boolean;
  v_nums1 text[]; v_nums2 text[];
  v_mesma_casa boolean;
  v_peso numeric;
begin
  select * into f1 from familias where id = p_id1;
  select * into f2 from familias where id = p_id2;

  v_peso := peso_dup('whatsapp_identico');
  if v_peso > 0 and f1.whatsapp_norm is not null and f1.whatsapp_norm = f2.whatsapp_norm then
    v_score := v_score + v_peso;
    v_motivos := array_append(v_motivos, 'WhatsApp idêntico (+' || v_peso || ')');
  end if;

  v_sim_end   := similarity(coalesce(f1.endereco_norm,''), coalesce(f2.endereco_norm,''));
  v_mesmo_cep := f1.cep_norm is not null and f1.cep_norm = f2.cep_norm;

  -- Números do endereço (ex.: 'rua jacaraipe 210' -> {210})
  v_nums1 := array(select x[1] from regexp_matches(coalesce(f1.endereco_norm,''), '\d+', 'g') as x);
  v_nums2 := array(select x[1] from regexp_matches(coalesce(f2.endereco_norm,''), '\d+', 'g') as x);

  -- Mesma casa: CEP igual + rua parecida + números idênticos
  v_mesma_casa := v_mesmo_cep and v_sim_end >= 0.7 and v_nums1 = v_nums2;

  if v_mesma_casa and cardinality(v_nums1) > 0 then
    v_peso := peso_dup('endereco_numero_identico');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Mesmo CEP + endereço e número idênticos (+' || v_peso || ')');
    end if;
  elsif v_mesma_casa then
    v_peso := peso_dup('endereco_sem_numero');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Mesmo CEP + endereço (sem número) (+' || v_peso || ')');
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

  -- Composição familiar: SÓ quando é a mesma casa de verdade
  v_peso := peso_dup('composicao_igual');
  if v_peso > 0
     and v_mesma_casa
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
-- CONFERÊNCIA (rode antes do delete): quantos pendentes sobrevivem
-- com a regra nova, e por quê.
--
--    select s.score, s.motivos, count(*)
--    from duplicatas_detectadas d
--    cross join lateral calcular_similaridade_familias(d.familia_id_1, d.familia_id_2) s
--    where d.status = 'pendente'
--    group by s.score, s.motivos
--    order by s.score desc;
-- ------------------------------------------------------------

-- Limpeza: apaga só os PENDENTES e re-detecta
delete from duplicatas_detectadas where status = 'pendente';
select detectar_duplicatas();

-- Verificação: select count(*) from duplicatas_detectadas where status = 'pendente';
