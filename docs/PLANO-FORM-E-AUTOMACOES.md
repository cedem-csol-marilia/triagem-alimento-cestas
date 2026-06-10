# Plano — Novo Form + Automações

Decisões: renda em **faixas fixas**, endereço em **4 campos**, **Apps Script**
segue na ingestão, **Make** para notificações/lembretes. 1ª automação:
**cadastro incompleto → WhatsApp**.

Regra de ouro: o Form muda → tudo abaixo precisa acompanhar **no mesmo lote**.
Testar com 2–3 respostas antes de valer.

---

## 1. Novo Google Form (perguntas e opções)

Use opções fixas (escolha única) onde indicado — nunca texto livre.

1. **Nome do responsável** — texto curto (obrigatório)
2. **WhatsApp** — texto curto, com validação de formato e exemplo "(11) 91234-5678" (obrigatório)
3. **CEP** — texto curto, validação de 8 dígitos (obrigatório)
4. **Rua / Logradouro** — texto curto (obrigatório)
5. **Número** — texto curto (obrigatório)
6. **Complemento** — texto curto (opcional)
7. **Bairro** — texto curto
8. **Cidade** — texto curto
9. **Ponto de referência** — texto curto
10. **Renda familiar total** — escolha única (obrigatório):
    - Sem renda
    - Até R$ 500
    - R$ 501 a R$ 1.000
    - R$ 1.001 a R$ 2.000
    - Acima de R$ 2.000
11. **Total de pessoas na casa** — número (obrigatório)
12. **Quantas crianças (menores de 12 anos)** — número
13. **Quantos idosos (60 anos ou mais)** — número
14. **Recebe algum auxílio do governo?** — escolha única: Sim / Não
15. **Qual auxílio?** — escolha única: Bolsa Família / BPC / Outro / Não recebo
16. **Tem pessoa com deficiência na casa?** — Sim / Não
17. **Descrição da deficiência** — texto (opcional)
18. **Consegue buscar a cesta no CEDEM?** — Sim / Não
19. **Frequenta o CEDEM?** — Sim / Não
20. **Aceita o termo de responsabilidade** — Sim / Não (obrigatório)

> Opções fixas (10, 14, 15) acabam com o problema de "Não/Nao/N tenho".
> Endereço separado (3,4,5,6) resolve a deduplicação na raiz.

---

## 2. Mudanças encadeadas (fazer junto, na ordem)

**a) Apps Script** — duas mudanças:
- **Mapear por NOME de coluna, não por número.** Hoje `COLUNAS` usa índices
  fixos; se o Form reordenar, quebra silencioso. Ler pelo cabeçalho deixa à
  prova de reordenação.
- Mandar os campos novos pra `importar_resposta_forms` (cep, rua, número,
  complemento, faixa de renda, recebe_auxílio, qual_auxílio...).

**b) Supabase — tabelas:** adicionar em `respostas_forms` e `familias` as
colunas que faltarem: `numero`, `complemento` (rua pode ir em `endereco`).
Manter `endereco` como "Rua, Número" montado.

**c) Supabase — funções:**
- `importar_resposta_forms`: aceitar os novos parâmetros; montar `endereco`
  limpo e os `*_norm`.
- `calcular_score`: como a renda vem padronizada, o mapeamento fica exato
  (sem fuzzy). Manter a estimativa por faixa ÷ nº de pessoas (per capita).
  Auxílio vira simples: `recebe_auxilio = 'Não'` → +10.
- `calcular_similaridade_familias`: com endereço limpo (CEP + número exatos),
  dá pra casar por **CEP + número idêntico** e **subir o gate** (0.7 → 0.85+),
  ganhando precisão e reduzindo falsos positivos.

**d) App:** mostrar os campos novos na Ficha/edição.

> Sequência segura: editar o Form → ajustar Apps Script (por nome) → migrations
> no Supabase (colunas + funções) → testar 2–3 respostas → recadastrar/recalcular.

---

## 3. Make — automações

Papel do Make: **notificações e lembretes** (ingestão segue no Apps Script).
Pré-requisito pra WhatsApp: um provedor (Z-API, Twilio ou 360dialog) — o Make
sozinho não envia WhatsApp.

### 3.1 Primeira: Cadastro incompleto → WhatsApp
- **Gatilho:** agendado (ex.: 1x/dia) — Make lê do Supabase os cadastros da
  view `cadastro_incompleto` que ainda não foram contatados.
- **Ação:** envia WhatsApp pra família pedindo o dado que falta (ex.: número do
  endereço), via provedor.
- **Controle anti-spam:** gravar `contatado_em` no cadastro pra não reenviar.
  (Precisa de uma coluna nova + um endpoint/RPC pra marcar.)

### 3.2 Próximas (mesma estrutura)
- **Ciclo confirmado → WhatsApp** pras famílias com data/local de retirada.
- **Triagem pendente → aviso** pro time (e-mail/Slack/WhatsApp).
- **Lembrete mensal** das entregas pendentes do mês.
- **Resumo semanal** pro coordenador.

### 3.3 Como o Make conversa com o Supabase
- Leitura: módulo HTTP do Make → REST do Supabase (`/rest/v1/...`) com a chave.
  ⚠️ Usar uma chave **restrita** (nunca a service_role exposta), de preferência
  um endpoint/RPC só-leitura pro que o Make precisa.
- Escrita (marcar contatado): RPC dedicada.

---

## Ordem de execução sugerida

1. Você edita o **Form** conforme a seção 1.
2. Avise — eu ajusto **Apps Script (por nome) + migrations do Supabase** num lote.
3. Testar com respostas de teste; recalcular scores.
4. Só então montar o **Make** (cadastro incompleto → WhatsApp), depois as demais.
