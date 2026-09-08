"""Prepara um modelo já SENTADO segurando cartas (Meshy, sem rig) para a mesa.
Uso: python3 scripts/prepara_sentado.py entrada.glb saida.glb [--altura 1.45] [--cabeca 0.85] [--tri 32000]
Roda test/modelo-prepara.mjs duas vezes: a primeira normaliza (altura, pés no chão, texturas,
triângulos); daí mede onde estão as mãos (a saliência mais à frente entre 42 % e 62 % da altura)
e a segunda injeta MaoEsq/MaoDir nessa posição e Cabeca na fração pedida. Só NumPy.
"""
import argparse, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from glb_utils import *

RAIZ = Path(__file__).resolve().parent.parent
PREPARA = RAIZ / 'test' / 'modelo-prepara.mjs'

def maos_de(path):
    g = GLB(path); j = g.j
    no = next(n for n in j['nodes'] if 'mesh' in n); esc = float(no.get('scale', [1])[0]); desl = np.array(no.get('translation', [0, 0, 0]), float)
    P = np.vstack([g.read(p['attributes']['POSITION']) for m in j['meshes'] for p in m['primitives']]).astype(float) * esc + desl
    lo, hi = P.min(0), P.max(0); alt = hi[1] - lo[1]
    # a faixa do peito: abaixo dela os JOELHOS são o ponto mais à frente de quem está sentado
    faixa = P[(P[:, 1] > lo[1] + 0.58 * alt) & (P[:, 1] < lo[1] + 0.75 * alt)]
    frente = faixa[faixa[:, 2] > np.percentile(faixa[:, 2], 95)]
    esq = frente[frente[:, 0] > np.median(frente[:, 0])].mean(0); dir_ = frente[frente[:, 0] <= np.median(frente[:, 0])].mean(0)
    # a pinça: onde as duas mãos convergem — os vértices da frente entre os centros das mãos
    meio = frente[(frente[:, 0] > min(esq[0], dir_[0]) + 0.3 * abs(esq[0] - dir_[0])) & (frente[:, 0] < max(esq[0], dir_[0]) - 0.3 * abs(esq[0] - dir_[0]))]
    pinca = meio.mean(0) if len(meio) >= 5 else (esq + dir_) / 2
    # a mesa põe o pivô do leque 3,5 cm acima do meio dos dois nós: o par desce para o pé das
    # cartas encostar na pinça, e recua 1 cm para os dedos ficarem à frente da base do leque
    alvo = pinca + np.array([0, -0.035, -0.01]); desl = alvo - (esq + dir_) / 2
    return esq + desl, dir_ + desl, alt

def prepara(src, dst, altura, cabeca, tri):
    with tempfile.TemporaryDirectory() as tmp:
        meio = Path(tmp) / 'meio.glb'
        subprocess.run(['node', str(PREPARA), src, str(meio), '--tri', str(tri), '--altura', str(altura), '--cabeca', str(cabeca)], check=True, capture_output=True)
        esq, dir_, alt = maos_de(meio)
        maos = '%.3f,%.3f,%.3f' % ((esq[0] - dir_[0]) / 2, (esq[1] + dir_[1]) / 2, (esq[2] + dir_[2]) / 2)
        r = subprocess.run(['node', str(PREPARA), src, dst, '--tri', str(tri), '--altura', str(altura), '--cabeca', str(cabeca), '--maos', maos], check=True, capture_output=True, text=True)
    # o prepara simetriza as mãos (±x); as mãos de um modelo posado raramente são simétricas
    g = GLB(dst)
    for n in g.j['nodes']:
        if n['name'] == 'MaoEsq': n['translation'] = [round(float(v), 4) for v in esq]
        if n['name'] == 'MaoDir': n['translation'] = [round(float(v), 4) for v in dir_]
    g.write(dst)
    print('%s: altura %.2f m, mãos esq %s, dir %s (a %.0f%% da altura, %.0f cm entre elas)' % (Path(dst).name, alt, np.round(esq, 2).tolist(), np.round(dir_, 2).tolist(), 100 * (esq[1] + dir_[1]) / 2 / alt, 100 * abs(esq[0] - dir_[0])))
    print(r.stdout.strip().splitlines()[-1][:160])

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--altura', type=float, default=1.45); ap.add_argument('--cabeca', type=float, default=0.85); ap.add_argument('--tri', type=int, default=32000)
    a = ap.parse_args(); prepara(a.src, a.dst, a.altura, a.cabeca, a.tri)
