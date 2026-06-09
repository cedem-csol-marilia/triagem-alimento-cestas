-- ============================================================
-- TABELA: duplicatas_detectadas
-- Papel: pares de cadastros EXISTENTES (familia x familia) que parecem
--        a mesma casa. Populada por detectar_duplicatas(). Cada par é
--        revisado na tela de Triagem ("Duplicatas entre cadastros existentes").
--
-- IMPORTANTE: esta tabela é SEPARADA de respostas_forms (input do Forms).
-- Nunca grave pares de duplicata em respostas_forms.
-- ============================================================
create table if not exists duplicatas_detectadas (
  id                  uuid primary key default gen_random_uuid(),
  familia_id_1        uuid not null references familias(id),
  familia_id_2        uuid not null references familias(id),
  score               numeric(5,2),
  motivos             text[],
  status              text default 'pendente',   -- pendente | mesma_casa | separadas | ignorado
  decidido_em         timestamptz,
  decidido_obs        text,
  familia_mantida_id  uuid references familias(id),  -- qual ficou após o merge
  criado_em           timestamptz default now(),
  constraint unique_par unique (familia_id_1, familia_id_2),
  constraint ordem_ids check (familia_id_1 < familia_id_2)
);

alter table duplicatas_detectadas enable row level security;

create policy "auth_duplicatas"
  on duplicatas_detectadas for all
  to authenticated
  using (true) with check (true);
