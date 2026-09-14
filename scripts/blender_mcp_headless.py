# Sobe o servidor MCP do Blender sem interface: o repositorio de extensoes
# "lab_blender_org" sumiu das preferencias (o add-on continua no disco), entao
# ele e' registrado so' nesta sessao. Nada e' salvo em userpref.blend.
import sys, traceback
import bpy

prefs = bpy.context.preferences
mods = [r.module for r in prefs.extensions.repos]
print("REPOS_ANTES", mods, flush=True)
if "lab_blender_org" not in mods:
    r = prefs.extensions.repos.new(
        name="Blender Lab", module="lab_blender_org", custom_directory="",
        remote_url="https://extensions.blender.org/lab/api/v1/extensions/")
    r.enabled = True
    print("REPO_ADICIONADO", r.module, r.directory, flush=True)

try:
    bpy.ops.preferences.addon_enable(module="bl_ext.lab_blender_org.mcp")
except Exception:
    traceback.print_exc()

print("ADDONS", [k for k in prefs.addons.keys() if "mcp" in k], flush=True)

from bl_ext.lab_blender_org.mcp import mcp_to_blender_server, execute_blocking
mcp_to_blender_server.start("localhost", 9876)
print("MCP_NO_AR 9876", flush=True)
sys.stdout.flush()
execute_blocking.run()
