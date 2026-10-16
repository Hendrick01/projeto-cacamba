// ============================================================================
// Puxadinho — a arte. Liga as peças modeladas no Blender
// (scripts/puxadinho_blender.py) às duas mesas: as URLs dos renders WebP
// (public/assets/puxadinho/), a ficha HTML, os pedaços de SVG do tabuleiro 2D,
// a folha de conferência, e as medidas e cores que a 2D, a 3D e o gerador
// compartilham (PALETA, COR_DO_TERRENO, POSICAO_DO_MATERIAL).
//
// As regras de arte (identidade, modelagem, conferência) estão na skill do
// projeto .claude/skills/arte-do-puxadinho. Tudo é desenho próprio: nada
// copiado nem decalcado de outro jogo.
//
// Os desenhos em vetor de antes (outubro de 2026) saíram: a 2D e a 3D passaram
// a usar os renders, e ninguém mais os chamava.
// ============================================================================

import { PRODUZ } from '/shared/puxadinho.js';

// Três tons de cada material (a cor dos renders mora no gerador; estes
// acompanham, para a reserva da 3D) e o fundo escuro da ficha, que só existe aqui.
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

// O material renderizado dentro de um SVG, num quadrado de 32: quem chama
// escala e posiciona (ver arteNoTabuleiro na mesa 2D).
export const imagemDoMaterial = (chave) => `<image href="${urlDoMaterial(chave)}" x="0" y="0" width="32" height="32"/>`;
export const imagemDaQuadra = (terreno) => imagemDoMaterial(PRODUZ[terreno] || 'prefeitura');

// O chão renderizado de uma quadra, centrado em (0, 0) nas coordenadas do hexágono.
export function chaoDaQuadra(terreno) {
  const l = LADO_DO_RENDER_DA_QUADRA;
  return `<image href="${urlDaQuadra(terreno)}" x="${-l / 2}" y="${-l / 2}" width="${l}" height="${l}"/>`;
}

// Onde o material vai no alto da quadra (canto de cima à esquerda e lado, em
// coordenadas do hexágono). A mesa 2D, a 3D e a folha leem daqui;
// as zonas livres do cenário no Blender (calmo() no gerador) seguem estas medidas.
export const POSICAO_DO_MATERIAL = {
  comNumero: { x: -0.31, y: -0.74, tam: 0.62 },
  semNumero: { x: -0.36, y: -0.62, tam: 0.72 },   // a Prefeitura, sem placa
};

// Um clarão atrás do material do alto: separa o desenho do chão em qualquer
// terreno (o ferro sobre o ferro-velho sumia).
export const LUZ_DO_MATERIAL = (comNumero = true) => `<ellipse cx="0" cy="${comNumero ? -0.44 : -0.28}" rx="0.36" ry="0.27" fill="#fff8e6" fill-opacity="0.15"/>`;

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
