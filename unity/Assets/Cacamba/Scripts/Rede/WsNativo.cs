#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Cacamba.Rede
{
    /// <summary>
    /// WebSocket para os aplicativos (Windows, Android, iOS) e o editor.
    ///
    /// O servidor confere o cabeçalho Origin (lib/security.js): em produção ele
    /// tem de ser exatamente o PUBLIC_URL; em desenvolvimento, o mesmo host do
    /// pedido. Um navegador põe esse cabeçalho sozinho; aqui quem põe é o
    /// <see cref="Conectar"/>, com o endereço do próprio servidor. Isso não afrouxa
    /// nada do lado de lá: a checagem de Origin protege navegadores de sites
    /// alheios, e um aplicativo não é um site alheio.
    /// </summary>
    public sealed class WsNativo : ITransporteWs
    {
        public event Action AoAbrir;
        public event Action<string> AoReceber;
        public event Action<int, string> AoFechar;

        readonly ConcurrentQueue<Action> fila = new ConcurrentQueue<Action>();
        readonly object travaEnvio = new object();
        ClientWebSocket socket;
        CancellationTokenSource cancelar;
        Task ultimoEnvio = Task.CompletedTask;
        // Cada conexão nova ganha uma geração: o que chegar atrasado de um socket
        // antigo (fechado ao reconectar) é descartado em vez de virar evento.
        int geracao;

        public bool Aberto => socket != null && socket.State == WebSocketState.Open;

        public void Conectar(string url, string origem)
        {
            Fechar();
            int minha = ++geracao;
            var ws = new ClientWebSocket();
            ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            if (!string.IsNullOrEmpty(origem))
            {
                try { ws.Options.SetRequestHeader("Origin", origem); }
                catch (Exception e) { Debug.LogWarning($"[rede] não deu para pôr o Origin: {e.Message}"); }
            }
            socket = ws;
            cancelar = new CancellationTokenSource();
            _ = Rodar(ws, new Uri(url), cancelar.Token, minha);
        }

        async Task Rodar(ClientWebSocket ws, Uri uri, CancellationToken token, int minha)
        {
            try
            {
                // ConfigureAwait(false): o laço de leitura roda fora da thread
                // principal; o que ele lê volta para ela pela fila.
                await ws.ConnectAsync(uri, token).ConfigureAwait(false);
                Enfileira(minha, () => AoAbrir?.Invoke());

                var buffer = new byte[16 * 1024];
                var mensagem = new MemoryStream();
                while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
                {
                    var r = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
                    if (r.MessageType == WebSocketMessageType.Close)
                    {
                        int codigo = (int)(r.CloseStatus ?? WebSocketCloseStatus.NormalClosure);
                        string motivo = r.CloseStatusDescription ?? "";
                        try { await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).ConfigureAwait(false); }
                        catch { /* o outro lado já foi */ }
                        Enfileira(minha, () => AoFechar?.Invoke(codigo, motivo));
                        return;
                    }
                    mensagem.Write(buffer, 0, r.Count);
                    if (!r.EndOfMessage) continue;
                    string texto = Encoding.UTF8.GetString(mensagem.GetBuffer(), 0, (int)mensagem.Length);
                    mensagem.SetLength(0);
                    if (r.MessageType == WebSocketMessageType.Text)
                        Enfileira(minha, () => AoReceber?.Invoke(texto));
                }
                Enfileira(minha, () => AoFechar?.Invoke(1006, ""));
            }
            catch (Exception e)
            {
                Enfileira(minha, () => AoFechar?.Invoke(1006, e.Message));
            }
        }

        void Enfileira(int minha, Action acao)
        {
            fila.Enqueue(() => { if (minha == geracao) acao(); });
        }

        public void Enviar(string texto)
        {
            var ws = socket;
            if (ws == null || ws.State != WebSocketState.Open) return;
            var bytes = Encoding.UTF8.GetBytes(texto);
            // ClientWebSocket não aceita dois envios ao mesmo tempo: cada envio
            // espera o anterior, e a ordem das jogadas é a ordem em que saíram.
            lock (travaEnvio)
            {
                ultimoEnvio = ultimoEnvio.ContinueWith(_ => EnviarAgora(ws, bytes)).Unwrap();
            }
        }

        static async Task EnviarAgora(ClientWebSocket ws, byte[] bytes)
        {
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[rede] falha ao enviar: {e.Message}");
            }
        }

        public void Fechar()
        {
            geracao++;
            var ws = socket;
            socket = null;
            try { cancelar?.Cancel(); } catch { /* já cancelado */ }
            cancelar = null;
            if (ws == null) return;
            try { ws.Abort(); } catch { /* já fechado */ }
            try { ws.Dispose(); } catch { /* idem */ }
        }

        public void Atualizar()
        {
            while (fila.TryDequeue(out var acao))
            {
                try { acao(); }
                catch (Exception e) { Debug.LogException(e); }
            }
        }
    }
}
#endif
