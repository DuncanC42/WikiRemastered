import { getMarketSummary, getSuggestedPriceFromSummary } from './api.js';
import { getNetworkPause } from './network.js';

const FRESH_MS = 30 * 60_000;
const RETAIN_MS = 24 * 60 * 60_000;
const START_SPACING_MS = 1_500;
const MAX_ENTRIES = 1_000;
const abortError = () => new DOMException('Opération annulée.', 'AbortError');
const cardIdOf = (row) => row?.card?.id;
const canPrice = row => typeof cardIdOf(row) === 'string'
  && typeof (row.snapshot_rarity ?? row.card?.rarity) === 'string'
  && Boolean((row.snapshot_rarity ?? row.card?.rarity).trim());

function wait(ms, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    function cancel() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function failureOf(error, previous) {
  const code = error.code || 'API_ERROR';
  const auth = ['PRICE_ACCESS_REQUIRED', 'AUTH_REQUIRED'].includes(code);
  const kind = auth ? 'access' : error.status === 403 && code !== 'RATE_LIMITED' ? 'forbidden' : 'transient';
  const count = previous?.kind === kind ? Math.min(previous.count + 1, 20) : 1;
  const delay = kind === 'access'
    ? Math.min(60 * 60_000, 15 * 60_000 * 2 ** (count - 1))
    : kind === 'forbidden'
      ? Math.min(15 * 60_000, 60_000 * 2 ** (count - 1))
      : Math.min(15 * 60_000, 30_000 * 2 ** (count - 1));
  const message = code === 'AUTH_REQUIRED' ? 'Reconnectez-vous à WikiMasters. Vérification automatique de la session.'
    : code === 'PRICE_ACCESS_REQUIRED' ? 'L’accès aux prix est restreint par WikiMasters. Vérification automatique.'
      : kind === 'forbidden' ? 'WikiMasters refuse l’accès aux prix. Reprise automatique après une pause.'
        : code === 'RATE_LIMITED' ? 'WikiMasters limite les requêtes. Reprise automatique après une pause.'
          : ['NETWORK_ERROR', 'TIMEOUT'].includes(code) ? 'Connexion à WikiMasters interrompue. Reprise automatique.'
            : 'Les prix sont temporairement indisponibles. Reprise automatique.';
  return { kind, count, code, message, delay };
}

/** One account/origin queue coordinates all tabs. Successful summaries cover every
 * rarity of a catalog card; errors never become the site's default 10 WB price. */
export function createPriceLoader({ accountKey, onChange, signal } = {}) {
  if (typeof accountKey !== 'string' || !accountKey.trim()) throw new Error('Le compte est nécessaire au chargement des prix.');
  const key = `wme:prices:v2:${location.origin}:${accountKey}`;
  const lockName = `${key}:request`;
  const controller = new AbortController();
  const jobs = new Map();
  let wanted = new Set();
  let cache = {};
  let meta = {};
  let initialized = false;
  let paused = false;
  let running = false;
  let destroyed = false;
  let activeId = null;
  let timer;
  let notificationQueued = false;
  let wakeReason = '';
  let storageFailure = null;

  const available = () => !destroyed && !paused && !document.hidden && navigator.onLine !== false;

  function notify() {
    if (destroyed || notificationQueued) return;
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      if (!destroyed) onChange?.();
    });
  }

  function acceptStored(value) {
    const entries = value?.entries || {};
    for (const [id, entry] of Object.entries(entries)) {
      if (entry?.at > (cache[id]?.at || 0)) cache[id] = entry;
    }
    // Storage notifications can arrive after the next local update has begun.
    if ((value?.meta?.revision || 0) >= (meta.revision || 0)) {
      const serverUntil = Math.max(meta.serverUntil || 0, value?.meta?.serverUntil || 0);
      meta = { ...value?.meta, serverUntil };
    }
  }

  async function reload() {
    const stored = await chrome.storage.local.get(key);
    acceptStored(stored[key]);
  }

  async function save() {
    cache = Object.fromEntries(Object.entries(cache)
      .filter(([, entry]) => entry?.at > Date.now() - RETAIN_MS)
      .sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES));
    meta = { ...meta, revision: (meta.revision || 0) + 1 };
    await chrome.storage.local.set({ [key]: { entries: cache, meta } });
  }

  function storageFailed() {
    const count = Math.min((storageFailure?.count || 0) + 1, 6);
    storageFailure = { count, until: Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (count - 1)) };
  }

  function entryFor(id) {
    const entry = cache[id];
    return entry?.at > Date.now() - RETAIN_MS ? entry : null;
  }

  function requestDue() {
    let retryAt = meta.retryAt || 0;
    // Regained connectivity/session focus can warrant one early probe, but never
    // bypass Retry-After or create a burst of probes when focus changes repeatedly.
    if (wakeReason && meta.failure) {
      const sessionWake = meta.failure.kind === 'access';
      const networkWake = wakeReason === 'online' && meta.failure.kind === 'transient';
      if (sessionWake || networkWake) {
        retryAt = Math.min(retryAt, (meta.lastStart || 0) + (sessionWake ? 60_000 : 10_000));
      }
    }
    return Math.max(retryAt, meta.serverUntil || 0, meta.nextAt || 0, storageFailure?.until || 0, getNetworkPause().until);
  }

  function snapshot(row) {
    if (!canPrice(row)) return { status: 'unavailable', value: null, stale: false, error: '', errorCode: null, retryAt: null, retryable: false };
    const id = cardIdOf(row);
    const entry = entryFor(id);
    let value = null;
    if (entry) {
      try { value = getSuggestedPriceFromSummary(row, entry.summary); } catch { /* A malformed value is never shown as a price. */ }
    }
    const fresh = Boolean(value && entry.at > Date.now() - FRESH_MS);
    if (fresh) return { status: 'ready', value, stale: false, error: '', errorCode: null, retryAt: null, retryable: false };
    const due = requestDue();
    const offline = navigator.onLine === false;
    const networkPaused = getNetworkPause().until > Date.now();
    const failure = meta.failure;
    const error = offline ? 'Connexion internet indisponible. Reprise automatique au retour du réseau.'
      : storageFailure ? 'Le stockage de l’extension est temporairement indisponible. Reprise automatique.'
        : failure?.message || (networkPaused ? 'WikiMasters est temporairement indisponible. Reprise automatique après une pause.' : '');
    const errorCode = offline ? 'OFFLINE' : storageFailure ? 'STORAGE_ERROR' : failure?.code || (networkPaused ? 'NETWORK_PAUSED' : null);
    const blocked = !available() || due > Date.now();
    return {
      status: blocked ? 'paused' : activeId === id || wanted.has(id) || !initialized ? 'loading' : 'idle',
      value, stale: Boolean(value), error, errorCode,
      retryAt: offline || document.hidden || paused ? null : due > Date.now() ? due : null,
      retryable: false,
    };
  }

  function enqueue(row) {
    const id = cardIdOf(row);
    if (destroyed || !canPrice(row) || !id) return;
    wanted.add(id);
    const job = jobs.get(id) || { id, row, lastAttempt: 0 };
    job.row = row;
    jobs.set(id, job);
    schedule();
  }

  function sync(rows) {
    if (destroyed) return;
    rows = Array.from(rows).filter(canPrice);
    wanted = new Set(rows.map(cardIdOf).filter(Boolean));
    for (const row of rows) enqueue(row);
    schedule();
  }

  function plan() {
    const visible = [...jobs.values()].filter((job) => wanted.has(job.id));
    if (!visible.length) return null;
    const stale = visible.filter((job) => !(entryFor(job.id)?.at > Date.now() - FRESH_MS));
    const next = stale.sort((a, b) => a.lastAttempt - b.lastAttempt)[0];
    if (next) return { job: next, due: requestDue() };
    if (storageFailure) return { job: visible[0], due: storageFailure.until };
    // A stable DOM still refreshes expired prices while those cards remain visible.
    return { due: Math.min(...visible.map((job) => entryFor(job.id).at + FRESH_MS)) };
  }

  function schedule() {
    clearTimeout(timer);
    if (!available() || !initialized || running) return;
    const next = plan();
    if (!next) return;
    timer = setTimeout(() => {
      notify();
      void drain();
    }, Math.min(2_147_483_647, Math.max(1, next.due - Date.now())));
  }

  async function run(job) {
    await navigator.locks.request(lockName, { signal: controller.signal }, async () => {
      if (!available() || !wanted.has(job.id)) return;
      await reload();
      if (storageFailure) {
        await save();
        storageFailure = null;
      }
      if (entryFor(job.id)?.at > Date.now() - FRESH_MS) return;
      const due = requestDue();
      if (due > Date.now()) return;
      await wait(Math.max(0, (meta.nextAt || 0) - Date.now()), controller.signal);
      if (!available() || !wanted.has(job.id)) return;
      wakeReason = '';
      job.lastAttempt = Date.now();
      meta.lastStart = Date.now();
      meta.nextAt = meta.lastStart + START_SPACING_MS;
      await save();
      if (!available() || !wanted.has(job.id)) return;
      activeId = job.id;
      notify();
      try {
        const summary = await getMarketSummary(job.id, { signal: controller.signal });
        getSuggestedPriceFromSummary(job.row, summary);
        cache[job.id] = { summary, at: Date.now() };
        delete meta.failure;
        delete meta.retryAt;
        delete meta.serverUntil;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        // Another feature may already have paused requests. Waiting on that
        // shared pause is not a new failed price request.
        if (error.code !== 'NETWORK_PAUSED') {
          const failure = failureOf(error, meta.failure);
          meta.failure = failure;
          meta.retryAt = Date.now() + failure.delay;
        }
        const serverDelay = Number.isFinite(error.retryAfter) ? Math.max(0, error.retryAfter * 1_000) : 0;
        meta.serverUntil = Math.max(meta.serverUntil || 0, Date.now() + serverDelay);
      } finally {
        activeId = null;
        if (!destroyed) await save();
      }
    });
  }

  async function drain() {
    if (running || !available() || !initialized) return;
    running = true;
    try {
      while (available()) {
        const next = plan();
        if (!next?.job || next.due > Date.now()) break;
        try { await run(next.job); }
        catch (error) {
          if (error.name === 'AbortError') break;
          storageFailed();
        }
        notify();
      }
    } finally {
      running = false;
      schedule();
    }
  }

  function onStorage(changes, area) {
    if (area !== 'local' || !changes[key] || destroyed) return;
    acceptStored(changes[key].newValue);
    notify();
    schedule();
  }

  function onVisibility() {
    notify();
    schedule();
  }

  function onWake(event) {
    if (event.type === 'online' || event.type === 'focus') wakeReason = event.type;
    notify();
    schedule();
  }

  function setPaused(value) {
    paused = Boolean(value);
    notify();
    schedule();
  }

  function destroy() {
    destroyed = true;
    clearTimeout(timer);
    controller.abort();
    try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* Invalidated. */ }
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('wme:network-state', onVisibility);
    window.removeEventListener('online', onWake);
    window.removeEventListener('offline', onWake);
    window.removeEventListener('focus', onWake);
    signal?.removeEventListener('abort', destroy);
    jobs.clear();
  }

  chrome.storage.onChanged.addListener(onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('wme:network-state', onVisibility);
  window.addEventListener('online', onWake);
  window.addEventListener('offline', onWake);
  window.addEventListener('focus', onWake);
  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted) destroy();
  else {
    reload().catch(storageFailed).finally(() => {
      initialized = true;
      notify();
      schedule();
    });
  }
  return { snapshot, enqueue, sync, setPaused, destroy };
}
