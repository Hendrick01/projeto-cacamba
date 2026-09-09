// O caminho do dinheiro, contra Postgres de verdade.
//
//   DATABASE_URL="postgres://$USER@localhost/cacamba_dev?sslmode=disable" node test/webhook-live.mjs
//
// O que este teste protege, e por que cada um importa:
//   - assinatura inválida NÃO credita (senão qualquer curl se dá skins);
//   - o mesmo evento duas vezes credita UMA (gateway reenvia por projeto);
//   - produto sem ligação não vira skin por palpite;
//   - estorno tira a posse e MANTÉM a venda no histórico (fiscal).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) { console.log('sem DATABASE_URL — pulando'); process.exit(0); }

const PORTA = 3298;
const base = `http://localhost:${PORTA}`;
const TOKEN = 'token-de-teste-do-webhook';
const sql = postgres(process.env.DATABASE_URL, { ssl: false, onnotice: () => {} });

const servidor = spawn(process.execPath, ['server.js'], {
  env: {
    ...process.env,
    PORT: String(PORTA),
    PUBLIC_URL: base,
    SEGREDO_SESSAO: 'segredo-de-teste',
    KIWIFY_TOKEN: TOKEN,
    KIWIFY_PRODUTOS: 'PROD_TESTE=verso-neon',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const assina = (corpo) => crypto.createHmac('sha1', TOKEN).update(corpo).digest('hex');

async function manda(payload, { assinaturaErrada = false } = {}) {
  const corpo = JSON.stringify(payload);
  const assinatura = assinaturaErrada ? 'f'.repeat(40) : assina(corpo);
  return fetch(`${base}/webhook/kiwify?signature=${assinatura}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo,
  });
}

// Email E id de evento únicos por execução. O id não pode ser fixo porque a
// UNIQUE (plataforma, evento_id) é justamente o que este teste prova: com id
// repetido, a segunda execução seria barrada pela trava que ela quer testar.
const CORRIDA = Date.now();
const EMAIL = `comprador-${CORRIDA}@exemplo.com`;
const EVT = (nome) => `EVT-${CORRIDA}-${nome}`;
const pedido = (id, status) => ({
  order_id: id, order_status: status,
  Customer: { email: EMAIL },
  Product: { product_id: 'PROD_TESTE' },
  Commissions: { charge_amount: 1490 },
});
const inventario = async () => (await sql`
  SELECT i.sku FROM inventario i JOIN contas c ON c.id = i.conta_id WHERE c.email = ${EMAIL}`).map((r) => r.sku);

try {
  await espera(1500);

  // 1. Assinatura forjada não credita nada.
  const forjado = await manda(pedido(EVT('FALSO'), 'paid'), { assinaturaErrada: true });
  assert.equal(forjado.status, 401, 'assinatura inválida deveria ser recusada');
  assert.deepEqual(await inventario(), [], 'assinatura falsa creditou!');

  // 2. Evento que não é pagamento: 200 e nada acontece.
  const boleto = await manda(pedido(EVT('BOLETO'), 'waiting_payment'));
  assert.equal(boleto.status, 200, 'evento irrelevante deve dar 200, senão a Kiwify reenvia para sempre');
  assert.deepEqual(await inventario(), []);

  // 3. Produto que não está ligado a nenhum sku não vira skin por palpite.
  const desconhecido = await manda({ ...pedido(EVT('SEM-SKU'), 'paid'), Product: { product_id: 'NAO-EXISTE' } });
  assert.equal(desconhecido.status, 200);
  assert.deepEqual(await inventario(), []);

  // 4. Pagamento de verdade credita.
  const pago = await manda(pedido(EVT('1'), 'paid'));
  assert.equal(pago.status, 200);
  assert.deepEqual(await inventario(), ['verso-neon'], 'a compra não creditou');

  // 5. O MESMO evento de novo não vira segunda compra. É a trava do banco.
  await manda(pedido(EVT('1'), 'paid'));
  await manda(pedido(EVT('1'), 'paid'));
  const [{ count }] = await sql`
    SELECT count(*)::int FROM compras WHERE plataforma = 'kiwify' AND evento_id = ${EVT('1')}`;
  assert.equal(count, 1, `o mesmo evento virou ${count} compras`);
  assert.deepEqual(await inventario(), ['verso-neon']);

  // 6. Estorno tira a posse e MANTÉM a venda no histórico.
  const estorno = await manda(pedido(EVT('1'), 'refunded'));
  assert.equal(estorno.status, 200);
  assert.deepEqual(await inventario(), [], 'o estorno não revogou a skin');
  const [venda] = await sql`SELECT status FROM compras WHERE evento_id = ${EVT('1')}`;
  assert.equal(venda.status, 'estornada');
  assert.ok(venda, 'a venda estornada sumiu do histórico — a fiscal pede 5 anos');

  // 7. Todo webhook recebido ficou anotado, inclusive o recusado.
  const anotados = await sql`SELECT assinatura_ok FROM webhooks_recebidos WHERE plataforma = 'kiwify'`;
  assert.ok(anotados.some((a) => a.assinatura_ok === false), 'o recusado não foi anotado');

  console.log('\n✓ webhook-live: 7 verificações passaram');
} finally {
  servidor.kill();
  await sql.end({ timeout: 5 });
}
