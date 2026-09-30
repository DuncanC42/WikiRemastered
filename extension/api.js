import { NetworkError, networkFetch, getNetworkPause, safeServerMessage } from './network.js';

const PAGE_SIZE = 50;
const TIMEOUT_MS = 20_000;
const COLLECTION_QUERY = "sort=added";

export class ApiError extends Error {
  constructor(message, { code = "API_ERROR", status = 0, retryAfter = null, uncertain = false, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.uncertain = uncertain;
  }
}

function abortError() {
  return new DOMException("Opération annulée.", "AbortError");
}

function numeric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function malformed(message = "La réponse de WikiMasters est incomplète. Rechargez la collection.") {
  return new ApiError(message, { code: "INVALID_RESPONSE" });
}

function collectionChanged() {
  return new ApiError("Actualisation de la collection en attente.", {
    code: "COLLECTION_CHANGED",
  });
}

function retryDelay(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

// Only the task's known WikiMasters routes call this helper; it is not an exposed fetch proxy.
async function request(path, { signal, method = "GET", body, beforeSend } = {}) {
  if (signal?.aborted) throw abortError();
  if (!/^https:\/\/(www\.)?wiki-masters\.com$/.test(location.origin)) {
    throw new ApiError("Ouvrez votre collection sur WikiMasters.", { code: "WRONG_ORIGIN" });
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Délai de réponse dépassé.', 'TimeoutError'));
  }, TIMEOUT_MS);
  const mutation = method === "POST";

  try {
    const response = await networkFetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    }, { beforeSend });

    if (response.redirected || response.status === 401) {
      throw new ApiError("Session expirée. Reconnectez-vous à WikiMasters, puis rechargez la collection.", {
        code: "AUTH_REQUIRED", status: response.status,
      });
    }
    let payload;
    let invalidJSON = false;
    try {
      payload = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      invalidJSON = true;
    }
    // Keep the HTTP status even when an upstream refusal is HTML instead of JSON.
    const pause = getNetworkPause();
    const serverRetryAfter = retryDelay(response.headers.get("Retry-After"));
    const retryAfter = Math.max(serverRetryAfter || 0,
      Math.ceil(Math.max(0, pause.until - Date.now()) / 1_000)) || null;
    const serverMessage = [payload?.error, payload?.message].map(safeServerMessage).find(Boolean);
    const hint = `${payload?.code || ''} ${serverMessage || ''}`;
    if (response.status === 429 || (response.status === 403 &&
      (serverRetryAfter !== null || /too many requests|rate.?limit|trop de requ[eê]tes|limite.{0,30}requ[eê]tes/i.test(hint)))) {
      throw new ApiError(serverMessage || (retryAfter
        ? `WikiMasters limite les requêtes. Nouvelle tentative après ${retryAfter} s.`
        : "WikiMasters limite les requêtes. Chargement des prix en pause."), {
        code: "RATE_LIMITED", status: response.status, retryAfter,
      });
    }
    if (response.status === 403) {
      const entitlement = /(?:pro|premium|subscription|abonnement)[_\s-]*(?:required|requis|n[eé]cessaire)|r[eé]serv[eé].{0,45}(?:\bpro\b|premium|abonn[eé])|requires?.{0,25}(?:subscription|premium|\bpro\b)/i.test(hint);
      throw new ApiError(serverMessage || 'WikiMasters refuse l’accès à ces données (403).', {
        code: entitlement ? 'PRICE_ACCESS_REQUIRED' : 'FORBIDDEN', status: 403, retryAfter,
      });
    }
    if (!response.ok) {
      throw new ApiError(serverMessage || (mutation && response.status >= 500
        ? 'Le serveur a rencontré une erreur. Rechargez la collection pour vérifier la défausse.'
        : 'WikiMasters ne peut pas traiter la demande pour le moment.'), {
        code: 'HTTP_ERROR', status: response.status, retryAfter,
        uncertain: mutation && response.status >= 500,
      });
    }
    if (invalidJSON) {
      throw new ApiError(mutation && response.ok
        ? "La défausse a peut-être abouti. Rechargez la collection avant de réessayer."
        : "WikiMasters n’a pas renvoyé les données attendues. Vérifiez votre connexion au site.", {
        code: "INVALID_RESPONSE", status: response.status, uncertain: mutation && response.ok,
      });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ApiError(mutation
        ? "La défausse a peut-être abouti. Rechargez la collection avant de réessayer."
        : "La réponse de WikiMasters est incomplète. Rechargez la collection.", {
        code: "INVALID_RESPONSE", status: response.status, uncertain: mutation,
      });
    }
    if (payload.error) {
      throw new ApiError(serverMessage || "WikiMasters refuse cette action.", {
        code: "API_ERROR", status: response.status,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof NetworkError) {
      if (!mutation && signal?.aborted) throw abortError();
      throw new ApiError(error.message, {
        code: timedOut && error.code === 'REQUEST_CANCELLED' ? 'TIMEOUT' : error.code,
        status: error.status, retryAfter: error.retryAfter, uncertain: error.uncertain, cause: error,
      });
    }
    if (signal?.aborted) {
      if (mutation) {
        throw new ApiError("Défausse interrompue. Rechargez la collection pour connaître son résultat.", {
          code: "MUTATION_UNCERTAIN", uncertain: true, cause: error,
        });
      }
      throw abortError();
    }
    throw new ApiError(mutation
      ? "Le résultat de la défausse est incertain. Rechargez la collection avant de réessayer."
      : timedOut
        ? "WikiMasters met trop de temps à répondre. Réessayez dans un instant."
        : "Connexion à WikiMasters impossible. Vérifiez votre connexion internet.", {
      code: mutation ? "MUTATION_UNCERTAIN" : timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      uncertain: mutation,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readTotal(payload) {
  const total = numeric(payload.total);
  if (payload.total == null) return null;
  if (total === null || !Number.isSafeInteger(total) || total < 0) throw malformed();
  return total;
}

function readRows(payload) {
  if (!Array.isArray(payload.collection)) throw malformed();
  if (payload.collection.length > PAGE_SIZE) throw malformed();
  for (const row of payload.collection) {
    if (!row || typeof row.id !== "string" || !row.id || !row.card || typeof row.card.id !== "string" || !row.card.id) {
      throw malformed();
    }
  }
  return payload.collection;
}

export async function loadCollection({ signal, onProgress } = {}) {
  const total = readTotal(await request(`/api/my-collection/stats?${COLLECTION_QUERY}`, { signal }));
  const rows = new Map();
  let firstPageIds;
  let page = 0;

  onProgress?.({ loaded: 0, total, page: 0 });
  while (true) {
    const current = readRows(await request(`/api/my-collection?${COLLECTION_QUERY}&page=${page}&stats=0`, { signal }));
    if (page === 0) firstPageIds = current.map(row => row.id);
    for (const row of current) {
      // A duplicate across pages indicates an unstable snapshot, not another copy of a card.
      if (rows.has(row.id)) throw collectionChanged();
      rows.set(row.id, row);
    }
    onProgress?.({ loaded: rows.size, total, page: page + 1 });
    if (total !== null && rows.size > total) throw collectionChanged();
    if (current.length < PAGE_SIZE || (total !== null && rows.size === total)) break;
    page += 1;
  }

  const finalTotal = readTotal(await request(`/api/my-collection/stats?${COLLECTION_QUERY}`, { signal }));
  if ((total !== null && rows.size !== total) || (finalTotal !== null && rows.size !== finalTotal)) {
    throw collectionChanged();
  }
  // The API has no snapshot token. Verify the first page again so offset shifts fail closed.
  if (page > 0) {
    const firstAgain = readRows(await request(`/api/my-collection?${COLLECTION_QUERY}&page=0&stats=0`, { signal }));
    if (firstAgain.length !== firstPageIds.length || firstAgain.some((row, index) => row.id !== firstPageIds[index])) {
      throw collectionChanged();
    }
  }
  return rows;
}

export async function loadProtections(rows, { signal } = {}) {
  const owned = rows instanceof Map ? rows : new Map(Array.from(rows, row => [row.id, row]));
  if (!owned.size) return new Set();
  const payload = await request("/api/trades?active=1", { signal });
  if (!Array.isArray(payload.trades)) throw malformed("Impossible de vérifier les échanges en cours. Réessayez avant de défausser.");

  if (payload.trades.some(trade => !trade || typeof trade !== "object")) throw malformed();
  const pending = payload.trades.filter(trade => trade.status === "pending");
  const ownedCardIds = new Set(Array.from(owned.values(), row => row.card.id));
  const userIds = new Set(Array.from(owned.values(), row => row.user_id).filter(id => typeof id === "string" && id));
  if (userIds.size > 1) throw collectionChanged();

  // List payloads can omit user_id. Exact owned-copy IDs establish authorship without auth-token access.
  for (const trade of pending) {
    if (!Array.isArray(trade.items)) throw malformed("Impossible de vérifier les échanges en cours. Réessayez avant de défausser.");
    for (const item of trade.items) {
      if (!item || typeof item !== "object") throw malformed();
      if (owned.has(item.user_card_id) && typeof item.offered_by === "string") userIds.add(item.offered_by);
    }
  }
  if (userIds.size > 1) throw collectionChanged();
  const userId = userIds.values().next().value;
  const protectedCards = new Set();

  for (const trade of pending) {
    for (const item of trade.items) {
      if (ownedCardIds.has(item.card_id) && (!userId || typeof item.offered_by !== "string") && !owned.has(item.user_card_id)) {
        throw malformed("Impossible d’identifier les cartes engagées dans vos échanges. Rechargez la collection avant de défausser.");
      }
      if (!(userId ? item.offered_by === userId : owned.has(item.user_card_id))) continue;
      if (typeof item.card_id !== "string" || !item.card_id) throw malformed();
      protectedCards.add(item.card_id);
    }
  }
  return protectedCards;
}

export async function getMarketSummary(cardId, { signal } = {}) {
  if (typeof cardId !== 'string' || !cardId) throw malformed();
  const payload = await request(`/api/marketplace/cards/${encodeURIComponent(cardId)}/sales?scope=summary`, { signal });
  if (!payload.summary || typeof payload.summary !== 'object' || Array.isArray(payload.summary)) throw malformed();
  return payload.summary;
}

export function getSuggestedPriceFromSummary(row, summary) {
  const rarity = row?.snapshot_rarity ?? row?.card?.rarity;
  if (typeof rarity !== 'string' || !summary || typeof summary !== 'object' || Array.isArray(summary)) throw malformed();
  const sale = summary[rarity];
  const average = numeric(sale?.average);
  const count = numeric(sale?.count);
  if (sale != null && (typeof sale !== 'object' || Array.isArray(sale)
    || (sale.count != null && (count === null || !Number.isSafeInteger(count) || count < 0))
    || (sale.average != null && (average === null || average < 0 || !Number.isSafeInteger(Math.round(average))))
    || (count !== 0 && (average === null || average < 0 || !Number.isSafeInteger(Math.round(average)))))) throw malformed();
  const hasAverage = average !== null && average >= 0 && count !== 0;
  return {
    price: hasAverage ? Math.max(1, Math.round(average)) : 10,
    source: hasAverage ? "average" : "default",
    average,
    count,
  };
}

export async function discardCard(id, { signal, beforeSend } = {}) {
  if (typeof id !== "string" || !id) throw new ApiError("Cette carte n’est plus disponible.", { code: "INVALID_CARD" });
  // The caller must invoke this only from an explicit user action. Mutations are never retried.
  return request(`/api/user-cards/${encodeURIComponent(id)}/discard`, { method: "POST", signal, beforeSend });
}

export async function discardCards(ids, { beforeSend } = {}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50
    || new Set(ids).size !== ids.length
    || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new ApiError('Liste de cartes invalide.', { code: 'INVALID_CARD' });
  }
  // The same native endpoint as the site's collection selection. Never auto-retry.
  return request('/api/user-cards/bulk-discard', { method: 'POST', body: { card_ids: ids }, beforeSend });
}
