// ============================================================================
// Puxadinho — a arte. Fonte única dos desenhos do modo: as fichas dos cinco
// materiais, o chão de cada quadra e as cores. A mesa 2D (puxadinho-mesa.js),
// a 3D (puxadinho-3d.js) e a folha de conferência (puxadinho-folha.html)
// desenham daqui, para as três falarem igual.
//
// As regras de desenho estão na skill do projeto
// .claude/skills/arte-do-puxadinho/SKILL.md. Em resumo:
//  - cada material é um OBJETO de obra reconhecível pela silhueta (paralelepí-
//    pedos, monte de areia com pá, tijolo baiano de 8 furos, saco de cimento,
//    feixe de vergalhão), num quadrado de 32;
//  - três tons por material (luz, base, sombra), luz de cima à esquerda,
//    contorno na tinta da casa; nada de degradê, filtro ou id (o mesmo desenho
//    aparece muitas vezes na página e tem de ficar nítido em 18 px);
//  - a quadra é o lugar que produz aquele material, visto de cima, em tom
//    sobre tom; o material dela vai no alto, igual ao da ficha.
// Tudo é desenho próprio: nada copiado nem decalcado de outro jogo.
//
// DUAS CAMADAS (outubro de 2026, pedido do dono do jogo: "os desenhos ainda
// estão simples demais"): as peças agora são MODELADAS no Blender
// (scripts/puxadinho_blender.py) e saem renderizadas em public/assets/
// puxadinho/ — é essa a arte que a mesa 2D e as fichas mostram (`fichaHTML`,
// `imagemDoMaterial`, `imagemDaQuadra`, `svgDaQuadraRender`). Os desenhos em
// vetor abaixo continuam como a forma de cada peça em texto (a mesa 3D os
// desenha em textura de canvas, onde imagem de fora não entra) e como plano B
// enquanto o render não carrega.
// ============================================================================

import { RECURSOS, PRODUZ } from '/shared/puxadinho.js';

export const TINTA = '#231c17';

// Três tons de cada material, mais o fundo escuro da ficha e um detalhe.
export const PALETA = {
  pedra: { base: '#8e949b', luz: '#c6cbd1', sombra: '#5d636a', fundo: '#3b3f45' },
  areia: { base: '#deb96f', luz: '#f3dba3', sombra: '#ad8742', fundo: '#4a3b21', cabo: '#8a5a2b' },
  tijolo: { base: '#c7623a', luz: '#e78d5e', sombra: '#8a3b1e', fundo: '#4a2416', furo: '#45190b' },
  cimento: { base: '#d3cfc4', luz: '#efeee8', sombra: '#a09b8e', fundo: '#22394a', faixa: '#3f6f86' },
  ferro: { base: '#b06f4c', luz: '#e3a67c', sombra: '#6e3d27', fundo: '#24302e', arame: '#2a2522' },
};

// O chão de cada quadra (a cor que identifica o terreno no tabuleiro).
export const COR_DO_TERRENO = {
  pedreira: '#7f8790', areal: '#d2b276', olaria: '#a9553a', cimenteira: '#c6bfae', ferrovelho: '#4f4640', prefeitura: '#4c7660',
};

const contorno = (w = 1.3) => `stroke="${TINTA}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// ---------------------------------------------------------------------------
// Os materiais, num quadrado de 32 (viewBox 0 0 32 32)
// ---------------------------------------------------------------------------

// Um bloco em perspectiva rápida: frente, tampo (luz) e lado (sombra).
function bloco(x, y, w, h, c) {
  const p = 3;   // profundidade
  return `<path d="M${x} ${y}L${x + p} ${y - p}H${x + w + p}L${x + w} ${y}Z" fill="${c.luz}" ${contorno()}/>`
    + `<path d="M${x + w} ${y}L${x + w + p} ${y - p}V${y + h - p}L${x + w} ${y + h}Z" fill="${c.sombra}" ${contorno()}/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.base}" ${contorno()}/>`
    + `<circle cx="${x + w * 0.3}" cy="${y + h * 0.4}" r=".7" fill="${c.sombra}"/>`
    + `<circle cx="${x + w * 0.68}" cy="${y + h * 0.66}" r=".6" fill="${c.sombra}"/>`
    + `<circle cx="${x + w * 0.52}" cy="${y + h * 0.28}" r=".5" fill="${c.luz}"/>`;
}

const SOMBRA_NO_CHAO = (cy, rx) => `<ellipse cx="16" cy="${cy}" rx="${rx}" ry="1.8" fill="#000" fill-opacity=".28"/>`;

function pedra() {
  const c = PALETA.pedra;
  // três paralelepípedos: dois no chão, um em cima
  return SOMBRA_NO_CHAO(28.4, 13.5) + bloco(2, 18, 11, 9, c) + bloco(15, 19, 11, 9, c) + bloco(8.5, 10, 11, 8, c);
}

function areia() {
  const c = PALETA.areia;
  const monte = 'M3 27C5 19 10 13 16 13C22 13 27 19 29 27Z';
  return SOMBRA_NO_CHAO(27.6, 13.5)
    // a pá, fincada (o cabo passa por trás da crista)
    + `<path d="M22.4 3.6L16.4 16.5" ${contorno(3.8)} fill="none"/><path d="M22.4 3.6L16.4 16.5" stroke="${c.cabo}" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="M20.2 2.4L24.6 4.5" ${contorno(3.6)} fill="none"/><path d="M20.2 2.4L24.6 4.5" stroke="${c.cabo}" stroke-width="2" stroke-linecap="round"/>`
    + `<path d="${monte}" fill="${c.base}"/>`
    + `<path d="M16 13C22 13 27 19 29 27H18.5C20 21 19.5 16 16 13Z" fill="${c.sombra}"/>`
    + `<path d="M6.5 23.5C8.5 18.5 11.5 15.6 14.6 15" stroke="${c.luz}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`
    + `<circle cx="10.5" cy="23.8" r=".7" fill="${c.sombra}"/><circle cx="13.6" cy="20.6" r=".6" fill="${c.sombra}"/>`
    + `<circle cx="22.5" cy="23.4" r=".7" fill="${c.luz}"/><circle cx="25" cy="25.6" r=".6" fill="${c.base}"/>`
    + `<path d="${monte}" fill="none" ${contorno()}/>`
    + `<circle cx="17" cy="15.2" r="1.15" fill="#9aa0a6" ${contorno(0.8)}/>`;
}

function tijolo() {
  const c = PALETA.tijolo;
  // o tijolo baiano de 8 furos, deitado e largo: em silhueta, um retângulo
  // baixo — o saco de cimento, ao lado, é alto e estreito
  const xs = [3.45, 9.1, 14.75, 20.4];
  const ys = [13.4, 19.2];
  let furos = '';
  for (const y of ys) for (const x of xs) {
    furos += `<rect x="${x}" y="${y}" width="4.2" height="4.4" rx=".7" fill="${c.furo}" ${contorno(0.7)}/>`
      + `<path d="M${x + 0.8} ${y + 3.8}H${x + 3.4}" stroke="${c.sombra}" stroke-width=".8" stroke-linecap="round"/>`;
  }
  return SOMBRA_NO_CHAO(26.6, 14)
    + `<path d="M2 12L6 8H30L26 12Z" fill="${c.luz}" ${contorno()}/>`
    + `<path d="M26 12L30 8V21L26 25Z" fill="${c.sombra}" ${contorno()}/>`
    + `<rect x="2" y="12" width="24" height="13" fill="${c.base}" ${contorno()}/>`
    + furos;
}

function cimento() {
  const c = PALETA.cimento;
  const saco = 'M8 6.5C11 5 21 5 24 6.5C25.6 12.5 25.6 21 24 27C21 28.5 11 28.5 8 27C6.4 21 6.4 12.5 8 6.5Z';
  return SOMBRA_NO_CHAO(28.4, 11)
    + `<path d="${saco}" fill="${c.base}"/>`
    + `<path d="M21 6C22.6 6.1 23.4 6.3 24 6.5C25.6 12.5 25.6 21 24 27C23.2 27.4 22.2 27.7 21.1 27.9C22.4 21 22.4 12.5 21 6Z" fill="${c.sombra}"/>`
    + `<path d="M9.6 10C9.2 14 9.2 19 9.6 23" stroke="${c.luz}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
    + `<path d="M7.1 14.4C11 15.5 21 15.5 24.9 14.4V19.9C21 21 11 21 7.1 19.9Z" fill="${c.faixa}"/>`
    + `<rect x="13" y="15.9" width="6" height="2.7" rx=".6" fill="${c.luz}"/>`
    + `<path d="M9 8.4H23" stroke="${TINTA}" stroke-width=".8" stroke-dasharray="1.2 1" fill="none"/>`
    + `<path d="M8 6.5L6.6 5.2M24 6.5L25.4 5.2" ${contorno(1.2)} fill="none"/>`
    + `<path d="${saco}" fill="none" ${contorno()}/>`;
}

function ferro() {
  const c = PALETA.ferro;
  // três vergalhões grossos, amarrados: com quatro finos, em 18 px virava borrão
  let barras = '';
  for (const y of [9.6, 14.3, 19]) {
    barras += `<rect x="2" y="${y}" width="27" height="4" rx="2" fill="${c.base}" ${contorno(1.1)}/>`
      + `<path d="M4.2 ${y + 2}H26.8" stroke="${c.sombra}" stroke-width="2.4" stroke-dasharray=".8 1.6"/>`
      + `<path d="M4.2 ${y + 1}H26.4" stroke="${c.luz}" stroke-width=".8" stroke-linecap="round"/>`
      + `<circle cx="28.3" cy="${y + 2}" r="1.75" fill="${c.luz}" ${contorno(0.9)}/>`;
  }
  const amarra = (x) => `<rect x="${x}" y="8.7" width="2" height="15.6" rx=".8" fill="${c.arame}"/>`
    + `<path d="M${x + 0.65} 9.8V23.2" stroke="#8a827b" stroke-width=".55"/>`;
  return `<g transform="rotate(-30 16 16.5)">${SOMBRA_NO_CHAO(25.6, 14)}${barras}${amarra(8.4)}${amarra(20.4)}</g>`;
}

// A Prefeitura não é material, mas tem o seu desenho no mesmo traço.
function prefeitura() {
  return SOMBRA_NO_CHAO(28.2, 13)
    + `<path d="M16 5.6V1.2" ${contorno(1.2)}/><path d="M16 1.2H21.6V4.2H16Z" fill="#f2c14e" ${contorno(0.9)}/>`
    + `<rect x="3.5" y="24.6" width="25" height="2.8" fill="#bfc2b5" ${contorno()}/>`
    + `<rect x="6" y="12.4" width="20" height="12.2" fill="#dfe2d6" ${contorno()}/>`
    + [9, 13.2, 17.4, 21.6].map((x) => `<rect x="${x}" y="13.8" width="1.5" height="10.8" fill="#a9ad9e"/>`).join('')
    + `<path d="M4 12.6L16 5.6L28 12.6Z" fill="#eef0e8" ${contorno()}/>`
    + `<circle cx="16" cy="10" r="1.3" fill="#a9ad9e"/>`;
}

const DESENHOS = { pedra, areia, tijolo, cimento, ferro, prefeitura };

// O desenho (sem a <svg> em volta), para pôr dentro de outro SVG.
export function desenhoDoMaterial(chave) {
  return (DESENHOS[chave] || DESENHOS.pedra)();
}

// O SVG inteiro de um material, pronto para HTML ou para virar textura.
export function svgDoMaterial(chave, tam = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${tam}" height="${tam}" aria-hidden="true">${desenhoDoMaterial(chave)}</svg>`;
}

// ---------------------------------------------------------------------------
// A camada renderizada (Blender). Os arquivos saem de scripts/puxadinho_blender.py
// com estes nomes; mudou um nome lá, muda aqui.
// ---------------------------------------------------------------------------

export const urlDoMaterial = (chave) => `/assets/puxadinho/material-${chave}.webp`;
export const urlDaQuadra = (terreno) => `/assets/puxadinho/quadra-${terreno}.webp`;
// Casa e prédio na cor de cada assento (o gerador lê CORES_DE_ASSENTO em client.js).
export const urlDaPeca = (tipo, cor) => `/assets/puxadinho/peca-${tipo}-${String(cor).replace('#', '').toLowerCase()}.webp`;
// O render da quadra cobre o hexágono de raio 0,86 num quadrado de 1,72 de lado.
export const LADO_DO_RENDER_DA_QUADRA = 1.72;

// A ficha de um material em HTML: o objeto renderizado sobre o fundo escuro dele.
export function fichaHTML(r, extra = '') {
  return `<span class="px-ficha px-${r} ${extra}" style="background:${PALETA[r].fundo}" aria-hidden="true"><img src="${urlDoMaterial(r)}" alt="" decoding="async" draggable="false"></span>`;
}

// O material renderizado dentro de um SVG, num quadrado de 32 (o mesmo
// contrato de desenhoDoMaterial: quem chama escala e posiciona).
export const imagemDoMaterial = (chave) => `<image href="${urlDoMaterial(chave)}" x="0" y="0" width="32" height="32"/>`;
export const imagemDaQuadra = (terreno) => imagemDoMaterial(PRODUZ[terreno] || 'prefeitura');

// O chão renderizado de uma quadra, centrado em (0, 0) nas coordenadas do hexágono.
export function chaoDaQuadra(terreno) {
  const l = LADO_DO_RENDER_DA_QUADRA;
  return `<image href="${urlDaQuadra(terreno)}" x="${-l / 2}" y="${-l / 2}" width="${l}" height="${l}"/>`;
}

// ---------------------------------------------------------------------------
// O chão das quadras. Coordenadas do hexágono: centro em (0, 0), raio 1, de
// ponta para cima; a quadra visível vai até ~0.83 (o resto é rua) e quem chama
// recorta no contorno dela. A placa do número ocupa o meio de baixo
// (x ±0.36, y −0.05…0.51) e o desenho do material fica no alto: a textura vive
// nas bordas, em tom sobre tom, para não brigar com nenhum dos dois.
// ---------------------------------------------------------------------------

const TEXTURAS = {
  pedreira: () => {
    // degraus da lavra, em diagonal, e dois blocos soltos
    let s = '';
    for (const [k, y] of [[0, -0.55], [1, -0.18], [2, 0.2], [3, 0.58]]) {
      s += `<path d="M-1 ${y + 0.28}Q-0.2 ${y + 0.02} 1 ${y - 0.32}" stroke="#6c7279" stroke-width="0.11" fill="none" opacity="${0.9 - k * 0.1}"/>`
        + `<path d="M-1 ${y + 0.2}Q-0.2 ${y - 0.06} 1 ${y - 0.4}" stroke="#a5abb2" stroke-width="0.04" fill="none"/>`;
    }
    return s + `<rect x="0.42" y="0.12" width="0.13" height="0.11" fill="#a5abb2" stroke="${TINTA}" stroke-width="0.02"/>`
      + `<rect x="-0.6" y="-0.02" width="0.12" height="0.1" fill="#a5abb2" stroke="${TINTA}" stroke-width="0.02"/>`;
  },
  areal: () => {
    // ondas na areia e o rio do porto de areia no canto de baixo à esquerda
    let s = '';
    for (const [x, y] of [[0.42, -0.2], [0.5, 0.12], [-0.55, -0.32], [0.35, 0.42], [-0.45, -0.02]]) {
      s += `<path d="M${x - 0.13} ${y}Q${x} ${y - 0.07} ${x + 0.13} ${y}" stroke="#a9884c" stroke-width="0.035" fill="none" stroke-linecap="round"/>`;
    }
    return s + `<path d="M-1 0.02Q-0.5 0.28 -0.4 1L-1 1Z" fill="#5d8d93"/>`
      + `<path d="M-0.84 0.34Q-0.7 0.3 -0.6 0.42M-0.8 0.62Q-0.66 0.58 -0.56 0.7" stroke="#a9d0cf" stroke-width="0.03" fill="none" stroke-linecap="round"/>`;
  },
  olaria: () => {
    // tijolos secando em fileiras dos dois lados, e o forno
    let s = '';
    for (const lado of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const x = lado * (0.46 + j * 0.13) - 0.05;
          s += `<rect x="${x}" y="${-0.18 + i * 0.13}" width="0.1" height="0.06" fill="#cf7c53"/>`;
        }
      }
    }
    return s + `<circle cx="0.5" cy="-0.4" r="0.12" fill="#6b2c18" stroke="${TINTA}" stroke-width="0.025"/>`
      + `<circle cx="0.5" cy="-0.4" r="0.055" fill="#2b120a"/>`;
  },
  cimenteira: () => {
    // silos vistos de cima e a esteira
    const silo = (x, y) => `<circle cx="${x}" cy="${y}" r="0.125" fill="#dedbd3" stroke="#77736a" stroke-width="0.03"/>`
      + `<circle cx="${x}" cy="${y}" r="0.07" fill="none" stroke="#a7a398" stroke-width="0.02"/><circle cx="${x}" cy="${y}" r="0.02" fill="#77736a"/>`;
    return `<path d="M-0.5 0.26L-0.5 -0.2M0.5 0.2L0.5 -0.25" stroke="#8d897f" stroke-width="0.05"/>`
      + silo(-0.5, -0.2) + silo(-0.5, 0.26) + silo(0.5, 0.2);
  },
  ferrovelho: () => {
    // pneus, sucata e um carro velho
    const pneu = (x, y) => `<circle cx="${x}" cy="${y}" r="0.08" fill="none" stroke="#2b2420" stroke-width="0.045"/>`;
    const caco = (x, y, a, cor) => `<rect x="${x}" y="${y}" width="0.1" height="0.05" fill="${cor}" transform="rotate(${a} ${x} ${y})"/>`;
    return pneu(-0.52, -0.12) + pneu(-0.44, 0.24) + pneu(0.55, 0.3)
      + caco(-0.6, 0.48, 30, '#9b6a4f') + caco(0.42, 0.05, -20, '#4f3a2f') + caco(-0.3, -0.42, 50, '#9b6a4f') + caco(0.6, -0.05, 70, '#8a7d70')
      + `<g transform="translate(0.47 -0.36) rotate(25)"><rect x="-0.14" y="-0.07" width="0.28" height="0.14" rx="0.04" fill="#6d8794" stroke="${TINTA}" stroke-width="0.02"/>`
      + `<rect x="-0.05" y="-0.055" width="0.09" height="0.11" fill="#2e3a40"/></g>`;
  },
  prefeitura: () => {
    // a praça: caminhos cruzados e árvores nos cantos
    const arvore = (x, y) => `<circle cx="${x}" cy="${y}" r="0.1" fill="#355a47"/><circle cx="${x - 0.025}" cy="${y - 0.025}" r="0.055" fill="#5f8f73"/>`;
    return `<path d="M-0.8 -0.5L0.8 0.5M-0.8 0.5L0.8 -0.5" stroke="#bdb596" stroke-width="0.09" stroke-linecap="round"/>`
      + arvore(-0.52, -0.08) + arvore(0.52, -0.08) + arvore(-0.38, 0.52) + arvore(0.38, 0.52);
  },
};

// Onde o material vai no alto da quadra (canto de cima à esquerda e lado, em
// coordenadas do hexágono). A mesa 2D, a 3D (svgDoChao) e a folha leem daqui;
// as zonas livres do cenário no Blender (calmo() no gerador) seguem estas medidas.
export const POSICAO_DO_MATERIAL = {
  comNumero: { x: -0.31, y: -0.74, tam: 0.62 },
  semNumero: { x: -0.36, y: -0.62, tam: 0.72 },   // a Prefeitura, sem placa
};

// Um clarão atrás do material do alto: separa o desenho do chão em qualquer
// terreno (o ferro sobre o ferro-velho sumia).
export const LUZ_DO_MATERIAL = (comNumero = true) => `<ellipse cx="0" cy="${comNumero ? -0.44 : -0.28}" rx="0.36" ry="0.27" fill="#fff8e6" fill-opacity="0.15"/>`;

// O chão de uma quadra (sem o fundo liso e sem o material do alto).
export function texturaDaQuadra(terreno) {
  return (TEXTURAS[terreno] || (() => ''))();
}

// O material (ou o prédio da Prefeitura) que vai no alto da quadra.
export const desenhoDaQuadra = (terreno) => desenhoDoMaterial(PRODUZ[terreno] || 'prefeitura');

// Uma quadra inteira num SVG (para a folha de conferência e para texturas da
// 3D): hexágono de ponta para cima, chão, textura e o material no alto.
export function svgDaQuadra(terreno, { numero = 0, tam = 120, fator = 0.83, embargado = false } = {}) {
  const cantos = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(Math.cos(a) * fator).toFixed(3)},${(Math.sin(a) * fator).toFixed(3)}`;
  }).join(' ');
  const quente = numero === 6 || numero === 8;
  const placa = numero ? `<rect x="-0.36" y="-0.05" width="0.72" height="0.56" rx="0.1" fill="${quente ? '#f2c14e' : '#f5f1e6'}" stroke="rgba(0,0,0,.45)" stroke-width="0.04"/>`
    + `<text x="0" y="0.3" text-anchor="middle" font-family="Paytone One, Arial Black, sans-serif" font-size="0.34" fill="${quente ? '#5a1d0e' : '#232a33'}">${numero}</text>` : '';
  // a quadra solta precisa de id para o recorte; um sorteio evita colisão
  // quando a mesma página mostra várias (o material, sem id, não tem esse problema)
  const id = `q${Math.random().toString(36).slice(2, 8)}`;
  const p = numero ? POSICAO_DO_MATERIAL.comNumero : POSICAO_DO_MATERIAL.semNumero;
  // embargado: o mesmo das listras do tabuleiro, com chão e desenho a 70%
  const listras = embargado
    ? `<pattern id="${id}l" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.15" height="0.3" fill="#e2402e" fill-opacity="0.45"/></pattern>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.9 -0.9 1.8 1.8" width="${tam}" height="${tam}">`
    + `<defs><clipPath id="${id}"><polygon points="${cantos}"/></clipPath>${listras}</defs>`
    + `<polygon points="${cantos}" fill="${COR_DO_TERRENO[terreno]}" stroke="rgba(0,0,0,.35)" stroke-width="0.05" stroke-linejoin="round"${embargado ? ' style="filter:saturate(.55) brightness(.8)"' : ''}/>`
    + `<g opacity="${embargado ? 0.7 : 1}"><g clip-path="url(#${id})">${texturaDaQuadra(terreno)}</g>`
    + LUZ_DO_MATERIAL(numero)
    + `<g transform="translate(${p.x} ${p.y}) scale(${p.tam / 32})">${desenhoDaQuadra(terreno)}</g></g>`
    + (embargado ? `<polygon points="${cantos}" fill="url(#${id}l)"/>` : '')
    + placa + '</svg>';
}

export { RECURSOS };

// A quadra renderizada inteira (chão + material + placa), para a folha de
// conferência: a mesma montagem que a mesa 2D faz no tabuleiro.
export function svgDaQuadraRender(terreno, { numero = 0, tam = 120, fator = 0.83, embargado = false } = {}) {
  const cantos = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(Math.cos(a) * fator).toFixed(3)},${(Math.sin(a) * fator).toFixed(3)}`;
  }).join(' ');
  const quente = numero === 6 || numero === 8;
  const placa = numero ? `<rect x="-0.36" y="-0.05" width="0.72" height="0.56" rx="0.1" fill="${quente ? '#f2c14e' : '#f5f1e6'}" stroke="rgba(0,0,0,.45)" stroke-width="0.04"/>`
    + `<text x="0" y="0.3" text-anchor="middle" font-family="Paytone One, Arial Black, sans-serif" font-size="0.34" fill="${quente ? '#5a1d0e' : '#232a33'}">${numero}</text>` : '';
  const id = `r${Math.random().toString(36).slice(2, 8)}`;
  const p = numero ? POSICAO_DO_MATERIAL.comNumero : POSICAO_DO_MATERIAL.semNumero;
  const listras = embargado
    ? `<pattern id="${id}l" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.15" height="0.3" fill="#e2402e" fill-opacity="0.45"/></pattern>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.9 -0.9 1.8 1.8" width="${tam}" height="${tam}">`
    + `<defs><clipPath id="${id}"><polygon points="${cantos}"/></clipPath>${listras}</defs>`
    + `<polygon points="${cantos}" fill="${COR_DO_TERRENO[terreno]}"/>`
    + `<g opacity="${embargado ? 0.7 : 1}"${embargado ? ' style="filter:saturate(.55) brightness(.8)"' : ''}><g clip-path="url(#${id})">${chaoDaQuadra(terreno)}</g>`
    + `<g transform="translate(${p.x} ${p.y}) scale(${p.tam / 32})">${imagemDaQuadra(terreno)}</g></g>`
    + `<polygon points="${cantos}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="0.05" stroke-linejoin="round"/>`
    + (embargado ? `<polygon points="${cantos}" fill="url(#${id}l)"/>` : '')
    + placa + '</svg>';
}
