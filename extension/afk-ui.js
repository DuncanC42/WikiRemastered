import { createHelpButton } from './controls.js';

const numberFormat = new Intl.NumberFormat('fr-FR');
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const rarityNames = new Set(['C', 'PC', 'R', 'SR', 'UR', 'L']);
let stylesheetPromise;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label) {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

function stylesheet() {
  // This is the extension's own presentation asset, never a WikiMasters API call.
  if (!stylesheetPromise) stylesheetPromise = fetch(chrome.runtime.getURL('afk-ui.css'))
    .then(response => {
      if (!response.ok) throw new Error('Impossible de charger les styles AFK.');
      return response.text();
    });
  return stylesheetPromise;
}

function activeElement() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function imageURL(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, location.origin);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Presentation only. The caller owns account filtering, persistence and openings.
 * onToggle(nextEnabled) may be async; call update() with the resulting state.
 * Call syncDOM() after native navigation or sidebar replacement.
 */
export function mountAfkUI({ onToggle } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const launcherHost = element('div');
  launcherHost.dataset.wme = 'afk-launcher';
  const launcherRoot = launcherHost.attachShadow({ mode: 'open' });
  const modalHost = element('div');
  modalHost.dataset.wme = 'afk-dialog';
  const modalRoot = modalHost.attachShadow({ mode: 'open' });
  const noticeHost = element('div');
  noticeHost.dataset.wme = 'afk-notice';
  const noticeRoot = noticeHost.attachShadow({ mode: 'open' });
  launcherHost.style.display = 'none';
  modalHost.style.display = 'none';
  noticeHost.style.display = 'none';

  const launcherGroup = element('div', 'launcher-group');
  const launcher = button('launcher');
  const launcherLabel = element('span', 'launcher-label', 'Ouvertures AFK');
  const launcherAttention = element('span', 'launcher-attention', 'Vérification requise');
  launcherAttention.hidden = true;
  launcher.append(launcherLabel, launcherAttention);
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  const historyLauncher = button('history-launcher');
  historyLauncher.hidden = true;
  historyLauncher.title = 'Historique AFK';
  historyLauncher.setAttribute('aria-label', 'Ouvrir l’historique AFK');
  historyLauncher.setAttribute('aria-haspopup', 'dialog');
  historyLauncher.setAttribute('aria-expanded', 'false');
  const historyIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  historyIcon.setAttribute('viewBox', '0 0 24 24');
  historyIcon.setAttribute('aria-hidden', 'true');
  const historyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  historyPath.setAttribute('d', 'M3 11a9 9 0 1 1 2.65 7.35M3 4v7h7M12 7v5l3 2');
  historyIcon.append(historyPath);
  historyLauncher.append(historyIcon);
  launcherGroup.append(launcher, historyLauncher);
  launcherRoot.append(launcherGroup);

  const notice = element('div', 'notice');
  notice.lang = 'fr';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');
  const noticeMessage = element('span', 'notice-message', 'Vérification requise pour les ouvertures AFK.');
  const noticeLink = element('a', 'notice-action', 'Vérifier');
  noticeLink.href = '/pulls';
  const noticeClose = button('notice-close', '×');
  noticeClose.setAttribute('aria-label', 'Fermer la notification');
  notice.append(noticeMessage, noticeLink, noticeClose);
  noticeRoot.append(notice);

  const dialog = element('dialog', 'drawer');
  dialog.lang = 'fr';
  dialog.setAttribute('aria-labelledby', 'afk-title');
  const header = element('header', 'drawer-header');
  const title = element('h2', 'drawer-title', 'Ouvertures AFK');
  title.id = 'afk-title';
  const closeButton = button('close-button', '×');
  closeButton.setAttribute('aria-label', 'Fermer les ouvertures AFK');
  header.append(title, closeButton);

  const settings = element('section', 'settings');
  const toggleRow = element('div', 'toggle-row');
  const toggleLabel = element('span', 'toggle-label', 'Ouvrir automatiquement');
  toggleLabel.id = 'afk-toggle-label';
  const toggle = button('toggle');
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-labelledby', toggleLabel.id);
  toggle.setAttribute('aria-describedby', 'afk-status');
  const thumb = element('span', 'toggle-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  toggle.append(thumb);
  toggleRow.append(toggleLabel, toggle);
  const status = element('p', 'status');
  status.id = 'afk-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const verificationLink = element('a', 'verification-link', 'Aller aux paquets');
  verificationLink.href = '/pulls';
  verificationLink.hidden = true;
  settings.append(toggleRow, status, verificationLink);
  settings.append(createHelpButton('afk', signal));

  const historyRegion = element('section', 'history-region');
  historyRegion.setAttribute('aria-labelledby', 'afk-history-title');
  const historyTitle = element('h3', 'history-title', 'Historique');
  historyTitle.id = 'afk-history-title';
  const empty = element('p', 'empty', 'Les prochains paquets ouverts apparaîtront ici.');
  const historyList = element('ol', 'history');
  historyRegion.append(historyTitle, empty, historyList);

  const footer = element('footer', 'drawer-footer');
  const collectionLink = element('a', 'collection-link', 'Ouvrir ma collection');
  collectionLink.href = '/collection';
  footer.append(collectionLink);
  dialog.append(header, settings, historyRegion, footer);
  modalRoot.append(dialog);

  let state = { enabled: true, status: 'idle', message: '', accountKey: null, history: [] };
  let alive = true;
  let togglePending = false;
  let toggleError = '';
  let historySignature = '';
  let restoreFocus = null;
  let noticeTimer = null;
  const desktop = matchMedia('(min-width: 768px)');
  const needsAttention = () => Boolean(state.enabled && state.accountKey && state.status === 'verification');

  function syncDOM() {
    if (!alive || !document.body) return;
    const sidebar = desktop.matches
      ? document.querySelector('nav[data-wme-nav="desktop"], nav.w-64') : null;
    const target = sidebar || document.body;
    launcherHost.dataset.placement = sidebar ? 'sidebar' : 'floating';
    launcherHost.dataset.mobile = String(!desktop.matches);
    if (launcherHost.parentElement !== target) target.append(launcherHost);
    if (modalHost.parentElement !== document.body) document.body.append(modalHost);
    if (noticeHost.parentElement !== document.body) document.body.append(noticeHost);
  }

  function hideNotice() {
    clearTimeout(noticeTimer);
    noticeTimer = null;
    notice.hidden = true;
  }

  function scheduleNoticeClose() {
    clearTimeout(noticeTimer);
    if (!notice.hidden) noticeTimer = setTimeout(hideNotice, 10_000);
  }

  // The caller deduplicates by account and verification episode across tabs.
  // Only acknowledge a notification once its styled, visible surface exists.
  async function notifyVerification() {
    if (!alive || document.hidden || !needsAttention()) return false;
    if (!(await stylesReady) || !alive || document.hidden || !needsAttention()) return false;
    syncDOM();
    if (!noticeHost.isConnected) return false;
    if (notice.hidden) {
      notice.hidden = false;
      scheduleNoticeClose();
    }
    return true;
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
  }

  function open() {
    if (!alive || dialog.open) return;
    syncDOM();
    restoreFocus = activeElement();
    dialog.showModal();
    if (!needsAttention()) launcher.setAttribute('aria-expanded', 'true');
    historyLauncher.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
  }

  function renderHistory() {
    const history = state.accountKey && Array.isArray(state.history)
      ? state.history.filter(entry => entry && Array.isArray(entry.cards)).slice()
        .sort((a, b) => (Number(b.openedAt) || 0) - (Number(a.openedAt) || 0)) : [];
    const signature = JSON.stringify([state.accountKey, history]);
    if (signature === historySignature) return;
    historySignature = signature;
    const fragment = document.createDocumentFragment();

    for (const entry of history) {
      const group = element('li', 'pack');
      const date = new Date(entry.openedAt);
      const hasDate = Number.isFinite(date.getTime());
      const groupHeader = element('div', 'pack-header');
      const time = element('time', 'pack-time', hasDate ? dateFormat.format(date) : 'Paquet ouvert');
      if (hasDate) time.dateTime = date.toISOString();
      groupHeader.append(time);
      const cards = element('ul', 'pack-cards');
      cards.setAttribute('aria-label', hasDate ? `Paquet du ${dateFormat.format(date)}` : 'Cartes du paquet');
      if (entry.status === 'uncertain' && entry.cards.length === 0) {
        const uncertain = element('div', 'uncertain-row');
        const link = element('a', 'collection-link', 'Ouvrir ma collection');
        link.href = '/collection';
        uncertain.append(element('p', 'uncertain-label', 'Résultat à vérifier'), link);
        group.append(groupHeader, uncertain);
        fragment.append(group);
        continue;
      }
      for (const card of entry.cards) {
        if (!card || typeof card !== 'object') continue;
        const row = element('li', 'card-row');
        const name = typeof card.title === 'string' && card.title ? card.title : 'Carte';
        const thumbnail = element('div', 'thumbnail');
        thumbnail.setAttribute('aria-hidden', 'true');
        const url = imageURL(card.imageUrl);
        if (url) {
          const image = element('img');
          image.alt = '';
          image.width = 36;
          image.height = 44;
          image.loading = 'lazy';
          image.decoding = 'async';
          image.referrerPolicy = 'no-referrer';
          image.src = url;
          image.addEventListener('error', () => image.remove(), { once: true });
          thumbnail.append(image);
        }
        const content = element('div', 'card-content');
        const nameElement = element('p', 'card-title', name);
        nameElement.title = name;
        content.append(nameElement);
        const details = [];
        if (validNumber(card.pageviews)) details.push(`${numberFormat.format(card.pageviews)} vues / 30 j`);
        if (validNumber(card.atk) && validNumber(card.def)) details.push(`${numberFormat.format(card.atk)} ATK / ${numberFormat.format(card.def)} DEF`);
        if (details.length) content.append(element('p', 'card-details', details.join(' · ')));
        const rarity = element('span', 'rarity', rarityNames.has(card.rarity) ? card.rarity : '');
        if (rarityNames.has(card.rarity)) {
          rarity.dataset.rarity = card.rarity;
          rarity.setAttribute('aria-label', `Rareté ${card.rarity}`);
        } else rarity.hidden = true;
        row.append(thumbnail, content, rarity);
        cards.append(row);
      }
      group.append(groupHeader, cards);
      fragment.append(group);
    }
    historyList.replaceChildren(fragment);
    historyList.hidden = history.length === 0;
    empty.hidden = history.length !== 0;
  }

  function render() {
    toggle.setAttribute('aria-checked', String(Boolean(state.enabled)));
    toggle.disabled = !state.accountKey || togglePending;
    launcher.dataset.enabled = String(Boolean(state.enabled && state.accountKey));
    const attention = needsAttention();
    launcherGroup.dataset.attention = String(attention);
    launcher.dataset.attention = String(attention);
    launcherAttention.hidden = !attention;
    historyLauncher.hidden = !attention;
    if (attention) {
      launcher.removeAttribute('aria-haspopup');
      launcher.removeAttribute('aria-expanded');
    } else {
      launcher.setAttribute('aria-haspopup', 'dialog');
      launcher.setAttribute('aria-expanded', String(dialog.open));
      hideNotice();
    }
    const defaults = {
      idle: 'Un paquet ouvert dès que le stock atteint 10/10.',
      checking: 'Vérification des paquets…',
      opening: 'Ouverture du paquet…',
      verification: 'Vérification requise sur Paquets.',
      paused: 'Ouvertures en pause.',
      error: 'Les ouvertures sont interrompues.',
    };
    const message = toggleError || (typeof state.message === 'string' ? state.message : '')
      || (!state.accountKey ? 'Connectez-vous à Wiki Masters pour activer les ouvertures.'
        : !state.enabled ? 'Ouvertures désactivées.' : defaults[state.status] || defaults.idle);
    status.textContent = message;
    status.dataset.kind = toggleError ? 'error' : state.status;
    verificationLink.hidden = !attention;
    launcher.title = attention ? 'Aller aux paquets pour vérifier votre présence' : message;
    renderHistory();
  }

  function update(next = {}) {
    if (!alive) return;
    const accountChanged = Object.hasOwn(next, 'accountKey') && next.accountKey !== state.accountKey;
    if (accountChanged) hideNotice();
    state = { ...state, ...next, history: accountChanged ? next.history || [] : next.history || state.history };
    toggleError = '';
    render();
    syncDOM();
  }

  launcher.addEventListener('click', () => {
    if (needsAttention()) {
      hideNotice();
      location.assign('/pulls');
    } else open();
  }, { signal });
  historyLauncher.addEventListener('click', open, { signal });
  noticeClose.addEventListener('click', hideNotice, { signal });
  noticeLink.addEventListener('click', hideNotice, { signal });
  for (const name of ['pointerenter', 'focusin']) {
    notice.addEventListener(name, () => clearTimeout(noticeTimer), { signal });
  }
  for (const name of ['pointerleave', 'focusout']) {
    notice.addEventListener(name, () => {
      if (!notice.matches(':hover') && !notice.contains(noticeRoot.activeElement)) scheduleNoticeClose();
    }, { signal });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideNotice();
  }, { signal });
  closeButton.addEventListener('click', close, { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('close', () => {
    if (!needsAttention()) launcher.setAttribute('aria-expanded', 'false');
    historyLauncher.setAttribute('aria-expanded', 'false');
    if (!alive) return;
    syncDOM();
    const target = restoreFocus?.isConnected ? restoreFocus : launcher;
    target?.focus?.({ preventScroll: true });
    restoreFocus = null;
  }, { signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }, { signal });
  modalRoot.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a[href]')) close();
  }, { signal });
  toggle.addEventListener('click', async () => {
    if (toggle.disabled || !onToggle) return;
    togglePending = true;
    toggleError = '';
    render();
    try { await onToggle(!state.enabled); }
    catch { toggleError = 'Le réglage n’a pas pu être enregistré. Réessayez.'; }
    finally {
      togglePending = false;
      if (alive) render();
    }
  }, { signal });
  desktop.addEventListener('change', syncDOM, { signal });
  for (const root of [launcherRoot, modalRoot, noticeRoot]) {
    for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
      root.addEventListener(name, event => event.stopPropagation(), { signal });
    }
  }

  // Native dialog supplies modal focus containment and makes the page inert.
  const stylesReady = stylesheet().then(css => {
    if (!alive) return false;
    for (const root of [launcherRoot, modalRoot, noticeRoot]) {
      const style = element('style');
      style.textContent = css;
      root.prepend(style);
    }
    launcherHost.style.removeProperty('display');
    modalHost.style.removeProperty('display');
    noticeHost.style.removeProperty('display');
    return true;
  }).catch(() => {
    // A missing packaged asset is a packaging error; never expose an unstyled modal.
    return false;
  });

  render();
  syncDOM();
  return {
    update,
    syncDOM,
    notifyVerification,
    destroy() {
      if (!alive) return;
      close();
      const focus = restoreFocus?.isConnected ? restoreFocus : null;
      alive = false;
      hideNotice();
      controller.abort();
      launcherHost.remove();
      modalHost.remove();
      noticeHost.remove();
      focus?.focus?.({ preventScroll: true });
    },
  };
}
