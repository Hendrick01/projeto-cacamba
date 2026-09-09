// ============================================================================
// O Pix da caixinha — o código copia-e-cola e o QR de apoio.
//
// Isto NÃO é venda. Não entrega skin, não tem valor fixo, não vira pedido e não
// pede conta: é a caixinha em cima do balcão. A diferença importa fora do
// código — doação não emite nota, não cria inventário para revogar e não põe o
// jogo debaixo das regras de compra digital. Quando existir loja de verdade,
// ela nasce noutro arquivo; este continua sendo a caixinha.
//
// Vive em lib/ pelo mesmo motivo do security.js: é função pura, sem estado, e
// o teste monta o payload sem subir servidor nenhum.
//
// O formato é o BR Code do Banco Central (o EMV®QRCPS): uma fila de campos
// "id + tamanho + valor", onde alguns campos são fila de outros campos. Dois
// detalhes derrubam quem escreve de primeira:
//
//   1. O CRC entra sobre a string JÁ terminada em "6304" — o cabeçalho do
//      próprio campo do CRC faz parte da conta.
//   2. O tamanho é o do valor, em dois dígitos. Um acento vira dois bytes em
//      UTF-8 e o tamanho passa a mentir, então nome e cidade saem sem acento.
//      É por isso que "Caçamba" viaja como "CACAMBA".
//
// Sem valor no código (campo 54 ausente), de propósito: quem apoia digita
// quanto quer. Um QR de valor fixo transformaria carinho em preço.
// ============================================================================

// "id + tamanho + valor". O tamanho é contado em bytes, não em caracteres.
function tlv(id, valor) {
  const v = String(valor);
  return id + String(Buffer.byteLength(v, 'utf8')).padStart(2, '0') + v;
}

// Nome e cidade do recebedor viajam em caixa alta e sem acento. O NFD separa a
// letra do acento ("ç" vira "c" + cedilha solta) e a faixa 0300–036F varre os
// acentos soltos; o que sobra de estranho vira espaço.
function ascii(texto, limite) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toUpperCase().slice(0, limite).trim();
}

// A chave, do jeito que a pessoa digita → do jeito que o Pix exige. Telefone
// precisa de "+55" e nada de espaço; CPF e CNPJ vão só com dígito; e-mail vai
// em minúscula. Sem isto, "95 999711394" vira um QR que o banco recusa — e o
// pior é que ele NASCE bonito: o desenho aparece, o CRC bate, e só quem tenta
// pagar descobre. Por isso a interpretação é dita em voz alta na subida.
//
// Os 11 dígitos são ambíguos: CPF tem 11 e celular com DDD também. O desempate
// é a regra do nono dígito — todo celular do país é DDD + 9 + oito dígitos. Um
// CPF que caia nesse molde existiria, então PIX_TIPO força a mão quando
// preciso.
export function normalizaChave(bruta, tipo = '') {
  const chave = String(bruta || '').trim();
  if (!chave) return { chave: '', tipo: 'vazia' };
  if (chave.includes('@')) return { chave: chave.toLowerCase(), tipo: 'e-mail' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
    return { chave: chave.toLowerCase(), tipo: 'aleatória' };
  }
  const d = chave.replace(/\D/g, '');
  const forcado = String(tipo || '').toLowerCase();
  const telefone = () => ({ chave: `+55${d.slice(-11)}`, tipo: 'telefone' });
  if (forcado === 'telefone') return telefone();
  if (forcado === 'cpf') return { chave: d.slice(-11), tipo: 'CPF' };
  if (chave.startsWith('+') || d.length === 13) return { chave: `+${d}`, tipo: 'telefone' };
  if (d.length === 14) return { chave: d, tipo: 'CNPJ' };
  if (d.length === 11) {
    // Ponto e traço são como se escreve CPF; espaço e parêntese, telefone.
    if (/[.]/.test(chave)) return { chave: d, tipo: 'CPF' };
    if (d[2] === '9') return telefone();
    return { chave: d, tipo: 'CPF' };
  }
  return { chave, tipo: 'desconhecido' };
}

// CRC-16/CCITT-FALSE: começa em 0xFFFF, polinômio 0x1021, sem espelhar bit e
// sem xor no fim. O valor de conferência da literatura é "123456789" → 29B1, e
// é exatamente isso que o teste cobra.
export function crc16(texto) {
  let crc = 0xFFFF;
  for (const byte of Buffer.from(String(texto), 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Devolve o copia-e-cola, ou null quando não há chave configurada — e o null é
// o que mantém o botão escondido em desenvolvimento, em vez de oferecer um QR
// que não leva a lugar nenhum.
export function codigoPix({ chave, nome, cidade, tipo } = {}) {
  const pix = normalizaChave(chave, tipo).chave;
  if (!pix) return null;

  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', pix);
  const semCrc = tlv('00', '01')          // versão do formato
    + tlv('26', conta)                     // a chave, dentro do template do Pix
    + tlv('52', '0000')                    // categoria: nenhuma em especial
    + tlv('53', '986')                     // moeda: real
    + tlv('58', 'BR')
    + tlv('59', ascii(nome, 25) || 'RECEBEDOR')
    + tlv('60', ascii(cidade, 15) || 'BRASIL')
    + tlv('62', tlv('05', '***'))          // sem identificador de transação
    + '6304';
  return semCrc + crc16(semCrc);
}
