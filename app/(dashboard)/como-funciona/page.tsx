'use client'
// app/(dashboard)/como-funciona/page.tsx

export default function ComoFuncionaPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Como funciona</h1>
        <p className="page-subtitle">Arquitetura do sistema, regras e fluxo de decisões</p>
      </div>

      <div className="page-content" style={{ maxWidth: 800 }}>

        {/* Fluxo geral */}
        <Secao titulo="Fluxo completo" emoji="🔄">
          <p style={estiloTexto}>
            O sistema funciona em ciclos de 3 meses. A cada ciclo, até 10 famílias são selecionadas para receber cestas básicas. O fluxo começa quando uma família preenche o Google Forms e termina quando a última entrega do ciclo é confirmada.
          </p>
          <FluxoVisual />
        </Secao>

        {/* Tabelas do banco */}
        <Secao titulo="Como os dados são organizados" emoji="🗄️">
          <p style={estiloTexto}>O sistema tem 5 tabelas principais, cada uma com um papel específico:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {[
              { nome: 'respostas_forms', icone: '📋', desc: 'Arquivo histórico de tudo que veio do Google Forms. Imutável — nunca apagamos. Se precisar rever uma resposta original, está aqui.' },
              { nome: 'familias', icone: '🏠', desc: 'Um cadastro por família real, após triagem. Contém o score de prioridade, status (fila, ativa, concluída) e todos os dados consolidados.' },
              { nome: 'duplicatas_detectadas', icone: '🔍', desc: 'Registro de cada decisão de triagem. Quem foi mesclado, quem ficou, quando, por quê. Auditável e permanente.' },
              { nome: 'ciclos', icone: '📅', desc: 'Cada período de 3 meses que uma família recebeu. Uma família pode ter vários ciclos ao longo do tempo.' },
              { nome: 'entregas', icone: '🚚', desc: 'Controle mês a mês. Pedido feito? Entregue? Data? É essa tabela que você edita na página de Entregas.' },
            ].map(t => (
              <div key={t.nome} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'white', border: '1px solid var(--terra-200)', borderRadius: 8 }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{t.icone}</span>
                <div>
                  <code style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--terra-800)', background: 'var(--terra-100)', padding: '1px 6px', borderRadius: 4 }}>{t.nome}</code>
                  <p style={{ fontSize: '0.78rem', color: 'var(--terra-600)', marginTop: 4, lineHeight: 1.5 }}>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Secao>

        {/* Triagem de duplicatas */}
        <Secao titulo="Como tratamos duplicatas" emoji="👥">
          <p style={estiloTexto}>
            Quando uma nova resposta chega, o sistema compara automaticamente com todas as famílias já cadastradas usando 4 critérios:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
            {[
              { criterio: 'WhatsApp idêntico', peso: '50 pts', desc: 'Mesmo número = mesma pessoa. Sinal mais forte.' },
              { criterio: 'CEP + endereço com número', peso: '30 pts', desc: 'Mesma rua, mesmo número, mesmo CEP = mesma casa.' },
              { criterio: 'Ponto de referência', peso: '10 pts', desc: '"Lojinha da Jéssica" em duas respostas é forte evidência.' },
              { criterio: 'Sobrenome incomum', peso: '10 pts', desc: 'Elchin, Giraudon — sobrenomes raros que coincidem.' },
            ].map(c => (
              <div key={c.criterio} style={{ padding: '10px 12px', background: 'var(--terra-50)', border: '1px solid var(--terra-200)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--terra-800)' }}>{c.criterio}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ocre-600)', background: 'var(--ocre-200)', padding: '1px 7px', borderRadius: 20 }}>{c.peso}</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--terra-500)', lineHeight: 1.4 }}>{c.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ ...estiloTexto, marginTop: 12 }}>
            <strong>Sobrenomes comuns</strong> (Silva, Santos, Souza, Oliveira e ~60 outros) não contam pontos — só sobrenomes raros. Se a similaridade for ≥ 40%, vai para a triagem para você decidir. Nunca é automático.
          </p>
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#FDF6D3', border: '1px solid var(--ocre-200)', borderRadius: 8 }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--ocre-600)', lineHeight: 1.5 }}>
              <strong>Importante:</strong> endereço sem número (ex: "Rua Jacaraípe" sem nada) vai para <strong>Cadastro Incompleto</strong> — você decide se contacta a família pelo WhatsApp para pedir o complemento.
            </p>
          </div>
        </Secao>

        {/* Decisões de triagem */}
        <Secao titulo="Decisões de triagem" emoji="🔍">
          {[
            { decisao: 'Mesma casa', cor: 'var(--musgo-700)', bg: 'var(--musgo-100)', desc: 'Duas pessoas do mesmo domicílio responderam. Os registros são mesclados em uma família. Score preservado, sem penalidade. A família com mais dados fica como principal.' },
            { decisao: 'Casas separadas', cor: 'var(--terra-700)', bg: 'var(--terra-100)', desc: 'Coincidência — são famílias distintas na mesma rua ou com nome parecido. Dois cadastros independentes, cada um com seu score na fila.' },
            { decisao: 'Recadastro', cor: 'var(--ocre-600)', bg: '#FDF6D3', desc: 'A mesma pessoa ou família já está no sistema. A nova resposta é descartada sem penalizar o cadastro existente. O campo de observação registra o motivo.' },
            { decisao: 'Ignorar', cor: 'var(--mogno-500)', bg: 'var(--mogno-100)', desc: 'Dado inválido, teste ou spam. Removido sem afetar nenhum cadastro.' },
          ].map(d => (
            <div key={d.decisao} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'white', border: '1px solid var(--terra-200)', borderRadius: 8, marginTop: 8 }}>
              <span style={{ background: d.bg, color: d.cor, fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: 2 }}>{d.decisao}</span>
              <p style={{ fontSize: '0.78rem', color: 'var(--terra-600)', lineHeight: 1.5 }}>{d.desc}</p>
            </div>
          ))}
        </Secao>

        {/* Score de prioridade */}
        <Secao titulo="Score de priorização da fila" emoji="🏆">
          <p style={estiloTexto}>
            Cada família na fila tem um score calculado automaticamente. Quanto maior o score, mais alta a posição na fila. Os pesos podem ser ajustados na página de <strong>Configurações</strong>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {[
              { criterio: 'Renda per capita < R$300', pts: 35 },
              { criterio: 'Renda per capita R$300–600', pts: 25 },
              { criterio: 'Renda per capita R$600–1000', pts: 15 },
              { criterio: '4 ou mais crianças', pts: 28 },
              { criterio: '3 crianças', pts: 22 },
              { criterio: '2 crianças', pts: 15 },
              { criterio: '1 criança', pts: 8 },
              { criterio: '2 ou mais idosos', pts: 18 },
              { criterio: '1 idoso', pts: 12 },
              { criterio: 'Sem auxílio do governo', pts: 10 },
              { criterio: 'Família monoparental', pts: 12 },
              { criterio: 'Pessoa com deficiência', pts: 12 },
              { criterio: '5 ou mais pessoas', pts: 5 },
              { criterio: 'Não pode buscar no CEDEM', pts: 3 },
            ].map(s => (
              <div key={s.criterio} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'white', border: '1px solid var(--terra-100)', borderRadius: 6 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--terra-700)' }}>{s.criterio}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--terra-800)', minWidth: 40, textAlign: 'right' }}>+{s.pts}</span>
              </div>
            ))}
          </div>
        </Secao>

        {/* Ciclos e espera */}
        <Secao titulo="Ciclos e tempo de espera" emoji="📅">
          <p style={estiloTexto}>
            Cada família recebe por <strong>3 meses consecutivos</strong>. Após o encerramento do ciclo, ela entra em período de espera de <strong>6 meses</strong> antes de poder voltar à fila.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { fase: 'Na fila', cor: 'var(--terra-400)', desc: 'Aguardando ser selecionada. Score calculado. Pode ser escolhida a qualquer momento.' },
              { fase: 'Confirmada', cor: 'var(--ocre-400)', desc: 'Selecionada para o próximo ciclo. Não pode ser removida — decisão imutável.' },
              { fase: 'Recebendo', cor: 'var(--musgo-500)', desc: 'Ciclo em andamento. Entregas acontecendo mês a mês.' },
              { fase: 'Concluída', cor: 'var(--terra-600)', desc: 'Ciclo encerrado. Em período de espera de 6 meses para voltar à fila.' },
            ].map(f => (
              <div key={f.fase} style={{ flex: 1, minWidth: 160, padding: '10px 12px', background: 'white', border: `2px solid ${f.cor}`, borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: f.cor, marginBottom: 4 }}>{f.fase}</div>
                <p style={{ fontSize: '0.72rem', color: 'var(--terra-600)', lineHeight: 1.4 }}>{f.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--musgo-100)', border: '1px solid var(--musgo-300)', borderRadius: 8 }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--musgo-700)', lineHeight: 1.5 }}>
              <strong>Regra de imutabilidade:</strong> uma vez que o ciclo é confirmado, as famílias selecionadas não podem ser alteradas — nem por novas respostas de maior prioridade. Isso garante previsibilidade e justiça no processo.
            </p>
          </div>
        </Secao>

        {/* Segurança */}
        <Secao titulo="Segurança e acesso" emoji="🔒">
          <p style={estiloTexto}>
            O sistema usa autenticação por email e senha. Apenas usuárias autorizadas têm acesso. O banco de dados tem Row Level Security ativo — mesmo com a chave de API, ninguém sem login consegue ler ou escrever dados.
          </p>
          <p style={{ ...estiloTexto, marginTop: 8 }}>
            O Google Forms envia dados via Apps Script usando uma chave de serviço do Supabase. Essa chave só tem permissão de inserir respostas — não lê dados existentes, não edita famílias.
          </p>
        </Secao>

      </div>
    </>
  )
}

// ── Componentes auxiliares ─────────────────────────────────

function Secao({ titulo, emoji, children }: { titulo: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-8)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 500, color: 'var(--terra-900)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{emoji}</span> {titulo}
      </h2>
      {children}
    </div>
  )
}

function FluxoVisual() {
  const passos = [
    { icone: '📋', label: 'Google Forms', sub: 'família preenche' },
    { icone: '⚙️', label: 'Apps Script', sub: 'envia automaticamente' },
    { icone: '🗄️', label: 'Supabase', sub: 'salva e analisa' },
    { icone: '🔍', label: 'Triagem', sub: 'você decide' },
    { icone: '🏆', label: 'Fila', sub: 'score calculado' },
    { icone: '✅', label: 'Ciclo', sub: 'confirmação final' },
    { icone: '🚚', label: 'Entrega', sub: 'mês a mês' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', marginTop: 12, background: 'var(--terra-50)', borderRadius: 8, padding: '12px', border: '1px solid var(--terra-200)' }}>
      {passos.map((p, i) => (
        <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{p.icone}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--terra-800)' }}>{p.label}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--terra-400)' }}>{p.sub}</div>
          </div>
          {i < passos.length - 1 && (
            <div style={{ color: 'var(--terra-300)', fontSize: '1rem', padding: '0 4px' }}>›</div>
          )}
        </div>
      ))}
    </div>
  )
}

const estiloTexto: React.CSSProperties = {
  fontSize: '0.82rem',
  color: 'var(--terra-700)',
  lineHeight: 1.7,
}