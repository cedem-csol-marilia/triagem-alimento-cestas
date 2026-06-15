// types/index.ts
// Tipos TypeScript espelhando o schema do Supabase

export type StatusFamilia  = 'fila' | 'confirmada' | 'ativa' | 'concluida' | 'inativa'
export type StatusCiclo    = 'confirmado' | 'em_curso' | 'encerrado'
export type StatusEntrega  = 'pendente' | 'entregue' | 'nao_entregue'
export type TipoEntrega    = 'ciclo' | 'avulsa'
export type DedupStatus    = 'novo' | 'mesma_casa' | 'recadastro' | 'separado' | 'ignorado'
export type DecisaoTriagem = 'mesma_casa' | 'casas_separadas' | 'recadastro' | 'ignorar'

export interface Familia {
  id:                      string
  nome_responsavel:        string
  whatsapp:                string | null
  whatsapp_norm:           string | null
  endereco:                string | null
  endereco_norm:           string | null
  complemento:             string | null
  bairro:                  string | null
  cep:                     string | null
  cep_norm:                string | null
  cidade:                  string | null
  ponto_referencia:        string | null
  reside_sp:               boolean
  pode_buscar_cedem:       boolean
  frequenta_cedem:         boolean
  num_total_pessoas_raw:   string | null
  num_total_pessoas:       number | null
  num_criancas:            number
  num_idosos:              number
  renda_faixa:             string | null
  renda_per_capita:        number | null
  tem_pcd:                 boolean
  monoparental:            boolean
  pcd_descricao:           string | null
  auxilio_acao_social:     string | null
  auxilio_renda_gov:       boolean
  interesse_curso:         boolean
  aceita_responsabilidade: boolean
  score:                   number
  status:                  StatusFamilia
  ids_respostas_forms:     string[] | null
  observacao:              string | null
  criado_em:               string
  atualizado_em:           string
}

export interface FilaPriorizada extends Familia {
  posicao_fila:            number
  ciclos_anteriores:       number
  ultimo_ciclo_encerrado:  string | null
}

export interface RespostaForms {
  id:                      string
  familia_id:              string | null
  timestamp_forms:         string | null
  nome_raw:                string | null
  whatsapp_raw:            string | null
  whatsapp_norm:           string | null
  endereco_raw:            string | null
  endereco_norm:           string | null
  cep_raw:                 string | null
  cep_norm:                string | null
  bairro_raw:              string | null
  ponto_referencia_raw:    string | null
  num_pessoas_raw:         string | null
  num_criancas_raw:        number | null
  num_idosos_raw:          number | null
  renda_raw:               string | null
  tem_pcd_raw:             string | null
  pcd_descricao_raw:       string | null
  auxilio_acao_social_raw: string | null
  auxilio_renda_gov_raw:   string | null
  interesse_curso_raw:     string | null
  pode_buscar_cedem_raw:   string | null
  frequenta_cedem_raw:     string | null
  dedup_status:            DedupStatus
  confianca_match:         number | null
  candidata_familia_id:    string | null
  candidata_motivos:       string[] | null
  decisao:                 DecisaoTriagem | null
  decidido_em:             string | null
  decidido_obs:            string | null
  criado_em:               string
}

export interface TriagemPendente {
  resposta_id:             string
  timestamp_forms:         string | null
  criado_em:               string
  nome_raw:                string | null
  whatsapp_raw:            string | null
  whatsapp_norm:           string | null
  endereco_raw:            string | null
  endereco_norm:           string | null
  cep_raw:                 string | null
  cep_norm:                string | null
  bairro_raw:              string | null
  ponto_referencia_raw:    string | null
  num_pessoas_raw:         string | null
  num_criancas_raw:        number | null
  num_idosos_raw:          number | null
  renda_raw:               string | null
  tem_pcd_raw:             string | null
  pcd_descricao_raw:       string | null
  auxilio_acao_social_raw: string | null
  auxilio_renda_gov_raw:   string | null
  interesse_curso_raw:     string | null
  pode_buscar_cedem_raw:   string | null
  frequenta_cedem_raw:     string | null
  confianca_match:         number | null
  candidata_motivos:       string[] | null
  candidata_familia_id:    string | null
  cand_nome:               string | null
  cand_whatsapp:           string | null
  cand_endereco:           string | null
  cand_cep:                string | null
  cand_bairro:             string | null
  cand_ponto_ref:          string | null
  cand_score:              number | null
  cand_status:             StatusFamilia | null
  cand_ciclos_anteriores:  number
  cand_ja_recebeu:         boolean
  cand_ultima_entrega:     string | null
}

export interface Ciclo {
  id:             string
  familia_id:     string
  data_inicio:    string
  data_fim:       string
  status:         StatusCiclo
  confirmado_em:  string
  confirmado_por: string | null
  observacao:     string | null
  criado_em:      string
  atualizado_em:  string
}

export interface Entrega {
  id:                string
  ciclo_id:          string | null
  tipo:              TipoEntrega
  familia_id:        string
  mes_referencia:    string
  data_entrega:      string | null
  status:            StatusEntrega
  pedido_enviado_em: string | null
  pedido_confirmado: boolean
  pedido_obs:        string | null
  observacao:        string | null
  atualizado_em:     string
}

export interface PainelEntrega extends Entrega {
  nome_responsavel:  string
  whatsapp:          string | null
  endereco:          string | null
  bairro:            string | null
  ponto_referencia:  string | null
  pode_buscar_cedem: boolean
  num_total_pessoas: number | null
  ciclo_inicio:      string | null
  ciclo_fim:         string | null
  ciclo_status:      StatusCiclo | null
}
