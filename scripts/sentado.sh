#!/bin/sh
# Modelo sentado do Meshy (sem rig) -> arquivo da mesa com rig da cintura para cima e dedos.
# Uso: scripts/sentado.sh ~/Downloads/3D-sentados/<slug>.glb public/models/<slug>.glb [--altura 1.45]
#   1. scripts/rig_sentado.py (Blender headless): esqueleto Mixamo pela geometria + pesos automáticos
#   2. scripts/rig_sentado_eixos.py: palma/lateral e eixo de cada falange (o que dedos3d.js lê)
#   3. test/modelo-prepara.mjs: nós Cabeca/MaoEsq/MaoDir, texturas 1024 px, 32 mil triângulos
set -e
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
fonte=$1; saida=$2; shift 2
altura=1.45; de_blender=0
while [ $# -gt 0 ]; do case "$1" in --altura) altura=$2; shift 2;; --de-blender) de_blender=1; shift;; *) echo "opção desconhecida: $1" >&2; exit 2;; esac; done
[ -f "$fonte" ] || { echo "fonte não existe: $fonte" >&2; exit 2; }
tmp=$(mktemp -d)
# --de-blender: a fonte já é o GLB exportado do Blender com o rig ajustado à mão (pula o passo 1)
if [ $de_blender = 1 ]; then cp "$fonte" "$tmp/rig.glb"; else
"$BLENDER" --background --python scripts/rig_sentado.py -- "$fonte" "$tmp/rig.glb" --altura "$altura" 2>&1 | grep -E "malha:|marcos|grupos sem|Error|Traceback"; fi
PYTHONPATH=scripts python3 scripts/rig_sentado_eixos.py "$tmp/rig.glb" "$tmp/eixos.glb"
node test/modelo-prepara.mjs "$tmp/eixos.glb" "$saida" --tri 32000 --altura "$altura" | tail -1
rm -rf "$tmp"
