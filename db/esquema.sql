-- ============================================================================
-- O banco da loja — Postgres.
--
-- Postgres e não SQLite porque o Render não guarda disco entre reinícios: o
-- arquivo do SQLite sumiria junto com o contêiner, levando as compras. Serve
-- qualquer hospedagem que dê uma DATABASE_URL (Neon, Supabase, Render); o
-- esquema abaixo não usa nada exclusivo de nenhuma.
--
-- O jogo em si NÃO passa por aqui. Sala, mão, descarte e placar continuam em
-- memória, como sempre foram: uma partida não pode ficar mais lenta nem cair
-- porque o banco piscou. O banco guarda só o que precisa sobreviver ao
-- reinício — quem é a pessoa e o que ela comprou.
--
-- Três decisões estão gravadas na forma das tabelas, e é bom saber quais são
-- antes de mexer:
--
--   1. NÃO EXISTE COLUNA DE SENHA. A entrada é por link no e-mail. O que não se
--      guarda não vaza, não precisa de hash forte e não gera "esqueci minha
--      senha" às duas da manhã.
--   2. COMPRA E POSSE SÃO TABELAS DIFERENTES. Estorno tira a skin do
--      `inventario` e deixa a linha em `compras` de pé — a fiscal exige o
--      histórico, e apagar venda estornada é o tipo de buraco que só aparece
--      quando alguém pede extrato.
--   3. O EVENTO DO GATEWAY É ÚNICO NO BANCO. Gateway reenvia webhook por
--      projeto: se a resposta demora, ele manda de novo. Sem a restrição, um
--      pagamento vira três skins. Deixar o banco recusar é mais seguro que
--      lembrar de checar no código.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Guardado em minúscula porque é assim que se compara e-mail. CITEXT
  -- resolveria sozinho, mas é extensão: nem toda hospedagem gerenciada deixa
  -- instalar, e normalizar na entrada custa uma linha.
  email          text UNIQUE NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
  criada_em      timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso  timestamptz,

  -- A trava de idade. Data de verdade, não um "declaro ter 18": a caixinha de
  -- declarar não protege ninguém e não vale nada se um responsável contestar
  -- a compra depois. Menor de 16 não compra; 16 e 17 dependem do responsável.
  nascimento         date,
  responsavel_email  text,
  responsavel_em     timestamptz,
  -- Com o que o responsável concordou e de onde: é isto que se mostra quando
  -- alguém questiona a compra de um adolescente.
  responsavel_ip     inet,

  -- LGPD com fiscal em cima. "Apagar minha conta" zera o e-mail e a data de
  -- nascimento e carimba aqui; as linhas de `compras` continuam, apontando
  -- para um id que não identifica mais ninguém. Atende o direito de exclusão
  -- sem destruir o que a Receita manda guardar por cinco anos.
  anonimizada_em     timestamptz
);

-- O link mágico. O token vive no e-mail da pessoa e no banco só como hash:
-- um vazamento do banco não vira acesso às contas. Uso único e curto — quinze
-- minutos bastam para clicar, e não bastam para caçar por tentativa.
CREATE TABLE IF NOT EXISTS links_magicos (
  token_hash  text PRIMARY KEY,
  conta_id    uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  pedido_de   inet
);
CREATE INDEX IF NOT EXISTS links_por_conta ON links_magicos (conta_id, criado_em DESC);

-- A sessão. O cookie leva só o id daqui, assinado; nada de dado da pessoa
-- viaja no cookie, então nada precisa ser decifrado para ser conferido.
CREATE TABLE IF NOT EXISTS sessoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id     uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  criada_em    timestamptz NOT NULL DEFAULT now(),
  expira_em    timestamptz NOT NULL,
  ultimo_uso   timestamptz NOT NULL DEFAULT now(),
  encerrada_em timestamptz
);
CREATE INDEX IF NOT EXISTS sessoes_por_conta ON sessoes (conta_id) WHERE encerrada_em IS NULL;

-- A venda. O catálogo NÃO mora aqui: ele é código, em shared/catalogo.js, pelo
-- mesmo motivo do elenco — os dois lados precisam dele e um deploy é o jeito
-- honesto de mudar preço. O que a tabela guarda é o que foi cobrado de fato,
-- congelado: baixar o preço amanhã não pode reescrever o que alguém pagou hoje.
CREATE TABLE IF NOT EXISTS compras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid NOT NULL REFERENCES contas(id),
  sku           text NOT NULL,
  centavos      integer NOT NULL CHECK (centavos >= 0),

  plataforma    text NOT NULL,             -- 'kiwify', 'hotmart', 'apple', 'google'
  -- A trava contra o webhook repetido. É o id do EVENTO no gateway, não o id
  -- do pedido: o mesmo pedido gera evento de pagamento e evento de estorno, e
  -- os dois têm de caber.
  evento_id     text NOT NULL,
  status        text NOT NULL CHECK (status IN ('paga', 'estornada', 'contestada')),

  paga_em       timestamptz NOT NULL DEFAULT now(),
  estornada_em  timestamptz,
  -- O prazo do artigo 49 do CDC. Guardado como coluna e não calculado na hora
  -- porque é o que decide se o botão de reembolso aparece — e regra de prazo
  -- espalhada pelo código é regra que diverge.
  arrependimento_ate timestamptz NOT NULL DEFAULT now() + interval '7 days',

  UNIQUE (plataforma, evento_id)
);
CREATE INDEX IF NOT EXISTS compras_por_conta ON compras (conta_id, paga_em DESC);

-- A posse. Uma linha por skin que a pessoa tem, e é ESTA tabela que o servidor
-- consulta quando alguém escolhe um personagem ou um verso — nunca o cliente,
-- que só pede. Separada de `compras` porque nem toda posse vem de venda
-- (brinde, correção de suporte) e porque estorno tira daqui sem mexer lá.
CREATE TABLE IF NOT EXISTS inventario (
  conta_id     uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  sku          text NOT NULL,
  concedida_em timestamptz NOT NULL DEFAULT now(),
  origem       text NOT NULL CHECK (origem IN ('compra', 'brinde', 'suporte')),
  compra_id    uuid REFERENCES compras(id),
  PRIMARY KEY (conta_id, sku)
);

-- O que o webhook recebeu, cru, antes de qualquer interpretação. Ocupa pouco e
-- é a única forma de responder "por que fulano não recebeu a skin" três
-- semanas depois — o gateway não guarda para sempre, e a resposta costuma
-- estar no corpo que chegou, não no que o código entendeu dele.
CREATE TABLE IF NOT EXISTS webhooks_recebidos (
  id           bigserial PRIMARY KEY,
  plataforma   text NOT NULL,
  evento_id    text,
  corpo        jsonb NOT NULL,
  assinatura_ok boolean NOT NULL,
  recebido_em  timestamptz NOT NULL DEFAULT now(),
  erro         text
);
CREATE INDEX IF NOT EXISTS webhooks_por_evento ON webhooks_recebidos (plataforma, evento_id);
