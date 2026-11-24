using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Cacamba.Editor
{
    /// <summary>
    /// Deixa o projeto pronto para abrir e gerar builds, sem clicar em nada:
    /// materiais-base, a cena do jogo, as configurações de cada plataforma e o
    /// ícone. Roda sozinho na primeira vez que o editor abre o projeto (quando a
    /// cena ainda não existe) e pode ser repetido pelo menu Caçamba.
    ///
    /// Pela linha de comando:
    ///   Unity -batchmode -quit -projectPath unity -executeMethod Cacamba.Editor.ConfiguraProjeto.Configurar
    /// </summary>
    [InitializeOnLoad]
    public static class ConfiguraProjeto
    {
        public const string Cena = "Assets/Cacamba/Cenas/Cacamba.unity";
        const string PastaMateriais = "Assets/Cacamba/Resources/Materiais";
        public const string Identificador = "com.cacamba.jogo";

        static ConfiguraProjeto()
        {
            if (Application.isBatchMode) return;
            EditorApplication.delayCall += () =>
            {
                if (!File.Exists(Cena)) Configurar();
            };
        }

        [MenuItem("Caçamba/Configurar projeto")]
        public static void Configurar()
        {
            CriaMateriais();
            CriaPainel();
            CriaCena();
            AjustaPlayer();
            AssetDatabase.SaveAssets();
            Debug.Log("[caçamba] projeto configurado");
        }

        // ------------------------------------------------------------ materiais

        static void CriaMateriais()
        {
            Directory.CreateDirectory(PastaMateriais);
            var simples = Shader.Find("Universal Render Pipeline/Simple Lit");
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var unlit = Shader.Find("Universal Render Pipeline/Unlit");

            var carta = Mat("Carta", simples, Color.white, 0.25f);
            carta.SetFloat("_AlphaClip", 1f);
            carta.SetFloat("_Cutoff", 0.5f);
            carta.SetFloat("_Cull", (float)CullMode.Back);
            Prepara(carta);

            Prepara(Mat("Personagem", simples, Color.white, 0.12f));
            Prepara(Mat("Feltro", lit, new Color(0.09f, 0.33f, 0.24f), 0.05f));
            Prepara(Mat("Madeira", lit, new Color(0.36f, 0.23f, 0.14f), 0.38f));
            Prepara(Mat("Chao", lit, Color.white, 0.3f));
            Prepara(Mat("Parede", lit, new Color(0.55f, 0.36f, 0.24f), 0.1f));

            // Brilho: sem luz e transparente — o anel da vez, a sombra de contato e o bulbo.
            var brilho = Mat("Brilho", unlit, Color.white, 0f);
            brilho.SetFloat("_Surface", 1f);
            brilho.SetFloat("_Blend", 0f);
            brilho.SetFloat("_ZWrite", 0f);
            Prepara(brilho);
        }

        static Material Mat(string nome, Shader shader, Color cor, float lisura)
        {
            string caminho = $"{PastaMateriais}/{nome}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(caminho);
            if (m == null)
            {
                m = new Material(shader) { name = nome };
                AssetDatabase.CreateAsset(m, caminho);
            }
            else if (m.shader != shader) m.shader = shader;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", cor);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", lisura);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
            return m;
        }

        /// <summary>Acerta palavras-chave, fila e blend a partir das propriedades (como o inspetor faz).</summary>
        static void Prepara(Material m)
        {
            BaseShaderGUI.SetMaterialKeywords(m);
            EditorUtility.SetDirty(m);
        }

        // ------------------------------------------------------------ painel da interface

        /// <summary>
        /// O painel da UI Toolkit já com o tema. Criado em tempo de execução, ele
        /// nascia sem tema e o Unity avisava "No Theme Style Sheet" antes de o
        /// jogo conseguir atribuir um.
        /// </summary>
        static void CriaPainel()
        {
            const string caminho = "Assets/Cacamba/Resources/UI/Painel.asset";
            var painel = AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.PanelSettings>(caminho);
            if (painel == null)
            {
                painel = ScriptableObject.CreateInstance<UnityEngine.UIElements.PanelSettings>();
                AssetDatabase.CreateAsset(painel, caminho);
            }
            painel.themeStyleSheet = AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.ThemeStyleSheet>("Assets/Cacamba/Resources/UI/TemaPadrao.tss");
            painel.scaleMode = UnityEngine.UIElements.PanelScaleMode.ScaleWithScreenSize;
            painel.referenceResolution = new Vector2Int(1280, 720);
            painel.screenMatchMode = UnityEngine.UIElements.PanelScreenMatchMode.MatchWidthOrHeight;
            painel.match = 0.5f;
            painel.sortingOrder = 10;
            EditorUtility.SetDirty(painel);
        }

        // ------------------------------------------------------------ cena

        static void CriaCena()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Cena));
            if (!File.Exists(Cena))
            {
                var cena = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var go = new GameObject("Caçamba");
                go.AddComponent<Jogo>();
                EditorSceneManager.SaveScene(cena, Cena);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Cena, true) };
        }

        // ------------------------------------------------------------ player

        static void AjustaPlayer()
        {
            PlayerSettings.companyName = "Caçamba";
            PlayerSettings.productName = "Caçamba";
            PlayerSettings.bundleVersion = "0.1.0";
            PlayerSettings.runInBackground = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;

            foreach (var alvo in new[] { NamedBuildTarget.Android, NamedBuildTarget.iOS, NamedBuildTarget.Standalone, NamedBuildTarget.WebGL })
                PlayerSettings.SetApplicationIdentifier(alvo, Identificador);

            // Celular: qualquer orientação — a mesa se arruma em pé e deitada.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = true;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;

            // Android: IL2CPP + ARM64 (exigência da Google Play), internet obrigatória.
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel23;
            PlayerSettings.Android.forceInternetPermission = true;

            // iOS: o projeto Xcode sai daqui; compilar exige um Mac com Xcode.
            PlayerSettings.iOS.targetOSVersionString = "13.0";
            PlayerSettings.iOS.appleEnableAutomaticSigning = true;

            // Windows: janela redimensionável.
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.resizableWindow = true;

            // WebGL: servido pelo próprio servidor do jogo em /unity/, com gzip
            // de verdade (Content-Encoding) e o modelo de página sem script inline,
            // que é o que a CSP do servidor aceita.
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.nameFilesAsHashes = false;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.template = "PROJECT:Cacamba";

            var icone = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Cacamba/Icone/icone.png");
            if (icone != null) PlayerSettings.SetIcons(NamedBuildTarget.Unknown, new[] { icone }, IconKind.Any);
        }
    }

    /// <summary>
    /// Builds pela linha de comando, uma por plataforma — sempre com o
    /// -buildTarget da mesma plataforma, para o editor já abrir nela:
    ///   -buildTarget Win64   -executeMethod Cacamba.Editor.Construir.Windows
    ///   -buildTarget WebGL   -executeMethod Cacamba.Editor.Construir.WebGL     (vai para ../public/unity, servido pelo jogo)
    ///   -buildTarget Android -executeMethod Cacamba.Editor.Construir.Android   (precisa do módulo Android no Unity Hub)
    ///   -buildTarget iOS     -executeMethod Cacamba.Editor.Construir.IOS       (precisa do módulo iOS; o Xcode compila num Mac)
    /// </summary>
    public static class Construir
    {
        public static void Windows() => Gera(BuildTarget.StandaloneWindows64, "Builds/Windows/Cacamba.exe");
        public static void WebGL() => Gera(BuildTarget.WebGL, "../public/unity");
        public static void Android() => Gera(BuildTarget.Android, "Builds/Android/Cacamba.apk");
        public static void IOS() => Gera(BuildTarget.iOS, "Builds/iOS");

        static string NomeNaLinhaDeComando(BuildTarget alvo) => alvo switch
        {
            BuildTarget.StandaloneWindows64 => "Win64",
            BuildTarget.WebGL => "WebGL",
            BuildTarget.Android => "Android",
            BuildTarget.iOS => "iOS",
            _ => alvo.ToString(),
        };

        static void Gera(BuildTarget alvo, string saida)
        {
            // O URP escolhe quais shaders entram na build pelos níveis de qualidade
            // da plataforma ATIVA no editor — e não da plataforma pedida. Aberto em
            // outra (o editor reabre na última usada), a build sai com os shaders
            // errados: a WebGL feita logo depois da de Windows levou só os do
            // perfil "PC" (Forward+) e a mesa ficou preta no navegador. Por isso a
            // plataforma tem que ser a ativa antes de começar.
            var grupo = BuildPipeline.GetBuildTargetGroup(alvo);
            if (EditorUserBuildSettings.activeBuildTarget != alvo)
            {
                if (Application.isBatchMode)
                {
                    Debug.LogError($"[caçamba] build {alvo}: o editor abriu em {EditorUserBuildSettings.activeBuildTarget}. " +
                                   $"Rode de novo com -buildTarget {NomeNaLinhaDeComando(alvo)} junto do -executeMethod.");
                    EditorApplication.Exit(1);
                    return;
                }
                if (!EditorUserBuildSettings.SwitchActiveBuildTarget(grupo, alvo))
                {
                    Debug.LogError($"[caçamba] build {alvo}: não deu para trocar a plataforma ativa (o módulo está instalado?).");
                    return;
                }
            }

            ConfiguraProjeto.Configurar();
            var opcoes = new BuildPlayerOptions
            {
                scenes = new[] { ConfiguraProjeto.Cena },
                locationPathName = saida,
                target = alvo,
                targetGroup = grupo,
                options = BuildOptions.None,
            };
            var r = BuildPipeline.BuildPlayer(opcoes);
            var s = r.summary;
            Debug.Log($"[caçamba] build {alvo}: {s.result}, {s.totalSize / (1024f * 1024f):0.0} MB, {s.totalErrors} erro(s), em {saida}");
            if (Application.isBatchMode) EditorApplication.Exit(s.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 1);
        }
    }
}
