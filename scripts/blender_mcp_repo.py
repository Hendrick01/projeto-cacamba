"""Devolve o repositório de extensões da Blender Lab às preferências do Blender.

O add-on MCP continua no disco (extensions/lab_blender_org/mcp), mas o crash
levou o registro do repositório junto com o userpref.blend — sem ele o Blender
nem carrega o add-on, e a porta 9876 nunca abre. Isto reinscreve o repositório,
liga o add-on e SALVA as preferências.

Uso (com o Blender FECHADO, senão ele reescreve o userpref.blend ao sair):
    /Applications/Blender.app/Contents/MacOS/Blender --background --online-mode \
        --python scripts/blender_mcp_repo.py
"""
import bpy

MODULO = "lab_blender_org"
URL = "https://lab.blender.org/"
ADDON = "bl_ext.lab_blender_org.mcp"

prefs = bpy.context.preferences
repos = prefs.extensions.repos

repo = next((r for r in repos if r.module == MODULO), None)
if repo is None:
    repo = repos.new(name="Blender Lab", module=MODULO, custom_directory="", remote_url=URL)
    print("REPOSITORIO_ADICIONADO", repo.module, repo.directory)
else:
    print("REPOSITORIO_JA_EXISTIA", repo.module)

repo.enabled = True
if hasattr(repo, "use_remote_url"):
    repo.use_remote_url = True
repo.remote_url = URL

bpy.ops.preferences.addon_enable(module=ADDON)

# Autostart é o padrão do add-on, mas deixa explícito: é ele que abre a 9876
# sozinho quando o Blender abre, sem depender de clique nenhum.
a = prefs.addons.get(ADDON)
if a:
    a.preferences.use_autostart = True

bpy.ops.wm.save_userpref()

print("ADDON_LIGADO", ADDON in prefs.addons)
print("AUTOSTART", a.preferences.use_autostart if a else "?")
print("PREFERENCIAS_SALVAS")
