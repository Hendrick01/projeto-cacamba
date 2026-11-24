using System;
using UnityEngine;

namespace Cacamba.Efeitos
{
    /// <summary>
    /// A vibração do aparelho, em pulsos curtos (a vez chegou, o tempo está
    /// acabando, a jogada foi recusada). No Android fala direto com o Vibrator do
    /// sistema, que aceita duração em milissegundos — o Handheld.Vibrate() do
    /// Unity só sabe dar um tranco de meio segundo. No navegador usa
    /// navigator.vibrate (Android; o iPhone não tem). No iOS nativo só o tranco
    /// longo existe sem plugin, então ele fica para os avisos fortes.
    /// </summary>
    public static class Vibra
    {
        const string Chave = "cacamba-vibra";
        static bool? ligada;

        public static bool Ligada
        {
            get => ligada ??= PlayerPrefs.GetInt(Chave, 1) == 1;
            set
            {
                ligada = value;
                PlayerPrefs.SetInt(Chave, value ? 1 : 0);
                PlayerPrefs.Save();
            }
        }

        /// <summary>Faz sentido oferecer o botão de vibração neste aparelho?</summary>
        public static bool Disponivel =>
            Application.isMobilePlatform || Application.platform == RuntimePlatform.WebGLPlayer;

        /// <summary>Um pulso de `ms` milissegundos (15–30 é um toque leve; 60–120, um aviso).</summary>
        public static void Pulso(int ms)
        {
            if (!Ligada || ms <= 0) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            try { PulsoAndroid(ms); }
            catch (Exception)
            {
                // Sem o Vibrator (aparelho estranho): o tranco do Unity, só nos avisos.
                // Esta chamada também é o que faz o Unity pedir a permissão VIBRATE.
                if (ms >= 60) Handheld.Vibrate();
            }
#elif UNITY_IOS && !UNITY_EDITOR
            if (ms >= 60) Handheld.Vibrate();
#elif UNITY_WEBGL && !UNITY_EDITOR
            try { CacambaVibrar(ms); } catch (Exception) { /* navegador sem vibração */ }
#endif
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        static AndroidJavaObject vibrador;
        static int nivelDaApi = -1;

        static void PulsoAndroid(int ms)
        {
            if (vibrador == null)
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var atividade = player.GetStatic<AndroidJavaObject>("currentActivity"))
                    vibrador = atividade.Call<AndroidJavaObject>("getSystemService", "vibrator");
                using (var versao = new AndroidJavaClass("android.os.Build$VERSION"))
                    nivelDaApi = versao.GetStatic<int>("SDK_INT");
            }
            if (vibrador == null) throw new InvalidOperationException("sem vibrador");
            if (nivelDaApi >= 26)
            {
                // -1 = a força padrão do aparelho (VibrationEffect.DEFAULT_AMPLITUDE)
                using (var efeitos = new AndroidJavaClass("android.os.VibrationEffect"))
                using (var efeito = efeitos.CallStatic<AndroidJavaObject>("createOneShot", (long)ms, -1))
                    vibrador.Call("vibrate", efeito);
            }
            else vibrador.Call("vibrate", (long)ms);
        }
#endif

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void CacambaVibrar(int ms);
#endif
    }
}
