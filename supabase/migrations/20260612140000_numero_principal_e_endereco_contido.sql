-- ============================================================
-- Migration: compara o número PRINCIPAL do endereço e reconhece
--            endereço contido (complementos não atrapalham)
-- Data: 2026-06-12
--
-- CASO QUE MOTIVOU (encontrado na conferência pós-20260612130000)
--   Grace dos Santos Elchin  "rua general irulegui cunha n°644 ... viela do amor casa 18"
--   Tauane dos Santos Elchin "rua general irulegui cunha 644"
--   Mesmo CEP, mesmo nº 644, sobrenome raro — duplicata real provável
--   que ficou FORA da fila por dois detalhes:
--   1. A comparação exigia TODOS os números iguais: {644,18} != {644}.
--      O "casa 18" do complemento quebrava o match.
--   2. similarity() pena quando um endereço é longo (complemento, bairro)
--      e o outro curto: caía abaixo do gate 0.7.
--
-- REGRA NOVA
--   - Número principal = primeiro número do endereço (o da rua).
--   - Similaridade = greatest(similarity, word_similarity nos dois
--     sentidos) -> reconhece "endereço curto contido no longo".
--   - Mesma casa = mesmo CEP + mesmo número principal + rua >= 0.7.
--   - Composição familiar continua contando SÓ na mesma casa.
--   - Pares sem número continuam valendo no máximo +10 de endereço.
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
  v_end1 text; v_end2 text;
  v_sim_end numeric; v_mesmo_cep boolean;
  v_num1 text; v_num2 text;
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

  v_end1 := coalesce(f1.endereco_norm, '');
  v_end2 := coalesce(f2.endereco_norm, '');

  -- Similaridade que reconhece endereço contido no outro
  -- (curto "rua x 644" dentro do longo "rua x 644 complemento casa 18")
  v_sim_end := greatest(
    similarity(v_end1, v_end2),
    word_similarity(v_end1, v_end2),
    word_similarity(v_end2, v_end1)
  );
  v_mesmo_cep := f1.cep_norm is not null and f1.cep_norm = f2.cep_norm;

  -- Número principal = primeiro número que aparece (o da rua)
  v_num1 := (regexp_match(v_end1, '\d+'))[1];
  v_num2 := (regexp_match(v_end2, '\d+'))[1];

  -- Mesma casa: CEP igual + mesmo número principal + rua parecida
  v_mesma_casa := v_mesmo_cep
                  and v_num1 is not null and v_num1 = v_num2
                  and v_sim_end >= 0.7;

  if v_mesma_casa then
    v_peso := peso_dup('endereco_numero_identico');
    if v_peso > 0 then
      v_score := v_score + v_peso;
      v_motivos := array_append(v_motivos, 'Mesmo CEP + endereço e número idênticos (+' || v_peso || ')');
    end if;
  elsif v_mesmo_cep and v_sim_end >= 0.7 and v_num1 is null and v_num2 is null then
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

  -- Composição familiar: SÓ quando é a mesma casa
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
-- CONFERÊNCIA (rode antes do delete): deve trazer os 6 atuais
-- + o par Grace x Tauane Elchin (644).
--
--    select f1.nome_responsavel as familia_1, f2.nome_responsavel as familia_2,
--           s.score, s.motivos
--    from familias f1
--    join familias f2 on f1.id < f2.id
--    cross join lateral calcular_similaridade_familias(f1.id, f2.id) s
--    where s.score >= 30
--    order by s.score desc;
-- ------------------------------------------------------------

-- Limpeza: apaga só os PENDENTES e re-detecta
delete from duplicatas_detectadas where status = 'pendente';
select detectar_duplicatas();

-- Verificação: select count(*) from duplicatas_detectadas where status = 'pendente';
