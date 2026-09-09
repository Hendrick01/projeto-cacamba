// ============================================================================
// O banco — ligar, migrar, e sobreviver a não existir.
//
// A REGRA QUE MANDA AQUI: sem DATABASE_URL, o Caçamba funciona igual. Sala,
// mão, descarte e placar nunca passaram por banco e continuam não passando;
// conta e inventário são um andar de cima, opcional. Quem clona o repositório
// e roda `npm start` joga na hora, sem instalar Postgres nenhum — e o dia em
// que o banco cair, o jogo não cai junto. É o mesmo contrato da caixinha do
// Pix: falta de configuração some com a funcionalidade, não quebra o jogo.
//
// O cliente é o `postgres` (porsager) e não o `pg` por dois motivos: zero
// dependências, e a consulta é template literal — `sql\`... ${email}\`` vira
// parâmetro ligado, não texto colado. Escrever injeção por acidente fica
// difícil, que é a única defesa que funciona a longo prazo.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const URL_BANCO = process.env.DATABASE_URL || '';

// Hospedagem gerenciada (Neon, Supabase, Render) exige TLS; o Postgres da sua
// máquina normalmente nem oferece. Decidir pela URL evita um terceiro botão de
// configuração que ninguém lembraria de virar.
const local = /localhost|127\.0\.0\.1/.test(URL_BANCO) || /sslmode=disable/.test(URL_BANCO);

export const sql = URL_BANCO
  ? postgres(URL_BANCO, {
    ssl: local ? false : 'require',
    // O Render free dorme e o Neon suspende: pool pequeno e conexão que morre
    // sozinha valem mais que conexão parada segurando slot do plano gratuito.
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    // O esquema é idempotente de propósito, então "relation já existe" é o
    // resultado ESPERADO de toda subida depois da primeira. Deixar o NOTICE
    // sair enche o log de dez linhas de susto que não são susto nenhum.
    onnotice: () => {},
  })
  : null;

export const temBanco = !!sql;

// Roda o esquema. É idempotente de propósito (todo CREATE tem IF NOT EXISTS),
// então subir duas vezes não dói e não existe tabela de versão para desandar.
// Enquanto o esquema só CRESCE, isto basta; no dia em que precisar ALTER com
// ordem, aí sim vale uma tabela de migrações — e não antes.
export async function migra() {
  if (!sql) return false;
  const esquema = fs.readFileSync(path.join(AQUI, '..', 'db', 'esquema.sql'), 'utf8');
  await sql.unsafe(esquema);
  return true;
}

// Fecha para o processo poder sair — testes e Ctrl+C.
export async function fecha() {
  if (sql) await sql.end({ timeout: 5 });
}
