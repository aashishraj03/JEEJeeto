/*! JEE Portal error catcher. Add to the <head> of every page, before other scripts.
    Nothing is sent to your server: it only shows /error.html with the details ready
    to send to you through Instagram / WhatsApp / Gmail. */
(function () {
  var ERROR_PAGE = '/error.html';
  var SHOW_FOR_AUTO_ERRORS = true; // false = auto-caught errors are ignored; only manual report() calls show the page
  var shown = false, seen = {};

  function newId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

  function isNoise(msg, src) {
    return /ResizeObserver loop|^Script error\.?$/i.test(String(msg || '')) || /extension:\/\//.test(src || '');
  }

  function showPage(info) {
    if (shown) return;
    shown = true;
    try { sessionStorage.setItem('jee_portal_last_error', JSON.stringify(info)); } catch (e) {}
    var f = document.createElement('iframe');
    f.id = 'jee-portal-error-frame';
    f.src = ERROR_PAGE + '?id=' + encodeURIComponent(info.id);
    f.title = 'Something went wrong';
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#22262e';
    (document.body || document.documentElement).appendChild(f);
  }

  // Close button inside error.html tells us to remove the overlay
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || e.data !== 'jee-portal-close') return;
    var f = document.getElementById('jee-portal-error-frame');
    if (f) f.remove();
    shown = false;
  });

  // err: Error or {message}; opts: {context, source, line, col, show}
  function report(err, opts) {
    opts = opts || {};
    err = err || {};
    var msg = err.message || String(err);
    if (isNoise(msg, opts.source)) return null;
    var key = msg + '|' + (opts.source || '') + '|' + (opts.line || '');
    if (seen[key]) return seen[key];
    var id = seen[key] = newId();
    if (opts.show !== false) {
      showPage({
        id: id,
        message: String(msg).slice(0, 300),
        context: opts.context || '',
        page: location.href,
        source: opts.source || '',
        line: opts.line || '',
        col: opts.col || ''
      });
    }
    return id;
  }

  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window) return; // ignore failed images/scripts
    report(e.error || { message: e.message }, {
      source: e.filename, line: e.lineno, col: e.colno, show: SHOW_FOR_AUTO_ERRORS
    });
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report(r instanceof Error ? r : { message: 'Unhandled promise rejection: ' + String(r) },
      { show: SHOW_FOR_AUTO_ERRORS });
  });

  window.JeePortalError = { report: report };
})();