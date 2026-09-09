// ============================================================================
// A Kiwify — conferir a assinatura e entender o que ela mandou.
//
// A Kiwify é a VENDEDORA de registro: ela cobra, emite a nota, absorve estorno
// e o arrependimento de 7 dias. Deste lado só chega o aviso "fulano pagou", e a
// única coisa que importa aqui é: o aviso é mesmo dela?
//
// COMO ELA ASSINA: HMAC-SHA1 do corpo CRU do pedido, com o token do webhook
// como chave, entregue na query string em ?signature=<hex>.
//
// Duas consequências que mudam o código, e é bom saber por quê:
//
//   1. O corpo tem de ser lido em BYTES, antes de virar JSON. `JSON.parse` e
//      `JSON.stringify` de volta não devolvem o mesmo texto — muda espaço,
//      muda ordem de chave — e o HMAC do texto remontado nunca bateria.
//   2. Esta rota NÃO confere Origin. Servidor de gateway não manda Origin, e
//      exigir isso rejeitaria tudo. Quem autentica aqui é a assinatura, e é
//      por isso que ela não pode ter atalho: sem token configurado, o webhook
//      é recusado inteiro em vez de "passar por enquanto".
//
// SHA-1 aqui não é escolha nossa e não é falha: em HMAC, o SHA-1 continua
// sólido para autenticar mensagem (o que quebrou nele foi resistência a
// colisão, que não é o que HMAC usa). Se um dia eles subirem para SHA-256,
// muda a linha do createHmac e mais nada.
// ============================================================================
import crypto from 'node:crypto';

const TOKEN = process.env.KIWIFY_TOKEN || '';
export const temKiwify = !!TOKEN;

// Comparação em tempo constante. Length diferente sai antes, o que vaza só o
// tamanho — e o tamanho de um hash hex é público de qualquer jeito.
function igualSeguro(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function assinaturaConfere(corpoCru, assinatura) {
  if (!TOKEN || !assinatura) return false;
  const esperado = crypto.createHmac('sha1', TOKEN).update(corpoCru).digest('hex');
  return igualSeguro(esperado, String(assinatura).toLowerCase());
}

// Quando a assinatura não bate, isto diz o que ela SERIA em cada esquema
// plausível. Serve para o primeiro webhook real ensinar qual é o certo, sem
// que nenhum payload não verificado seja aceito no meio do caminho. Some do
// log assim que o primeiro evento verdadeiro passar.
export function diagnostico(corpoCru, assinatura) {
  if (!TOKEN) return 'KIWIFY_TOKEN não configurado';
  const jeitos = {
    'sha1-hex': crypto.createHmac('sha1', TOKEN).update(corpoCru).digest('hex'),
    'sha256-hex': crypto.createHmac('sha256', TOKEN).update(corpoCru).digest('hex'),
    'sha1-base64': crypto.createHmac('sha1', TOKEN).update(corpoCru).digest('base64'),
  };
  const bateu = Object.entries(jeitos).find(([, v]) => igualSeguro(v, assinatura));
  return bateu
    ? `A assinatura bate com ${bateu[0]} — ajuste assinaturaConfere para esse esquema.`
    : `Nenhum esquema conhecido bate. Recebido: ${String(assinatura).slice(0, 20)}… | sha1-hex daria: ${jeitos['sha1-hex'].slice(0, 20)}…`;
}

// Lê o payload sem apostar num formato exato. A documentação técnica da Kiwify
// vive num Notion fechado, então em vez de fingir certeza, isto procura o dado
// nos caminhos plausíveis e devolve `null` no que não achar — e o corpo cru
// fica salvo em webhooks_recebidos, que é onde o primeiro evento de verdade
// revela o formato real sem ter perdido nada.
const cava = (obj, ...caminhos) => {
  for (const caminho of caminhos) {
    const valor = caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    if (valor !== undefined && valor !== null && valor !== '') return valor;
  }
  return null;
};

// 'paga' credita, 'estornada' revoga, null é evento que não nos diz respeito
// (carrinho abandonado, boleto gerado) e deve ser respondido com 200 e ignorado
// — devolver erro faria a Kiwify reenviar para sempre.
export function situacao(payload) {
  const bruto = String(cava(payload, 'order_status', 'status', 'webhook_event_type', 'order.status') || '').toLowerCase();
  if (['paid', 'approved', 'aprovado', 'pago', 'order_approved'].includes(bruto)) return 'paga';
  if (['refunded', 'chargeback', 'chargedback', 'estornado', 'reembolsado', 'order_refunded'].includes(bruto)) return 'estornada';
  return null;
}

export function leEvento(payload) {
  return {
    situacao: situacao(payload),
    eventoId: cava(payload, 'order_id', 'id', 'order.id', 'order_ref'),
    email: String(cava(payload, 'Customer.email', 'customer.email', 'buyer.email', 'email') || '').toLowerCase() || null,
    produtoId: cava(payload, 'Product.product_id', 'product.id', 'product_id', 'Product.id'),
    centavos: Number(cava(payload, 'Commissions.charge_amount', 'charge_amount', 'order_total', 'amount')) || 0,
  };
}
