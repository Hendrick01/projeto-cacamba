// O painel de emotes e frases prontas — o mesmo na mesa 2D, na 3D e na sala de
// espera. Os emotes ficam numa RODA, como a do Capote (princípio, não arte):
// oito setores em volta de um centro que fecha; as frases, em fichas embaixo.
// Um toque manda e fecha. Descansa 1,5 s entre um e outro: o servidor também
// freia, mas aqui o freio é visível e ninguém acha que o botão quebrou.
import { EMOTES, FRASES, textoDoEmote } from '/shared/emotes.js';

export function montaEmotes({ botao, envia }) {
  if (!botao) return null;
  const fundo = document.createElement('div');
  fundo.className = 'emotes-fundo'; fundo.hidden = true;
  const painel = document.createElement('div');
  painel.className = 'emotes-painel';
  painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Emotes e frases prontas');
  const roda = document.createElement('div'); roda.className = 'emotes-roda';
  const frases = document.createElement('div'); frases.className = 'emotes-frases';
  const fecha = () => { fundo.hidden = true; botao.setAttribute('aria-expanded', 'false'); };
  const escolhe = (k) => {
    fecha(); envia(k);
    botao.disabled = true;
    setTimeout(() => { botao.disabled = false; }, 1500);
  };
  EMOTES.forEach((e, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'emotes-setor';
    // a posição na roda vai por propriedade (CSSOM): a CSP do jogo não deixa
    // estilo embutido no HTML, mas deixa o script acertar a propriedade
    b.style.setProperty('--ang', `${(360 / EMOTES.length) * i}deg`);
    b.textContent = e.emoji; b.title = textoDoEmote(e); b.setAttribute('aria-label', textoDoEmote(e) || e.k);
    b.onclick = () => escolhe(e.k); roda.appendChild(b);
  });
  const centro = document.createElement('button'); centro.type = 'button'; centro.className = 'emotes-centro';
  centro.textContent = '✕'; centro.setAttribute('aria-label', 'Fechar'); centro.onclick = fecha; roda.appendChild(centro);
  for (const f of FRASES) {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = f.texto; b.onclick = () => escolhe(f.k); frases.appendChild(b);
  }
  painel.append(roda, frases);
  fundo.appendChild(painel);
  document.body.appendChild(fundo);
  botao.setAttribute('aria-haspopup', 'dialog'); botao.setAttribute('aria-expanded', 'false');
  botao.addEventListener('click', (ev) => {
    ev.stopPropagation();
    fundo.hidden = !fundo.hidden;
    botao.setAttribute('aria-expanded', String(!fundo.hidden));
  });
  fundo.addEventListener('pointerdown', (ev) => { if (ev.target === fundo) fecha(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecha(); });
  return { fecha };
}
