import { ApiError } from './api.js';
import { NetworkError, networkFetch, getNetworkPause, safeServerMessage } from './network.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 50;
const RARITIES = new Set(['C', 'PC', 'R', 'SR', 'UR', 'L']);
const STATUSES = new Set(['active', 'settled_sold', 'settled_unsold', 'cancelled']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

function invalidResponse({ status = 0, uncertain = false } = {}) {
  return new ApiError(uncertain
    ? 'Le résultat de la mise est incertain. Vérifiez vos enchères avant de reprendre.'
    : 'Les données du marché sont incomplètes. Nouvelle vérification nécessaire.', {
    code: 'INVALID_RESPONSE', status, uncertain,
  });
}

function validId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new ApiError('Identifiant d’enchère invalide.', { code: 'INVALID_ARGUMENT' });
  }
  return id.toLowerCase();
}

function retryDelay(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1_000)) : null;
}

// Only the verified marketplace routes below can issue requests. In particular,
// a mutation is never replayed after a lost or ambiguous server response.
async function request(path, { signal, method = 'GET', body, beforeSend } = {}) {
  if (signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
  if (!/^https:\/\/(www\.)?wiki-masters\.com$/.test(location.origin)) {
    throw new ApiError('Ouvrez le marché sur WikiMasters.', { code: 'WRONG_ORIGIN' });
  }
  const mutation = method === 'POST';
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Délai de réponse dépassé.', 'TimeoutError'));
  }, TIMEOUT_MS);
  try {
    const response = await networkFetch(path, {
      method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    }, { beforeSend });
    const pause = getNetworkPause();
    const serverRetryAfter = retryDelay(response.headers.get('Retry-After'));
    const retryAfter = Math.max(serverRetryAfter || 0,
      Math.ceil(Math.max(0, pause.until - Date.now()) / 1_000)) || null;
    let payload;
    try { payload = await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; }
    const serverMessage = [payload?.error, payload?.message].map(safeServerMessage).find(Boolean);
    const serverCode = typeof payload?.code === 'string' ? payload.code.slice(0, 100) : '';
    if (!response.ok) {
      const limited = response.status === 429 || (response.status === 403 && (serverRetryAfter !== null
        || /rate.?limit|too many requests|trop de requ[eê]tes/i.test(`${serverCode} ${serverMessage || ''}`)));
      const code = response.status === 401 ? 'AUTH_REQUIRED' : limited ? 'RATE_LIMITED'
        : response.status === 403 ? 'FORBIDDEN' : serverCode || 'HTTP_ERROR';
      const error = new ApiError(serverMessage || (response.status === 401
        ? 'Reconnectez-vous à WikiMasters pour reprendre les enchères.'
        : limited ? 'WikiMasters limite les requêtes. Les enchères sont en pause.'
          : 'WikiMasters ne peut pas traiter cette demande.'), {
        code, status: response.status, retryAfter, uncertain: mutation && response.status >= 500,
      });
      if (integer(payload?.min) && payload.min >= 1) error.min = payload.min;
      throw error;
    }
    if (!object(payload)) throw invalidResponse({ status: response.status, uncertain: mutation });
    if (payload.error) {
      // A success status carrying an error is inconsistent: do not release a
      // reserved budget until the user has checked the actual auction result.
      throw new ApiError(serverMessage || 'WikiMasters n’a pas confirmé cette action.', {
        code: serverCode || 'INVALID_RESPONSE', status: response.status, retryAfter, uncertain: mutation,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof NetworkError) {
      if (!mutation && signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
      throw new ApiError(error.message, {
        code: timedOut && error.code === 'REQUEST_CANCELLED' ? 'TIMEOUT' : error.code,
        status: error.status, retryAfter: error.retryAfter, uncertain: error.uncertain, cause: error,
      });
    }
    if (!mutation && signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
    throw new ApiError(mutation
      ? 'Le résultat de la mise est incertain. Vérifiez vos enchères avant de reprendre.'
      : timedOut ? 'WikiMasters met trop de temps à répondre.' : 'Connexion à WikiMasters interrompue.', {
      code: mutation ? 'MUTATION_UNCERTAIN' : timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      uncertain: mutation, cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function loadMarketPage({ page = 1, query = '', signal } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || typeof query !== 'string' || query.length > 200) {
    throw new ApiError('Recherche de marché invalide.', { code: 'INVALID_ARGUMENT' });
  }
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: 'ending_soon' });
  if (query.trim()) params.set('q', query.trim());
  const payload = await request(`/api/marketplace?${params}`, { signal });
  if (!Array.isArray(payload.auctions) || payload.auctions.length > PAGE_SIZE
    || typeof payload.hasMore !== 'boolean'
    || payload.auctions.some(row => !object(row) || typeof row.id !== 'string' || !UUID.test(row.id))) {
    throw invalidResponse();
  }
  return { auctions: payload.auctions, hasMore: payload.hasMore };
}

/** The API card is already the effective auction snapshot used by the native
 * detail screen. Never substitute a catalog rarity or guess missing bid data. */
export function normalizeAuction(raw) {
  if (!object(raw) || typeof raw.id !== 'string' || !UUID.test(raw.id)
    || !object(raw.card) || typeof raw.card.id !== 'string' || !UUID.test(raw.card.id)
    || !RARITIES.has(raw.card.rarity) || typeof raw.card.wikipedia_title !== 'string'
    || !raw.card.wikipedia_title.trim()
    || typeof raw.seller_id !== 'string' || !UUID.test(raw.seller_id)
    || !STATUSES.has(raw.status) || typeof raw.end_at !== 'string'
    || !Number.isFinite(Date.parse(raw.end_at)) || !integer(raw.base_amount) || raw.base_amount < 1) return null;

  // Missing fields cannot be interpreted as "no one has bid". The native API
  // uses an explicit null for that state, as seen in both listing and detail.
  if (!Object.hasOwn(raw, 'current_bid') || !Object.hasOwn(raw, 'current_bidder_id')) return null;
  const currentBid = raw.current_bid;
  const bidderId = raw.current_bidder_id;
  if (currentBid !== null && (!integer(currentBid) || currentBid < 1)) return null;
  if (bidderId !== null && (typeof bidderId !== 'string' || !UUID.test(bidderId))) return null;
  if ((currentBid === null) !== (bidderId === null)) return null;

  // Exact native detail rule (0xtc0t2gwbo4c.js, C/E): +10%, rounded up,
  // at least one WB; an auction without a bid starts at base_amount.
  const minBid = currentBid === null ? raw.base_amount : Math.max(Math.ceil(1.1 * currentBid), currentBid + 1);
  if (!integer(minBid) || minBid < 1) return null;
  return {
    id: raw.id.toLowerCase(), card: raw.card,
    sellerId: raw.seller_id.toLowerCase(), bidderId: bidderId?.toLowerCase() ?? null,
    currentBid, minBid, status: raw.status, endAt: Date.parse(raw.end_at),
    title: raw.card.wikipedia_title.trim(), snapshot_rarity: raw.card.rarity,
  };
}

export async function loadAuction(id, { signal } = {}) {
  id = validId(id);
  const payload = await request(`/api/marketplace/${id}`, { signal });
  const auction = normalizeAuction(payload.auction);
  if (!auction || auction.id !== id) throw invalidResponse();
  return payload.auction;
}

export async function loadMarketBalance({ signal } = {}) {
  const payload = await request('/api/wikibidous', { signal });
  if (!integer(payload.balance)) throw invalidResponse();
  return payload.balance;
}

export async function placeBid(id, amount, { signal, beforeSend } = {}) {
  id = validId(id);
  if (!integer(amount) || amount < 1) {
    throw new ApiError('Montant de mise invalide.', { code: 'INVALID_ARGUMENT' });
  }
  const payload = await request(`/api/marketplace/${id}/bid`, {
    method: 'POST', body: { amount }, signal, beforeSend,
  });
  // The native client consumes these two response fields. If the server does
  // not confirm the submitted amount, keep its reservation and never replay it.
  if (payload.current_bid !== amount || !integer(payload.bidder_balance)) {
    throw invalidResponse({ uncertain: true });
  }
  return payload;
}
