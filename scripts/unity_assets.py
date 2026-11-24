"""Copia a arte do jogo web para o projeto Unity, nos formatos que o Unity lê.

O Unity não importa WebP, WOFF2 nem SVG. Este script parte sempre da arte que
o site serve (public/) e grava em unity/Assets/Cacamba/, de modo que a mesma
carta, a mesma fonte e o mesmo personagem aparecem nas duas versões. Rode de
novo sempre que a arte de public/ mudar:

    python scripts/unity_assets.py

Requer: Pillow, fontTools, brotli e resvg-py (pip install pillow fonttools brotli resvg-py).
"""
from __future__ import annotations

import io
import json
import shutil
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PUBLIC = RAIZ / "public"
DESTINO = RAIZ / "unity" / "Assets" / "Cacamba"
RECURSOS = DESTINO / "Resources"

ELENCO = ["gabizinsky", "dri", "esterex", "matheus", "mafra-kitty", "junior", "lyly", "mufasa"]


def cantos_arredondados(img: Image.Image, raio_frac: float = 0.06) -> Image.Image:
    """Recorta os cantos da carta com antisserrilhado (máscara desenhada a 4x)."""
    img = img.convert("RGBA")
    w, h = img.size
    escala = 4
    raio = int(round(w * raio_frac)) * escala
    mascara = Image.new("L", (w * escala, h * escala), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, w * escala - 1, h * escala - 1), radius=raio, fill=255)
    mascara = mascara.resize((w, h), Image.LANCZOS)
    img.putalpha(mascara)
    return img


def cartas() -> int:
    pasta = RECURSOS / "Cartas"
    pasta.mkdir(parents=True, exist_ok=True)
    n = 0
    for origem in sorted((PUBLIC / "assets" / "baralho").glob("*.webp")):
        img = Image.open(origem)
        # 320×450 → 320×448: a compressão de textura (DXT/ETC/ASTC) trabalha
        # em blocos de 4 px, e com 450 de altura o Unity desistia de comprimir
        # — cada carta pesava 750 KB na build. Um pixel a menos em cima e
        # embaixo, na moldura de papel, não aparece.
        w, h = img.size
        if h % 4:
            sobra = h % 4
            img = img.crop((0, sobra // 2, w, h - (sobra - sobra // 2)))
        img = cantos_arredondados(img)
        img.save(pasta / f"{origem.stem}.png", optimize=True)
        n += 1
    return n


def svg_para_png(svg: Path, destino: Path, largura: int | None = None, altura: int | None = None) -> None:
    import resvg_py

    dados = resvg_py.svg_to_bytes(svg_path=str(svg), width=largura, height=altura)
    Image.open(io.BytesIO(bytes(dados))).save(destino, optimize=True)


def personagens() -> int:
    pasta = RECURSOS / "Personagens"
    pasta.mkdir(parents=True, exist_ok=True)
    n = 0
    for slug in ELENCO:
        base = PUBLIC / "assets" / "personagens"
        svg_para_png(base / f"{slug}-avatar.svg", pasta / f"{slug}-avatar.png", largura=256)
        n += 1
    return n


def fontes() -> int:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    pasta = RECURSOS / "Fontes"
    pasta.mkdir(parents=True, exist_ok=True)
    origem = PUBLIC / "fonts"

    # A Nunito do site é variável (pesos 200–1000); o jogo usa 700–900. O Unity
    # lê o arquivo variável na instância padrão, que é fina demais, então fixa
    # aqui o peso 800 — o mesmo do texto corrido do site.
    nunito = TTFont(origem / "nunito-latin.woff2")
    nunito.flavor = None
    if "fvar" in nunito:
        nunito = instancer.instantiateVariableFont(nunito, {"wght": 800})
    nunito.save(pasta / "Nunito-ExtraBold.ttf")

    paytone = TTFont(origem / "paytone-one-latin.woff2")
    paytone.flavor = None
    paytone.save(pasta / "PaytoneOne.ttf")

    shutil.copyfile(origem / "LICENCA-OFL.txt", pasta / "LICENCA-OFL.txt")
    return 2


def glb_sem_imagens(origem: Path, destino: Path, textura: Path, lado_max: int = 1024) -> None:
    """Grava o .glb sem as imagens embutidas e a textura de cor num arquivo à parte.

    Por quê: o importador do glTF guarda as texturas do modelo sem compressão,
    e cada personagem (cor + relevo, 1024 px cada) pesava 9,5 MB na build. O
    app só usa a cor, então ela sai como arquivo próprio — que o Unity
    comprime por plataforma — e o modelo fica só com malha e nós.
    """
    b = origem.read_bytes()
    jlen = struct.unpack_from("<I", b, 12)[0]
    gltf = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from("<I", b, off)[0]
    binario = b[off + 8: off + 8 + blen]

    def trecho(bv: dict) -> bytes:
        inicio = bv.get("byteOffset", 0)
        return binario[inicio:inicio + bv["byteLength"]]

    # a textura de cor (baseColorTexture) do primeiro material que tiver uma
    indice = next((m["pbrMetallicRoughness"]["baseColorTexture"]["index"]
                   for m in gltf.get("materials", [])
                   if m.get("pbrMetallicRoughness", {}).get("baseColorTexture")), None)
    if indice is not None:
        imagem = gltf["images"][gltf["textures"][indice]["source"]]
        img = Image.open(io.BytesIO(trecho(gltf["bufferViews"][imagem["bufferView"]]))).convert("RGB")
        if max(img.size) > lado_max:
            img.thumbnail((lado_max, lado_max), Image.LANCZOS)
        img.save(textura, optimize=True)

    # refaz o buffer sem os trechos das imagens, renumerando os bufferViews
    das_imagens = {i["bufferView"] for i in gltf.get("images", []) if "bufferView" in i}
    novo, mapa, views = bytearray(), {}, []
    for i, bv in enumerate(gltf.get("bufferViews", [])):
        if i in das_imagens:
            continue
        while len(novo) % 4:
            novo.append(0)
        copia = dict(bv)
        copia["byteOffset"] = len(novo)
        copia["buffer"] = 0
        novo += trecho(bv)
        mapa[i] = len(views)
        views.append(copia)
    for acessor in gltf.get("accessors", []):
        if "bufferView" in acessor:
            acessor["bufferView"] = mapa[acessor["bufferView"]]
        if "sparse" in acessor:
            raise ValueError(f"{origem.name}: acessor esparso não suportado")
    gltf["bufferViews"] = views
    while len(novo) % 4:
        novo.append(0)
    gltf["buffers"] = [{"byteLength": len(novo)}]
    for chave in ("images", "textures", "samplers"):
        gltf.pop(chave, None)
    for m in gltf.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        pbr.pop("baseColorTexture", None)
        pbr.pop("metallicRoughnessTexture", None)
        for chave in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            m.pop(chave, None)

    texto = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(texto) % 4:
        texto += b" "
    total = 12 + 8 + len(texto) + 8 + len(novo)
    destino.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(texto), 0x4E4F534A) + texto
        + struct.pack("<II", len(novo), 0x004E4942) + bytes(novo)
    )


def modelos() -> int:
    pasta = RECURSOS / "Modelos"
    texturas = RECURSOS / "TexturasModelos"
    pasta.mkdir(parents=True, exist_ok=True)
    texturas.mkdir(parents=True, exist_ok=True)
    n = 0
    for nome in [*ELENCO, "copo", "pod"]:
        origem = PUBLIC / "models" / f"{nome}.glb"
        if origem.exists():
            glb_sem_imagens(origem, pasta / f"{nome}.glb", texturas / f"{nome}.png")
            n += 1
    return n


def icone() -> int:
    pasta = DESTINO / "Icone"
    pasta.mkdir(parents=True, exist_ok=True)
    svg_para_png(PUBLIC / "icon.svg", pasta / "icone.png", largura=1024)
    return 1


def main() -> int:
    if not (RAIZ / "unity" / "Assets").is_dir():
        print("Projeto Unity não encontrado em unity/.", file=sys.stderr)
        return 1
    print(f"cartas: {cartas()}")
    print(f"personagens: {personagens()}")
    print(f"fontes: {fontes()}")
    print(f"modelos: {modelos()}")
    print(f"ícone: {icone()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
