"""Pinta de vermelho só as massas de naipe de uma carta de copas ou ouros.

O problema: a carta é toda preta, e o naipe GRANDE quase sempre encosta no
traço do gato — vira um componente conexo só com o bicho, então não dá para
separar por componente. Foi o que a medição mostrou: no Ás de copas, o coração
e o gato são uma massa de 211x227.

A saída é gabarito. Todo carta traz, no canto de cima, um naipe pequeno e
LIMPO: é o índice, e ele nunca encosta em nada. Esse virou o molde. Com ele a
gente varre a carta em várias escalas procurando onde a mesma forma aparece —
inclusive grudada no gato — e pinta só os pixels de tinta que caem dentro da
silhueta do molde. O gato que cruza por cima continua preto porque o desenho
original o desenha com o miolo branco: onde ele passa, não há tinta de naipe.
"""
import numpy as np
from PIL import Image

def rotula(mask):
    h, w = mask.shape
    pai = [0]
    def raiz(a):
        while pai[a] != a:
            pai[a] = pai[pai[a]]; a = pai[a]
        return a
    rot = np.zeros((h, w), np.int32); ant = []
    for y in range(h):
        d = np.diff(np.concatenate(([0], mask[y].view(np.int8), [0])))
        atual = []
        for a, b in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
            viz = [r for (ra, rb, r) in ant if ra <= b and a <= rb]
            if viz:
                eu = min(raiz(v) for v in viz)
                for v in viz:
                    rv = raiz(v)
                    if rv != eu: pai[max(rv, eu)] = min(rv, eu)
            else:
                pai.append(len(pai)); eu = len(pai) - 1
            rot[y, a:b] = eu; atual.append((a, b, eu))
        ant = atual
    return np.array([raiz(i) for i in range(len(pai))], np.int32)[rot]

def molde_do_canto(tinta):
    """O naipe do índice, que vira molde de tudo.

    No canto de cima moram duas coisas: o NÚMERO em cima e o NAIPE embaixo.
    Escolher pela área falha — no Rei de ouros o "K" é maior que o losango, e o
    detector saía caçando K pela carta inteira e pintando a letra de vermelho.
    O que não falha é a posição: o naipe é sempre o de BAIXO. O preenchimento
    entra só como peneira grossa (letra é vazada, naipe é massa).
    """
    h, w = tinta.shape
    rot = rotula(tinta)
    cand = []
    for i in np.unique(rot):
        if i == 0: continue
        m = rot == i
        ys, xs = np.where(m)
        if ys.mean() > h * 0.32 or xs.mean() > w * 0.28: continue
        y0, y1, x0, x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
        bh, bw = y1-y0, x1-x0
        if bh < 10 or bw < 10 or m.sum() < 80: continue
        cheio = m.sum() / (bh * bw)
        if cheio < 0.42: continue
        if not (0.55 < bw / bh < 1.9): continue
        cand.append((ys.mean(), m[y0:y1, x0:x1]))
    if not cand: return None
    cand.sort(key=lambda c: -c[0])          # o mais baixo é o naipe
    return cand[0][1]

def _corr(campo, nucleo):
    """Correlação por FFT: soma do núcleo sob cada posição."""
    fh, fw = campo.shape; nh, nw = nucleo.shape
    H, W = fh + nh, fw + nw
    F = np.fft.rfft2(campo.astype(np.float32), (H, W))
    K = np.fft.rfft2(nucleo[::-1, ::-1].astype(np.float32), (H, W))
    return np.fft.irfft2(F * K, (H, W))[nh-1:nh-1+fh, nw-1:nw-1+fw]

def encolhe(m, r=1):
    return ~dilata(~m, r)

def abre(m, r):
    """Abertura: encolhe e devolve. Some com traço FINO e deixa massa GROSSA.

    É o que separa o naipe do bicho quando os dois viraram um componente só:
    o coração tem 40 px de miolo e sobrevive a encolher 10; o contorno do gato
    tem 3 px de espessura e desaparece.
    """
    return dilata(encolhe(m, r), r)

def dilata(m, r=1):
    s = m.copy()
    for _ in range(r):
        p = np.pad(s, 1, constant_values=False)
        s = (p[:-2,1:-1] | p[2:,1:-1] | p[1:-1,:-2] | p[1:-1,2:] |
             p[:-2,:-2] | p[:-2,2:] | p[2:,:-2] | p[2:,2:] | s)
    return s

def _norm(sub, n=44):
    im = Image.fromarray((sub * 255).astype('uint8'))
    return np.array(im.resize((n, n), Image.BILINEAR)) > 110

def _iou(A, B):
    return (A & B).sum() / max(1, (A | B).sum())

def mascara_de_naipe(cinza, limiar=140, folga=(0.80, 0.70, 0.72)):
    """A máscara dos naipes, em dois estágios.

    Estágio 1 — o naipe SOLTO, que é a maioria. O componente conexo já é o
    naipe inteiro, então basta comparar a forma com um molde. Três coisas que a
    medição obrigou a fazer aqui:

      · o molde entra nas DUAS rotações. O naipe do canto de baixo é o de cima
        girado meia volta, e coração girado não é coração — sem isso, todas as
        26 cartas ficavam com o índice de baixo preto;
      · a comparação é tolerante (0,66), porque a arte é desenhada à mão e dois
        corações da mesma carta não são o mesmo coração;
      · os acertos viram molde novo. É o que pega as variações: o coração que o
        gato segura é diferente do coração do índice, mas é parecido com algum
        dos que já casaram.

    Estágio 2 — o naipe GRUDADO no gato, que não é componente próprio (no Ás de
    copas, coração e bicho são uma massa só de 211x227). Aí vale a correlação,
    mas só dentro daquela massa e só para naipe GRANDE: procurar no cartão
    inteiro é o que fazia o K de ouros virar vermelho.
    """
    tinta = cinza < limiar
    molde = molde_do_canto(tinta)
    if molde is None:
        return np.zeros_like(tinta), 0
    base = max(molde.shape)
    origem = [_norm(molde), _norm(molde[::-1, ::-1])]
    moldes = list(origem)

    rot = rotula(tinta)
    pecas = []
    for i in np.unique(rot):
        if i == 0: continue
        m = rot == i
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
        bh, bw = y1-y0, x1-x0
        area = m.sum()
        if area < 60: continue
        pecas.append((m, y0, y1, x0, x1, area, bh, bw))

    saida = np.zeros_like(tinta); achados = 0
    casou = [False] * len(pecas)
    for _volta in range(3):                       # os acertos viram molde novo
        novos = []
        for k, (m, y0, y1, x0, x1, area, bh, bw) in enumerate(pecas):
            if casou[k]: continue
            if not (0.55 < bw/bh < 1.9) or area/(bh*bw) < 0.40: continue
            # A peneira que a FORMA não dá: TAMANHO.
            #
            # Varrendo as 26 cartas, forma sozinha não separa — o coração mais
            # torto (h4, h7, h6) desce a 0,685, e a pinta do manto sobe a 0,679.
            # Não existe corte entre os dois. Mas existe entre os tamanhos: todo
            # impostor mede de 8 a 18 px, e todo naipe de verdade mede 32 ou
            # mais. E isso não é coincidência da arte, é a construção da carta —
            # o naipe do índice é o MENOR naipe que a carta tem, então nada
            # abaixo dele pode ser naipe.
            if max(bh, bw) < base * 0.62: continue
            f = _norm(m[y0:y1, x0:x1])
            if any(_iou(f, t) > 0.66 for t in moldes):
                casou[k] = True; saida |= m; achados += 1
                # Trava de deriva: o acerto só vira molde novo se ele mesmo
                # ainda se parecer com o naipe ORIGINAL. Sem isso a corrente
                # anda — foi assim que o K de ouros acabou vermelho.
                if any(_iou(f, t) > 0.60 for t in origem):
                    novos.append(f)
        if not novos: break
        moldes.extend(novos)

    for k, (m, y0, y1, x0, x1, area, bh, bw) in enumerate(pecas):
        if casou[k] or area < base * base * 1.2: continue
        recorte = tinta[y0:y1, x0:x1]; daqui = m[y0:y1, x0:x1]
        melhores = []
        for esc in np.geomspace(0.9, 6.5, 20):
            mh = int(round(molde.shape[0]*esc)); mw = int(round(molde.shape[1]*esc))
            if mh < 16 or mh > recorte.shape[0] or mw > recorte.shape[1]: continue
            T = np.array(Image.fromarray((molde*255).astype('uint8')).resize((mw,mh), Image.BILINEAR)) > 110
            # A prova de forma do estágio 2, e é a mesma do estágio 1 em
            # outra roupa: não basta a silhueta do molde estar CHEIA de tinta
            # (dentro), é preciso que quase não sobre tinta em volta, dentro da
            # janela. O anel fino não bastava — o lobo do gorro do Valete e a
            # faixa do manto da Dama enchem o molde e transbordam para além do
            # anel, e por isso viravam naipe.
            caixa = np.ones((mh, mw), bool)
            dentro_n = _corr(recorte, T)
            caixa_n = _corr(recorte, caixa)
            sobra = caixa_n - dentro_n
            d_ = dentro_n / T.sum()
            j_ = dentro_n / (T.sum() + sobra)          # união dentro da janela
            n_ = _corr(daqui, T) / T.sum()
            bom = (d_ > folga[0]) & (j_ > folga[1]) & (n_ > folga[2])
            for y, x in zip(*np.where(bom)):
                melhores.append((float(j_[y,x]), mh, mw, int(y), int(x), T))
        melhores.sort(key=lambda t: -(t[0] * t[1] * t[2]))
        fica = []
        for nota, mh, mw, y, x, T in melhores:
            if any(abs(y-py) < (mh+ph)*0.34 and abs(x-px) < (mw+pw)*0.34
                   for _, ph, pw, py, px in fica):
                continue
            # Prova de forma DEPOIS do casamento: pega a tinta que está na
            # janela, tira o traço fino por abertura e compara o que sobrou com
            # o molde. É o que reprova o lobo do gorro do Valete — ele enche o
            # molde e passa na correlação, mas o que sobra dele depois da
            # abertura é uma gota, e gota não é coração (0,53 contra 0,66).
            jan = recorte[y:y+mh, x:x+mw]
            if jan.shape != (mh, mw): continue
            r_ab = max(2, mh // 7)
            nucleo = abre(jan, r_ab)
            if not nucleo.any(): continue
            ys2, xs2 = np.where(nucleo)
            forma = _norm(nucleo[ys2.min():ys2.max()+1, xs2.min():xs2.max()+1])
            # O molde entra ABERTO no mesmo raio. Comparar núcleo aberto com
            # molde inteiro era injusto justamente com OUROS, que é a forma de
            # cantos vivos: a abertura os arredonda, a semelhança despencava e
            # o losango que o Valete segura ficava preto.
            alvoT = abre(T, r_ab)
            if not alvoT.any(): continue
            ya, xa = np.where(alvoT)
            molde_ab = _norm(alvoT[ya.min():ya.max()+1, xa.min():xa.max()+1])
            if _iou(forma, molde_ab) < 0.72: continue
            fica.append((T, mh, mw, y, x))
        for T, mh, mw, y, x in fica:
            yy, xx = min(recorte.shape[0], y+mh), min(recorte.shape[1], x+mw)
            saida[y0:y1, x0:x1][y:yy, x:xx] |= dilata(T,1)[:yy-y, :xx-x]
            achados += 1

        # Segunda chance para o naipe que a correlação não pegou: abre a massa
        # grudada inteira e vê se algum caroço tem cara de naipe. É assim que a
        # copa que o gato do 6 SEGURA aparece — ela encosta na pata, some como
        # componente, e a correlação não a acha porque a pata come um pedaço.
        for caroco_r in (max(3, int(base * 0.22)),):
            nucleos = abre(m[y0:y1, x0:x1], caroco_r)
            if not nucleos.any(): continue
            rot2 = rotula(nucleos)
            for j2 in np.unique(rot2):
                if j2 == 0: continue
                c = rot2 == j2
                ys2, xs2 = np.where(c)
                cy0, cy1, cx0, cx1 = ys2.min(), ys2.max()+1, xs2.min(), xs2.max()+1
                if max(cy1-cy0, cx1-cx0) < base * 0.62: continue
                if saida[y0:y1, x0:x1][c].mean() > 0.3: continue      # já é vermelho
                forma = _norm(c[cy0:cy1, cx0:cx1])
                if not any(_iou(forma, t) > 0.66 for t in moldes): continue
                saida[y0:y1, x0:x1] |= c
                achados += 1

    # O número da carta nunca vira naipe. Ele mora nos dois cantos e é vazado
    # (preenche ~0,33 da própria caixa, contra ~0,5 do ouros e ~0,68 das copas):
    # é assim que o "10" e o "K" ficam de fora, aconteça o que acontecer acima.
    h, w = tinta.shape
    for m, y0, y1, x0, x1, area, bh, bw in pecas:
        if area / (bh * bw) >= 0.42: continue
        cy, cx = (y0 + y1) / 2 / h, (x0 + x1) / 2 / w
        canto = (cy < 0.28 and cx < 0.30) or (cy > 0.72 and cx > 0.70)
        if canto: saida &= ~m

    return saida & dilata(tinta, 1), achados
