# Roadmap de Melhorias — Triagem de Cestas CEDEM

Mapeamento feito após estabilizar a base (build, duplicatas, score configurável,
auth/convite, remoção de ciclo). Objetivo: priorizar o que mais melhora o uso
real, com esforço estimado.

**Legenda** — Prioridade: P0 (faça primeiro) · P1 (em seguida) · P2 (quando der).
Esforço: P (poucas horas) · M (1–2 dias) · G (vários dias).

---

## Estado atual (baseline)

Funcionando hoje: ingestão do Forms → Supabase (Apps Script), normalização e
dedup de respostas novas, triagem (respostas novas + duplicatas entre cadastros),
score de priorização configurável, score de duplicata configurável, fila,
ciclos com entregas mês a mês, remoção do ciclo antes da 1ª entrega, login/reset/
convite por e-mail. Lógica versionada em `supabase/`.

Limitação-raiz conhecida: **endereço entra como texto livre no Form**, o que
degrada a deduplicação por endereço (visto no caso Elchin). Vários itens abaixo
giram em torno disso.

---

## 1. Triagem & Duplicatas — "difíceis de ver"  · P0

**Problema:** os cards de duplicata são densos (duas colunas lado a lado), e com
o corte em 30 aparecem muitos pares. Fica difícil bater o olho e decidir. Pares
do mesmo lar aparecem repetidos (Elchin × 3) em vez de agrupados.

**Propostas (da mais barata à mais rica):**
- **Destacar o que casa vs o que difere** (P): pintar de verde os campos que
  batem (mesmo CEP, mesmo número, sobrenome) e cinza os que diferem. O olho vai
  direto no motivo.
- **Faixa de confiança visível** (P): mostrar "muito provável / provável /
  possível" com cor, além do %. Hoje só tem a barrinha.
- **Agrupar por lar** (M): quando A×B e A×C estão pendentes, mostrar como **um
  grupo** ("3 cadastros, mesmo endereço") em vez de 3 cards soltos. Decide o
  cluster de uma vez.
- **Ordenar por confiança e recolher os fracos** (P): mais provável no topo;
  pares de baixa confiança colapsados.
- **Ação em lote "São separadas"** (M): pra varrer rápido os falsos positivos
  (mesmo prédio, famílias distintas).

**Impacto:** alto (é a tela de decisão diária). **Esforço:** P→M por item.

---

## 2. Ficha da Família (clicar e abrir)  · P0

**Problema:** em Famílias e na Fila as linhas são "mortas" — não dá pra ver o
contexto completo sem editar. Falta uma visão 360º.

**Proposta:** um painel lateral (drawer) ou modal **"Ficha da família"**,
reutilizável, que abre ao clicar na linha, mostrando:
- Dados completos + status.
- **Composição do score** (por que ela tem X pontos — quais critérios somaram).
- **Histórico de ciclos e entregas** (quando recebeu, quantas vezes).
- **Possíveis duplicatas** ligadas a ela.
- Resposta(s) original(is) do Forms.
- Observações.

O mesmo componente serve em Famílias, Fila e até na Triagem (pra dar contexto
antes de decidir). 

**Impacto:** alto (transparência e confiança nas decisões). **Esforço:** M
(um componente reaproveitável + as queries de histórico já existem em parte).

---

## 3. Formulário (qualidade na origem)  · P1 — destrava o resto

**Problema:** endereço, telefone e composição entram "sujos", o que limita a
deduplicação e a normalização. É a causa-raiz de itens como o caso Elchin.

**Mudanças no Google Form:**
- **Endereço em campos separados:** CEP, Rua, Número, Complemento (em vez de um
  campo único de texto livre). Idealmente CEP primeiro, com orientação.
- **Campos obrigatórios:** nome, WhatsApp, CEP e número. Sem eles, vira
  "cadastro incompleto" de propósito.
- **WhatsApp com exemplo/máscara:** "(11) 91234-5678" — reduz variação.
- **Composição com definições claras:** "crianças (menores de 12)", "idosos
  (60+)", "total de pessoas na casa" — para o sinal de composição funcionar.
- **Pergunta de confirmação/consentimento** ao final.

**No sistema (depois do Form mudar):**
- Ajustar o Apps Script pra mapear os novos campos.
- Melhorar `normalizar_endereco` (já que vem estruturado) e **persistir** os
  `*_norm` (migration opcional já criada).
- Com endereço limpo, dá pra **subir o gate** de similaridade de volta (0.7 → 0.85+)
  e ganhar precisão, reduzindo falsos positivos na triagem.

**Impacto:** alto e estrutural (melhora dedup, score e relatórios de uma vez).
**Esforço:** P no Form, M no encadeamento (Apps Script + normalização).

---

## 4. Qualidade de dados & operação  · P1/P2

- **Fluxo de Cadastro Incompleto** (P1, M): botão "pedir complemento via WhatsApp"
  com mensagem pronta; marcar status quando respondido.
- **Re-pontuar duplicatas pendentes** ao mudar pesos (P2, P): hoje precisa
  apagar pendentes + rodar detecção. Dá pra ter um botão "recalcular duplicatas".
- **Relatórios** (P2, M): quantas cestas/mês, por bairro, tempo médio na fila,
  taxa de duplicata — ajuda a prestar contas.

---

## 5. Higiene técnica (cross-cutting)  · P2

- **Versionar as funções que faltam** (P): `buscar_candidatas_dedup`,
  `normalizar_*`, `calcular_score`, `confirmar_ciclo`, `recalcular_scores_fila`
  → salvar em `supabase/schema/`. Hoje só parte está versionada.
- **Rotacionar a `service_role`** (P, pendente): com cuidado (atualizar app +
  Apps Script juntos).
- **`.gitattributes`** (P): fixar fim de linha (LF) pra parar o ruído de CRLF
  nos commits.
- **Mostrar erros reais na tela** (P): vários pontos engolem o erro do Supabase
  ("Erro ao salvar"); logar a mensagem real ajuda a debugar (foi o que nos
  travou no recálculo e no convite).
- **Proteção de rota no middleware** (P2): hoje a proteção é client-side; um
  middleware adequado deixa mais robusto (token refresh).

---

## Sequência sugerida

1. **Ficha da Família** (item 2) — alto valor, reaproveitável, e já dá contexto
   pra triagem.
2. **Clareza da Triagem** (item 1) — destacar diferenças + agrupar por lar.
3. **Formulário** (item 3) — quando você puder mexer no Form; destrava dedup/score.
4. Operação e higiene técnica conforme a necessidade aparecer.

> Observação: itens 1 e 2 são de interface (no app, deploy normal). O item 3
> começa no Google Form (fora do código) e depois encadeia no Apps Script + banco.
