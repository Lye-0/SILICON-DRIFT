/* A small independent bootstrap survives parse errors in the main application. */
(function () {
  'use strict';
  var stage = 'BOOT', detail = 'JavaScript の起動を確認しました', completed = false, failed = false;
  var lastAdvance = Date.now(), lastTick = lastAdvance, idleVisible = 0, timer;
  var byId = function (id) { return document.getElementById(id); };
  document.documentElement.setAttribute('data-sd-js', 'true');
  function reload(safe) {
    if (!safe) { location.reload(); return; }
    try { var url = new URL(location.href); url.searchParams.set('safe', '1'); url.searchParams.set('quality', 'low'); location.replace(url.href); }
    catch (e) { location.reload(); }
  }
  function diagnostics(message) {
    var app = window.__SD, s = app && app.settings;
    return 'SILICON DRIFT 1.1.0\nSTAGE: ' + stage + '\n' + detail + '\n' + message +
      '\nJavaScript: 実行済み\nURL形式: ' + location.protocol + '\n画面: ' + innerWidth + ' × ' + innerHeight +
      (s ? '\n品質: ' + s.quality + ' / 互換モード: ' + !!s.safe : '');
  }
  function fail(message, code) {
    if (failed) return;
    failed = true; clearInterval(timer);
    var text = String(message || '不明なエラー');
    document.body.setAttribute('data-error', code || text);
    document.body.setAttribute('data-ready', 'false');
    byId('loading').hidden = true; byId('error-screen').hidden = false;
    byId('error-text').textContent = code === 'WEBGL_UNAVAILABLE' ?
      'この表示環境では WebGL 2 の描画を開始できませんでした。ファイルのプレビューであれば、サイトのURLをブラウザで開き直してください。' :
      code === 'SCRIPT_LOAD_ERROR' ? '必要なJavaScriptファイルを読み込めませんでした。ZIP内の js/ も含めて配置し直してください。' :
      code === 'STARTUP_TIMEOUT' ? '起動処理が進んでいません。互換モードで再試行するか、下の診断情報と開き方をお知らせください。' :
      '起動または描画の途中でエラーが発生しました。下の診断情報を確認してください。';
    byId('error-detail').textContent = diagnostics(text).slice(0, 1800);
    window.dispatchEvent(new Event('sd:fatal'));
  }
  function arm() {
    clearInterval(timer); lastAdvance = lastTick = Date.now(); idleVisible = 0;
    timer = setInterval(function () {
      var now = Date.now(), elapsed = Math.max(0, now - lastTick); lastTick = now;
      if (document.hidden || completed || failed) return;
      idleVisible += elapsed;
      if (idleVisible > 30000) fail('30秒以上、起動の進捗がありません。', 'STARTUP_TIMEOUT');
    }, 1000);
  }
  window.__SD_BOOT = {
    mark: function (name, text, progress) {
      if (failed) return;
      stage = name; detail = text; lastAdvance = lastTick = Date.now(); idleVisible = 0;
      byId('boot-stage').textContent = text;
      if (typeof progress === 'number') byId('loading-progress').style.width = Math.max(0, Math.min(100, progress)) + '%';
    },
    begin: function () { completed = false; failed = false; document.body.removeAttribute('data-error'); byId('error-screen').hidden = true; arm(); },
    complete: function () { if (failed) return; completed = true; stage = 'READY'; clearInterval(timer); byId('loading').classList.add('done'); byId('loading').hidden = true; },
    fail: fail,
    snapshot: function () { return { stage: stage, detail: detail, complete: completed, failed: failed, lastAdvance: lastAdvance }; }
  };
  byId('retry').onclick = function () { reload(false); };
  byId('safe-retry').onclick = function () { reload(true); };
  // Resource errors do not bubble: capture missing split scripts as well as runtime errors.
  window.addEventListener('error', function (e) {
    var target = e.target;
    if (target && target.tagName === 'SCRIPT') {
      var path = target.src;
      try { path = new URL(path, location.href).pathname; } catch (ignore) {}
      fail('JavaScript ファイルを読み込めませんでした: ' + path + '\nindex.html と js/ を同じ構成で配置してください。', 'SCRIPT_LOAD_ERROR');
      return;
    }
    if (e.message) fail(e.message, 'SCRIPT_ERROR');
  }, true);
  window.addEventListener('unhandledrejection', function (e) { fail(String(e.reason && e.reason.message || e.reason || '非同期処理が失敗しました。'), 'ASYNC_ERROR'); });
  document.addEventListener('visibilitychange', function () { lastTick = Date.now(); });
  arm(); window.__SD_BOOT.mark('BOOT', detail, 2);
}());
