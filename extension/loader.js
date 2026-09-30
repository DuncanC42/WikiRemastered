(() => {
  function requireReload() {
    if (!document.body || document.querySelector('[data-wme="reload-notice"]')) return;
    const host = document.createElement('div');
    host.dataset.wme = 'reload-notice';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;bottom:20px;right:20px;z-index:2147483647;font:13px system-ui;color:#f5f5f7}div{display:flex;align-items:center;gap:12px;max-width:calc(100vw - 40px);padding:12px 16px;border:1px solid #414147;border-radius:10px;background:#232327;box-shadow:0 6px 24px #0005}button{border:0;border-radius:6px;padding:8px 12px;background:#0a84ff;color:white;font:inherit;cursor:pointer}button:focus-visible{outline:2px solid white;outline-offset:3px}';
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = 'Wiki Masters Enhancer a été mis à jour. Rechargez la page pour le réactiver.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Recharger';
    button.addEventListener('click', () => location.reload());
    notice.append(text, button);
    root.append(style, notice);
    document.body.append(host);
  }
  document.addEventListener('wme:reload-required', requireReload);
  // A failed enhancement leaves the native page available.
  import(chrome.runtime.getURL('market.js')).catch(() => {});
  import(chrome.runtime.getURL('content.js')).catch(() => {
    if (location.pathname.replace(/\/$/, '') === '/collection') requireReload();
  });
  import(chrome.runtime.getURL('pack-opening.js'))
    .then(({ installPackOpening }) => installPackOpening({ cssUrl: chrome.runtime.getURL('pack-opening.css'), packUrl: chrome.runtime.getURL('pack-art.svg'), puzzleUrl: chrome.runtime.getURL('pack-art-puzzle.svg'), puzzleBackUrl: chrome.runtime.getURL('card-back-puzzle.svg'), greenUrl: chrome.runtime.getURL('pack-art-green.svg'), greenBackUrl: chrome.runtime.getURL('card-back-green.svg'), globeUrl: chrome.runtime.getURL('pack-art-globe.svg'), globeBackUrl: chrome.runtime.getURL('card-back-globe.svg') }))
    .catch(() => {});
})();
