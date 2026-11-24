using System.Collections.Generic;
using UnityEngine;

namespace Cacamba.Efeitos
{
    public enum Som
    {
        Carta,       // uma carta deslizando (puxar, voar)
        Pousa,       // carta batendo no feltro
        Baixa,       // um jogo descendo na mesa
        Embaralha,   // distribuir, remexer o monte
        SuaVez,      // a vez chegou em você
        Pedido,      // alguém pediu a carta do meio
        Bom,         // pegou o que queria, baixou, trocou coringa
        Bateu,       // você bateu / ganhou
        Perdeu,      // a rodada acabou e não foi você
        Erro,        // o juiz recusou a jogada
        Tique,       // o relógio nos últimos segundos
        Clique,      // botão
        Emote,       // frase ou emote chegando
    }

    /// <summary>
    /// Os sons do jogo, todos SINTETIZADOS aqui (seno, ruído filtrado e
    /// envelopes) — como a arte gerada da mesa e os sons do Bazuca no site:
    /// nenhum arquivo de áudio baixado, nada com licença para conferir. Cada som
    /// vira um AudioClip na primeira vez que toca.
    /// </summary>
    public static class Sons
    {
        const int Taxa = 44100;
        const string Chave = "cacamba-som";
        const float VolumeGeral = 0.85f;

        static AudioSource[] fontes;
        static int proxima;
        static readonly Dictionary<Som, AudioClip> clipes = new Dictionary<Som, AudioClip>();
        static readonly Dictionary<Som, float> tocouEm = new Dictionary<Som, float>();
        static bool? ligado;

        public static bool Ligado
        {
            get => ligado ??= PlayerPrefs.GetInt(Chave, 1) == 1;
            set
            {
                ligado = value;
                PlayerPrefs.SetInt(Chave, value ? 1 : 0);
                PlayerPrefs.Save();
            }
        }

        /// <summary>
        /// Toca um som. `tom` muda a altura (1 = como foi feito); `intervaloMin`
        /// impede que o mesmo som se empilhe em rajada (dez cartas voando juntas
        /// viram meia dúzia de estalos, não um chiado só).
        /// </summary>
        public static void Toca(Som som, float volume = 1f, float tom = 1f, float intervaloMin = 0.045f)
        {
            if (!Ligado) return;
            float agora = Time.unscaledTime;
            if (tocouEm.TryGetValue(som, out float antes) && agora - antes < intervaloMin) return;
            tocouEm[som] = agora;

            if (fontes == null || fontes[0] == null) Monta();
            var clipe = Clipe(som);
            if (clipe == null) return;
            var fonte = fontes[proxima];
            proxima = (proxima + 1) % fontes.Length;
            fonte.pitch = Mathf.Clamp(tom, 0.5f, 2f);
            fonte.PlayOneShot(clipe, Mathf.Clamp01(volume) * VolumeGeral);
        }

        static void Monta()
        {
            var go = new GameObject("Sons");
            Object.DontDestroyOnLoad(go);
            // várias fontes em rodízio: cada uma pode ter a sua altura sem mexer
            // no som que a anterior ainda está tocando
            fontes = new AudioSource[6];
            for (int i = 0; i < fontes.Length; i++)
            {
                var f = go.AddComponent<AudioSource>();
                f.playOnAwake = false;
                f.spatialBlend = 0f;
                f.loop = false;
                fontes[i] = f;
            }
        }

        static AudioClip Clipe(Som som)
        {
            if (clipes.TryGetValue(som, out var c) && c != null) return c;
            float[] b = Gera(som);
            if (b == null || b.Length == 0) return null;
            for (int i = 0; i < b.Length; i++) b[i] = Mathf.Clamp(b[i], -1f, 1f);
            c = AudioClip.Create("som-" + som, b.Length, 1, Taxa, false);
            c.SetData(b, 0);
            clipes[som] = c;
            return c;
        }

        // ------------------------------------------------------------ receitas

        static float[] Gera(Som som)
        {
            float[] b;
            switch (som)
            {
                case Som.Carta:
                    b = Novo(0.13f);
                    Chiado(b, 0f, 0.12f, 0.85f, 900f, 5200f, 30f, 11);
                    Chiado(b, 0.015f, 0.09f, 0.35f, 250f, 1400f, 38f, 23);
                    return b;
                case Som.Pousa:
                    b = Novo(0.11f);
                    Batida(b, 0f, 150f, 0.55f, 31);
                    return b;
                case Som.Baixa:
                    b = Novo(0.3f);
                    Batida(b, 0f, 140f, 0.6f, 41);
                    Batida(b, 0.065f, 165f, 0.5f, 43);
                    Batida(b, 0.13f, 185f, 0.45f, 47);
                    return b;
                case Som.Embaralha:
                    b = Novo(0.42f);
                    for (int i = 0; i < 7; i++)
                        Chiado(b, i * 0.048f, 0.07f, 0.55f - i * 0.03f, 800f + i * 90f, 5000f, 55f, (uint)(60 + i * 7));
                    return b;
                case Som.SuaVez:
                    b = Novo(0.6f);
                    Nota(b, 0f, 659.25f, 0.2f, 0.36f, 9f);
                    Nota(b, 0.11f, 880f, 0.48f, 0.4f, 5.5f);
                    return b;
                case Som.Pedido:
                    b = Novo(0.26f);
                    Nota(b, 0f, 523.25f, 0.09f, 0.3f, 18f);
                    Nota(b, 0.1f, 523.25f, 0.14f, 0.3f, 14f);
                    return b;
                case Som.Bom:
                    b = Novo(0.36f);
                    Nota(b, 0f, 523.25f, 0.12f, 0.3f, 12f);
                    Nota(b, 0.085f, 783.99f, 0.26f, 0.34f, 8f);
                    return b;
                case Som.Bateu:
                    b = Novo(1.15f);
                    Nota(b, 0f, 523.25f, 0.13f, 0.28f, 9f);
                    Nota(b, 0.095f, 659.25f, 0.13f, 0.28f, 9f);
                    Nota(b, 0.19f, 783.99f, 0.13f, 0.28f, 9f);
                    Nota(b, 0.29f, 1046.5f, 0.85f, 0.26f, 3.2f);
                    Nota(b, 0.29f, 783.99f, 0.85f, 0.18f, 3.2f);
                    Nota(b, 0.29f, 659.25f, 0.85f, 0.16f, 3.2f);
                    return b;
                case Som.Perdeu:
                    b = Novo(0.75f);
                    Nota(b, 0f, 392f, 0.26f, 0.28f, 7f);
                    Nota(b, 0.15f, 329.63f, 0.26f, 0.28f, 7f);
                    Nota(b, 0.3f, 261.63f, 0.44f, 0.3f, 5f);
                    return b;
                case Som.Erro:
                    b = Novo(0.2f);
                    Nota(b, 0f, 196f, 0.19f, 0.26f, 10f, 0.6f);
                    Nota(b, 0f, 185f, 0.19f, 0.26f, 10f, 0.6f);
                    return b;
                case Som.Tique:
                    b = Novo(0.05f);
                    Nota(b, 0f, 1200f, 0.045f, 0.32f, 90f, 0f, 0.001f);
                    return b;
                case Som.Clique:
                    b = Novo(0.035f);
                    Nota(b, 0f, 1700f, 0.03f, 0.14f, 140f, 0f, 0.001f);
                    Chiado(b, 0f, 0.012f, 0.12f, 2000f, 8000f, 300f, 71);
                    return b;
                case Som.Emote:
                    b = Novo(0.12f);
                    Varredura(b, 0f, 320f, 780f, 0.1f, 0.34f);
                    return b;
            }
            return null;
        }

        static float[] Novo(float segundos) => new float[Mathf.CeilToInt(segundos * Taxa)];

        /// <summary>Um seno (com um pouco do segundo harmônico) que ataca rápido e some em exponencial.</summary>
        static void Nota(float[] b, float inicio, float freq, float dur, float amp, float queda, float harmonico = 0.25f, float ataque = 0.004f)
        {
            int i0 = (int)(inicio * Taxa), n = (int)(dur * Taxa);
            float fimDe = 0.008f * Taxa;
            for (int i = 0; i < n && i0 + i < b.Length; i++)
            {
                float t = i / (float)Taxa;
                float env = Mathf.Min(1f, t / ataque) * Mathf.Exp(-queda * t) * Mathf.Min(1f, (n - i) / fimDe);
                float fase = 2f * Mathf.PI * freq * t;
                b[i0 + i] += (Mathf.Sin(fase) + harmonico * Mathf.Sin(2f * fase)) * env * amp;
            }
        }

        /// <summary>Um seno que sobe de `de` até `ate` hertz: o "pop" do emote.</summary>
        static void Varredura(float[] b, float inicio, float de, float ate, float dur, float amp)
        {
            int i0 = (int)(inicio * Taxa), n = (int)(dur * Taxa);
            float fase = 0f;
            for (int i = 0; i < n && i0 + i < b.Length; i++)
            {
                float k = i / (float)n;
                fase += 2f * Mathf.PI * Mathf.Lerp(de, ate, k) / Taxa;
                float env = Mathf.Min(1f, k / 0.06f) * (1f - k) * (1f - k);
                b[i0 + i] += Mathf.Sin(fase) * env * amp;
            }
        }

        /// <summary>
        /// Ruído branco passado por um passa-faixa simples (a diferença de dois
        /// passa-baixas de um polo): é o chiado de papel de uma carta.
        /// </summary>
        static void Chiado(float[] b, float inicio, float dur, float amp, float graveHz, float agudoHz, float queda, uint semente)
        {
            int i0 = (int)(inicio * Taxa), n = (int)(dur * Taxa);
            float a1 = 1f - Mathf.Exp(-2f * Mathf.PI * agudoHz / Taxa);
            float a2 = 1f - Mathf.Exp(-2f * Mathf.PI * graveHz / Taxa);
            float y1 = 0f, y2 = 0f, fimDe = 0.006f * Taxa;
            uint x = semente * 2654435761u + 12345u;
            for (int i = 0; i < n && i0 + i < b.Length; i++)
            {
                x = x * 1664525u + 1013904223u;
                float r = (x >> 8) / 8388608f - 1f;
                y1 += a1 * (r - y1);
                y2 += a2 * (r - y2);
                float t = i / (float)Taxa;
                float env = Mathf.Min(1f, t / 0.003f) * Mathf.Exp(-queda * t) * Mathf.Min(1f, (n - i) / fimDe);
                b[i0 + i] += (y1 - y2) * env * amp * 2.2f;
            }
        }

        /// <summary>Carta batendo no feltro: um baque grave curto e um estalo de papel por cima.</summary>
        static void Batida(float[] b, float inicio, float freq, float amp, uint semente)
        {
            Nota(b, inicio, freq, 0.09f, amp, 46f, 0f, 0.002f);
            Chiado(b, inicio, 0.035f, amp * 0.8f, 1400f, 7000f, 110f, semente);
        }
    }
}
