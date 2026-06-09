-- ============================================================
-- TABELA: config_pesos_duplicacao
-- Papel: pesos editáveis dos critérios do SCORE DE SIMILARIDADE
--        (chance de dois cadastros serem a mesma casa).
--        Mesmo formato de config_pesos_priorizacao (id/label/descricao/ordem)
--        + coluna 'criterio' usada por peso_dup().
--        Editável em Configurações > aba "Regra de duplicatas".
-- ============================================================
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
  ('whatsapp_identico',        'Mesmo WhatsApp',               'Os dois cadastros têm o mesmo número de WhatsApp',           50, 1),
  ('endereco_numero_identico', 'Endereço com número idêntico', 'Mesmo CEP e mesmo endereço, com o número batendo',           30, 2),
  ('composicao_igual',         'Mesma composição familiar',    'Mesmo total de pessoas, crianças e idosos reportados',       20, 3),
  ('sobrenome_incomum',        'Sobrenome incomum',            'Compartilham um sobrenome pouco comum (sinal de parentesco)',15, 4),
  ('endereco_sem_numero',      'Endereço sem número',          'Mesmo CEP e endereço, mas sem número identificável',         10, 5),
  ('ponto_referencia',         'Ponto de referência coincide', 'Descrevem o mesmo ponto de referência',                      10, 6)
on conflict (criterio) do nothing;
