// =============================================================================
//  gas-shim.js — makes the original Apps Script dialogs (decision_maker.html,
//  GuidelineDialog.html) work unchanged inside the dashboard.
//  Implements google.script.run.<fn>(...) → POST /api/gas/<fn>
//         and google.script.host.close()  → closes the dashboard modal
// =============================================================================
(function () {
  var params = new URLSearchParams(location.search);
  var listId = params.get('listId');

  function Runner() { this.ok = function () {}; this.fail = function (e) { alert('Error: ' + e.message); }; }

  var runner = new Runner();
  var proxy = new Proxy(runner, {
    get: function (target, prop) {
      if (prop === 'withSuccessHandler') return function (fn) { target.ok = fn; return proxy; };
      if (prop === 'withFailureHandler') return function (fn) { target.fail = fn; return proxy; };
      if (prop === 'withUserObject') return function () { return proxy; };
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      // Any other property is treated as a server function name
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var r = new Runner(); r.ok = target.ok; r.fail = target.fail;
        target.ok = function () {}; target.fail = function (e) { alert('Error: ' + e.message); };
        fetch('/api/gas/' + encodeURIComponent(prop), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: listId, args: args })
        }).then(function (res) { return res.json().then(function (j) { return { res: res, j: j }; }); })
          .then(function (x) {
            if (!x.res.ok) throw new Error(x.j.error || ('HTTP ' + x.res.status));
            r.ok(x.j.result);
          })
          .catch(function (e) { r.fail(e); });
      };
    }
  });

  window.google = {
    script: {
      run: proxy,
      host: {
        close: function () { window.parent.postMessage({ type: 'gas-close' }, '*'); },
        setWidth: function () {}, setHeight: function () {}
      }
    }
  };
})();
