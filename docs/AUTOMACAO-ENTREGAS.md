# Automação de entregas — Make + Supabase

Como a automação alimenta a base de `entregas` a partir dos e-mails da Calvo.
A **estrutura no Supabase já existe** (migrations `20260617120000` e `20260617121000`).
Este doc é só o lado do **Make** + o parsing dos e-mails.

## Princípio

O Make **não escreve direto nas tabelas**. Ele lê o e-mail, extrai os campos e
**chama uma RPC** do Supabase. A RPC faz o match da família (por whatsapp),
atualiza a entrega de forma idempotente e, se não casar, joga numa fila de
revisão (`entregas_nao_casadas`) — nunca grava errado no escuro.

```
e-mail Calvo ──> Make (trigger + regex) ──> POST /rest/v1/rpc/<funcao> ──> Supabase
```

> **Importante:** os e-mails chegam **encaminhados** (Fwd) pela Eduarda, então o `From`
> é sempre o e-mail dela — NÃO dá pra filtrar por remetente. Filtre sempre por
> **"Has the words"** (texto único do corpo/assunto de cada estágio).

Três estágios + um gancho:

| Estágio | E-mail (como reconhecer) | RPC chamada |
|---|---|---|
| 1. Pedido realizado | corpo contém "está sendo processado" / assunto "está em processamento" | `registrar_pedido_loja` |
| 2. NF emitida | remetente `nfe-calvo@calvo.com.br`, assunto "Nota Fiscal Eletronica" | `registrar_nf` |
| 3. Entregue | corpo contém "foi entregue e concluído" | `registrar_entrega_concluida` |
| 4. Falha (futuro) | a definir | `registrar_falha_entrega` |

> Pedido e Entregue vêm do MESMO template da loja (mudam a frase do corpo e o
> assunto). A NF vem de outro sistema e os dados da família estão **só no PDF**.

## Pré-requisito: chave restrita

No Make, módulo **HTTP > Make a request**. Para cada chamada:

- **URL:** `https://<SEU-PROJETO>.supabase.co/rest/v1/rpc/<nome_da_funcao>`
- **Method:** POST
- **Headers:**
  - `apikey: <CHAVE_RESTRITA>`
  - `Authorization: Bearer <CHAVE_RESTRITA>`
  - `Content-Type: application/json`
- **Body:** JSON (ver cada estágio abaixo)

⚠️ Crie um **role/chave restrito** com permissão de **EXECUTE só nas 5 funções**,
sem acesso direto às tabelas. NÃO use a `service_role` (que, segundo o
`ARQUITETURA.md`, já vazou e precisa ser rotacionada).

A resposta volta em JSON. Trate sempre:
- `{"ok": true, ...}` → gravou.
- `{"ok": true, "duplicado": true}` → e-mail repetido, ignorou (idempotência).
- `{"ok": false, "motivo": "...", "pendencia": true}` → foi pra fila de revisão.
  Vale adicionar um passo no Make que avisa quando `ok=false`.

---

## Estágio 1 — Pedido realizado

**Trigger:** Watch emails (Gmail). Filtro **Has the words** → `esta em processamento`
(não filtre por remetente — chega encaminhado).

**Extrair do corpo** (módulo Text parser / "Match pattern", regex):

- `pedido_loja`  → `#(\d+)`                          (ex.: 209683)
- `whatsapp`     → `whatsapp\s*(\d{10,11})`           (pega "Haiti whatsapp 11..." também)
- `data`         → `\((\d{1,2}) de (\w+) de (\d{4})\)` → montar `AAAA-MM-DD` (ver "Datas")
- `nome`/`endereco`/`cep` (opcional, do bloco "Endereço de entrega" — só pra auditoria)

**Body da chamada** `registrar_pedido_loja`:

```json
{
  "p_whatsapp": "11984677326",
  "p_pedido_loja": "209683",
  "p_data": "2026-06-11",
  "p_nome": "Elisangela Gonsales",
  "p_endereco": "Rua Piquitinga 11",
  "p_cep": "03982-080",
  "p_payload": { "fonte": "email_pedido" }
}
```

---

## Estágio 3 — Entregue

**Trigger/filtro:** Has the words → `foi entregue e concluído` (também chega
encaminhada, não filtre por remetente) (o assunto é parecido com o do pedido, então o que
distingue é a frase do corpo).

**Extrair:** igual ao estágio 1 (`pedido_loja`, `whatsapp`, `data`).

**Body** `registrar_entrega_concluida`:

```json
{
  "p_whatsapp": "11989736285",
  "p_pedido_loja": "209540",
  "p_data": "2026-06-10"
}
```

> Casa primeiro pelo `pedido_loja` (gravado no estágio 1) — determinístico.
> O whatsapp é só fallback. Por isso o estágio 1 é o ponto de ancoragem.

---

## Estágio 2 — NF (o caso difícil)

**Trigger/filtro:** remetente `nfe-calvo@calvo.com.br`, assunto contém
`Nota Fiscal`. O e-mail tem um **PDF anexo (DANFE)** — é nele que estão os
dados da família.

**Passo extra:** extrair o **texto do PDF**. Opções:
- Módulo de PDF no Make (ex.: PDF.co, CloudConvert, Parseur) → devolve o texto.
- OU (recomendado) uma **Supabase Edge Function** que recebe o anexo, extrai o
  texto e chama a `registrar_nf` — mais testável e versionável.

**Do assunto / corpo do e-mail:**
- `nfe_numero` → assunto `Nota Fiscal Eletronica (\d+)`   (ex.: 002632574)
- `nfe_serie` → `série (\d+)`                              (ex.: 2)

**Do texto do PDF (bloco "Informações Complementares"):**
- `nfe_emitida_em` → `Emitida em (\d{2}/\d{2}/\d{4})` ou `(\d{2}/\d{2}/\d{4})` da emissão
- `pedido_fiscal`  → `Pedido:\s*(\d+)`        (ex.: 1810114 — é o "Nosso Pedido")
- `pedido_mae`     → `Ped\.?Mae\s*(\d+)`      (ex.: 1809488)
- `whatsapp`       → `whatsapp\s*(\d{10,11})` (ex.: 11977551642)
- `nome` (opcional) → texto após o número do Ped.Mae (ex.: FLAVIA HORRANA PITANGA)

**Body** `registrar_nf`:

```json
{
  "p_whatsapp": "11977551642",
  "p_nfe_numero": "002632574",
  "p_nfe_serie": "2",
  "p_nfe_emitida_em": "2026-06-12",
  "p_pedido_fiscal": "1810114",
  "p_pedido_mae": "1809488",
  "p_nome": "FLAVIA HORRANA PITANGA",
  "p_payload": { "fonte": "email_nf" }
}
```

> É **best-effort**: se o whatsapp não estiver no PDF ou não casar, vira
> pendência e o fluxo segue. A NF é marco fiscal, não bloqueia entrega.

---

## Datas (PT-BR → ISO)

A loja escreve "11 de junho de 2026". A RPC espera `2026-06-11`.
No Make, mapear o mês (janeiro=01 ... dezembro=12) e montar `AAAA-MM-DD`.
Na NF a data já vem `12/06/2026` → virar `2026-06-12`.

## Monitorar pendências

O que não casou fica em `entregas_nao_casadas`. Olhar de tempos em tempos:

```sql
select recebido_em, estagio, motivo, whatsapp, pedido_loja, nfe_numero
from entregas_nao_casadas
where resolvido = false
order by recebido_em desc;
```

Sugestão: um cenário Make diário que conta as pendências e te avisa
(e-mail/WhatsApp) quando houver alguma.

## Ordem de montagem sugerida

1. Estágio 1 (pedido) — é o mais simples e o que ancora o resto. Testar com
   2-3 e-mails reais antes de ligar.
2. Estágio 3 (entregue) — quase igual ao 1.
3. Estágio 2 (NF) — por último, com o parser de PDF.
4. Estágio 4 (falha) — quando você tiver o e-mail/critério de falha.
