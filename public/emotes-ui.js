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
  painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true'); painel.setAttribute('aria-label', 'Emotes e frases prontas');
  const roda = document.createElement('div'); roda.className = 'emotes-roda';
  const frases = document.createElement('div'); frases.className = 'emotes-frases';
  // Fechar devolve o foco ao botão que abriu — só se ele estava no painel:
  // um toque fora não tem por que puxar o foco de onde o jogador está.
  const fecha = () => {
    if (fundo.hidden) return;
    const estavaDentro = painel.contains(document.activeElement);
    fundo.hidden = true; botao.setAttribute('aria-expanded', 'false');
    if (estavaDentro) botao.focus();
  };
  const escolhe = (k) => {
    fecha(); envia(k);
    // botão desabilitado perde o foco; ele volta quando o descanso acaba
    const tinhaFoco = document.activeElement === botao;
    botao.disabled = true;
    setTimeout(() => {
      botao.disabled = false;
      if (tinhaFoco && (document.activeElement === document.body || !document.activeElement)) botao.focus();
    }, 1500);
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
    if (!fundo.hidden) return fecha();
    fundo.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    roda.querySelector('button')?.focus();
  });
  fundo.addEventListener('pointerdown', (ev) => { if (ev.target === fundo) fecha(); });
  document.addEventListener('keydown', (ev) => {
    if (fundo.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); fecha(); return; }
    // o Tab dá a volta dentro do painel
    if (ev.key !== 'Tab') return;
    const bs = [...painel.querySelectorAll('button')];
    const primeiro = bs[0], ultimo = bs[bs.length - 1];
    const dentro = painel.contains(document.activeElement);
    if (ev.shiftKey && (!dentro || document.activeElement === primeiro)) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && (!dentro || document.activeElement === ultimo)) { ev.preventDefault(); primeiro.focus(); }
  });
  return { fecha };
}
