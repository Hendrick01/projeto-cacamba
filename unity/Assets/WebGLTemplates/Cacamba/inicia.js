// Carrega a build WebGL do Caçamba. Fica num arquivo (e não inline no
// index.html) porque a CSP do servidor do jogo só aceita script de arquivo.
(function () {
  var dados = document.currentScript.dataset;
  var tela = document.getElementById('unity-canvas');
  var barra = document.getElementById('progresso');
  var mensagem = document.getElementById('mensagem');
  var aviso = document.getElementById('carregando');

  var config = {
    dataUrl: dados.data,
    frameworkUrl: dados.framework,
    codeUrl: dados.code,
    streamingAssetsUrl: 'StreamingAssets',
    companyName: dados.company,
    productName: dados.product,
    productVersion: dados.version,
    matchWebGLToCanvasSize: true,
    // tela de celular com 3x de densidade custa caro na GPU: 2x basta
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  };

  var loader = document.createElement('script');
  loader.src = dados.loader;
  loader.onload = function () {
    createUnityInstance(tela, config, function (p) {
      barra.style.width = Math.round(p * 100) + '%';
    }).then(function () {
      aviso.style.display = 'none';
    }).catch(function (erro) {
      mensagem.textContent = 'Não deu para abrir o jogo: ' + erro;
    });
  };
  loader.onerror = function () {
    mensagem.textContent = 'Não deu para baixar o jogo. Confira a conexão e recarregue.';
  };
  document.body.appendChild(loader);
})();
