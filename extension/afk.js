import { mountAfkUI } from './afk-ui.js';
import { normalizePackResponse } from './pack-cards.js';
import { networkFetch, getNetworkPause } from './network.js';
import { extensionAlive, onInvalidated, invalidatedError } from './runtime.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalPack = doc => doc.querySelector('button:has(img[alt="Ouvrir un paquet"])');
let accountKey = null;
let lastActivity = Date.now();
let probe;
let ui;
let syncTimer;
let refreshTimer;
let opening = false;
let pendingReceipt;
let lastHistoryId;
let lastVerifiedAt;
let lastPathname = location.pathname;
let runtimeUnavailable = false;

// An unpacked-extension reload can invalidate this tab's context. Chrome may
// throw synchronously, before sendMessage returns a promise.
async function wakeWorker(extra = {}) {
  if (runtimeUnavailable || !extensionAlive()) return;
  try { await chrome.runtime.sendMessage({ type: 'wme:afk-wake', ...extra }); }
  catch (error) { if (invalidatedError(error)) extensionAlive(); }
}

const onPulls = () => location.pathname.replace(/\/$/, '') === '/pulls';
const account = () => document.documentElement.getAttribute('data-wme-account');
const manualOpening = () => onPulls() && Boolean(
  document.documentElement.hasAttribute('data-wme-pack-opening')
  || document.querySelector('main [class*="animate-pack-shake"]')
  || (!normalPack(document) && document.querySelector('main [data-wme-reveal-pages],main [class*="animate-card-flip"]')));

function consumeChange(jobId) {
  if (!jobId || jobId === lastHistoryId) return;
  lastHistoryId = jobId;
  document.dispatchEvent(new Event('wme:collection-changed'));
  schedulePackRefresh();
}

function release(nonce) {
  if (!probe || (nonce && nonce !== probe.nonce)) return;
  const current = probe;
  probe = null;
  clearTimeout(current.timer);
  current.cancel?.();
  current.frame.remove();
}

function readPack(doc) {
  if (!doc) return null;
  // Ask the read-only adapter now: background timer throttling must not leave
  // its marker waiting behind the native page's constantly changing countdown.
  doc.dispatchEvent(new Event('wme:scan'));
  const button = normalPack(doc);
  try {
    const state = JSON.parse(button?.getAttribute('data-wme-pack-state'));
    if (!state || !UUID.test(state.accountKey) || !Number.isInteger(state.remaining)) return null;
    const verifiedAt = Date.parse(state.humanVerifiedAt);
    const blockedUntil = Date.parse(state.blockedUntil);
    const verifiedAge = Date.now() - verifiedAt;
    const verificationRequired = !Number.isFinite(verifiedAt) || verifiedAge < 0 || verifiedAge >= 12 * 60 * 60_000;
    const blocked = Number.isFinite(blockedUntil) && blockedUntil > Date.now();
    return { ...state, verificationRequired, blocked, canOpen: state.canOpen && !button.disabled && !verificationRequired && !blocked };
  } catch { return null; }
}

async function snapshot(expectedAccount) {
  if (opening || !navigator.onLine || account() !== expectedAccount) return null;
  const pause = getNetworkPause();
  if (pause.until > Date.now()) return { retryAfterMs: pause.until - Date.now() };
  release();
  const nonce = crypto.randomUUID();
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.loading = 'eager';
  frame.tabIndex = -1;
  frame.title = 'Synchronisation des paquets';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-wme', 'pack-worker');
  const url = new URL('/pulls', location.origin);
  url.searchParams.set('_wme_afk', nonce);
  frame.src = url.href;
  probe = { frame, nonce, at: Date.now(), timer: setTimeout(() => release(nonce), 60_000) };
  document.body.append(frame);
  try {
    const state = await new Promise(resolve => {
      let observer;
      let settled = false;
      const timeout = setTimeout(() => done(null), 25_000);
      function done(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        observer?.disconnect();
        frame.removeEventListener('load', loaded);
        resolve(value);
      }
      function inspect() {
        try {
          if (probe?.nonce !== nonce || account() !== expectedAccount) return done(null);
          const state = readPack(frame.contentDocument);
          if (state) done(state.accountKey === expectedAccount ? state : null);
        } catch { done(null); }
      }
      function loaded() {
        try {
          observer?.disconnect();
          observer = new MutationObserver(inspect);
          observer.observe(frame.contentDocument, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-wme-pack-state', 'disabled'] });
          inspect();
        } catch { done(null); }
      }
      probe.cancel = () => done(null);
      frame.addEventListener('load', loaded);
      if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.location.pathname === '/pulls') loaded();
    });
    if (!state || probe?.nonce !== nonce) { release(nonce); return null; }
    probe.at = Date.now();
    const native = onPulls() ? readPack(document) : null;
    if (native?.accountKey === expectedAccount && (native.remaining !== state.remaining
      || native.humanVerifiedAt !== state.humanVerifiedAt)) schedulePackRefresh();
    return { ...state, nonce };
  } catch { release(nonce); return null; }
}

function retryAfter(header) {
  if (!header) return 0;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : Math.max(0, Date.parse(header) - Date.now()) || 0;
}

async function persistReceipt(receipt) {
  pendingReceipt = receipt;
  await chrome.storage.local.set({ [`afk:receipt:${receipt.jobId}`]: receipt });
  pendingReceipt = null;
}

async function openPack(message) {
  const allowedNow = () => !opening && navigator.onLine && probe?.nonce === message.nonce && account() === message.accountKey
    && Date.now() - probe.at <= 45_000 && !manualOpening()
    && !(onPulls() && Date.now() - lastActivity < 30_000);
  if (!allowedNow()) {
    release(message.nonce);
    return { notStarted: true };
  }
  const preferences = await chrome.storage.local.get(['afkEnabled', `afk:${message.accountKey}`]);
  if (!allowedNow()) { release(message.nonce); return { notStarted: true }; }
  const state = readPack(probe.frame.contentDocument);
  if (preferences.afkEnabled === false || preferences[`afk:${message.accountKey}`]?.pending?.jobId !== message.jobId
    || !state?.canOpen || state.remaining !== 10 || state.accountKey !== message.accountKey) {
    release(message.nonce);
    return { notStarted: true };
  }
  opening = true;
  const receipt = { jobId: message.jobId, accountKey: message.accountKey, at: Date.now() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Délai dépassé', 'TimeoutError')), 25_000);
  try {
    const response = await networkFetch('/api/packs/open', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    }, { beforeSend: async () => {
      const values = await chrome.storage.local.get(['afkEnabled', `afk:${message.accountKey}`]);
      const current = probe?.nonce === message.nonce ? readPack(probe.frame.contentDocument) : null;
      if (values.afkEnabled === false || values[`afk:${message.accountKey}`]?.pending?.jobId !== message.jobId
        || account() !== message.accountKey || !navigator.onLine || manualOpening()
        || (onPulls() && Date.now() - lastActivity < 30_000)
        || !current?.canOpen || current.remaining !== 10 || current.accountKey !== message.accountKey
        || Date.now() - probe.at > 45_000) return false;
      // Consume the authorization only after network pacing, immediately before POST.
      release(message.nonce);
      return true;
    } });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      const pack = normalizePackResponse(payload);
      Object.assign(receipt, { kind: 'opened', cards: pack.cards,
        packsRemaining: pack.packsRemaining, packsLastRegenAt: pack.packsLastRegenAt });
    } else if (response.status >= 500) {
      receipt.kind = 'uncertain';
    } else {
      const hint = `${payload?.error || ''} ${payload?.code || ''}`;
      receipt.kind = payload?.human_verification_required || /human_verification_required/.test(hint) ? 'verification' : 'error';
      receipt.message = receipt.kind === 'verification' ? 'Vérification requise sur Paquets.'
        : response.status === 401 || response.redirected ? 'Reconnecte-toi à Wiki Masters.'
          : 'Ouverture suspendue par le site. Nouvelle vérification automatique.';
      receipt.retryAfterMs = retryAfter(response.headers.get('Retry-After'));
    }
  } catch (error) {
    if (error?.uncertain === false) {
      receipt.kind = error.code === 'REQUEST_CANCELLED' ? 'skipped' : 'error';
      receipt.message = receipt.kind === 'skipped' ? '' : 'Connexion à Wiki Masters en attente.';
      receipt.retryAfterMs = Math.max(0, Number(error.retryAfter) || 0) * 1_000;
    } else receipt.kind = 'uncertain';
  }
  finally { clearTimeout(timer); release(message.nonce); }
  try { await persistReceipt(receipt); }
  finally { opening = false; }
  return { received: true };
}

async function syncUI() {
  syncTimer = null;
  if (runtimeUnavailable || !extensionAlive()) return;
  const nextAccount = account();
  if (!UUID.test(nextAccount || '')) {
    accountKey = null;
    ui?.destroy();
    ui = null;
    return;
  }
  const changed = accountKey !== nextAccount;
  accountKey = nextAccount;
  const expected = accountKey;
  if (!ui) ui = mountAfkUI({ onToggle: async enabled => {
    await chrome.storage.local.set({ afkEnabled: enabled });
    if (enabled) void wakeWorker();
  } });
  ui.syncDOM();
  if (lastPathname !== location.pathname) {
    lastPathname = location.pathname;
    void wakeWorker();
  }
  const nativePack = onPulls() ? readPack(document) : null;
  if (nativePack?.accountKey === expected && !nativePack.verificationRequired && nativePack.humanVerifiedAt !== lastVerifiedAt) {
    lastVerifiedAt = nativePack.humanVerifiedAt;
    void wakeWorker({ accountKey: expected, verifiedAt: lastVerifiedAt });
  }
  const values = await chrome.storage.local.get(['afkEnabled', `afk:${expected}`]);
  if (accountKey !== expected || !ui) return;
  const saved = values[`afk:${expected}`] || {};
  if (nativePack?.accountKey === expected && saved.checkedAt > lastActivity && Date.now() - saved.checkedAt < 5 * 60_000
    && (nativePack.remaining !== saved.packsRemaining || nativePack.humanVerifiedAt !== saved.humanVerifiedAt)) schedulePackRefresh();
  if (changed) lastHistoryId = saved.history?.[0]?.id;
  ui.update({ ...saved, accountKey, enabled: values.afkEnabled !== false,
    status: values.afkEnabled === false ? 'paused' : saved.status || 'idle', history: saved.history || [] });
  if (values.afkEnabled !== false && saved.status === 'verification' && saved.attention?.id) {
    notifyVerification(expected, saved.attention.id).catch(() => {});
  }
  if (changed) void wakeWorker();
}

async function notifyVerification(expected, attentionId) {
  if (document.hidden || account() !== expected || !ui) return;
  const key = `afk:notice:${expected}`;
  await navigator.locks.request(`wme:afk-notice:${expected}`, { ifAvailable: true }, async lock => {
    if (!lock || document.hidden || account() !== expected || !ui) return;
    const values = await chrome.storage.local.get([key, 'afkEnabled', `afk:${expected}`]);
    const saved = values[`afk:${expected}`];
    if (values.afkEnabled === false || values[key]?.id === attentionId || saved?.attention?.id !== attentionId
      || saved.status !== 'verification' || document.hidden || account() !== expected || !ui) return;
    if (await ui.notifyVerification()) await chrome.storage.local.set({ [key]: { id: attentionId, at: Date.now() } });
  });
}

function scheduleUI() {
  if (runtimeUnavailable || syncTimer) return;
  syncTimer = setTimeout(() => syncUI().catch(error => { if (invalidatedError(error)) extensionAlive(); }), 200);
}

function schedulePackRefresh() {
  if (!onPulls()) { clearTimeout(refreshTimer); refreshTimer = null; return; }
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (!onPulls() || opening || !extensionAlive()) return;
    if (!navigator.onLine || getNetworkPause().until > Date.now()) return schedulePackRefresh();
    if (Date.now() - lastActivity < 30_000 || manualOpening() || document.querySelector('dialog[open],[role="dialog"],[data-wme-surface="dialog"]')
      || document.querySelector('[data-wme="afk-dialog"]')?.shadowRoot?.querySelector('dialog[open]')) return schedulePackRefresh();
    // Only the idle stock screen is refreshed; never interrupt a reveal or form.
    if (normalPack(document)) location.reload();
  }, 30_000);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!extensionAlive() || sender.id !== chrome.runtime.id) return;
  if (message?.type === 'wme:afk-probe') {
    respond({ ready: Boolean(UUID.test(account() || '') && navigator.onLine), accountKey: account(),
      idleMs: Date.now() - lastActivity, onPulls: onPulls(), manualOpening: manualOpening(), visible: !document.hidden });
  } else if (message?.type === 'wme:afk-snapshot') {
    snapshot(message.accountKey).then(respond, () => respond(null));
    return true;
  } else if (message?.type === 'wme:afk-release') { release(message.nonce); respond({ ok: true });
  } else if (message?.type === 'wme:afk-open') {
    openPack(message).then(respond, () => respond(null));
    return true;
  } else if (message?.type === 'wme:afk-opened' && message.accountKey === account()) {
    consumeChange(message.jobId);
    scheduleUI();
    respond({ ok: true });
  }
});

for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(name, event => { if (event.isTrusted) lastActivity = Date.now(); }, { passive: true, capture: true });
}
const observer = new MutationObserver(records => {
  if (records.some(record => !(record.target instanceof Element) || !record.target.closest('[data-wme]'))) scheduleUI();
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wme-account', 'data-wme-pack-state'] });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !extensionAlive()) return;
  const updated = changes[`afk:${accountKey}`];
  if (updated) consumeChange(updated.newValue?.history?.[0]?.id);
  if (changes.afkEnabled || updated) scheduleUI();
});
window.addEventListener('online', () => { void wakeWorker(); });
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && !runtimeUnavailable) {
    scheduleUI();
    try {
      if (pendingReceipt) await persistReceipt(pendingReceipt);
      await wakeWorker();
    } catch { /* Preserve an unsaved receipt; never replay the pack opening. */ }
  }
});
window.addEventListener('pagehide', () => release());
// Orphaned by an extension reload: stop observing and leave the native page alone.
onInvalidated(() => {
  runtimeUnavailable = true;
  observer.disconnect();
  clearTimeout(syncTimer);
  clearTimeout(refreshTimer);
  release();
  ui?.destroy();
  ui = null;
});
scheduleUI();
