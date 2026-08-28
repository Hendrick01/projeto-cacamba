// O endereço do convite e do QR: é por ele que as pessoas entram na sala, e
// errar o esquema (http num site https) manda todo mundo por um redirecionamento
// — ou, num app instalado, para lugar nenhum.
//
// Rodar com o servidor no ar:
//   node test/convite.mjs [porta]
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

// Cria uma sala mandando os cabeçalhos que um proxy reverso poria, e devolve
// o link de convite que o servidor montou.
async function conviteCom(headers) {
  const ws = new WebSocket(URL, { headers });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const link = await new Promise((res) => {
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'lobby') res(m.joinUrl);
    });
    ws.send(JSON.stringify({ t: 'create', name: 'Teste' }));
  });
  ws.send(JSON.stringify({ t: 'leave' }));
  await espera(120);
  try { ws.close(); } catch { /* ok */ }
  return link;
}

const atrasDeProxy = await conviteCom({
  host: 'projeto-cacamba.onrender.com',
  'x-forwarded-proto': 'https',
});
confere(
  atrasDeProxy.startsWith('https://projeto-cacamba.onrender.com/?sala='),
  `atrás de proxy https, o convite sai em https (${atrasDeProxy})`,
);

const semProxy = await conviteCom({ host: `localhost:${PORT}` });
confere(
  semProxy.startsWith('http://localhost'),
  `sem proxy, continua http (${semProxy})`,
);

// Host forjado sem TRUST_PROXY não pode redirecionar o convite para outro
// domínio: essa é a proteção que a flag guarda, e ela continua de pé.
const forjado = await conviteCom({
  host: `localhost:${PORT}`,
  'x-forwarded-host': 'site-do-atacante.example',
});
confere(
  !forjado.includes('site-do-atacante'),
  `x-forwarded-host sem TRUST_PROXY é ignorado (${forjado})`,
);

console.log(falhou.length ? `\nCONVITE FALHOU: ${falhou.length} de 3` : '\nCONVITE OK: 3/3');
process.exit(falhou.length ? 1 : 0);
