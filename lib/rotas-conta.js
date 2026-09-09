// ============================================================================
// As rotas da conta — e a primeira vez que este servidor aceita POST.
//
// Até aqui o Caçamba respondia 405 para tudo que não fosse GET ou HEAD, e essa
// era uma defesa de graça: sem corpo de pedido, não há corpo malicioso. Abrir
// POST devolve essa superfície, então ela volta com quatro cintos:
//
//   1. LISTA FECHADA de caminhos. O que não está na lista continua 405.
//   2. ORIGIN conferido em todo POST — é a trava de CSRF. GET não muda nada,
//      então não precisa; POST muda, então precisa.
//   3. CORPO COM TETO de 4 KB, cortado enquanto chega. Sem isso, um pedido que
//      nunca termina come memória do processo que segura todas as salas.
//   4. BALDE POR IP no /entrar, que é a rota cara: cada chamada dispara e-mail.
//      Sem balde, ela vira máquina de mandar spam com o nome do jogo no
//      remetente — e o custo disso é o domínio queimar.
//
// A trava de idade fica ANTES de criar a conta, de propósito: menor de 16
// recebe a recusa sem que o e-mail dele chegue a existir no banco. A LGPD pede
// cuidado redobrado com dado de criança; o cuidado que não falha é não ter.
// ============================================================================
import { consume, clientIp, validOrigin } from './security.js';
import { avaliaIdade, normalizaEmail, pedeEntrada, consomeLink, contaDaSessao, encerra, anonimiza, assinaCookie, DURACAO_SESSAO_DIAS } from './contas.js';
import { temBanco } from './banco.js';
import { mandaLink } from './email.js';

const NOME_COOKIE = 'cacamba_sessao';
const TETO_CORPO = 4096;
const POSTS = new Set(['/entrar', '/sair', '/apagar-conta']);

const baldes = new Map();
setInterval(() => {
  for (const [ip, b] of baldes) if (Date.now() - (b.at || 0) > 900000) baldes.delete(ip);
}, 300000).unref?.();

// Teste barato de caminho, para o server.js só entrar aqui quando for caso —
// e continuar respondendo 405 a POST em qualquer outro endereço.
const GETS = new Set(['/eu.json']);
export function ehRotaDeConta(req) {
  const caminho = String(req.url || '').split('?')[0];
  return POSTS.has(caminho) || GETS.has(caminho) || caminho.startsWith('/entrar/');
}

function leCookie(req, nome) {
  for (const par of String(req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(par.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Lê o corpo cortando no teto. `destroy` em vez de só parar de ler: quem manda
// demais perde a conexão, não fica pendurado ocupando socket.
async function leCorpo(req) {
  let total = 0;
  const partes = [];
  for await (const pedaco of req) {
    total += pedaco.length;
    if (total > TETO_CORPO) { req.destroy(); return null; }
    partes.push(pedaco);
  }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return null; }
}

function json(res, codigo, corpo, cabecalhos = {}) {
  const texto = Buffer.from(JSON.stringify(corpo));
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': texto.length, ...cabecalhos });
  res.end(texto);
}

// HttpOnly para o JavaScript da página não conseguir ler a sessão — é o que
// transforma um XSS em estrago menor. SameSite=Lax porque o link do e-mail é
// navegação de topo e precisa levar o cookie recém-posto. Secure só onde há
// TLS: em http://localhost, Secure faria o navegador descartar em silêncio, e
// o login "não funcionaria" sem erro nenhum na tela.
function poeCookie(valor, https) {
  const pedacos = [`${NOME_COOKIE}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${DURACAO_SESSAO_DIAS * 86400}`];
  if (https) pedacos.push('Secure');
  return pedacos.join('; ');
}
const tiraCookie = (https) => poeCookie('', https).replace(/Max-Age=\d+/, 'Max-Age=0');

// Devolve true quando tratou o pedido. server.js segue para os arquivos
// estáticos quando isto devolve false.
export async function rotaDeConta(req, res, { publicUrl = '', trustProxy = false } = {}) {
  const url = new URL(req.url, 'http://localhost');
  const caminho = url.pathname;
  const https = /^https:/.test(publicUrl);
  const ehPost = req.method === 'POST';

  if (!ehPost && !['GET', 'HEAD'].includes(req.method)) return false;
  if (ehPost && !POSTS.has(caminho)) return false;
  if (!ehPost && caminho !== '/eu.json' && !caminho.startsWith('/entrar/')) return false;

  // Sem banco não há conta. Diz isso claramente em vez de estourar depois: é a
  // mesma promessa da caixinha do Pix — falta de configuração some com a
  // funcionalidade, não quebra o jogo.
  if (!temBanco) { json(res, 503, { erro: 'A loja ainda não está ligada.' }); return true; }

  if (ehPost && !validOrigin(req, publicUrl)) { json(res, 403, { erro: 'Origem inválida.' }); return true; }

  const ip = clientIp(req, trustProxy);

  if (caminho === '/entrar' && ehPost) {
    // Cinco pedidos, repostos a um a cada dois minutos. Generoso para quem
    // errou o e-mail, apertado para quem quer usar o servidor de megafone.
    let balde = baldes.get(ip);
    if (!balde) { balde = {}; baldes.set(ip, balde); }
    if (!consume(balde, 5, 1 / 120)) { json(res, 429, { erro: 'Muitos pedidos. Tente de novo em alguns minutos.' }); return true; }

    const corpo = await leCorpo(req);
    if (!corpo) { json(res, 400, { erro: 'Pedido inválido.' }); return true; }

    const email = normalizaEmail(corpo.email);
    if (!email) { json(res, 400, { erro: 'Confira o e-mail.' }); return true; }

    const idade = avaliaIdade(corpo.nascimento);
    if (!idade.ok && !idade.precisaResponsavel) { json(res, 403, { erro: idade.motivo }); return true; }

    const pedido = await pedeEntrada(email, corpo.nascimento, ip);
    if (!pedido || pedido.erro) { json(res, 400, { erro: pedido?.erro || 'Não deu para entrar agora.' }); return true; }

    const base = publicUrl || `http://${req.headers.host}`;
    const envio = await mandaLink(email, `${base}/entrar/${pedido.token}`);
    // A resposta é a mesma com e-mail cadastrado ou não: dizer "esta conta não
    // existe" entregaria de graça quem tem conta aqui.
    json(res, 200, { ok: true, enviado: envio.enviado, precisaResponsavel: idade.precisaResponsavel });
    return true;
  }

  if (caminho.startsWith('/entrar/') && req.method !== 'POST') {
    const token = caminho.slice('/entrar/'.length);
    const sessao = token && await consomeLink(token);
    if (!sessao) {
      res.writeHead(303, { Location: '/?entrada=expirada', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    res.writeHead(303, {
      Location: '/?entrada=ok',
      'Set-Cookie': poeCookie(assinaCookie(sessao.sessaoId), https),
      'Cache-Control': 'no-store',
    });
    res.end();
    return true;
  }

  if (caminho === '/eu.json') {
    const conta = await contaDaSessao(leCookie(req, NOME_COOKIE));
    if (!conta) { json(res, 200, { entrou: false }); return true; }
    json(res, 200, {
      entrou: true,
      email: conta.email,
      inventario: conta.inventario,
      precisaResponsavel: avaliaIdade(conta.nascimento).precisaResponsavel && !conta.responsavel_em,
    });
    return true;
  }

  if (caminho === '/sair' && ehPost) {
    await encerra(leCookie(req, NOME_COOKIE));
    json(res, 200, { ok: true }, { 'Set-Cookie': tiraCookie(https) });
    return true;
  }

  if (caminho === '/apagar-conta' && ehPost) {
    const conta = await contaDaSessao(leCookie(req, NOME_COOKIE));
    if (!conta) { json(res, 401, { erro: 'Entre primeiro.' }); return true; }
    await anonimiza(conta.id);
    json(res, 200, { ok: true }, { 'Set-Cookie': tiraCookie(https) });
    return true;
  }

  return false;
}
