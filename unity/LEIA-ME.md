# Caçamba em Unity

O Caçamba como aplicativo Unity — Android, iOS, Windows e navegador (WebGL) —
com a **mesa 3D e os oito personagens** do elenco.

O Unity é um **cliente** do servidor de sempre (`server.js`): ele fala o mesmo
protocolo WebSocket do site, então quem joga no app e quem joga no navegador
sentam **na mesma sala**, pelo mesmo código de 4 letras. As regras continuam
morando em `shared/engine.js` e o servidor continua sendo o juiz — o app só
pede jogadas e desenha o que volta.

Nesta primeira etapa entra só o **Caçamba**. Os outros sete jogos da
plataforma continuam no site.

## Como se joga no app

**Primeira vez: "Aprender a jogar"** (na tela inicial). É uma rodada curta contra um robô, com a **Lyly** num cartão dizendo o próximo passo e acendendo o que tocar: o monte, o meio, as cartas certas da mão, o feltro onde baixar, o jogo onde encaixar.

- A rodada é arrumada no servidor (`shared/tutorial.js`) para que, em duas vezes, apareça tudo:
  - **1ª vez:** puxar do monte, baixar uma trinca, encaixar e descartar;
  - **vez do robô:** ele descarta um Rei;
  - **2ª vez:** pegar o Rei do meio, baixar a segunda trinca e bater.
- A Lyly não segue roteiro fixo: a cada lance ela olha a mesa e escolhe a lição. Se você fizer outra coisa, ela acompanha o jogo do jeito que ficou.
- No fim, dá para continuar a partida contra o robô, ler as regras ou sair.
- **Regras** (na tela inicial e no Menu da partida) abre o "Como se joga" inteiro, com o contrato da rodada marcado.

**A mão é para pegar com o dedo.**

- **Tocar** numa carta escolhe (ela sobe); tocar de novo desfaz.
- **Arrastar dentro da mão** muda a ordem; a mão passa para "Ordem: sua".
- **Arrastar para a mesa** joga a carta:
  - **no descarte**: descarta (o descarte acende um anel verde quando a carta está em cima);
  - **num jogo baixado**: encaixa. Os jogos onde a carta cabe brilham em âmbar, e o que está embaixo do dedo brilha em verde. Se a carta cabe de dois jeitos (as duas pontas, ou ponta e lugar do coringa), o app pergunta qual;
  - **no feltro livre**: baixa o jogo de que a carta faz parte, ou as cartas escolhidas. As que descem junto sobem um pouco enquanto a carta está no ar.
- Os botões continuam lá, para quem prefere tocar.

**Dicas.**

- As cartas que já formam um jogo ganham uma **faixa colorida** embaixo, uma cor por jogo.
- O contrato aparece em **pílulas**: verde = já está na mesa; âmbar = pronto na mão; apagada = falta.
- Com o contrato inteiro na mão, a faixa da vez diz "baixe!" e o botão de baixar vira o principal.
- O botão **Ordem**, ao lado do "Você · pontos", alterna naipe, valor e "jogos" (os jogos prontos juntos, na frente).
- As dicas são calculadas no app, numa cópia em C# da busca de jogos do motor (`Regras.cs`). Quem decide continua sendo o servidor.

**A mesa se mexe.** Toda carta viaja de onde estava para onde vai:

- do monte para a mão (a sua ou a de um adversário);
- da mão para o descarte e para os jogos;
- de um jogo para outro;
- a queimada sai da mesa;
- na rodada nova, o monte distribui.

Os personagens:

- vão à mesa a cada lance;
- dão pulinhos quando pegam o que queriam;
- comemoram quando batem;
- murcham quando outro bate.

**Som e vibração.**

- Todos os sons são **gerados no próprio app** (nenhum arquivo de áudio baixado): carta deslizando, carta pousando, baralho, sino da sua vez, pedido, baixada, batida, erro e o tique dos últimos segundos.
- No celular, a vez, os últimos 5 segundos e a jogada recusada vibram.
- No **Menu** dá para desligar o som, a vibração e as animações. Com as animações desligadas, a mesa troca de estado direto, como antes.

**Relógio da vez (opcional).** Quem cria a sala escolhe no lobby:

- sem relógio, 30, 45, 60 ou 90 segundos por vez.
- Com relógio, a barra e os segundos aparecem acima dos botões e sobre a cabeça de quem está jogando.
- Quem estoura o prazo tem a vez jogada no mínimo: o jogo puxa e descarta, nunca baixa por ninguém.
- O site mostra o mesmo relógio na faixa da vez.

## Requisitos

- **Unity 6** (`6000.0.41f1`, a versão em que o projeto foi feito) com uma
  licença ativa — a Personal é gratuita. Entre no Unity Hub com a sua conta.
- Módulos do editor, pelo Unity Hub → Installs → ⚙ → Add modules:
  - **Windows Build Support** e **WebGL Build Support** — para o app de Windows e a versão de navegador;
  - **Android Build Support** (com OpenJDK e Android SDK & NDK) — para o app Android;
  - **iOS Build Support** — gera o projeto Xcode. Compilar e publicar exige um **Mac com Xcode**.

## Abrir e jogar no editor

1. Unity Hub → **Add** → **Add project from disk** → escolha esta pasta `unity/`.
2. Na primeira abertura o projeto se configura sozinho (cena, materiais,
   ícone, ajustes de cada plataforma). Para repetir: menu **Caçamba → Configurar projeto**.
3. Abra `Assets/Cacamba/Cenas/Cacamba.unity` e aperte **Play**.

Por padrão o app liga no servidor publicado (`https://projeto-cacamba.onrender.com`).
Para jogar contra o servidor da sua máquina, rode `npm start` na raiz do
repositório e troque o campo **Servidor** da tela inicial para
`http://localhost:3000` (ou o endereço de rede que o terminal mostra, para o
celular na mesma Wi‑Fi).

## Gerar as builds

Pelo editor: **File → Build Profiles**, escolha a plataforma e **Build**.

Pela linha de comando (com o editor fechado):

```bash
"C:\Program Files\Unity\Hub\Editor\6000.0.41f1\Editor\Unity.exe" -batchmode -quit -projectPath unity -buildTarget Win64 -executeMethod Cacamba.Editor.Construir.Windows -logFile -
```

Para as outras, troque o par `-buildTarget` / `Construir.*`: `WebGL` /
`Construir.WebGL`, `Android` / `Construir.Android`, `iOS` / `Construir.IOS`.
O `-buildTarget` não é enfeite: o URP escolhe os shaders da build pela
plataforma em que o editor **abriu**, e ele reabre na última usada. Sem o
`-buildTarget`, uma WebGL gerada logo depois da de Windows saía com os
shaders do perfil de PC e a mesa ficava preta no navegador. Agora o comando
de build recusa rodar se a plataforma aberta não for a pedida.

| Plataforma | Sai em | Observação |
|---|---|---|
| Windows | `unity/Builds/Windows/Cacamba.exe` | |
| WebGL | `public/unity/` | O servidor do jogo serve em **`/unity/`**. Tem que ser o mesmo servidor: o servidor confere a origem da conexão, e uma página de outro domínio é recusada |
| Android | `unity/Builds/Android/Cacamba.apk` | Precisa do módulo Android e de um caminho sem acento (ver "O ç no caminho" abaixo). Identificador provisório: `com.cacamba.jogo` (troque em `Editor/ConfiguraProjeto.cs` antes de publicar) |
| iOS | `unity/Builds/iOS/` (projeto Xcode) | Precisa do módulo iOS; o Xcode compila num Mac |

### Limites da build WebGL

- **Renderizador "Mobile" em Forward, não Forward+.** É o perfil de qualidade
  do WebGL, do Android e do iOS (`Assets/Settings/Mobile_Renderer.asset`). No
  WebGL, o Forward+ do URP guarda a lista de luzes em texturas de inteiros e o
  navegador recusava os desenhos com *"Mismatch between texture format and
  sampler type"* — a mesa saía preta, só com o que não usa luz. O Windows
  segue no perfil "PC", com Forward+. Em Forward, a sombra da lâmpada funciona
  no navegador também.
- **Texturas em DXT**, o formato dos computadores. Celular não lê DXT: o Unity
  descomprime na hora, o que pesa em memória. Para o navegador do celular, a
  saída é uma segunda build com ASTC (File → Build Profiles → WebGL → Texture
  Compression) — ou deixar o celular com o site de sempre, que já é leve.

### Instalar o APK num celular Android

O APK sai assinado com a chave de depuração do Unity: serve para testar, não
para a Google Play (lá vai um `.aab` assinado com a sua chave — ver abaixo).

- **Sem cabo:** mande `unity/Builds/Android/Cacamba.apk` para o celular (Drive,
  e-mail, WhatsApp para você mesmo), toque no arquivo e permita "instalar
  apps desta fonte" quando o Android perguntar.
- **Com cabo** (com a depuração USB ligada nas opções de desenvolvedor):

  ```bash
  "C:\Program Files\Unity\Hub\Editor\6000.0.41f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" install -r C:\Users\SEU_USUARIO\cacamba-unity\Builds\Android\Cacamba.apk
  ```

  (pelo atalho sem acento: as ferramentas do Android não abrem caminho com "ç")

O app abre ligado no servidor publicado. Para jogar contra o servidor da sua
máquina, troque o campo **Servidor** pelo endereço de rede que o `npm start`
mostra (celular e computador na mesma Wi‑Fi).

Para a Google Play: crie uma keystore (Player Settings → Publishing Settings),
marque **Build App Bundle (Google Play)** e troque o identificador provisório
`com.cacamba.jogo`.

### O "ç" no caminho e o Android

O Unity se recusa a gerar build de Android quando o caminho do projeto tem
caractere fora do ASCII — um acento ou um "ç" em qualquer pasta acima dele,
como em `…\Documentos\caçamba\projeto-cacamba\unity`.
A saída é um **atalho de pasta** (junction) sem acento apontando para cá,
como `C:\Users\SEU_USUARIO\cacamba-unity`. É a mesma pasta, não uma cópia. Para
Android, abra o projeto no Unity Hub por esse caminho (ou passe-o em
`-projectPath`). Para criar o atalho (no Prompt de Comando):

```bash
mklink /J C:\Users\SEU_USUARIO\cacamba-unity "C:\caminho\do\repositorio\unity"
```

Para apagar o atalho sem tocar no projeto, use `rmdir C:\Users\SEU_USUARIO\cacamba-unity`
(nunca "excluir com conteúdo"). A solução definitiva é o repositório morar
num caminho sem acento e fora do OneDrive. O Gradle tem a mesma restrição, e
`Assets/Plugins/Android/gradleTemplate.properties` (`android.overridePathCheck=true`)
libera essa outra checagem.

### A build WebGL no ar

`public/unity/` está no `.gitignore` (são dezenas de MB por build). O Render
publica o que está no repositório, então para o `/unity/` existir em produção
é preciso decidir entre versionar a build (de preferência com Git LFS) ou
publicá-la por outro caminho. No servidor, a rota já está pronta: os arquivos
`.gz` saem com `Content-Encoding: gzip` e a página do Unity recebe
`'wasm-unsafe-eval'` na CSP — só ela; o resto do site segue igual.

### Testar sem ninguém no teclado

A build de Windows tem um modo de autoteste: cria uma sala, põe três robôs,
começa a partida e joga a própria vez sozinha. Com `-captura`, grava um print
e fecha:

```bash
unity\Builds\Windows\Cacamba.exe -servidor http://localhost:3000 -autoteste -captura mesa.png -tempo 25
```

Outras opções: `-autoteste -sala ABCD` entra numa sala que já existe (criada
no site, por exemplo) e joga a própria vez — é o teste de app e navegador na
mesma mesa; `-autoteste -so-sala` para no lobby; `-autoteste -tutorial` abre
o tutorial e joga sozinho, com o treinador acompanhando; `-limpa-sessao`
esquece a partida guardada e abre na tela inicial. O autoteste puxa pelo mesmo caminho
do toque no monte (o HUD), para pegar também uma interface quebrada.

## A arte

O Unity não lê WebP, WOFF2 nem SVG. A arte do site (`public/`) é convertida
para `Assets/Cacamba/` por um script — rode de novo sempre que a arte mudar:

```bash
python scripts/unity_assets.py
```

Ele gera as 55 cartas em PNG (cantos arredondados, 320×448 — múltiplo de 4,
para o Unity conseguir comprimir), os avatares do elenco, as fontes Nunito e
Paytone One em TTF e o ícone. Os modelos 3D (`.glb`, importados pelo glTFast)
são gravados **sem as imagens embutidas**: a textura de cor de cada um sai em
`Resources/TexturasModelos/`, onde o Unity a comprime por plataforma. Copiado
como veio do site, cada personagem pesava 9,5 MB na build, porque o
importador do glTF guarda as texturas sem compressão.

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `Assets/Cacamba/Scripts/Jogo.cs` | O ponto de partida: monta a mesa e a interface, liga no servidor, troca de tela |
| `Assets/Cacamba/Scripts/Rede/` | `Cliente.cs` (o protocolo do servidor, sessão, reconexão, retomada e selo da sala), `WsNativo.cs` (WebSocket dos apps) e `WsWebGL.cs` + `Plugins/WebGL/CacambaWs.jslib` (WebSocket do navegador) |
| `Assets/Cacamba/Scripts/Modelo/` | Os tipos da visão do servidor, o elenco, os emotes, os textos dos avisos e as regras que a tela precisa: acender botões, achar os jogos prontos da mão e dizer onde uma carta encaixa (`Regras.cs`, espelho de `shared/engine.js`) |
| `Assets/Cacamba/Scripts/Mesa/` | A mesa 3D: sala do boteco, mesa, cadeiras, personagens e os gestos deles, monte, descarte, jogos baixados, a câmera, os voos das cartas e o alvo da carta arrastada |
| `Assets/Cacamba/Scripts/Interface/` | As telas (UI Toolkit): início, sala (com o relógio da vez), HUD da partida com a mão de arrastar, as dicas, o relógio, o visor de jogos, o placar e o menu; `Treinador.cs` (a Lyly do tutorial) e `TelaRegras.cs` (o "Como se joga") |
| `Assets/Cacamba/Scripts/Efeitos/` | Os sons gerados (`Sons.cs`), a vibração (`Vibra.cs` + `Plugins/WebGL/CacambaAparelho.jslib`) e a chave das animações (`Movimento.cs`) |
| `Assets/Cacamba/Resources/UI/Cacamba.uss` | O estilo da interface, nas cores do site |
| `Assets/Cacamba/Editor/` | Configuração automática do projeto e os comandos de build |
| `Assets/WebGLTemplates/Cacamba/` | A página da build WebGL, sem script inline (a CSP do servidor exige) |

## O que ainda não veio do site

- **Chat de voz** (WebRTC): no Unity pede o pacote `com.unity.webrtc` e um
  servidor TURN. Por enquanto o app fica fora da voz — quem está no
  navegador continua conversando entre si.
- **Conta e loja**: em app de loja, item digital (skin) precisa da cobrança
  da própria loja (Google Play Billing / compra no app da Apple). A loja do
  site, pela Kiwify, não pode ir para os apps como está — confirme as regras
  vigentes de cada loja antes de planejar.
- Os outros sete jogos (Presidente, Dominó, Bazuca, Poker, Mexe‑Mexe,
  Canastra e Puxadinho).
- Presença ao vivo (o modelo de quem escolhe uma carta, na mesa dos outros).
