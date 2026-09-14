// Banca de testes visuais: espelha o servidor do jogo (HTTP e WebSocket) SEM a
// CSP dele, e recebe de volta em /salva a imagem que a página desenhou.
//
//   node scripts/banca-visual.mjs <pasta-das-imagens> [porta-do-jogo=3000]
//   → abre http://localhost:3999/3d.html (ou /inspetor-mao.html)
//   → na página: fetch('/salva?nome=x', { method: 'POST', body: base64Jpeg })
//
// Por que espelhar em vez de servir os arquivos soltos: a mesa 3D precisa do
// WebSocket para receber a partida, e a CSP do jogo (connect-src 'self') barra
// mandar a imagem para outra porta. Espelhando, tudo vira a mesma origem — e a
// CSP é tirada do cabeçalho na passagem. É ferramenta de desenvolvimento: nunca
// aponte para o servidor publicado.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const PASTA = process.argv[2] || '.';
const ALVO = { host: '127.0.0.1', port: Number(process.argv[3] || 3000) };
const PORTA = Number(process.env.BANCA_PORTA || 3999);

const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/salva') {
    const nome = (u.searchParams.get('nome') || 'saida').replace(/[^\w.-]/g, '_') + '.jpg';
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const arq = path.join(PASTA, nome);
      fs.writeFileSync(arq, Buffer.from(corpo, 'base64'));
      console.log('gravado', arq, fs.statSync(arq).size, 'bytes');
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    });
    return;
  }
  const p = http.request({ ...ALVO, method: req.method, path: req.url,
    headers: { ...req.headers, host: `127.0.0.1:${ALVO.port}`, ...(req.headers.origin ? { origin: `http://127.0.0.1:${ALVO.port}` } : {}) } }, (r) => {
    const h = { ...r.headers };
    delete h['content-security-policy'];      // é ela que barraria o /salva
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502).end(String(e.message)); });
  req.pipe(p);
});

// o WebSocket da partida passa por aqui em cru
servidor.on('upgrade', (req, socket, head) => {
  const alvo = net.connect(ALVO.port, ALVO.host, () => {
    alvo.write(`${req.method} ${req.url} HTTP/1.1\r\n`);
    // Host E Origin passam a apontar para o servidor de verdade: o jogo confere
    // a origem do WebSocket (lib/security.js, validOrigin) e recusa a da banca.
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i];
      const v = /^host$/i.test(k) ? `127.0.0.1:${ALVO.port}`
        : /^origin$/i.test(k) ? `http://127.0.0.1:${ALVO.port}` : req.rawHeaders[i + 1];
      alvo.write(`${k}: ${v}\r\n`);
    }
    alvo.write('\r\n');
    if (head?.length) alvo.write(head);
    alvo.pipe(socket); socket.pipe(alvo);
  });
  alvo.on('error', () => socket.destroy());
  socket.on('error', () => alvo.destroy());
});

servidor.listen(PORTA, () => console.log(`banca em ${PORTA} -> imagens em ${PASTA} | espelhando ${ALVO.port}`));
