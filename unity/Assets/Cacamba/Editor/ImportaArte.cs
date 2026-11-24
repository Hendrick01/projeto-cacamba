using UnityEditor;
using UnityEngine;

namespace Cacamba.Editor
{
    /// <summary>
    /// Ajusta a importação da arte que o scripts/unity_assets.py copia do site.
    /// Cartas: sem redimensionar para potência de 2 (a carta é 320×450 e
    /// esticar deformaria o desenho), com mipmap para não cintilar deitada na
    /// mesa e com transparência nos cantos arredondados.
    /// </summary>
    public sealed class ImportaArte : AssetPostprocessor
    {
        // Mudar as regras abaixo não reimporta nada sozinho: o Unity só refaz um
        // arquivo quando ele muda — ou quando esta versão muda. Suba o número a
        // cada mudança de regra.
        public override uint GetVersion() => 3;

        void OnPreprocessTexture()
        {
            var imp = (TextureImporter)assetImporter;
            string p = assetPath.Replace('\\', '/');
            if (p.Contains("/Cacamba/Resources/Cartas/"))
            {
                // Fora de potência de 2 o Unity deixava a carta sem compressão em
                // algumas plataformas (750 KB cada na build WebGL). Na potência
                // mais próxima (256×512) ela comprime em todas, com "crunch" por
                // cima; quem desenha estica de volta para a proporção da carta.
                imp.textureType = TextureImporterType.Default;
                imp.npotScale = TextureImporterNPOTScale.ToNearest;
                imp.mipmapEnabled = true;
                imp.wrapMode = TextureWrapMode.Clamp;
                imp.alphaIsTransparency = true;
                imp.sRGBTexture = true;
                imp.maxTextureSize = 512;
                imp.anisoLevel = 4;
                imp.textureCompression = TextureImporterCompression.Compressed;
                imp.crunchedCompression = true;
                imp.compressionQuality = 75;
            }
            else if (p.Contains("/Cacamba/Resources/TexturasModelos/"))
            {
                // a cor de cada personagem (e do copo e do pod), extraída do .glb
                imp.textureType = TextureImporterType.Default;
                imp.mipmapEnabled = true;
                imp.wrapMode = TextureWrapMode.Clamp;
                imp.sRGBTexture = true;
                imp.maxTextureSize = 1024;
                imp.anisoLevel = 2;
                imp.textureCompression = TextureImporterCompression.Compressed;
                imp.crunchedCompression = true;
                imp.compressionQuality = 70;
            }
            else if (p.Contains("/Cacamba/Resources/Personagens/"))
            {
                imp.textureType = TextureImporterType.Default;
                imp.npotScale = TextureImporterNPOTScale.None;
                imp.mipmapEnabled = false;
                imp.wrapMode = TextureWrapMode.Clamp;
                imp.alphaIsTransparency = true;
                imp.maxTextureSize = 1024;
                imp.textureCompression = TextureImporterCompression.CompressedHQ;
            }
            else if (p.Contains("/Cacamba/Icone/"))
            {
                imp.textureType = TextureImporterType.Default;
                imp.npotScale = TextureImporterNPOTScale.None;
                imp.mipmapEnabled = false;
                imp.alphaIsTransparency = true;
                imp.isReadable = true;
                imp.textureCompression = TextureImporterCompression.Uncompressed;
            }
        }
    }
}
