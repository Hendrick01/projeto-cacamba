# 🃏 Caçamba

## Revisão de dedos, visual e segurança — 06/09/2026

Consulte [o relatório da revisão](REVISAO-2026-09-06.md) para alterações,
testes e limitações. Os oito modelos incluem articulação inicial dos dedos,
com controle de flexão em `provador.html`. A aprovação visual final em um
navegador com WebGL ainda é necessária antes de publicar esta revisão.

```bash
npm ci
npm test
npm run test:security
npm run test:integration
npm start
```

Os testes de integração iniciam e encerram seu próprio servidor local. Os
scripts Python em `scripts/` são ferramentas opcionais de preparação e
conferência dos modelos (NumPy e SciPy); o jogo não depende de Python.

Com `PUBLIC_URL` definido, conexões WebSocket precisam enviar o `Origin`
exato do site, como os navegadores fazem. Ferramentas de teste externas
também precisam configurá-lo. Use `TRUST_PROXY=1` somente quando a origem
estiver atrás de um proxy confiável que trate `X-Forwarded-For` corretamente.


Jogo de cartas multiplayer para celular. São **7 rodadas de contratos** — trincas e
sequências —, de 2 a 8 jogadores, cada um no seu aparelho. Quem terminar com **menos
pontos** ganha.

Entrar numa mesa é como no Kahoot: alguém cria a sala, os outros apontam a câmera para
o QR ou digitam o código de 4 letras. Não precisa instalar nada — roda no navegador do
celular e pode ser fixado na tela inicial como aplicativo (PWA).

## Como se joga

Cada rodada tem um **contrato** para cumprir, e ganha uma carta a mais que a anterior:

| Rodada | Cartas | Contrato |
|---|---|---|
| 1ª | 6 | 2 trincas |
| 2ª | 7 | 1 trinca + 1 sequência |
| 3ª | 8 | 2 sequências |
| 4ª | 9 | 3 trincas |
| 5ª | 10 | 2 trincas + 1 sequência |
| 6ª | 11 | 2 sequências + 1 trinca |
| 7ª | 12 | 3 sequências |

- **Trinca:** 3 cartas do mesmo valor, com naipes diferentes.
- **Sequência:** 4 cartas seguidas do mesmo naipe (o Ás vale 1 ou 14, mas não vira a esquina).

Na sua vez você **puxa uma carta** (do monte ou do meio) e **descarta uma** — as duas
coisas são obrigatórias. Entre elas, dá para **baixar seus jogos**, um de cada vez, e
para **encaixar** cartas nos jogos da mesa depois que o contrato inteiro estiver baixado.

Quando alguém descarta, os outros podem **pedir a carta**: leva quem apertar primeiro —
a não ser que quem está na vez também a queira, porque ele tem preferência.

O **coringa** só vale em sequência (no máximo um por sequência), custa 20 pontos se
sobrar na sua mão, e **trava o meio** enquanto estiver descartado por cima. Quem tiver a
carta exata que ele representa pode trocá-la por ele.

As regras completas estão dentro do jogo, no botão **?**.

## Rodar na sua máquina

```bash
npm install && npm start
```

O terminal mostra dois endereços: um para este computador e outro para os celulares na
mesma rede Wi-Fi. Abra o segundo no celular e crie a sala.

Testes:

```bash
npm test
```

Os testes de integração pedem o servidor no ar: `node test/e2e.mjs` e `node test/sair.mjs`.

## Publicar na web

O jogo guarda as salas em memória e conversa por WebSocket, então precisa de um
servidor rodando o tempo todo. **Não funciona** em Vercel, Netlify ou Cloudflare Pages,
que são serverless. Servem Render, Fly.io, Railway e Koyeb.

Para o Render, o [`render.yaml`](render.yaml) já está pronto: no painel, escolha
**New → Blueprint** e aponte para este repositório. Ele cria o serviço sozinho.

Variáveis de ambiente que o servidor entende:

| Variável | Para que serve |
|---|---|
| `PORT` | Porta. As hospedagens injetam sozinhas. |
| `HOST` | Interface de escuta (padrão `0.0.0.0`). |
| `PUBLIC_URL` | Endereço fixo do site, usado no link de convite e no QR. |
| `TRUST_PROXY` | `1` atrás de proxy reverso, para o convite sair com o endereço público. |
| `ALLOWED_HOSTS` | Lista de hosts aceitos no convite, separados por vírgula. |

Sem `PUBLIC_URL`, o endereço do convite sai dos cabeçalhos da requisição (com
`TRUST_PROXY=1`) e, em último caso, do IP da rede local.

## Por dentro

Node.js puro em ESM, sem framework e sem build; só duas dependências (`ws` e `qrcode`).
O servidor é o **juiz** — nenhuma regra é confiada ao navegador. O motor de regras vive
em [`shared/engine.js`](shared/engine.js) e roda nos dois lados: no servidor decidindo,
no cliente apenas para a tela não oferecer um gesto que o juiz recusaria.

[`ESTRUTURA.md`](ESTRUTURA.md) explica o projeto arquivo por arquivo.
