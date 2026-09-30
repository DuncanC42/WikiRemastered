import { createMarketToolbar, createMarketExtras, createLateBidControls } from './market-ui.js';
import { createPriceLoader } from './prices.js';
import { MARKET_DEFAULTS, marketKey, isAccount, eligibleBid, withinBidWindow } from './market-policy.js';
import { loadMarketPage, loadAuction, normalizeAuction, placeBid, loadMarketBalance } from './market-api.js';
import { lateBidKey, LATE_BID_WINDOW_MS } from './late-bid-policy.js';
import { extensionAlive, onInvalidated } from './runtime.js';

const onMarket = () => location.pathname.replace(/\/$/, '') === '/marketplace';
const marketDetailId = () => {
  const parts = location.pathname.replace(/\/$/, '').split('/');
  return parts.length === 3 && parts[1] === 'marketplace' && isAccount(parts[2]) ? parts[2].toLowerCase() : null;
};
const onMarketPage = () => onMarket() || Boolean(marketDetailId());
const METRICS_KEY = 'marketMetrics';

// Opt-in "Vues et prix" switch, placed beside the native sort select.
function createMetricsSwitch(onChange) {
  const label = document.createElement('label');
  label.dataset.wme = 'market-metrics';
  label.title = 'Afficher les vues sur 30 jours et le prix conseillé sous chaque carte.';
  const control = document.createElement('button');
  control.type = 'button';
  control.setAttribute('role', 'switch');
  control.setAttribute('aria-checked', 'false');
  control.id = 'wme-market-metrics';
  const text = document.createElement('span');
  text.textContent = 'Vues et prix';
  label.htmlFor = control.id;
  label.append(control, text);
  control.addEventListener('click', () => onChange(control.getAttribute('aria-checked') !== 'true'));
  return {
    element: label,
    set(value) { if (control.getAttribute('aria-checked') !== String(value)) control.setAttribute('aria-checked', String(value)); },
  };
}
const sortSelect = () => {
  const selects = [...document.querySelectorAll('main select')];
  return selects.find(select => [...select.options].some(option => /récemment/i.test(option.textContent))) || selects[0] || null;
};
const accountNow = () => {
  const value = document.documentElement.getAttribute('data-wme-account');
  return isAccount(value) ? value : null;
};
let session = null;
let scheduled = null;
const inFlight = new Set();

function mismatch() {
  return Object.assign(new Error('Le compte Wiki Masters a changé.'), { code: 'AUTH_REQUIRED', uncertain: false });
}
function checkAccount(account) {
  if (accountNow() !== account) throw mismatch();
  if (navigator.onLine === false) throw Object.assign(new Error('Hors ligne.'), { uncertain: false, code: 'NETWORK_ERROR' });
}

const lateReservesAuction = plan => Boolean(plan?.active || plan?.pending || plan?.status === 'uncertain');
const refused = (message, code = 'INVALID_ARGUMENT') => Object.assign(new Error(message), { code, uncertain: false });

async function executeBid(message, account) {
  const late = message.action === 'late-bid';
  if (!isAccount(message.id) || !Number.isSafeInteger(message.amount) || message.amount < 1) {
    throw refused('Mise invalide.');
  }
  // Both bidding modes share this lock across tabs. Re-check under it, so a
  // queued keyword bid cannot compete with a newly scheduled last-minute bid.
  return navigator.locks.request(`wme:auction-bid:${account}:${message.id}`, async () => {
    checkAccount(account);
    const values = await chrome.storage.local.get([marketKey(account), lateBidKey(account)]);
    const plan = values[lateBidKey(account)]?.plans?.[message.id];
    if (!late && lateReservesAuction(plan)) throw refused('Enchère gérée par sa programmation.', 'AUCTION_RESERVED');
    const keywordState = values[marketKey(account)];
    if (late && (keywordState?.pending?.id === message.id
      || keywordState?.entries?.some(entry => entry.id === message.id && entry.status === 'unknown'))) {
      throw refused('Une mise précédente reste à vérifier dans Mes enchères.', 'MUTATION_PENDING');
    }
    const state = late ? plan : values[marketKey(account)];
    const pending = state?.pending;
    const valid = late
      ? state?.active && state.id === message.id && state.runId === message.runId
        && pending?.runId === message.runId && Number.isSafeInteger(state.maxBid) && message.amount <= state.maxBid
      : state?.active && state.id === message.sessionId && !lateReservesAuction(plan)
        && message.amount <= state.settings.maxBid && state.used <= state.settings.budget;
    if (!valid || pending?.jobId !== message.jobId || pending.id !== message.id
      || pending.amount !== message.amount || inFlight.has(message.jobId)) {
      throw refused('Mise non autorisée par la programmation.');
    }
    inFlight.add(message.jobId);
    try {
      let endAt;
      let auction;
      try {
        auction = normalizeAuction(await loadAuction(message.id));
        checkAccount(account);
        if (late) {
          const now = Date.now();
          if (!auction || auction.status !== 'active' || auction.sellerId === account
            || auction.bidderId === account || auction.minBid !== message.amount
            || auction.endAt <= now || auction.endAt - now > LATE_BID_WINDOW_MS) {
            throw refused('L’enchère a changé. Nouvelle lecture nécessaire.', 'AUCTION_CHANGED');
          }
        } else {
          // Undo only this pending reservation to evaluate the actual remaining
          // budget. An earlier accepted bid remains in the session's history.
          const candidateState = { ...state, pending: null, used: state.used - message.amount,
            attempted: pending.rebid ? state.attempted : state.attempted.filter(id => id !== message.id) };
          if (eligibleBid(auction, candidateState, account) !== message.amount) {
            throw refused('L’enchère a changé. Nouvelle lecture nécessaire.', 'AUCTION_CHANGED');
          }
        }
        endAt = auction.endAt;
        const balance = await loadMarketBalance();
        if (balance < message.amount) throw refused('Solde insuffisant. Programmation arrêtée.', 'insufficient_balance');
      } catch (error) { error.uncertain = false; throw error; }
      let reserved = false;
      let changed = false;
      const value = await placeBid(message.id, message.amount, { beforeSend: async () => {
        checkAccount(account);
        if (late) {
          if (Date.now() >= endAt || endAt - Date.now() > LATE_BID_WINDOW_MS) return false;
        } else {
          if (!withinBidWindow(auction, state.settings)) { changed = true; return false; }
          const current = (await chrome.storage.local.get(lateBidKey(account)))[lateBidKey(account)]?.plans?.[message.id];
          if (lateReservesAuction(current)) { reserved = true; return false; }
        }
        const authorization = await chrome.runtime.sendMessage({ ...message,
          type: late ? 'wme:late-authorize' : 'wme:market-authorize' });
        checkAccount(account);
        const inTime = Date.now() < endAt;
        if (!late && !inTime) changed = true;
        return authorization?.allowed === true && inTime;
      } }).catch(error => {
        if (reserved && error.uncertain === false) throw refused('Enchère gérée par sa programmation.', 'AUCTION_RESERVED');
        if (changed && error.uncertain === false) throw refused('L’enchère a changé.', 'AUCTION_CHANGED');
        throw error;
      });
      document.dispatchEvent(new Event('wme:balance-refresh'));
      return value;
    } finally { inFlight.delete(message.jobId); }
  });
}

// Fixed operations only. No page script can call this extension message port.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!extensionAlive() || sender.id !== chrome.runtime.id) return;
  if (message?.type === 'wme:market-probe') {
    const accountKey = accountNow();
    respond({ ready: Boolean(accountKey) && navigator.onLine !== false, accountKey, onMarket: onMarket() });
    return;
  }
  if (message?.type !== 'wme:market-command' || !isAccount(message.accountKey)) return;
  const execute = async () => {
    const account = message.accountKey;
    checkAccount(account);
    let value;
    if (message.action === 'list') {
      const result = await loadMarketPage({ page: message.page });
      value = { auctions: result.auctions.map(normalizeAuction).filter(Boolean), hasMore: result.hasMore };
    } else if (message.action === 'detail') {
      value = normalizeAuction(await loadAuction(message.id));
      if (!value) throw Object.assign(new Error('Enchère indisponible.'), { code: 'INVALID_RESPONSE', uncertain: false });
    } else if (message.action === 'bid' || message.action === 'late-bid') {
      value = await executeBid(message, account);
      // An account switch after a confirmed POST must not undo its reservation.
      return value;
    } else throw Object.assign(new Error('Action inconnue.'), { uncertain: false });
    checkAccount(account);
    return value;
  };
  execute().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: {
    message: error.message, code: error.code || 'NETWORK_ERROR', status: error.status || 0,
    retryAfter: error.retryAfter || null, uncertain: ['bid', 'late-bid'].includes(message.action) ? error.uncertain !== false : false,
  } }));
  return true;
});

function createSession(account) {
  let alive = true;
  let state = { settings: { ...MARKET_DEFAULTS, keywords: [] }, active: false, used: 0, entries: [] };
  let lateState = { plans: {} };
  let preferenceWrites = Promise.resolve();
  let editing = 0;
  const controller = new AbortController();
  const views = new Map();
  let detailView = null;
  let showMetrics = false;
  const metricsSwitch = createMetricsSwitch(value => {
    setMetrics(value);
    if (extensionAlive()) chrome.storage.local.set({ [METRICS_KEY]: value }).catch(() => {});
  });
  function setMetrics(value) {
    showMetrics = value === true;
    metricsSwitch.set(showMetrics);
    syncPrices();
  }
  chrome.storage.local.get(METRICS_KEY).then(values => { if (alive) setMetrics(values[METRICS_KEY]); }, () => {});
  const toolbar = createMarketToolbar({
    onStart: async settings => {
      await preferenceWrites;
      const result = await rpc('start', settings);
      if (alive) { state = result; render(); }
    },
    onStop: async () => {
      const result = await rpc('stop');
      if (alive) { state = result; render(); }
    },
    onLateStop: id => lateRpc('stop', { id }),
    onLateDismiss: id => lateRpc('dismiss', { id }),
    onSettingsChange: settings => {
      state.settings = settings;
      editing += 1;
      preferenceWrites = preferenceWrites.catch(() => {}).then(() => rpc('settings', settings)).then(result => {
        if (alive && editing === 1) { state = result; render(); }
      }, error => {
        if (alive) { state.error = error.message; render(); }
      }).finally(() => { editing -= 1; });
    },
  });
  async function rpc(action, settings) {
    if (!alive || accountNow() !== account) throw mismatch();
    const result = await chrome.runtime.sendMessage({ type: `wme:market-${action}`, accountKey: account, settings });
    if (!result?.ok) throw new Error(result?.error || 'Extension indisponible. Rechargez cet onglet.');
    return result.state;
  }
  async function lateRpc(action, payload = {}) {
    if (!alive || accountNow() !== account) throw mismatch();
    const result = await chrome.runtime.sendMessage({ type: `wme:late-${action}`, accountKey: account, ...payload });
    if (!result?.ok) throw new Error(result?.error || 'Programmation indisponible. Rechargez cet onglet.');
    if (alive) {
      lateState = result.state || { plans: {} };
      render();
      renderPrices();
    }
    return result.state;
  }
  const priceLoader = createPriceLoader({ accountKey: account, signal: controller.signal, onChange: () => renderPrices() });
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const view = views.get(entry.target);
      if (view) view.visible = entry.isIntersecting;
    }
    syncPrices();
  }, { rootMargin: '300px' });

  function render() {
    if (!alive) return;
    toolbar.update({ ...state, accountReady: accountNow() === account, latePlans: Object.values(lateState.plans || {}) });
  }
  function renderPrices() {
    if (!alive) return;
    for (const view of views.values()) {
      view.extras.update({ views: view.row.card.pageviews, price: priceLoader.snapshot(view.row), theme: 'dark', metrics: showMetrics,
        latePlan: lateState.plans?.[view.row.id] || null,
        lateAvailable: view.row.status === 'active' && view.row.sellerId !== account
          && isAccount(view.row.sellerId) && Number.isFinite(view.row.endAt) && view.row.endAt > Date.now(),
      });
    }
    if (detailView) detailView.controls.update({
      latePlan: lateState.plans?.[detailView.id] || null,
      lateAvailable: marketDetailId() === detailView.id && accountNow() === account
        && detailView.row.status === 'active' && detailView.row.sellerId !== account && detailView.row.endAt > Date.now(),
      theme: 'dark',
    });
  }
  function syncPrices() {
    // Hidden metrics cost nothing: no price is fetched until the switch is on.
    priceLoader.sync(showMetrics ? [...views.values()].filter(view => view.visible).map(view => view.row) : []);
    renderPrices();
  }
  function scan() {
    const heading = onMarket() ? document.querySelector('main h1') : null;
    const header = heading?.closest('div.flex.items-start.justify-between');
    if (header && toolbar.element.previousElementSibling !== header) header.after(toolbar.element);
    else if (!onMarket()) toolbar.element.remove();
    const select = onMarket() ? sortSelect() : null;
    // A select wrapped with its own icon is placed as a whole.
    const wrapper = select?.parentElement?.childElementCount <= 2 && select.parentElement.matches('.relative') ? select.parentElement : select;
    if (wrapper && wrapper.nextElementSibling !== metricsSwitch.element) wrapper.after(metricsSwitch.element);
    else if (!wrapper) metricsSwitch.element.remove();
    const id = marketDetailId();
    // Native /marketplace/[id] renders this exact bid input inside the block
    // containing balance, minimum bid and the explanation below the Miser CTA.
    const input = id ? document.querySelector('main input[type="number"][aria-label="Montant de la mise"]') : null;
    let anchor = input?.closest('div.card-frame.p-4.space-y-3');
    let detailRow;
    try { detailRow = JSON.parse(anchor?.getAttribute('data-wme-auction-detail')); } catch { /* Wait for a confirmed native detail. */ }
    if (detailRow?.id !== id || !isAccount(detailRow?.sellerId) || !Number.isFinite(detailRow?.endAt)) anchor = null;
    if (detailView && (detailView.id !== id || detailView.anchor !== anchor)) {
      detailView.controls.destroy();
      detailView = null;
    }
    if (id && anchor) {
      if (!detailView) detailView = { id, anchor, row: detailRow, controls: createLateBidControls({
        detail: true,
        onLateSet: maxBid => {
          if (marketDetailId() !== id) throw mismatch();
          return lateRpc('set', { id, maxBid });
        },
        onLateStop: () => lateRpc('stop', { id }),
        onLateDismiss: () => lateRpc('dismiss', { id }),
      }) };
      detailView.row = detailRow;
      if (anchor.nextElementSibling !== detailView.controls.element) anchor.after(detailView.controls.element);
    }
    for (const [wrapper, view] of views) {
      if (!wrapper.isConnected || !wrapper.hasAttribute('data-wme-auction-row')) {
        intersection.unobserve(wrapper);
        view.extras.destroy();
        views.delete(wrapper);
      }
    }
    for (const wrapper of document.querySelectorAll('main [data-wme-auction-row]')) {
      let row;
      try { row = JSON.parse(wrapper.getAttribute('data-wme-auction-row')); } catch { continue; }
      if (!isAccount(row?.id) || !isAccount(row?.card?.id)) continue;
      let view = views.get(wrapper);
      if (view && view.row.id !== row.id) {
        view.extras.destroy();
        intersection.unobserve(wrapper);
        views.delete(wrapper);
        view = null;
      }
      if (!view) {
        const id = row.id;
        view = { row, extras: createMarketExtras({
          onLateSet: maxBid => lateRpc('set', { id, maxBid }),
          onLateStop: () => lateRpc('stop', { id }),
          onLateDismiss: () => lateRpc('dismiss', { id }),
        }), visible: false };
        views.set(wrapper, view);
        intersection.observe(wrapper);
      }
      view.row = row;
      if (!view.extras.element.isConnected) wrapper.append(view.extras.element);
    }
    syncPrices();
    render();
  }
  function changed(changes, area) {
    if (area !== 'local' || !alive) return;
    if (changes[METRICS_KEY]) setMetrics(changes[METRICS_KEY].newValue);
    const next = changes[marketKey(account)]?.newValue;
    if (next) state = { ...next, ...(editing ? { settings: state.settings } : {}) };
    if (changes[lateBidKey(account)]) {
      lateState = changes[lateBidKey(account)].newValue || { plans: {} };
      renderPrices();
    }
    if (!next && !changes[lateBidKey(account)]) return;
    render();
  }
  chrome.storage.onChanged.addListener(changed);
  rpc('get').then(result => { if (alive) { state = result; render(); } }, error => {
    if (alive) { state.error = error.message; render(); }
  });
  lateRpc('get').catch(error => { if (alive) { state.error = error.message; render(); } });
  return {
    account, scan,
    destroy() {
      alive = false;
      controller.abort();
      intersection.disconnect();
      priceLoader.destroy();
      try { chrome.storage.onChanged.removeListener(changed); } catch { /* Invalidated. */ }
      toolbar.destroy();
      metricsSwitch.element.remove();
      detailView?.controls.destroy();
      detailView = null;
      for (const view of views.values()) view.extras.destroy();
      views.clear();
    },
  };
}

function sync() {
  scheduled = null;
  if (!extensionAlive()) return;
  const account = accountNow();
  syncLateWake(account);
  if (session && (!onMarketPage() || session.account !== account)) { session.destroy(); session = null; }
  if (onMarketPage() && account && !session) session = createSession(account);
  session?.scan();
}
function schedule() {
  if (scheduled === null) scheduled = setTimeout(sync, 100);
}
const observer = new MutationObserver(records => {
  if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes]
    .some(node => node.nodeType === Node.ELEMENT_NODE && !node.matches('[data-wme]')))) schedule();
});
observer.observe(document, { childList: true, subtree: true, attributes: true,
  attributeFilter: ['data-wme-account', 'data-wme-auction-row', 'data-wme-auction-detail'] });
window.addEventListener('popstate', schedule);
window.addEventListener('pageshow', schedule);

// A content timer supplements durable browser alarms in the final minute.
// It only wakes the worker; all reads, backoff and bids remain coordinated there.
let lateWakeAccount = null;
let lateWakePlans = {};
let lateWakeTimer;
let lateWakeSending = false;
let lastLateWakeAt = 0;
let lateWakeRetryAt = 0;
function armLateWake() {
  clearTimeout(lateWakeTimer);
  if (!lateWakeAccount || navigator.onLine === false || lateWakeSending) return;
  const active = Object.values(lateWakePlans).filter(plan => plan?.active && !plan.pending);
  if (!active.length) return;
  const due = Math.min(...active.map(plan => Number.isFinite(plan.nextAt) ? plan.nextAt : plan.endAt - LATE_BID_WINDOW_MS));
  if (!Number.isFinite(due)) return;
  const remaining = Math.max(due, lastLateWakeAt + 8_000, lateWakeRetryAt) - Date.now();
  lateWakeTimer = setTimeout(async () => {
    const accountKey = lateWakeAccount;
    if (!accountKey || accountNow() !== accountKey || navigator.onLine === false || !extensionAlive()) return;
    lateWakeSending = true;
    lastLateWakeAt = Date.now();
    try { await chrome.runtime.sendMessage({ type: 'wme:late-wake', accountKey }); lateWakeRetryAt = 0; }
    catch { lateWakeRetryAt = Date.now() + 30_000; }
    finally { lateWakeSending = false; armLateWake(); }
  }, Math.min(2_147_483_647, Math.max(1_000, remaining)));
}
function syncLateWake(account) {
  if (lateWakeAccount === account) return;
  lateWakeAccount = account;
  lateWakePlans = {};
  lastLateWakeAt = 0;
  lateWakeRetryAt = 0;
  clearTimeout(lateWakeTimer);
  if (!account) return;
  chrome.storage.local.get(lateBidKey(account)).then(values => {
    if (lateWakeAccount !== account) return;
    lateWakePlans = values[lateBidKey(account)]?.plans || {};
    armLateWake();
  }).catch(() => {});
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !extensionAlive() || !lateWakeAccount || !changes[lateBidKey(lateWakeAccount)]) return;
  lateWakePlans = changes[lateBidKey(lateWakeAccount)].newValue?.plans || {};
  armLateWake();
});
window.addEventListener('online', armLateWake);
document.addEventListener('visibilitychange', () => { if (!document.hidden) armLateWake(); });
onInvalidated(() => {
  observer.disconnect();
  clearTimeout(scheduled);
  clearTimeout(lateWakeTimer);
  lateWakeAccount = null;
  session?.destroy();
  session = null;
});
sync();
