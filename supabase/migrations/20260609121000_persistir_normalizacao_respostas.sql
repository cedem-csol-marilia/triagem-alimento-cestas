-- ============================================================
-- Migration (OPCIONAL): persiste as colunas normalizadas
-- Data: 2026-06-09
--
-- CONTEXTO
--   importar_resposta_forms() calcula whatsapp_norm / endereco_norm /
--   cep_norm para usar na deduplicação, mas NÃO grava esses valores
--   nas colunas correspondentes de respostas_forms — elas ficam nulas.
--   Não quebra nada hoje, mas se um dia você quiser filtrar/buscar por
--   endereço ou telefone normalizado, o dado não estará lá.
--
-- ESTA MIGRATION
--   1. Recria importar_resposta_forms() gravando as 3 colunas _norm.
--   2. Faz backfill das respostas já existentes.
--
-- É OPCIONAL e segura. Rode quando quiser.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Recria a função gravando whatsapp_norm / endereco_norm / cep_norm
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.importar_resposta_forms(
  p_timestamp timestamp with time zone, p_nome text, p_reside_sp text,
  p_aceita_responsabilidade text, p_endereco text, p_bairro text,
  p_ponto_referencia text, p_cidade text, p_cep text, p_whatsapp text,
  p_num_pessoas text, p_num_criancas integer, p_num_idosos integer,
  p_renda text, p_tem_pcd text, p_pcd_descricao text,
  p_auxilio_acao_social text, p_auxilio_renda_gov text,
  p_interesse_curso text, p_pode_buscar_cedem text, p_frequenta_cedem text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_resposta_id   uuid;
  v_wapp_norm     text;
  v_end_norm      text;
  v_cep_norm      text;
  v_melhor_conf   numeric;
  v_melhor_fid    uuid;
  v_motivos       text[];
  v_result        jsonb;
begin
  v_wapp_norm := normalizar_telefone(p_whatsapp);
  v_end_norm  := normalizar_endereco(p_endereco);
  v_cep_norm  := normalizar_cep(p_cep);

  -- Insere a resposta bruta + as colunas normalizadas (AGORA persistidas)
  insert into respostas_forms (
    timestamp_forms, nome_raw, reside_sp_raw, aceita_responsabilidade_raw,
    endereco_raw, bairro_raw, ponto_referencia_raw, cidade_raw, cep_raw,
    whatsapp_raw, num_pessoas_raw, num_criancas_raw, num_idosos_raw,
    renda_raw, tem_pcd_raw, pcd_descricao_raw, auxilio_acao_social_raw,
    auxilio_renda_gov_raw, interesse_curso_raw, pode_buscar_cedem_raw,
    frequenta_cedem_raw,
    whatsapp_norm, endereco_norm, cep_norm,           -- <<< adicionadas
    dedup_status
  ) values (
    p_timestamp, p_nome, p_reside_sp, p_aceita_responsabilidade,
    p_endereco, p_bairro, p_ponto_referencia, p_cidade, p_cep,
    p_whatsapp, p_num_pessoas, p_num_criancas, p_num_idosos,
    p_renda, p_tem_pcd, p_pcd_descricao, p_auxilio_acao_social,
    p_auxilio_renda_gov, p_interesse_curso, p_pode_buscar_cedem,
    p_frequenta_cedem,
    v_wapp_norm, v_end_norm, v_cep_norm,              -- <<< adicionadas
    'novo'
  )
  returning id into v_resposta_id;

  -- Busca candidatas similares
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
  end if;

  v_result := jsonb_build_object(
    'resposta_id',     v_resposta_id,
    'precisa_triagem', v_melhor_fid is not null,
    'confianca',       v_melhor_conf,
    'candidata_id',    v_melhor_fid,
    'motivos',         v_motivos
  );
  return v_result;
end;
$function$;

-- ------------------------------------------------------------
-- 2) Backfill das respostas já existentes (preenche o que estava nulo)
-- ------------------------------------------------------------
update respostas_forms
set whatsapp_norm = normalizar_telefone(whatsapp_raw),
    endereco_norm = normalizar_endereco(endereco_raw),
    cep_norm      = normalizar_cep(cep_raw)
where whatsapp_norm is null
   or endereco_norm is null
   or cep_norm is null;
