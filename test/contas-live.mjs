// Login de ponta a ponta contra um Postgres de verdade.
//
// Fica em .mjs (e fora do `npm test`) pelo mesmo motivo do security-live.mjs:
// precisa de banco e de servidor no ar, e a suíte tem de continuar rodando na
// máquina de quem só clonou o repositório.
//
//   createdb cacamba_dev
//   DATABASE_URL="postgres://$USER@localhost/cacamba_dev?sslmode=disable" node test/contas-live.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log('sem DATABASE_URL — pulando (é assim que deve ser numa máquina sem banco)');
  process.exit(0);
}

const PORTA = 3299;
const base = `http://localhost:${PORTA}`;
const servidor = spawn(process.execPath, ['server.js'], {
  // PUBLIC_URL ligado de propósito: é ele que faz o validOrigin EXIGIR Origin,
  // como em produção. Sem ele o servidor aceita pedido sem Origin (ferramenta
  // local), e o teste de CSRF não estaria testando nada.
  env: { ...process.env, PORT: String(PORTA), PUBLIC_URL: base, SEGREDO_SESSAO: 'segredo-de-teste' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

// O link de entrada sai no stdout enquanto não há RESEND_API_KEY. É assim que
// o teste "abre o e-mail".
let saida = '';
servidor.stdout.on('data', (p) => { saida += p; process.stdout.write(p); });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pede = (caminho, opcoes = {}) => fetch(base + caminho, {
  ...opcoes,
  headers: { 'Content-Type': 'application/json', Origin: base, ...(opcoes.headers || {}) },
  redirect: 'manual',
});

try {
  await espera(1500);

  // 1. Menor de 16 é recusado ANTES de virar linha no banco.
  const menor = await pede('/entrar', { method: 'POST', body: JSON.stringify({ email: 'crianca@exemplo.com', nascimento: '2015-01-01' }) });
  assert.equal(menor.status, 403, 'menor de 16 deveria ser recusado');
  assert.match((await menor.json()).erro, /16 anos/);

  // 2. POST sem Origin não passa (é a trava de CSRF).
  const semOrigem = await fetch(`${base}/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(semOrigem.status, 403, 'POST sem Origin deveria ser recusado');

  // 3. Corpo gigante é cortado, não engolido.
  const gigante = await pede('/entrar', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', lixo: 'x'.repeat(20000) }) }).catch(() => ({ status: 'conexão derrubada' }));
  assert.notEqual(gigante.status, 200, 'corpo de 20 KB não deveria ser aceito');

  // 4. Adulto entra.
  const adulto = await pede('/entrar', { method: 'POST', body: JSON.stringify({ email: 'Adulto@Exemplo.com', nascimento: '1990-05-20' }) });
  assert.equal(adulto.status, 200);

  await espera(500);
  const link = saida.match(/https?:\/\/\S+\/entrar\/[\w-]+/)?.[0];
  assert.ok(link, 'o link de entrada não apareceu no log');

  // 5. O link abre a sessão e devolve o cookie.
  const entrada = await fetch(link, { redirect: 'manual' });
  assert.equal(entrada.status, 303);
  const cookie = entrada.headers.get('set-cookie');
  assert.ok(cookie?.includes('HttpOnly'), 'o cookie precisa ser HttpOnly');
  assert.ok(cookie?.includes('SameSite=Lax'), 'o cookie precisa ser SameSite=Lax');
  const valor = cookie.split(';')[0];

  // 6. A sessão identifica a conta, com o e-mail já normalizado.
  const eu = await (await pede('/eu.json', { headers: { Cookie: valor } })).json();
  assert.equal(eu.entrou, true);
  assert.equal(eu.email, 'adulto@exemplo.com');
  assert.deepEqual(eu.inventario, []);

  // 7. O link é de uso único — o segundo clique não entra.
  const repetido = await fetch(link, { redirect: 'manual' });
  assert.match(repetido.headers.get('location'), /expirada/, 'o link foi aceito duas vezes');

  // 8. Cookie adulterado não vale.
  const forjado = valor.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await (await pede('/eu.json', { headers: { Cookie: forjado } })).json()).entrou, false);

  // 9. Sair encerra de verdade.
  await pede('/sair', { method: 'POST', headers: { Cookie: valor } });
  assert.equal((await (await pede('/eu.json', { headers: { Cookie: valor } })).json()).entrou, false);

  console.log('\n✓ contas-live: 9 verificações passaram');
} finally {
  servidor.kill();
}
