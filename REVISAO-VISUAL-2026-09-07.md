# Polimento visual independente do rig

Base: `62319a81a0c3c4e79dac24edd751dfbe56ed1b8c`.
Solicitacao: executar as melhorias visuais enquanto Matheus resolve os dedos.

## Implementado

- Luz de preenchimento mais neutra, luz principal quente moderada e recorte
  discreto, sem adicionar mapa de sombra. Mantido o boteco e seus objetos.
- Acabamento distinto apenas para materiais explicitamente nomeados como
  tecido, couro, metal e vidro. Atlas unico desconhecido permanece neutro.
  Cor, textura, UV, geometria e transparencia originais sao preservadas.
- Relevo procedural pequeno no feltro/piso, e contato suave sob os assentos.
  As tres texturas novas medem 128x128, 128x128 e 64x64; sao reutilizadas.
- Transicao de altura/recuo da camera independente de FPS; preservado o teto
  de 2,6 m, sem zoom em jogadas. Mudanca de orientacao aplica o enquadramento
  imediatamente. Paralaxe horizontal limitada a 18 cm.
- Micromovimento adicional somente na cabeca reconhecida, inferior a 0,3 grau,
  sem alterar tronco, pelve, bracos, maos ou dedos. A pose e restaurada apos o
  desenho e nao acumula rotacoes entre quadros. Reacoes existentes prevalecem.
- Piscadas somente quando o arquivo ja oferece morphs compativeis e eles nao
  sao usados pelos clips. Nao cria palpebras nem simula uma piscada inexistente.
- Provador com o mesmo tratamento de luz/material, sem animacao adicional ou
  alteracao da camera orbital, para manter estavel a conferencia do rig.
- Respeito a prefers-reduced-motion. Contatos removidos quando o assento sai;
  rotina dispose restaura materiais/luzes e libera os recursos adicionados.

## Integracao e limites de escopo

As paginas carregam `mesa3d-visual.js` e `provador-visual.js`. Esses modulos
inicializam o jogo/provador existente e instalam `visual3d.js` pelos contextos
publicos ja presentes no projeto. Os callbacks da Scene sao encadeados,
nao substituimos WebGLRenderer.render nem criamos outro loop de animacao.

Nao foram alterados `dedos3d.js`, `interacao3d.js`, `modelo3d.js`, os GLBs,
clips, pesos, personagens, regras, cartas, servidor ou chat de voz. Nao houve
regeneracao de personagens, consumo de geracao na Fal ou deploy.

Os ajustes sentados existentes foram preservados. Esta camada nao corrige
interpenetracao anatomica, nao e nova escultura e nao substitui o ajuste de
ombro/cotovelo/punho no rig. O relevo de superficie nao e nova geometria.

## Validacao

Executado no ambiente local: 15 testes das funcoes puras, todos aprovados;
checagem de sintaxe dos quatro modulos novos e dos testes.

Adicionados 9 testes de integracao da Scene com o Three.js ja versionado no
repositorio: restauracao de pose, preservacao de dedos/maos, materiais, camera
orbital, liberacao de recursos e callbacks. Eles nao foram executados neste
ambiente local, que nao conseguiu baixar o vendor e os assets do repositorio.
O workflow visual-qa executa esses testes, a suite completa e test:security.
Consultar o resultado efetivo no PR; incluir o workflow nao significa que passou.

Sem validacao visual final em navegador com os GLBs, sem medicao de FPS em
hardware real e sem teste de iPhone. Por isso, entregar como PR de revisao,
sem merge automatico ou alteracao do servico publicado.

## Conferencia visual antes de publicar

Abrir a mesa com 2 e 7 jogadores, em retrato e paisagem. Conferir rosto, feltro,
leitura das cartas, contatos e transicao ao redimensionar. No provador, alternar
personagens e estilos e testar o GLB com os dedos corrigidos. Para inspecao:

```js
window.mesa3d.visual.diagnostico();
window.provador.visual.diagnostico();
```

Os numeros retornados sao contadores do renderer, nao uma medicao de FPS.
