// Funcoes puras do acabamento visual. Nao conhecem malha, rig ou partida.
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const finito = (v, fallback) => Number.isFinite(v) ? v : fallback;
export function faseVisual(id = '') {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
export function pulsoPiscar(segundos, fase = 0) {
  fase = clamp(finito(fase, 0), 0, 1);
  const periodo = 4.3 + fase * 2;
  let t = (finito(segundos, 0) + fase * periodo) % periodo;
  if (t < 0) t += periodo;
  if (t >= 0.18) return 0;
  const p = t < 0.065 ? t / 0.065 : (0.18 - t) / 0.115;
  return p * p * (3 - 2 * p);
}
// Damping independente da taxa de quadros. Uma mudanca externa renova o alvo;
// o valor aplicado no quadro anterior nunca vira o novo alvo por acidente.
export function criaTransicaoCamera() {
  let estado = null;
  return function passo({ y, z, aspecto = 1, dt = 0, reduzido = false }) {
    y = finito(y, 1.2); z = clamp(finito(z, 1.35), 1.35, 2.6);
    aspecto = Math.max(0.01, finito(aspecto, 1));
    if (!estado || Math.abs(aspecto - estado.aspecto) > 0.001 || reduzido) {
      estado = { y, z, alvoY: y, alvoZ: z, aspecto };
    } else {
      if (Math.abs(y - estado.y) > 1e-6) estado.alvoY = y;
      if (Math.abs(z - estado.z) > 1e-6) estado.alvoZ = z;
      const a = 1 - Math.exp(-clamp(finito(dt, 0), 0, 0.1) / 0.22);
      estado.y += (estado.alvoY - estado.y) * a;
      estado.z += (estado.alvoZ - estado.z) * a;
    }
    return { y: estado.y, z: estado.z };
  };
}
// A geometria/atlas unico nao permite inferir pele, roupa e acessorio.
// So especializa materiais com nomes explicitos; nunca modifica a cor/mapa.
export function acabamentoMaterial(nome = '', transparente = false) {
  const n = String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (transparente && /glass|lens|vidro|lente/.test(n)) return { roughness: 0.16, metalness: 0, envMapIntensity: 0.38 };
  if (/\b(metal|steel|chrome|cromo|prata|aco)\b/.test(n.replace(/[_-]/g, ' '))) {
    return { roughness: 0.34, metalness: 0.65, envMapIntensity: 0.42 };
  }
  if (/leather|couro/.test(n)) return { roughness: 0.55, metalness: 0, envMapIntensity: 0.3 };
  if (/cloth|fabric|tecido|algodao/.test(n)) return { roughness: 0.9, metalness: 0, envMapIntensity: 0.2 };
  return { roughness: 0.78, metalness: 0, envMapIntensity: 0.3 };
}
export function graoVisual(tamanho = 128, semente = 17) {
  if (!Number.isInteger(tamanho) || tamanho < 2 || tamanho > 256) throw new RangeError('Tamanho de textura invalido');
  const dados = new Uint8Array(tamanho * tamanho * 4);
  let s = semente >>> 0;
  for (let i = 0; i < dados.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const v = 112 + (s >>> 27);
    dados[i] = dados[i + 1] = dados[i + 2] = v;
    dados[i + 3] = 255;
  }
  return dados;
}
export function contatoVisual(tamanho = 64) {
  if (!Number.isInteger(tamanho) || tamanho < 2 || tamanho > 256) throw new RangeError('Tamanho de textura invalido');
  const dados = new Uint8Array(tamanho * tamanho * 4);
  for (let y = 0; y < tamanho; y++) for (let x = 0; x < tamanho; x++) {
    const r = Math.hypot((x + 0.5) / tamanho * 2 - 1, (y + 0.5) / tamanho * 2 - 1);
    dados[(y * tamanho + x) * 4 + 3] = Math.round(255 * Math.max(0, 1 - r) ** 2);
  }
  return dados;
}
