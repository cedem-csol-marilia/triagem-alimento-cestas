// lib/exportarPedido.ts
// Gera e baixa o CSV do pedido para o site da loja.
//
// A ordem das colunas espelha a etapa de Entrega do site. A coluna
// "Notas do pedido" já vem montada (whatsapp só-dígitos + ponto de
// referência): cole EXATAMENTE essa célula no campo "Notas no pedido
// (opcional)" do site — assim o whatsapp sempre chega na Observação
// do e-mail e a automação casa por ele.
//
// Usado por: Famílias (exportar confirmadas) e Entregas (exportar
// pendentes sem pedido do mês).

export interface FamiliaPedido {
  nome_responsavel:      string
  cep:                   string | null
  endereco:              string | null
  bairro:                string | null
  ponto_referencia:      string | null
  whatsapp:              string | null
  num_total_pessoas_raw?: string | null
  num_total_pessoas:     number | null
  num_criancas:          number
  num_idosos:            number
  pode_buscar_cedem:     boolean
}

export function baixarCsvPedido(familias: FamiliaPedido[], nomeArquivo: string) {
  const cabecalho = ['Nome', 'CEP', 'Endereço', 'Bairro', 'Cidade', 'Ponto de referência', 'WhatsApp', 'Notas do pedido (colar exatamente no site)', 'Total pessoas', 'Crianças', 'Idosos', 'Pode buscar CEDEM']
  const linhas = [
    cabecalho.join(';'),
    ...familias.map(f => {
      const wpp = (f.whatsapp ?? '').replace(/[^0-9]/g, '')
      const notas = [wpp, f.ponto_referencia ?? ''].filter(Boolean).join(' · ')
      return [
        f.nome_responsavel,
        f.cep ?? '',
        f.endereco ?? '',
        f.bairro ?? '',
        'São Paulo',
        f.ponto_referencia ?? '',
        f.whatsapp ?? '',
        notas,
        f.num_total_pessoas_raw ?? f.num_total_pessoas ?? '',
        f.num_criancas,
        f.num_idosos,
        f.pode_buscar_cedem ? 'Sim' : 'Não',
      ].join(';')
    })
  ]
  const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
