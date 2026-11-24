using System;

namespace Cacamba.Rede
{
    /// <summary>
    /// O fio até o servidor. Duas implementações: <see cref="WsNativo"/> (Windows,
    /// Android, iOS e o editor, com System.Net.WebSockets) e <see cref="WsWebGL"/>
    /// (navegador, com o WebSocket do próprio navegador). Os eventos sempre chegam
    /// na thread principal, dentro de <see cref="Atualizar"/>: quem escuta pode
    /// mexer em GameObject e interface sem cuidado extra.
    /// </summary>
    public interface ITransporteWs
    {
        event Action AoAbrir;
        event Action<string> AoReceber;
        event Action<int, string> AoFechar;

        bool Aberto { get; }

        /// <param name="url">ws:// ou wss://, sempre no caminho "/" (o servidor recusa outro).</param>
        /// <param name="origem">Cabeçalho Origin a enviar. O navegador põe o dele e ignora este.</param>
        void Conectar(string url, string origem);
        void Enviar(string texto);
        void Fechar();

        /// <summary>Despacha, na thread principal, o que chegou desde o último quadro.</summary>
        void Atualizar();
    }

    public static class FabricaWs
    {
        public static ITransporteWs Criar()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return new WsWebGL();
#else
            return new WsNativo();
#endif
        }
    }
}
