// A folha de conferência da arte do Puxadinho (puxadinho-folha.html). Arquivo
// à parte porque a política de segurança do servidor não roda script embutido.
import { RECURSOS, NOME_DO_RECURSO } from '/shared/puxadinho.js';
import { fichaHTML, urlDoMaterial, svgDaQuadraRender as svgDaQuadra } from '/puxadinho-arte.js';

const tamanhos = [18, 26, 30, 44, 96];
const fichas = document.getElementById('fichas');
fichas.append(Object.assign(document.createElement('span'), { textContent: '' }));
for (const t of tamanhos) fichas.append(Object.assign(document.createElement('span'), { className: 'rot', textContent: `${t} px` }));
for (const r of RECURSOS) {
  fichas.append(Object.assign(document.createElement('span'), { className: 'rot', textContent: NOME_DO_RECURSO[r] }));
  for (const t of tamanhos) {
    // a ficha do jogo, a mesma de fichaHTML, só que em vários tamanhos
    const caixa = document.createElement('span');
    caixa.innerHTML = fichaHTML(r);
    const f = caixa.firstElementChild;
    f.style.width = `${t}px`; f.style.height = `${t}px`; f.style.borderRadius = `${Math.round(t * 0.24)}px`;
    fichas.append(f);
  }
}

const sil = document.getElementById('silhuetas');
for (const r of RECURSOS) {
  const it = document.createElement('div');
  it.className = 'item';
  it.innerHTML = `<span class="silhueta"><img src="${urlDoMaterial(r)}" width="26" height="26" alt=""></span><span class="silhueta"><img src="${urlDoMaterial(r)}" width="44" height="44" alt=""></span>${NOME_DO_RECURSO[r]}`;
  sil.append(it);
}

const exemplos = [['pedreira', 8], ['areal', 6], ['olaria', 10], ['cimenteira', 4], ['ferrovelho', 9], ['prefeitura', 0]];
// no celular de 375 px o tabuleiro tem ~32 px por raio: a quadra de raio 0,9 cabe em ~58 px
for (const [t, n] of exemplos) {
  document.getElementById('quadras-real').insertAdjacentHTML('beforeend', `<div class="item">${svgDaQuadra(t, { numero: n, tam: 58 })}</div>`);
  document.getElementById('quadras').insertAdjacentHTML('beforeend', `<div class="item">${svgDaQuadra(t, { numero: n, tam: 170 })}${t}</div>`);
}
// embargado pelo fiscal: o número tem de continuar legível
document.getElementById('quadras-real').insertAdjacentHTML('beforeend', `<div class="item">${svgDaQuadra('olaria', { numero: 6, tam: 58, embargado: true })}</div>`);
document.getElementById('quadras').insertAdjacentHTML('beforeend', `<div class="item">${svgDaQuadra('olaria', { numero: 6, tam: 170, embargado: true })}olaria embargada</div>`);
