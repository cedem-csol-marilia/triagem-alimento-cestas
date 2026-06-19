# Fluxo e Banco — triagem-alimento-cestas

Documentação profunda de **como os dados andam** (do Google Form e dos e-mails
da Calvo até as telas) e de **como o banco está montado** (tabelas, views,
funções, contratos das RPCs e modos de falha).

Complementa, sem substituir:
- `supabase/ARQUITETURA.md` — mapa resumido do fluxo de dados.
- `docs/AUTOMACAO-ENTREGAS.md` — lado Make + parsing dos e-mails.
- `supabase/migrations/` — histórico real das mudanças no banco.

> Convenção deste doc: tudo marcado com **(não versionado)** é uma estrutura
> que existe no banco mas cujo DDL completo ainda não está no repo — as colunas
> listadas vêm das migrations e das views que as referenciam, não do `CREATE TABLE`
> original. Para fechar o gap, rode `select pg_get_functiondef(...)` /
> `\d <tabela>` no SQL Editor e salve em `supabase/schema/`.

---

## 1. Visão geral — os dois fluxos

O sistema tem **dois fluxos de entrada independentes** que terminam nas mesmas
tabelas (`familias`, `entregas`):

### Fluxo A — Cadastro e triagem (Google Form → famílias)

```
Google Form ──IMPORTRANGE──► Planilha ──Apps Script──► RPC importar_resposta_forms
                                                              │ normaliza + dedup
                                                              ▼
                                                     respostas_forms (input cru)
                                                              │
                                          ┌───────────────────┴───────────────────┐
                                          │ tem candidata de duplicata?            │
                                          ▼                                        ▼
                              view triagem_pendente                    cria família nova na fila
                              "Novas respostas do Forms"                (familias + ciclo/entrega)
```

### Fluxo B — Automação de entregas (e-mails Calvo → entregas)

```
e-mail Calvo (Fwd Eduarda) ──► Make (trigger Gmail + regex) ──► POST /rest/v1/rpc/<funcao>
                                                                        │
                                                            ┌───────────┴────────────┐
                                                            │ casou a família/entrega?│
                                                            ▼                         ▼
                                              UPDATE em entregas            INSERT em entregas_nao_casadas
                                              (idempotente)                 (fila de revisão manual)
```

A regra de ouro dos dois fluxos: **ninguém escreve direto nas tabelas-núcleo
no escuro.** Tudo passa por RPC que normaliza, deduplica e, quando não tem
certeza, manda pra uma fila de revisão (`respostas_forms` com candidata, ou
`entregas_nao_casadas`).

---

## 2. Banco — tabelas

### `respostas_forms` — input cru do Form *(não versionado)*
Uma linha por resposta do Google Form. **Só o Apps Script escreve**, via
`importar_resposta_forms`. Nenhuma função de duplicata pode gravar aqui.
Campos relevantes conhecidos: dados crus do form, colunas `*_norm`
(telefone/endereço/CEP normalizados), `dedup_status` (`'novo'`…),
`candidata_familia_id`, `confianca_match`, `familia_id` (preenchido no backfill).

### `familias` — cadastros consolidados *(não versionado)*
Registro "oficial" de cada família. Colunas conhecidas (via views/migrations):
`id` (uuid), `nome_responsavel`, `whatsapp`, **`whatsapp_norm`** (chave de match
da automação), `endereco`, `numero`, `complemento`, `bairro`, `ponto_referencia`,
`pode_buscar_cedem`, `num_total_pessoas`, status na fila, motivo de inativação,
`endereco_verificado`, `contatado_em`.

> `whatsapp_norm` é o **eixo de todo o match da automação**. Se ele estiver
> vazio ou diferente do que vem no e-mail, a entrega não casa.

### `ciclos` — ciclos de entrega por família *(não versionado)*
Colunas conhecidas (via `painel_entregas`): `id`, `data_inicio`, `data_fim`,
`status`. Uma entrega de tipo `'ciclo'` aponta para um ciclo.

### `entregas` — entregas individuais
Tabela-núcleo do Fluxo B. Colunas (base + migrations de automação):

| Coluna | Tipo | Origem | Papel |
|---|---|---|---|
| `id` | uuid | base | PK |
| `ciclo_id` | uuid (nullable) | base / `…615130000` | ciclo ao qual pertence; **null** se avulsa |
| `familia_id` | uuid | base | família que recebe |
| `mes_referencia` | date | base | 1º dia do mês (ex.: `2026-06-01`) |
| `tipo` | text | `…615130000` | `'ciclo'` \| `'avulsa'` (default `'ciclo'`) |
| `status` | text | base | `'pendente'` \| `'entregue'` \| `'nao_entregue'` |
| `data_entrega` | date | base | preenchida no estágio "entregue" |
| `observacao` | text | base | nota livre |
| `pedido_confirmado` | bool | base | marcado no estágio "pedido" |
| `pedido_enviado_em` | timestamptz | base | data do pedido |
| `atualizado_em` | timestamptz | base | usado pra desempate no match |
| `pedido_loja` | text | `…617120000` | nº da loja virtual (ex.: 209683) — **chave de match do "entregue"** |
| `pedido_fiscal` | text | `…617120000` | "Nosso Pedido" da NF (ex.: 1810114) — auditoria |
| `pedido_mae` | text | `…617120000` | "Ped.Mae" (ex.: 1809488) — auditoria |
| `nfe_numero` | text | `…617120000` | nº da NF (ex.: 002632574) — chave idempotente da NF |
| `nfe_serie` | text | `…617120000` | série da NF |
| `nfe_emitida_em` | date | `…617120000` | data de emissão |
| `whatsapp_pedido` | text | `…617120000` | whatsapp como veio no pedido (auditoria) |
| `motivo_falha` | text | `…617120000` | preenchido quando `status='nao_entregue'` |
| `origem` | text | `…617120000` | `'manual'` \| `'make'` (default `'manual'`) |

**Constraints / índices que importam para a automação:**
- `entregas_tipo_check`: `tipo='ciclo'` exige `ciclo_id`; `tipo='avulsa'` exige `ciclo_id IS NULL`.
- `entregas_pedido_loja_uidx` — **único** em `pedido_loja` (where not null): a 2ª
  chamada com o mesmo pedido **não duplica** (idempotência na raiz).
- `entregas_nfe_numero_uidx` — **único** em `nfe_numero` (where not null): idem para NF.

### `entregas_nao_casadas` — fila de exceções da automação
"Caixa de entrada" do que o Make recebeu mas **não conseguiu (ou não deve)**
gravar direto em `entregas`. Definida em `…617120000`.

| Coluna | Tipo | Papel |
|---|---|---|
| `id` | uuid | PK |
| `recebido_em` | timestamptz | quando entrou na fila |
| `estagio` | text | `'pedido'` \| `'nf'` \| `'entregue'` \| `'falha'` |
| `motivo` | text | por que não casou (ver §5) |
| `whatsapp`, `nome`, `endereco`, `cep` | text | dados crus do e-mail |
| `pedido_loja`, `pedido_fiscal`, `nfe_numero` | text | identificadores crus |
| `payload` | jsonb | campos crus extraídos (pra **reprocessar**) |
| `resolvido` | bool | default `false` |
| `entrega_id` | uuid → entregas | preenchido quando resolvido |
| `resolvido_em` | timestamptz | quando foi resolvido |

> **Esta é a tabela no centro da sua dúvida.** Leia o §4 com atenção: uma linha
> aqui significa que **o request NÃO falhou** — ele rodou e foi 200; a função
> *de propósito* estacionou o registro aqui pra revisão.

### Tabelas de apoio (Fluxo A)
- `duplicatas_detectadas` — pares de cadastros suspeitos de serem a mesma casa.
- `config_pesos_duplicacao` / `config_pesos_priorizacao` — pesos dos scores.
- `sobrenomes_comuns` — sobrenome comum vale menos no match.
- `triagem_log` — histórico de decisões de triagem.

---

## 3. Banco — views e funções

### Views
- **`triagem_pendente`** — respostas novas com candidata → tela "Novas respostas do Forms".
- **`fila_priorizada`** — fila ordenada por score.
- **`painel_entregas`** — entregas + dados da família (lê a tela de Entregas).
  Expõe `pedido_loja`, `nfe_numero`, `nfe_emitida_em` (migration `…617150000`).
- **`cadastro_incompleto`** — cadastros faltando dados.

### Funções da automação (Fluxo B) — as 5 RPCs

Todas têm 3 propriedades fixas (migrations `…617121000`, `…617130000`, `…617160000`):
1. **Idempotentes** — rodar 2x não duplica (via os índices únicos + checagens).
2. **Nunca escrevem no escuro** — se não casam, gravam em `entregas_nao_casadas`.
3. **`SECURITY DEFINER` + `GRANT EXECUTE TO anon`** — a chave `anon` pode chamar,
   sem ter acesso direto às tabelas.

| Função | Estágio | Chave de match | Efeito quando casa |
|---|---|---|---|
| `casar_familia_por_whatsapp(p_whatsapp)` | helper | `whatsapp_norm` | retorna `familia_id` ou motivo |
| `registrar_pedido_loja(...)` | 1 — pedido | whatsapp → entrega pendente do mês sem `pedido_loja` | marca `pedido_confirmado`, grava `pedido_loja` |
| `registrar_nf(...)` | 2 — NF | whatsapp → entrega do mês | grava `nfe_*`, `pedido_fiscal/mae` (best-effort) |
| `registrar_entrega_concluida(...)` | 3 — entregue | **`pedido_loja` primeiro**, whatsapp como fallback | `status='entregue'` + `data_entrega` |
| `registrar_falha_entrega(...)` | 4 — falha (gancho) | `pedido_loja` → whatsapp | `status='nao_entregue'` + `motivo_falha` |

**Assinatura atual de `registrar_entrega_concluida`** (após `…617130000` — `p_data` é **text**):

```sql
registrar_entrega_concluida(
  p_whatsapp text, p_pedido_loja text, p_data text,
  p_nome text default null, p_endereco text default null,
  p_cep text default null, p_payload jsonb default null
) returns jsonb
```

Lógica do estágio 3 (resumida):
1. Se veio `p_pedido_loja`, acha a entrega por **número do pedido** (determinístico,
   independe do mês — pedido pode ser de maio e entrega de junho).
2. Se não achou, tenta casar por whatsapp → entrega `pendente` do mês.
3. Se nada casou → `INSERT entregas_nao_casadas(estagio='entregue', motivo=...)` e
   retorna `{"ok": false, ...}`.
4. Se a entrega já está `'entregue'` → retorna `{"ok": true, "duplicado": true}`.
5. Senão → `UPDATE status='entregue', data_entrega=..., origem='make'` e retorna `{"ok": true}`.

### Contrato de resposta (todas as RPCs)
| Resposta | HTTP | Significado |
|---|---|---|
| `{"ok": true, "entrega_id": "..."}` | 200 | gravou |
| `{"ok": true, "duplicado": true}` | 200 | e-mail repetido, ignorou (idempotência) |
| `{"ok": false, "motivo": "...", "pendencia": true}` | **200** | **foi pra fila de revisão** |
| erro PostgREST (PGRST…/22007/…) | **4xx/5xx** | **o request falhou** — nada foi gravado |

### Funções da triagem (Fluxo A)
`importar_resposta_forms`, `detectar_duplicatas`, `calcular_similaridade_familias`,
`buscar_candidatas_dedup`, `calcular_score`, `mesclar_familias`, `reativar_familia`,
`registrar_entrega_avulsa`, e os normalizadores `normalizar_telefone/endereco/cep`.
Versionamento parcial — ver tabela em `ARQUITETURA.md`.

---

## 4. Por que o request "não rodou" — a distinção central

Há **dois eventos diferentes** que você está tratando como um só:

### (a) `ok: false` → linha em `entregas_nao_casadas` — **o request NÃO falhou**
A função rodou, retornou **HTTP 200** com `{"ok": false, "pendencia": true}` e
*deliberadamente* estacionou o registro na fila. Como o flag do módulo Make é
**"Return error if HTTP request fails"** e isso só dispara em status **não-2xx**,
um `ok:false` (que é 200) **não deixa o módulo vermelho**. Ou seja: **toda linha
que está em `entregas_nao_casadas` corresponde a um request que deu certo.**
Essas são as "entregas antigas não mapeadas" — comportamento esperado, não erro.

### (b) Módulo HTTP vermelho no Make — **o request falhou de verdade (não-2xx)**
Aí a função **não completou** ou o PostgREST recusou a chamada. Resultado:
**nada foi gravado — nem em `entregas`, nem em `entregas_nao_casadas`.** O bundle
daquele e-mail parou. Estes são um conjunto **disjunto** das linhas da fila.

> Resumindo a sua frase "tem coisas em entregas_nao_casadas, mas essas não
> entraram porque o request falhou": **não**. As que estão na fila *entraram* na
> fila (request 200, match falhou). As que *falharam* (vermelho no Make) não
> deixaram rastro nenhum. São problemas separados, com soluções separadas.

### Onde achar a causa real do (b)
A config que você colou é o **mapeamento** do módulo, não a resposta. No Make:
abra a execução → clique no módulo HTTP vermelho (request 7) → aba **Output** →
olhe `statusCode` e `body`. O `body` traz o erro do PostgREST. Causas prováveis,
em ordem de probabilidade neste projeto:

| Sintoma no `body` | Status | Causa | Correção |
|---|---|---|---|
| `invalid input syntax for type date` / `22007` | 400 | a migration `…617130000` (data tolerante) **não foi aplicada** no banco vivo e `p_data` chegou vazio/PT-BR | aplicar `…617130000`; garantir que o Make manda `AAAA-MM-DD` (ou vazio) |
| `permission denied for function …` | 403 | o Make usa uma chave/role que **não é `anon`** (a `…617160000` só deu EXECUTE pro `anon`) | usar a chave `anon`, **ou** `grant execute … to <seu_role>` |
| `Could not find function … in schema cache` / `PGRST202` | 404 | assinatura não bate ou cache do PostgREST velho após as migrations | `NOTIFY pgrst, 'reload schema';` e conferir nomes dos params |
| `No API key found` / JWT | 401 | header `apikey`/`Authorization` ausente ou errado | conferir os 3 headers do §pré-requisito do `AUTOMACAO-ENTREGAS.md` |
| `Could not choose the best candidate function` / `PGRST203` | 300 | existem **duas** versões da RPC (a antiga `date` não foi dropada) | dropar a sobrecarga antiga (ver §6) |

> Pista forte: a própria existência da migration `…617130000` ("blindar contra
> data vazia/inválida — 22007") indica que esse erro **já aconteceu** antes. Se o
> Make ainda quebra, o primeiro suspeito é que **as migrations de 17/jun
> (130000/140000/160000) não foram todas aplicadas no Supabase vivo** — o
> `CONTINUAR-AQUI.md` só confirma commit até a `…615…`/`…612150000`.

### Detalhe do payload que você colou
O body manda `"p_payload": { "fonte": "email_pedido" }` num endpoint que é o de
**entregue** (estágio 3). É só um rótulo de auditoria copiado do estágio 1 —
inofensivo, mas vale corrigir pra `"email_entregue"` pra não confundir log depois.

---

## 5. Resolver `entregas_nao_casadas` — playbook por motivo

Liste o que está aberto:
```sql
select recebido_em, estagio, motivo, whatsapp, pedido_loja, nfe_numero, nome
from entregas_nao_casadas
where resolvido = false
order by recebido_em desc;
```

| `motivo` | O que significa | Como resolver |
|---|---|---|
| `whatsapp_ausente` | a regex do Make não extraiu o whatsapp (ou veio em branco) | pegar o número no `payload`/e-mail, achar a família, casar na mão (ver abaixo); melhorar a regex no Make |
| `familia_nao_encontrada` | o `whatsapp_norm` não bate com nenhuma família — **típico das "antigas não mapeadas"**: família que recebeu cesta mas nunca foi cadastrada, ou cujo whatsapp no cadastro está diferente | cadastrar/corrigir o `whatsapp` da família; se a família não deve existir, marcar `resolvido=true` sem ação |
| `multiplas_familias` | duas+ famílias com o mesmo `whatsapp_norm` | deduplicar via `mesclar_familias`; depois reprocessar |
| `sem_entrega_no_mes` | família existe, mas não há entrega **pendente** naquele `mes_referencia` (ciclo não criado, ou já estava entregue) | criar a entrega/ciclo do mês (ou `registrar_entrega_avulsa`), depois casar |
| `sem_entrega_disponivel` | todas as entregas pendentes do mês **já têm `pedido_loja`** (vários pedidos, poucas entregas) | criar entrega adicional do mês, ou conferir se é pedido duplicado |

**Resolução manual de uma linha** (não existe RPC de reprocessamento ainda — ver §6):
1. Corrija a causa (cadastre a família / crie a entrega / mescle duplicata).
2. Aplique o efeito na entrega certa: a forma limpa é **re-disparar o e-mail** no
   Make, ou chamar a RPC de novo com o mesmo `payload` (idempotente — não duplica).
3. Feche a linha:
   ```sql
   update entregas_nao_casadas
   set resolvido = true, entrega_id = '<uuid_da_entrega>', resolvido_em = now()
   where id = '<uuid_da_linha>';
   ```

**Atalho que evita a maioria dos `sem_entrega_no_mes`/`familia_nao_encontrada`:**
preencher o `pedido_loja` **na mão** na tela de Entregas (coluna "Nº pedido")
para as entregas conhecidas. Quando o e-mail de "entregue" chegar, a
`registrar_entrega_concluida` casa **pelo número** (passo 1 da lógica) — sem
depender do whatsapp.

---

## 6. Como deixar os fluxos "rodando liso" — checklist

**Estrutural (uma vez):**
1. **Confirmar que TODAS as migrations de 17/jun foram aplicadas** no Supabase vivo:
   `…617120000`, `…617121000`, `…617130000`, `…617140000` (opcional),
   `…617150000`, `…617160000`. É a causa nº 1 de request vermelho.
2. **Conferir a chave do Make**: tem que ser a `anon` (a que recebeu `GRANT EXECUTE`),
   ou rodar `grant execute on function … to <role>` para o role da sua chave restrita.
   **Não usar `service_role`** (que, segundo `ARQUITETURA.md`, vazou e precisa ser rotacionada).
3. **Recarregar o schema cache** do PostgREST após mexer em função: `NOTIFY pgrst, 'reload schema';`
4. **Eliminar sobrecargas antigas** (se houver PGRST203): conferir
   `select oid::regprocedure from pg_proc where proname='registrar_entrega_concluida';`
   — deve haver **uma só** (a de `p_data text`). Dropar a `…date…` se sobrou.

**No Make (robustez):**
5. Garantir que `p_data` sai como `AAAA-MM-DD` (mapear o mês PT-BR) ou vazio — nunca "11 de junho de 2026".
6. Adicionar um **error handler** no módulo HTTP (directive *Resume* / *Ignore*) para
   que um bundle ruim **não pare a fila inteira** de e-mails.
7. Adicionar um **Router pós-HTTP** que, quando `ok=false`, te avisa (e-mail/WhatsApp)
   que caiu uma pendência — em vez de descobrir só olhando a tabela.
8. Cenário diário que conta `entregas_nao_casadas where resolvido=false` e alerta.

**Backfill (dados antigos):**
9. As "entregas antigas não mapeadas" são esperadas. Decidir caso a caso: cadastrar a
   família e casar, ou marcar `resolvido=true` se não fizer mais sentido.

**Gaps de engenharia conhecidos (vale abrir no Linear / virar migration):**
- Não há **RPC de reprocessamento** (`reprocessar_nao_casada(id)`) que releia o
  `payload` e tente casar de novo + feche a linha. Hoje é manual. É o maior atrito.
- `entregas_nao_casadas` não dedupa: o mesmo e-mail reenviado várias vezes empilha
  linhas novas (a idempotência só vale para o caminho de sucesso em `entregas`).
- DDL de `entregas`, `familias`, `ciclos`, `respostas_forms` e dos normalizadores
  ainda **não está versionado** em `supabase/schema/` (ver `ARQUITETURA.md`).

---

## 7. Referências cruzadas
- `supabase/ARQUITETURA.md` — mapa de dados + as duas deduplicações.
- `docs/AUTOMACAO-ENTREGAS.md` — montagem do Make, regex por estágio, datas PT-BR→ISO.
- `docs/CONTINUAR-AQUI.md` — estado do projeto e pendências.
- `supabase/migrations/20260617*` — colunas, RPCs, blindagem de data e grants da automação.
