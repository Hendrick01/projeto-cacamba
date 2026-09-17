// O painel de emotes e frases prontas — o mesmo na mesa 2D e na 3D. Um botão
// abre; um toque manda e fecha. Descansa 1,5 s entre um e outro: o servidor
// também freia, mas aqui o freio é visível e ninguém acha que o botão quebrou.
import { EMOTES, FRASES, textoDoEmote } from '/shared/emotes.js';

export function montaEmotes({ botao, envia }) {
  if (!botao) return null;
  const painel = document.createElement('div');
  painel.className = 'emotes-painel'; painel.hidden = true;
  painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Emotes e frases prontas');
  const grade = document.createElement('div'); grade.className = 'emotes-grade';
  const frases = document.createElement('div'); frases.className = 'emotes-frases';
  const fecha = () => { painel.hidden = true; botao.setAttribute('aria-expanded', 'false'); };
  const escolhe = (k) => {
    fecha(); envia(k);
    painel.classList.add('descansando'); botao.disabled = true;
    setTimeout(() => { painel.classList.remove('descansando'); botao.disabled = false; }, 1500);
  };
  for (const e of EMOTES) {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = e.emoji; b.title = textoDoEmote(e); b.setAttribute('aria-label', textoDoEmote(e) || e.k);
    b.onclick = () => escolhe(e.k); grade.appendChild(b);
  }
  for (const f of FRASES) {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = f.texto; b.onclick = () => escolhe(f.k); frases.appendChild(b);
  }
  painel.append(grade, frases);
  document.body.appendChild(painel);
  botao.setAttribute('aria-haspopup', 'dialog'); botao.setAttribute('aria-expanded', 'false');
  botao.addEventListener('click', (ev) => {
    ev.stopPropagation();
    painel.hidden = !painel.hidden;
    botao.setAttribute('aria-expanded', String(!painel.hidden));
  });
  document.addEventListener('pointerdown', (ev) => { if (!painel.hidden && !painel.contains(ev.target) && ev.target !== botao) fecha(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecha(); });
  return { fecha };
}
