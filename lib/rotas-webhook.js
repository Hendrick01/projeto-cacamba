// ============================================================================
// O webhook da Kiwify — a única rota do jogo que aceita POST sem conferir
// Origin, e o comentário existe para essa exceção nunca virar descuido.
//
// Servidor de gateway não manda cabeçalho Origin: exigir isso rejeitaria todo
// pagamento. Quem autentica aqui é a ASSINATURA do corpo, e por isso ela não
// tem atalho — sem KIWIFY_TOKEN configurado, a rota recusa tudo em vez de
// "deixar passar por enquanto". Um webhook que credita sem conferir assinatura
// é uma loja onde qualquer pessoa se dá skins de presente com um curl.
//
// O CORPO É LIDO EM BYTES e o HMAC é feito sobre esses bytes, antes de virar
// JSON — remontar o texto com JSON.stringify muda espaço e ordem de chave, e a
// assinatura nunca bateria.
//
// TODA resposta é 200 quando o evento foi entendido, INCLUSIVE o repetido e o
// que não nos diz respeito (boleto gerado, carrinho abandonado). Devolver erro
// nesses casos faz a Kiwify reenviar em laço para sempre. Erro só para o que é
// erro de verdade: assinatura inválida e falha nossa.
// ============================================================================
import { assinaturaConfere, diagnostico, leEvento, temKiwify } from './kiwify.js';
import { skuPorKiwify } from '../shared/catalogo.js';
import { credita, revoga, anota } from './loja.js';
import { temBanco } from './banco.js';

const TETO = 64 * 1024;

export const ehWebhook = (req) => String(req.url || '').split('?')[0] === '/webhook/kiwify';

async function corpoCru(req) {
  let total = 0;
  const partes = [];
  for await (const pedaco of req) {
    total += pedaco.length;
    if (total > TETO) { req.destroy(); return null; }
    partes.push(pedaco);
  }
  return Buffer.concat(partes);
}

function responde(res, codigo, texto) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(texto);
}

// `avisa(contaId, sku)` é injetado pelo server.js: é ele que sabe quais
// WebSockets pertencem a quem. Fica como parâmetro para este arquivo continuar
// testável sem subir servidor.
export async function rotaDeWebhook(req, res, { avisa = () => {} } = {}) {
  if (req.method !== 'POST') { responde(res, 405, 'Só POST'); return true; }
  if (!temKiwify || !temBanco) { responde(res, 503, 'Loja não configurada'); return true; }

  const cru = await corpoCru(req);
  if (!cru) { responde(res, 413, 'Corpo grande demais'); return true; }

  const assinatura = new URL(req.url, 'http://localhost').searchParams.get('signature') || '';
  const ok = assinaturaConfere(cru, assinatura);

  let payload = null;
  try { payload = JSON.parse(cru.toString('utf8')); } catch { payload = { ilegivel: cru.toString('utf8').slice(0, 500) }; }

  if (!ok) {
    // Guarda o recusado e explica em voz alta o que a assinatura SERIA em cada
    // esquema conhecido. É assim que o primeiro webhook real diz se algum
    // detalhe da documentação mudou — sem nada não verificado ser aceito.
    await anota({ plataforma: 'kiwify', eventoId: null, corpo: payload, assinaturaOk: false, erro: 'assinatura inválida' });
    console.error('webhook kiwify recusado —', diagnostico(cru, assinatura));
    responde(res, 401, 'Assinatura inválida');
    return true;
  }

  const evento = leEvento(payload);
  await anota({ plataforma: 'kiwify', eventoId: evento.eventoId, corpo: payload, assinaturaOk: true });

  // Evento que não é pagamento nem estorno: 200 e adeus.
  if (!evento.situacao) { responde(res, 200, 'ignorado'); return true; }

  if (evento.situacao === 'estornada') {
    const r = await revoga({ plataforma: 'kiwify', eventoId: evento.eventoId });
    if (r.contaId) avisa(r.contaId, r.sku, 'revogada');
    responde(res, 200, 'estorno processado');
    return true;
  }

  const sku = skuPorKiwify(evento.produtoId);
  if (!sku) {
    // Produto sem ligação no catálogo. 200 para a Kiwify parar de reenviar, e
    // grito no log porque isto é dinheiro entrando sem entrega — alguém tem de
    // preencher o campo `kiwify` do item e creditar essa pessoa na mão.
    console.error(`webhook kiwify: produto ${evento.produtoId} não está ligado a nenhum sku. Pagamento de ${evento.email} NÃO foi entregue.`);
    await anota({ plataforma: 'kiwify', eventoId: evento.eventoId, corpo: payload, assinaturaOk: true, erro: `produto ${evento.produtoId} sem sku` });
    responde(res, 200, 'produto desconhecido');
    return true;
  }

  const r = await credita({ email: evento.email, sku, centavos: evento.centavos, plataforma: 'kiwify', eventoId: evento.eventoId });
  if (r.ok && !r.repetido) avisa(r.contaId, sku, 'liberada');
  responde(res, 200, r.repetido ? 'já processado' : 'creditado');
  return true;
}
