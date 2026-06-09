-- ============================================================
-- VIEW: triagem_pendente
-- Papel: lista as respostas do Forms ainda não classificadas
--        (dedup_status = 'novo') que têm uma família candidata.
--        Alimenta a seção "Novas respostas do Forms" na tela de Triagem.
-- ============================================================
create or replace view public.triagem_pendente as
 select r.id as resposta_id,
    r.timestamp_forms,
    r.criado_em,
    r.nome_raw,
    r.whatsapp_raw,
    r.whatsapp_norm,
    r.endereco_raw,
    r.endereco_norm,
    r.cep_raw,
    r.cep_norm,
    r.bairro_raw,
    r.ponto_referencia_raw,
    r.num_pessoas_raw,
    r.num_criancas_raw,
    r.num_idosos_raw,
    r.renda_raw,
    r.tem_pcd_raw,
    r.pcd_descricao_raw,
    r.auxilio_acao_social_raw,
    r.auxilio_renda_gov_raw,
    r.interesse_curso_raw,
    r.pode_buscar_cedem_raw,
    r.frequenta_cedem_raw,
    r.confianca_match,
    r.candidata_motivos,
    r.candidata_familia_id,
    f.nome_responsavel as cand_nome,
    f.whatsapp as cand_whatsapp,
    f.endereco as cand_endereco,
    f.cep as cand_cep,
    f.bairro as cand_bairro,
    f.ponto_referencia as cand_ponto_ref,
    f.score as cand_score,
    f.status as cand_status,
    ( select count(*) as count
           from ciclos c
          where c.familia_id = f.id) as cand_ciclos_anteriores
   from respostas_forms r
     left join familias f on f.id = r.candidata_familia_id
  where r.dedup_status = 'novo'::dedup_status and r.candidata_familia_id is not null
  order by r.confianca_match desc nulls last, r.criado_em;
