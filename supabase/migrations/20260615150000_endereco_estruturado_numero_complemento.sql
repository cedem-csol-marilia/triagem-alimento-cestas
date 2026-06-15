-- ============================================================
-- MIGRATION: endereço estruturado — complemento em coluna própria
--
-- Decisão de desenho: o que quebrava a dedup (caso Elchin) era o complemento
-- ("casa 18") jogando um número solto dentro do endereço. Então:
--   - `endereco` guarda só RUA + NÚMERO (o número permanece → dedup por número
--     segue funcionando e fica confiável).
--   - `complemento` vira COLUNA PRÓPRIA, fora do endereco e do endereco_norm
--     (que é GENERATED a partir de endereco) → não polui mais o match.
--
-- Colunas:
--   - respostas_forms: numero_raw, complemento_raw (auditoria do input cru)
--   - familias:        complemento (o número vive dentro de `endereco`)
--
-- importar_resposta_forms ganha p_numero / p_complemento OPCIONAIS:
--   - Apps Script ANTIGO (sem os campos): comportamento atual, tudo via p_endereco.
--   - Apps Script NOVO: p_endereco = rua, + p_numero (entra no endereco) +
--     p_complemento (vai pra coluna própria, fora do endereco).
-- ============================================================

alter table respostas_forms add column if not exists numero_raw      text;
alter table respostas_forms add column if not exists complemento_raw text;
alter table familias        add column if not exists complemento     text;

CREATE OR REPLACE FUNCTION public.importar_resposta_forms(
  p_timestamp timestamp with time zone, p_nome text, p_reside_sp text,
  p_aceita_responsabilidade text, p_endereco text, p_bairro text,
  p_ponto_referencia text, p_cidade text, p_cep text, p_whatsapp text,
  p_num_pessoas text, p_num_criancas integer, p_num_idosos integer,
  p_renda text, p_tem_pcd text, p_pcd_descricao text,
  p_auxilio_acao_social text, p_auxilio_renda_gov text,
  p_interesse_curso text, p_pode_buscar_cedem text, p_frequenta_cedem text,
  p_numero text DEFAULT NULL, p_complemento text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_resposta_id uuid;
  v_endereco    text;
  v_wapp_norm   text;
  v_end_norm    text;
  v_cep_norm    text;
  v_melhor_conf numeric;
  v_melhor_fid  uuid;
  v_motivos     text[];
  v_familia_id  uuid;
  v_total       int;
  v_result      jsonb;
begin
  -- endereco = rua + número (complemento NÃO entra aqui; vai em coluna própria).
  if p_numero is not null or p_complemento is not null then
    v_endereco := array_to_string(
      array_remove(array[nullif(trim(p_endereco), ''), nullif(trim(p_numero), '')], null), ', ');
  else
    v_endereco := p_endereco;
  end if;
  v_endereco := nullif(v_endereco, '');

  v_wapp_norm := normalizar_telefone(p_whatsapp);
  v_end_norm  := normalizar_endereco(v_endereco);
  v_cep_norm  := normalizar_cep(p_cep);

  insert into respostas_forms (
    timestamp_forms, nome_raw, reside_sp_raw, aceita_responsabilidade_raw,
    endereco_raw, numero_raw, complemento_raw, bairro_raw, ponto_referencia_raw,
    cidade_raw, cep_raw, whatsapp_raw, num_pessoas_raw, num_criancas_raw,
    num_idosos_raw, renda_raw, tem_pcd_raw, pcd_descricao_raw, auxilio_acao_social_raw,
    auxilio_renda_gov_raw, interesse_curso_raw, pode_buscar_cedem_raw,
    frequenta_cedem_raw, dedup_status
  ) values (
    p_timestamp, p_nome, p_reside_sp, p_aceita_responsabilidade,
    v_endereco, p_numero, p_complemento, p_bairro, p_ponto_referencia,
    p_cidade, p_cep, p_whatsapp, p_num_pessoas, p_num_criancas,
    p_num_idosos, p_renda, p_tem_pcd, p_pcd_descricao, p_auxilio_acao_social,
    p_auxilio_renda_gov, p_interesse_curso, p_pode_buscar_cedem,
    p_frequenta_cedem, 'novo'
  )
  returning id into v_resposta_id;

  select c.familia_id, c.confianca, c.motivos
  into v_melhor_fid, v_melhor_conf, v_motivos
  from buscar_candidatas_dedup(v_wapp_norm, v_end_norm, v_cep_norm, p_ponto_referencia) c
  limit 1;

  if v_melhor_fid is not null then
    update respostas_forms
    set candidata_familia_id = v_melhor_fid,
        confianca_match      = v_melhor_conf,
        candidata_motivos    = v_motivos
    where id = v_resposta_id;

    v_result := jsonb_build_object(
      'resposta_id', v_resposta_id, 'precisa_triagem', true,
      'confianca', v_melhor_conf, 'candidata_id', v_melhor_fid, 'motivos', v_motivos);
  else
    v_total := nullif(regexp_replace(coalesce(p_num_pessoas, ''), '[^0-9]', '', 'g'), '')::int;

    insert into familias (
      nome_responsavel, whatsapp, endereco, complemento,
      bairro, cep, cidade, ponto_referencia, reside_sp,
      num_total_pessoas_raw, num_total_pessoas, num_criancas, num_idosos,
      renda_faixa, tem_pcd, pcd_descricao, auxilio_acao_social, auxilio_renda_gov,
      interesse_curso, pode_buscar_cedem, frequenta_cedem, aceita_responsabilidade,
      status, ids_respostas_forms
    ) values (
      p_nome, p_whatsapp, v_endereco, p_complemento,
      p_bairro, p_cep, p_cidade, p_ponto_referencia,
      (lower(coalesce(p_reside_sp, '')) like 'sim%'),
      p_num_pessoas, v_total, coalesce(p_num_criancas, 0), coalesce(p_num_idosos, 0),
      p_renda, (lower(coalesce(p_tem_pcd, '')) like 'sim%'), p_pcd_descricao,
      p_auxilio_acao_social, (lower(coalesce(p_auxilio_renda_gov, '')) like 'sim%'),
      coalesce(lower(coalesce(p_interesse_curso, '')) ~ '(empregab|alfabet)', false),
      (lower(coalesce(p_pode_buscar_cedem, '')) like 'sim%'),
      (lower(coalesce(p_frequenta_cedem, '')) like 'sim%'),
      (lower(coalesce(p_aceita_responsabilidade, '')) like 'sim%'),
      'fila', array[v_resposta_id]
    )
    returning id into v_familia_id;

    update respostas_forms
    set familia_id = v_familia_id, dedup_status = 'separado'
    where id = v_resposta_id;

    v_result := jsonb_build_object(
      'resposta_id', v_resposta_id, 'precisa_triagem', false,
      'familia_id', v_familia_id, 'nova_familia', true);
  end if;

  return v_result;
end;
$function$;
