-- ============================================================
-- Migration: triagem_pendente mostra histórico de entrega da candidata
-- Data: 2026-06-09
--
-- OBJETIVO
--   Num cadastro novo, avisar se a família candidata (a que o matching
--   apontou como possível duplicata) JÁ RECEBEU cesta. Assim, na triagem,
--   dá pra marcar "Recadastro" e não mandar cesta repetida.
--
--   Acrescenta duas colunas à view:
--     cand_ja_recebeu     -> a candidata tem alguma entrega 'entregue'?
--     cand_ultima_entrega -> data da última entrega 'entregue'
--
--   Isso NÃO é o score de similaridade — é histórico (tabela entregas).
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
          where c.familia_id = f.id) as cand_ciclos_anteriores,
    exists (
      select 1 from entregas e
      where e.familia_id = f.id and e.status = 'entregue'
    ) as cand_ja_recebeu,
    ( select max(e.data_entrega)
           from entregas e
          where e.familia_id = f.id and e.status = 'entregue') as cand_ultima_entrega
   from respostas_forms r
     left join familias f on f.id = r.candidata_familia_id
  where r.dedup_status = 'novo'::dedup_status and r.candidata_familia_id is not null
  order by r.confianca_match desc nulls last, r.criado_em;
