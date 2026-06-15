// ============================================================
// CEDEM — Ingestão Forms → Supabase (lê por NOME de coluna)
// Cole no Apps Script da planilha de respostas (Extensões → Apps Script).
// Robusto a reordenação de colunas: acha cada campo pelo título.
// ============================================================
const CONFIG = {
  SUPABASE_URL: 'https://cxzyujfksierpujwzjad.supabase.co',
  SUPABASE_SERVICE_KEY: 'COLE_AQUI_A_SERVICE_KEY', // Settings → API → service_role
  NOME_ABA: 'Página1',          // confirme o nome exato da aba
  LINHA_INICIO_DADOS: 2,
};

// Normaliza título: minúsculo, sem acento, espaços colapsados
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Acha o índice (0-based) da coluna cujo título bate
function acharCol(headers, opts) {
  if (opts.igual) {
    for (var i = 0; i < headers.length; i++) {
      if (norm(headers[i]) === norm(opts.igual)) return i;
    }
  }
  if (opts.contem) {
    for (var j = 0; j < headers.length; j++) {
      var h = norm(headers[j]);
      for (var k = 0; k < opts.contem.length; k++) {
        if (h.indexOf(norm(opts.contem[k])) >= 0) return j;
      }
    }
  }
  return -1;
}

// Monta o mapa campo -> índice a partir da linha de cabeçalho
function mapearCampos(headers) {
  return {
    timestamp:    acharCol(headers, { contem: ['carimbo de data'] }),
    nome:         acharCol(headers, { contem: ['nome completo'] }),
    reside_sp:    acharCol(headers, { contem: ['reside'] }),
    aceita_resp:  acharCol(headers, { contem: ['responsabilidade'] }),
    endereco:     acharCol(headers, { contem: ['qual seu endereco'] }),
    numero:       acharCol(headers, { contem: ['numero da residencia'] }),
    complemento:  acharCol(headers, { contem: ['complemento'] }),
    bairro:       acharCol(headers, { contem: ['bairro'] }),
    ponto_ref:    acharCol(headers, { contem: ['ponto de referencia', 'referencia'] }),
    cidade:       acharCol(headers, { igual: 'cidade' }),
    cep:          acharCol(headers, { contem: ['cep'] }),
    whatsapp:     acharCol(headers, { contem: ['whatsapp'] }),
    num_pessoas:  acharCol(headers, { contem: ['quantas pessoas'] }),
    num_criancas: acharCol(headers, { contem: ['quantas criancas'] }),
    num_idosos:   acharCol(headers, { contem: ['quantos idosos'] }),
    renda:        acharCol(headers, { contem: ['renda total'] }),
    tem_pcd:      acharCol(headers, { contem: ['alguma pessoa com defici'] }),
    pcd_desc:     acharCol(headers, { contem: ['especifique qual'] }),
    aux_inst:     acharCol(headers, { contem: ['instituicao social'] }),
    aux_gov:      acharCol(headers, { contem: ['renda do governo'] }),
    interesse:    acharCol(headers, { contem: ['empregabilidade'] }),
    pode_buscar:  acharCol(headers, { contem: ['buscar uma cesta no cedem', 'possibilidade de ir buscar'] }),
    frequenta:    acharCol(headers, { contem: ['frequenta o cedem'] }),
  };
}

function getHeaders() {
  return {
    'Content-Type':  'application/json',
    'apikey':        CONFIG.SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_SERVICE_KEY,
    'Prefer':        'return=representation',
  };
}

function obterAba() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NOME_ABA);
  if (!sheet) console.error('Aba não encontrada: "' + CONFIG.NOME_ABA + '"');
  return sheet;
}

function onNovaResposta(e) {
  var sheet = obterAba();
  if (!sheet) return;
  var ultimaCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];
  var mapa = mapearCampos(headers);
  var ultimaLinha = sheet.getLastRow();
  for (var linha = CONFIG.LINHA_INICIO_DADOS; linha <= ultimaLinha; linha++) {
    var dados = sheet.getRange(linha, 1, 1, ultimaCol).getValues()[0];
    var ts = formatarTimestamp(dados[mapa.timestamp]);
    if (!ts) continue;
    if (jaExisteNoSupabase(ts)) continue;
    enviarLinha(dados, mapa, linha);
  }
}

function enviarTodas() {
  var sheet = obterAba();
  if (!sheet) return;
  var ultimaCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];
  var mapa = mapearCampos(headers);
  var ultimaLinha = sheet.getLastRow();
  var enviadas = 0, puladas = 0, erros = 0;
  for (var linha = CONFIG.LINHA_INICIO_DADOS; linha <= ultimaLinha; linha++) {
    var dados = sheet.getRange(linha, 1, 1, ultimaCol).getValues()[0];
    var ts = formatarTimestamp(dados[mapa.timestamp]);
    if (!ts) { puladas++; continue; }
    if (jaExisteNoSupabase(ts)) { puladas++; continue; }
    if (enviarLinha(dados, mapa, linha)) enviadas++; else erros++;
    Utilities.sleep(150);
  }
  console.log('✅ Enviadas: ' + enviadas + ' | Puladas: ' + puladas + ' | Erros: ' + erros);
}

function jaExisteNoSupabase(timestampISO) {
  if (!timestampISO) return false;
  try {
    var r = UrlFetchApp.fetch(
      CONFIG.SUPABASE_URL + '/rest/v1/respostas_forms?timestamp_forms=eq.' +
      encodeURIComponent(timestampISO) + '&select=id&limit=1',
      { method: 'GET', headers: getHeaders(), muteHttpExceptions: true });
    if (r.getResponseCode() === 200) return JSON.parse(r.getContentText()).length > 0;
    return false;
  } catch (err) { console.error(err.message); return false; }
}

function enviarLinha(dados, mapa, linha) {
  function v(campo) { var i = mapa[campo]; return (i == null || i < 0) ? null : limpar(dados[i]); }

  // Endereço estruturado: manda rua, número e complemento SEPARADOS.
  // Quem monta o endereço completo é a função importar_resposta_forms no banco.
  var rua  = v('endereco');
  var num  = v('numero');
  var comp = v('complemento');

  try {
    var payload = {
      p_timestamp:               formatarTimestamp(dados[mapa.timestamp]),
      p_nome:                    v('nome'),
      p_reside_sp:               v('reside_sp'),
      p_aceita_responsabilidade: v('aceita_resp'),
      p_endereco:                rua,
      p_numero:                  num,
      p_complemento:             comp,
      p_bairro:                  v('bairro'),
      p_ponto_referencia:        v('ponto_ref'),
      p_cidade:                  v('cidade'),
      p_cep:                     v('cep'),
      p_whatsapp:                v('whatsapp'),
      p_num_pessoas:             v('num_pessoas'),
      p_num_criancas:            parseInt(v('num_criancas')) || 0,
      p_num_idosos:              parseInt(v('num_idosos'))   || 0,
      p_renda:                   v('renda'),
      p_tem_pcd:                 v('tem_pcd'),
      p_pcd_descricao:           v('pcd_desc'),
      p_auxilio_acao_social:     v('aux_inst'),   // "Sim"/"Não" (instituição social)
      p_auxilio_renda_gov:       v('aux_gov'),    // "Sim"/"Não"
      p_interesse_curso:         v('interesse'),
      p_pode_buscar_cedem:       v('pode_buscar'),
      p_frequenta_cedem:         v('frequenta'),
    };
    var r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/importar_resposta_forms',
      { method: 'POST', headers: getHeaders(), payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (r.getResponseCode() === 200) { console.log('Linha ' + linha + ' ✅'); return true; }
    console.error('Linha ' + linha + ' ❌ HTTP ' + r.getResponseCode() + ': ' + r.getContentText());
    return false;
  } catch (err) { console.error('Linha ' + linha + ' ❌ ' + err.message); return false; }
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onNovaResposta') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onNovaResposta').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
  console.log('✅ Trigger ativado.');
}

function formatarTimestamp(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString();
  var d = new Date(valor);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function limpar(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'string') return valor.trim() || null;
  return String(valor).trim() || null;
}
