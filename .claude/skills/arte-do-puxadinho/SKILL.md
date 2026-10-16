---
name: arte-do-puxadinho
description: Arte do modo Puxadinho (projeto Caçamba) — modelagem no Blender, renders da mesa 2D e conferência. Aciona quando o pedido é desenhar, modelar, redesenhar, corrigir ou revisar fichas de material (pedra, areia, tijolo, cimento, ferro), quadras do tabuleiro, casas e prédios dos jogadores, a folha de arte ou os modelos GLB da mesa 3D, e quando alguém quer trazer ícones ou desenhos de fora para o modo.
model: inherit
---

# Arte do Puxadinho

O Puxadinho é o modo de tabuleiro do Caçamba: um loteamento de obra visto de
cima. A arte é toda própria porque é ela que separa o jogo do jogo de mecânica
parecida em que se inspira (`PROPOSTA-PUXADINHO.md`, documento interno) — um
desenho bonito e parecido de propósito é um problema, não uma solução.

## Onde a arte mora

As peças são **modeladas no Blender por script**: um modelo só para as duas
mesas. A 2D mostra os renders; a 3D carrega os GLB.

| Arquivo | Papel |
|---|---|
| `scripts/puxadinho_blender.py` | **Fonte das peças.** Modela tudo do zero e gera os renders e os GLB. |
| `public/assets/puxadinho/` | Renders WebP: `material-*` (fichas, 3/4), `quadra-*` (chão visto de cima), `peca-{casa,predio}-<cor>`. |
| `public/models/puxadinho/` | GLB para a 3D: materiais, quadras, casa, prédio, cone. |
| `public/puxadinho-arte.js` | Liga os renders à página: `fichaHTML` (HTML), `imagemDoMaterial`, `imagemDaQuadra`, `chaoDaQuadra` (SVG) e as URLs (`urlDoMaterial`, `urlDaQuadra`, `urlDaPeca`). Guarda `PALETA`, `COR_DO_TERRENO`, `POSICAO_DO_MATERIAL` e os desenhos em vetor antigos. |
| `public/puxadinho-mesa.js` | A mesa 2D; põe a arte no tabuleiro com `arteNoTabuleiro(markup, x, y, tam)`. |
| `public/puxadinho-3d.js` | A mesa 3D: carrega os GLB, os renders de material e importa a arte. |
| `public/puxadinho.css` | O CSS do modo inteiro; das fichas, só tamanho e moldura. |
| `public/puxadinho-folha.html` + `.js` | A folha de arte, usada no passo de conferência. |

Cada coisa abaixo tem uma fonte e cópias. Mude na fonte e acompanhe as
cópias, senão as mesas divergem:

| O quê | Fonte | Cópias que precisam acompanhar |
|---|---|---|
| Cor do chão das quadras | `COR_DO_TERRENO` em `puxadinho-arte.js` (o gerador lê) | os renders: rode o gerador |
| Cor das peças renderizadas | `mat()` em cada peça do gerador | `PALETA[r].base/luz/sombra` (vetor e reserva da 3D); o `fundo` da ficha só existe em `PALETA` |
| Cores dos jogadores | `CORES_DE_ASSENTO` em `public/client.js` (o gerador lê) | `CORES_DE_ASSENTO` em `public/mesa3d.js`; os renders `peca-*` |
| Posição do material no alto | `POSICAO_DO_MATERIAL` em `puxadinho-arte.js` | `calmo()` no gerador (zonas livres do cenário) |
| Tamanho do render da quadra | `RAIO_LOTE` no gerador | `LADO_DO_RENDER_DA_QUADRA` em `puxadinho-arte.js` (= 2 × `RAIO_LOTE`) |
| Placa do número (cor e medida) | `puxadinho.css` | `svgDaQuadra`/`svgDaQuadraRender` em `puxadinho-arte.js`, `puxadinho-3d.js` |
| Avenida e placas das revendas | `puxadinho.css` | `puxadinho-3d.js` |
| Embargo (listras, filtro, 70%) | `puxadinho-mesa.js` e `puxadinho.css` | `svgDaQuadra*` (folha) |

Os desenhos em vetor de `puxadinho-arte.js` são plano B (enquanto o render não
carrega) e a textura de canvas da 3D, onde imagem de fora não entra. Mexa neles
só para esses dois usos; chave nova vai em `DESENHOS`, senão `desenhoDoMaterial`
cai em silêncio no desenho da pedra.

Antes de renomear uma função exportada, um arquivo de render ou um GLB, rode
`grep -rn "puxadinho-arte\|assets/puxadinho\|models/puxadinho" public/` e
ajuste (ou avise o dono de) cada arquivo que aparecer.

## Identidade

- Cada material é um **objeto de obra brasileiro**, reconhecido pela silhueta:
  paralelepípedos empilhados, monte de areia com pá, tijolo baiano de 8 furos
  deitado, sacos de cimento deitados com a faixa, feixe de vergalhão amarrado.
- Cada quadra é **o lugar que produz aquele material**, visto de cima:
  Pedreira (rochas da lavra), Areal (montes e a lagoa da cava), Olaria
  (tijolos secando e o forno), Cimenteira (silos e galpão), Ferro-velho
  (pneus, sucata e carro velho), Prefeitura (praça).
- Fica de fora: mar ou ilha, floresta, trigo, ovelha, montanha de minério,
  disco bege com número vermelho, peça de madeira de jogo de tabuleiro
  clássico, emoji, e qualquer coisa decalcada de arte de outro jogo.

## Gerar as peças

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/puxadinho_blender.py -- [--so ferro,olaria] [--sem-glb] [--previa DIR]
```

Use `--so` para gerar só as chaves listadas: materiais (`pedra`…`ferro`),
quadras (`pedreira`…`ferrovelho`), `prefeitura` (é as duas coisas: refaz o
prédio e a quadra) e peças (`casa`, `predio`, `cone`; casa e prédio também
refazem os renders coloridos). Use `--sem-glb` para
não mexer nos modelos que a 3D carrega e `--previa DIR` para mandar renders e
GLB a uma pasta à parte em vez de `public/`. Rode uma geração por vez: duas
gravam os mesmos arquivos e disputam a placa de vídeo. Gerar GLB muda o que a
3D carrega, então avise quem cuida da 3D, ou use `--sem-glb`.

Pronto quando: o comando termina com `pronto em … s` e sem `Traceback`.

## Modelar ou mudar um material

1. Monte a peça em `MATERIAIS` com as formas do script (`caixa`, `cilindro`,
   `cone`, `esfera`, `toro`, `corta_abaixo`), com o pé em z = 0 e 1 unidade =
   raio do hexágono.
2. Pinte com `mat()` (a fonte da cor da peça; se a cor mudar de família,
   atualize `PALETA` junto), com ruído (`cor2`, `limiar`) e relevo para dar
   matéria. O ruído só existe no render: o GLB leva a cor
   principal (`cor_para_o_glb` solta o nó antes de exportar; sem isso o
   material chegava branco na 3D). Metal alto escurece a peça (ela reflete o
   fundo): o vergalhão só leu como aço com metal 0,15 e cinza claro.
3. Disco ou cone chato vai com `liso=False`. Sombreado suave num disco vira
   uma bola.
4. Deixe a câmera, a luz e o contorno com o script: `enquadra()` ajusta a
   câmera à silhueta projetada (pela diagonal 3D, o objeto ficava pequeno na
   ficha), a luz vem de cima à esquerda da tela e o Freestyle traça o contorno
   na tinta da casa.
5. Material novo: nome novo em `MATERIAIS`, fundo de ficha de **matiz
   próprio** em `PALETA`, o nome do arquivo igual ao que `urlDoMaterial`
   espera e o desenho em vetor em `DESENHOS` (ver acima).

Pronto quando: na folha, a ficha de 18 px se reconhece pela forma e pela cor,
e a silhueta preta não se confunde com nenhuma das outras.

## Modelar ou mudar uma quadra

1. Monte o cenário em `QUADRAS` sobre `chao()`: hexágono de raio
   `RAIO_LOTE` (0,86), ponta para +Y (o "para cima" da mesa 2D). A câmera é
   ortográfica, de cima, com o sol baixo para a sombra dar profundidade.
2. Deixe o meio de baixo (placa do número) e o alto (o material que a 2D põe
   por cima) livres: a função `calmo()` diz onde, e `pontos_livres()` respeita
   isso. O cenário mora nas laterais.
3. Plano raso que encosta na borda (como o caminho da Prefeitura) passa por
   `corta_hex()` para não vazar do lote.
4. Mantenha os chãos distinguíveis entre si. Os dois cinzas se separam por
   valor e temperatura: a Pedreira é média e fria, a Cimenteira é clara e quente.

Pronto quando: na fileira "Quadras no tamanho do celular" da folha, o número
lê de primeira, o material se destaca do chão da própria quadra, e a olaria
embargada continua legível.

## Peso

Mantenha os renders em ~250 KB no total e os GLB em ~1,2 MB, nenhum arquivo
acima de 250 KB: a 3D baixa tudo no celular. O GLB sai da malha de "viewport",
então ponha subdivisão alta só no render (`render_levels`) e o detalhe que só
serve ao render em `SO_NO_RENDER`.

Pronto quando: `du -ch public/assets/puxadinho public/models/puxadinho` não
passa de ~1,6 MB (o `du` conta blocos: uns 80 KB a mais que os bytes) e `find public/assets/puxadinho public/models/puxadinho -size +250k`
não lista nada.

## Conferir (antes de dizer que ficou pronto)

1. Rode a checagem de sintaxe dos quatro arquivos e depois os testes:
   ```bash
   for f in public/puxadinho-arte.js public/puxadinho-mesa.js public/puxadinho-3d.js public/puxadinho-folha.js; do node --check "$f" || echo "FALHOU: $f"; done
   ```
   Depois, `npm test` (ele não testa a arte, só confirma que o resto não
   quebrou). Pronto quando: nenhum `FALHOU` e os testes passam.
2. Suba o servidor `puxadinho` do `.claude/launch.json` (porta 3031). Os
   arquivos de `/assets/` e `/models/` têm cache de 5 minutos: antes de olhar,
   rode no navegador `fetch(url, {cache: 'reload'})` para cada render ou GLB
   que mudou e recarregue a página. Abra `/puxadinho-folha.html` e tire captura das fichas de 18 a
   96 px, da linha de silhuetas e das quadras, inclusive a embargada. Pronto
   quando: os critérios de "pronto" das seções de material e de quadra valem
   para tudo o que mudou.
3. Na mesa 2D, com a tela em 375×812:
   - crie uma sala Puxadinho com 3 robôs e amplie o tabuleiro (quadras, casas e
     prédios);
   - confira a mão, o modal **Trocar** nas duas abas e uma oferta;
   - cancele a oferta no fim.

   Pronto quando: há captura de cada um, sem desenho cortado, borrado ou sumido.
4. Se mudou GLB, render de material (a 3D o usa nas revendas) ou desenho em
   vetor que a 3D usa em textura, suba
   `puxadinho-3d` (porta 3033, outro processo: as salas do 3031 não existem
   lá), crie uma sala Puxadinho com 3 robôs e toque no botão 3D da mesa.
   Pronto quando: há captura do tabuleiro 3D com a arte nova.
5. Navegue pelos alvos do tabuleiro 2D com Tab. Pronto quando: o foco aparece
   em cada um.

## Trazer desenho de fora

Só com pedido do dono do jogo, que vende skins. A licença precisa permitir uso
comercial:
- **Pode:** ISC ou MIT (Lucide, Tabler, Phosphor) e CC0 (Kenney).
- **Só com tela de créditos no jogo:** CC BY (game-icons.net), que exige
  "Icons made by {autor}" visível. Se o jogo não tiver essa tela, criá-la faz
  parte do trabalho.
- **Evite:** Remix Icon (o README fala numa licença própria e o pacote npm
  diz Apache-2.0) e OpenMoji (CC BY-SA obriga a liberar os derivados).

Copie só o arquivo usado e abra para confirmar que não tem script nem link
externo. Registre origem, autor e licença em `CREDITOS-ARTE.md` na raiz
(crie o arquivo se não existir). Para arte, nada de pacote npm nem CDN.

Pronto quando: o arquivo está dentro de `public/`, sem `<script>` nem `href`
externo, `CREDITOS-ARTE.md` tem uma linha com origem, autor e licença dele e,
se a licença for CC BY, a tela de créditos do jogo mostra o crédito.
