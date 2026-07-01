// lib/ciclo.ts
// Janela do ciclo "fixada no banco".
//
// Regra de negócio (alinhada com a Marília):
//   - O ciclo de entregas é MENSAL, mas cada ciclo dura 3 meses (3 cestas).
//   - O começo foi truncado (o 1º ciclo entrou no meio do caminho); deve se
//     normalizar nos próximos. Por isso a janela é ancorada num mês e roda de
//     3 em 3 a partir dele — em vez de "3 meses a partir de hoje" no cliente.
//
// Âncora:
//   - Por padrão é o MENOR data_inicio dos ciclos do banco (passado em runtime).
//     Assim a janela "vem do banco" e se realinha sozinha conforme novos ciclos
//     são confirmados.
//   - Para TRAVAR um mês fixo, basta setar CICLO_ANCORA abaixo (ex.: '2026-05-01').
//     Quando preenchido, ele tem prioridade sobre o que vier do banco.

export const CICLO_ANCORA: string | null = null // ex.: '2026-05-01' para fixar

export interface JanelaCiclo {
  inicio: Date // 1º dia do bloco de 3 meses
  fim: Date // último dia do bloco
  mesAtual: number // 1..3 — em que mês do ciclo estamos
  bloco: number // índice do ciclo desde a âncora (0, 1, 2…)
  rotulo: string // ex.: "mai – jul 2026"
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Parse seguro de 'AAAA-MM-DD' como data LOCAL (evita o shift de fuso do new Date(str)).
function parseLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, (m ?? 1) - 1, d ?? 1)
}

const primeiroDiaMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

function diffMeses(de: Date, ate: Date) {
  return (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
}

function rotular(inicio: Date, fim: Date): string {
  const mi = MESES[inicio.getMonth()]
  const mf = MESES[fim.getMonth()]
  const ai = inicio.getFullYear()
  const af = fim.getFullYear()
  return ai === af ? `${mi} – ${mf} ${af}` : `${mi}/${ai} – ${mf}/${af}`
}

/**
 * Calcula a janela do ciclo de 3 meses vigente.
 * @param ancoraBanco  menor data_inicio dos ciclos (do banco), ou null.
 * @param hoje         data de referência (default: agora).
 * @returns a janela vigente, ou null se não há âncora (nenhum ciclo ainda).
 */
export function janelaCicloAtual(ancoraBanco: string | null, hoje: Date = new Date()): JanelaCiclo | null {
  const ancoraStr = CICLO_ANCORA ?? ancoraBanco
  if (!ancoraStr) return null

  const ancora = primeiroDiaMes(parseLocal(ancoraStr))
  const hojeMes = primeiroDiaMes(hoje)

  // Quantos meses se passaram desde a âncora (nunca negativo: antes da âncora = bloco 0).
  const meses = Math.max(0, diffMeses(ancora, hojeMes))
  const bloco = Math.floor(meses / 3)

  const inicio = new Date(ancora.getFullYear(), ancora.getMonth() + bloco * 3, 1)
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 3, 0) // dia 0 do 4º mês = último do 3º
  const mesAtual = Math.min(3, (meses % 3) + 1)

  return { inicio, fim, mesAtual, bloco, rotulo: rotular(inicio, fim) }
}

// ─────────────────────────────────────────────────────────────────────────
// Janela do CICLO REAL (a partir das linhas de `ciclos` no banco).
//
// Por que existe: janelaCicloAtual() usa uma GRADE fixa de 3 meses ancorada no
// ciclo mais antigo do banco. Quando os ciclos começam em meses arbitrários e
// se sobrepõem, essa grade descasa do ciclo de verdade (ex.: ciclo real
// mai–jul aparecendo como jun–ago). Aqui a janela vem do próprio ciclo:
// data_inicio → data_fim reais, com o total de meses que ele de fato cobre.
// ─────────────────────────────────────────────────────────────────────────
export interface JanelaCicloReal {
  inicio: Date // 1º dia do mês de data_inicio
  fim: Date // data_fim do ciclo
  mesAtual: number // 1..totalMeses — em que mês do ciclo estamos hoje
  totalMeses: number // quantos meses o ciclo cobre (não é fixo em 3)
  rotulo: string // ex.: "mai – jul 2026"
}

/**
 * Calcula a janela a partir do ciclo real (data_inicio/data_fim do banco).
 * @param dataInicio 'AAAA-MM-DD' — data_inicio do lote de ciclo ativo.
 * @param dataFim    'AAAA-MM-DD' — data_fim do mesmo lote.
 * @param hoje       data de referência (default: agora).
 */
export function janelaCicloReal(
  dataInicio: string,
  dataFim: string,
  hoje: Date = new Date(),
): JanelaCicloReal {
  const inicio = primeiroDiaMes(parseLocal(dataInicio))
  const fim = parseLocal(dataFim)
  const totalMeses = diffMeses(inicio, primeiroDiaMes(fim)) + 1
  const mesBruto = diffMeses(inicio, primeiroDiaMes(hoje)) + 1
  const mesAtual = Math.min(totalMeses, Math.max(1, mesBruto))
  return { inicio, fim, mesAtual, totalMeses, rotulo: rotular(inicio, fim) }
}

// Os 3 primeiros-dias-de-mês ('AAAA-MM-01') que compõem a janela — úteis para
// contar entregas dentro do ciclo no banco.
export function mesesDaJanela(janela: JanelaCiclo): string[] {
  return [0, 1, 2].map((i) => {
    const d = new Date(janela.inicio.getFullYear(), janela.inicio.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
}

export function formatarDataBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
