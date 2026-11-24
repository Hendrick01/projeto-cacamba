// WebSocket do navegador para a build WebGL do Caçamba (ver Scripts/Rede/WsWebGL.cs).
// Um socket por vez: conectar de novo fecha o anterior sem disparar o aviso dele.
var CacambaWs = {
  $cacambaWs: { socket: null, aoAbrir: 0, aoReceber: 0, aoFechar: 0 },

  $cacambaTexto: function (texto) {
    var tamanho = lengthBytesUTF8(texto) + 1;
    var ptr = _malloc(tamanho);
    stringToUTF8(texto, ptr, tamanho);
    return ptr;
  },

  CacambaWsConectar__deps: ['$cacambaWs', '$cacambaTexto'],
  CacambaWsConectar: function (urlPtr, aoAbrir, aoReceber, aoFechar) {
    var url = UTF8ToString(urlPtr);
    cacambaWs.aoAbrir = aoAbrir;
    cacambaWs.aoReceber = aoReceber;
    cacambaWs.aoFechar = aoFechar;
    var antigo = cacambaWs.socket;
    if (antigo) {
      antigo.onopen = antigo.onmessage = antigo.onclose = antigo.onerror = null;
      try { antigo.close(); } catch (e) { /* já fechado */ }
    }
    var s;
    try {
      s = new WebSocket(url);
    } catch (e) {
      var erro = cacambaTexto(String(e && e.message || e));
      {{{ makeDynCall('vii', 'cacambaWs.aoFechar') }}}(1006, erro);
      _free(erro);
      return;
    }
    cacambaWs.socket = s;
    s.onopen = function () {
      if (cacambaWs.socket !== s) return;
      {{{ makeDynCall('v', 'cacambaWs.aoAbrir') }}}();
    };
    s.onmessage = function (ev) {
      if (cacambaWs.socket !== s || typeof ev.data !== 'string') return;
      var ptr = cacambaTexto(ev.data);
      {{{ makeDynCall('vi', 'cacambaWs.aoReceber') }}}(ptr);
      _free(ptr);
    };
    s.onclose = function (ev) {
      if (cacambaWs.socket !== s) return;
      cacambaWs.socket = null;
      var ptr = cacambaTexto(ev.reason || '');
      {{{ makeDynCall('vii', 'cacambaWs.aoFechar') }}}(ev.code || 1006, ptr);
      _free(ptr);
    };
  },

  CacambaWsEnviar__deps: ['$cacambaWs'],
  CacambaWsEnviar: function (textoPtr) {
    var s = cacambaWs.socket;
    if (s && s.readyState === 1) s.send(UTF8ToString(textoPtr));
  },

  CacambaWsFechar__deps: ['$cacambaWs'],
  CacambaWsFechar: function () {
    var s = cacambaWs.socket;
    cacambaWs.socket = null;
    if (!s) return;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try { s.close(); } catch (e) { /* já fechado */ }
  },

  CacambaWsAberto__deps: ['$cacambaWs'],
  CacambaWsAberto: function () {
    var s = cacambaWs.socket;
    return s && s.readyState === 1 ? 1 : 0;
  },

  // Devolvido com _malloc: o IL2CPP converte em string e libera.
  CacambaPaginaOrigem__deps: ['$cacambaTexto'],
  CacambaPaginaOrigem: function () {
    return cacambaTexto(window.location.origin || '');
  }
};

autoAddDeps(CacambaWs, '$cacambaWs');
mergeInto(LibraryManager.library, CacambaWs);
