const SPACING_MS = 1_500;
const MAX_BACKOFF_MS = 15 * 60_000;
const origin = globalThis.location?.origin || '';
const storageKey = `wme:network:${origin}`;
const lockName = `${storageKey}:request`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
let cached = { until: 0, nextAt: 0, failures: 0, code: null, revision: 0 };

export class NetworkError extends Error {
  constructor(message, { code, status = 0, retryAfter = null, uncertain = false, cause } = {}) {
    super(message, { cause });
    this.name = 'NetworkError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.uncertain = uncertain;
  }
}

const html = value => typeof value === 'string'
  && /<!doctype\s+html|<\/?(?:html|head|body|script|style|title|meta|div|p|h[1-6])(?:\s|\/?>)|&lt;(?:!doctype|html|head|body)\b/i.test(value);
const gateway = value => typeof value === 'string'
  && /cloudflare|ssl\s+handshake|bad\s+gateway|gateway\s+time.?out|origin\s+(?:is\s+)?unreachable|upstream\s+connect\s+error|web\s+server\s+is\s+(?:down|returning)|(?:error|code)\s*[:#]?\s*52[0-7]\b|(?:service\s+temporarily\s+unavailable|internal\s+server\s+error)/i.test(value);

/** Server errors are plain text, never a gateway document or its identifiers. */
export function safeServerMessage(value) {
  if (typeof value !== 'string' || html(value) || gateway(value) || /<\/?[a-z][^>]*>/i.test(value)) return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return text ? text.slice(0, 300) : null;
}

export function getNetworkPause() {
  return cached.until > Date.now() ? { until: cached.until, code: cached.code } : { until: 0, code: null };
}

function accept(value) {
  if (!object(value) || !integer(value.revision) || value.revision < cached.revision) return;
  const previous = `${cached.until}:${cached.code}`;
  cached = {
    until: integer(value.until) ? value.until : 0,
    nextAt: integer(value.nextAt) ? value.nextAt : 0,
    failures: integer(value.failures) ? Math.min(value.failures, 10) : 0,
    code: typeof value.code === 'string' ? value.code : null,
    revision: value.revision,
  };
  if (previous !== `${cached.until}:${cached.code}` && globalThis.document) {
    document.dispatchEvent(new CustomEvent('wme:network-state', { detail: getNetworkPause() }));
  }
}

async function readState() {
  const result = await chrome.storage.local.get(storageKey);
  if (result[storageKey]) accept(result[storageKey]);
  return { ...cached };
}

async function writeState(state) {
  state.revision = Math.max(state.revision, cached.revision) + 1;
  await chrome.storage.local.set({ [storageKey]: state });
  accept(state);
}

if (globalThis.chrome?.storage?.local) {
  void readState().catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[storageKey]?.newValue) accept(changes[storageKey].newValue);
  });
}

function cancelled() {
  return new NetworkError('Action annulée avant son envoi.', { code: 'REQUEST_CANCELLED', uncertain: false });
}

function paused(state = cached) {
  return new NetworkError('WikiMasters est temporairement indisponible. Reprise automatique après une pause.', {
    code: 'NETWORK_PAUSED', retryAfter: Math.max(1, Math.ceil((state.until - Date.now()) / 1_000)), uncertain: false,
  });
}

function retryAt(header) {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Date.now() + Math.max(0, seconds * 1_000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? at : 0;
}

async function failed(state, code, { limited = false, retry = 0 } = {}) {
  state.failures = Math.min(10, state.failures + 1);
  const base = Math.min(MAX_BACKOFF_MS, (limited ? 60_000 : 30_000) * 2 ** (state.failures - 1));
  const delay = Math.min(MAX_BACKOFF_MS, base + Math.floor(Math.random() * Math.min(30_000, base * .2)));
  state.until = Math.max(state.until, Date.now() + delay, retry);
  state.code = code;
  try { await writeState(state); }
  catch {
    // Retain the local pause if storage becomes unavailable after a request.
    // Never turn a confirmed mutation into a retry because bookkeeping failed.
    accept({ ...state, revision: Math.max(state.revision, cached.revision) + 1 });
  }
  return Math.ceil((state.until - Date.now()) / 1_000);
}

function knownSuccess(path, payload) {
  if (!object(payload) || payload.error || payload.success === false) return false;
  if (path === '/api/my-collection') return Array.isArray(payload.collection);
  if (path === '/api/my-collection/stats') return integer(payload.total);
  if (path === '/api/trades') return Array.isArray(payload.trades);
  if (/^\/api\/marketplace\/cards\/[^/]+\/sales$/.test(path)) return object(payload.summary);
  if (path === '/api/marketplace') return Array.isArray(payload.auctions) && typeof payload.hasMore === 'boolean';
  if (/^\/api\/marketplace\/[^/]+$/.test(path)) return object(payload.auction) && typeof payload.auction.id === 'string';
  if (/^\/api\/marketplace\/[^/]+\/bid$/.test(path)) return integer(payload.current_bid) && integer(payload.bidder_balance);
  if (path === '/api/wikibidous') return integer(payload.balance);
  if (path === '/api/packs/open') return Array.isArray(payload.cards) && payload.cards.length > 0 && integer(payload.packs_remaining);
  if (path === '/api/user-cards/bulk-discard') return integer(payload.discarded_count) && Array.isArray(payload.failed);
  return false;
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(cancelled()); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** navigator.locks.request() that also works from a Firefox content script. There, the lock
 * manager belongs to the page and reading `then` on the extension's promise is a "Permission
 * denied": the held phase is handed over as a promise of the page's own, and the callback runs
 * entirely on the extension's side (its results and errors never cross over). Chrome: unchanged. */
export function requestLock(name, options, callback) {
  const page = typeof window === 'object' ? window.wrappedJSObject : undefined;
  if (typeof exportFunction !== 'function' || !page?.Promise) return navigator.locks.request(name, options, callback);
  return new Promise((resolve, reject) => {
    const held = lock => new page.Promise(exportFunction(release => {
      Promise.resolve().then(() => callback(lock)).then(resolve, reject).finally(() => release());
    }, page));
    navigator.locks.request(name, options, exportFunction(held, page)).catch(reject);
  });
}

/** One origin-wide request at a time, including its body. Waiting for a free
 * slot may repeat; no HTTP request, especially no mutation, is ever replayed.
 * beforeSend is the caller's final authorization after any queueing delay. */
export async function networkFetch(path, options = {}, { beforeSend } = {}) {
  const url = new URL(path, origin);
  if (!/^https:\/\/(www\.)?wiki-masters\.com$/.test(origin) || url.origin !== origin || !url.pathname.startsWith('/api/')) {
    throw new NetworkError('Adresse WikiMasters invalide.', { code: 'WRONG_ORIGIN' });
  }
  const mutation = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const signal = options.signal;
  if (!navigator.locks?.request || !globalThis.chrome?.storage?.local) throw paused({ until: Date.now() + 30_000 });
  while (true) {
    if (signal?.aborted) throw cancelled();
    let result;
    try {
      result = await requestLock(lockName, { mode: 'exclusive', ...(signal ? { signal } : {}) }, async () => {
        let state;
        try { state = await readState(); }
        catch { throw paused({ until: Date.now() + 30_000 }); }
        if (state.until > Date.now()) throw paused(state);
        if (state.nextAt > Date.now()) return { wait: state.nextAt - Date.now() };
        state.nextAt = Date.now() + SPACING_MS;
        try { await writeState(state); }
        catch { throw paused({ until: Date.now() + 30_000 }); }
        if (signal?.aborted) throw cancelled();
        if (beforeSend) {
          try { if (await beforeSend() === false) throw cancelled(); }
          catch { throw cancelled(); }
        }
        if (signal?.aborted) throw cancelled();
        try {
          const response = await fetch(url.href, options);
          const text = await response.clone().text();
          let payload;
          try { payload = JSON.parse(text); } catch { /* Error pages are inspected as text only. */ }
          const hints = [payload?.error, payload?.message, payload?.error?.message];
          const isGateway = response.status >= 500 || hints.some(value => html(value) || gateway(value))
            || (!response.redirected && response.status !== 401 && (html(text) && /^\s*</.test(text) || gateway(text) && !object(payload)));
          const limited = response.status === 429 || response.status === 403;
          if (isGateway) {
            const retryAfter = await failed(state, 'SERVICE_UNAVAILABLE', { limited, retry: retryAt(response.headers.get('Retry-After')) });
            throw new NetworkError('WikiMasters est temporairement indisponible. Reprise automatique après une pause.', {
              code: 'SERVICE_UNAVAILABLE', status: response.status, retryAfter,
              uncertain: mutation && (response.ok || response.status >= 500),
            });
          }
          if (limited) {
            await failed(state, response.status === 429 ? 'RATE_LIMITED' : 'FORBIDDEN', {
              limited: true, retry: retryAt(response.headers.get('Retry-After')),
            });
          } else if (response.ok && !response.redirected && state.until <= Date.now() && knownSuccess(url.pathname, payload)) {
            if (state.failures || state.until || state.code) {
              state.failures = 0; state.until = 0; state.code = null;
              try { await writeState(state); } catch { /* Successful data stays successful. */ }
            }
          }
          return { response };
        } catch (error) {
          if (error instanceof NetworkError) throw error;
          const intentionalAbort = signal?.aborted && signal.reason?.name === 'AbortError';
          const code = signal?.reason?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR';
          const retryAfter = intentionalAbort ? null : await failed(state, code);
          throw new NetworkError(mutation ? 'La réponse de WikiMasters a été interrompue. Résultat de l’action à vérifier.'
            : 'Connexion à WikiMasters interrompue. Reprise automatique après une pause.', {
            code, retryAfter, uncertain: mutation,
          });
        }
      });
    } catch (error) {
      if (error instanceof NetworkError) throw error;
      if (signal?.aborted) throw cancelled();
      throw paused({ until: Date.now() + 30_000 });
    }
    if (result.response) return result.response;
    // Other tabs may use this time. Always reload the shared gate under the
    // lock after sleeping, so only one request probes an expired circuit.
    await wait(result.wait, signal);
  }
}
