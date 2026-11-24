#if UNITY_WEBGL && !UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using AOT;
using UnityEngine;

namespace Cacamba.Rede
{
    /// <summary>
    /// WebSocket no navegador (build WebGL). System.Net.WebSockets não existe lá:
    /// quem conversa é o WebSocket do próprio navegador, pelo plugin
    /// Plugins/WebGL/CacambaWs.jslib. O navegador põe o Origin da página, e é por
    /// isso que a build WebGL precisa ser servida pelo mesmo servidor do jogo
    /// (em /unity/): de outro domínio, a origem não confere e o servidor recusa.
    /// </summary>
    public sealed class WsWebGL : ITransporteWs
    {
        delegate void CbVazio();
        delegate void CbTexto(IntPtr texto);
        delegate void CbFechar(int codigo, IntPtr motivo);

        [DllImport("__Internal")] static extern void CacambaWsConectar(string url, CbVazio aoAbrir, CbTexto aoReceber, CbFechar aoFechar);
        [DllImport("__Internal")] static extern void CacambaWsEnviar(string texto);
        [DllImport("__Internal")] static extern void CacambaWsFechar();
        [DllImport("__Internal")] static extern int CacambaWsAberto();
        [DllImport("__Internal")] static extern string CacambaPaginaOrigem();

        static WsWebGL atual;
        static readonly Queue<Action> fila = new Queue<Action>();

        public event Action AoAbrir;
        public event Action<string> AoReceber;
        public event Action<int, string> AoFechar;

        public bool Aberto => CacambaWsAberto() == 1;

        /// <summary>O endereço da página que abriu o jogo, ex.: https://projeto-cacamba.onrender.com</summary>
        public static string OrigemDaPagina()
        {
            try { return CacambaPaginaOrigem(); }
            catch { return ""; }
        }

        public void Conectar(string url, string origem)
        {
            atual = this;
            CacambaWsConectar(url, QuandoAbre, QuandoRecebe, QuandoFecha);
        }

        public void Enviar(string texto) => CacambaWsEnviar(texto);

        public void Fechar() => CacambaWsFechar();

        public void Atualizar()
        {
            while (fila.Count > 0)
            {
                var acao = fila.Dequeue();
                try { acao(); }
                catch (Exception e) { Debug.LogException(e); }
            }
        }

        [MonoPInvokeCallback(typeof(CbVazio))]
        static void QuandoAbre()
        {
            var eu = atual;
            fila.Enqueue(() => eu?.AoAbrir?.Invoke());
        }

        [MonoPInvokeCallback(typeof(CbTexto))]
        static void QuandoRecebe(IntPtr ptr)
        {
            var eu = atual;
            string texto = Marshal.PtrToStringUTF8(ptr) ?? "";
            fila.Enqueue(() => eu?.AoReceber?.Invoke(texto));
        }

        [MonoPInvokeCallback(typeof(CbFechar))]
        static void QuandoFecha(int codigo, IntPtr ptr)
        {
            var eu = atual;
            string motivo = Marshal.PtrToStringUTF8(ptr) ?? "";
            fila.Enqueue(() => eu?.AoFechar?.Invoke(codigo, motivo));
        }
    }
}
#endif
