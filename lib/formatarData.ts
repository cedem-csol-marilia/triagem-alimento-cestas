// lib/formatarData.ts
// Exibe datas ISO (yyyy-mm-dd ou timestamp completo) como dd/mm/yyyy.
// Trabalha direto na string para evitar o deslocamento de fuso do
// `new Date('yyyy-mm-dd')` (interpretado como UTC, vira o dia anterior no Brasil).
export function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}
