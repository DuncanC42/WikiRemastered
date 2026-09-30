import { normalizeBlockedWords, createBlockedWordMatcher } from './protection.js';

export const MARKET_DEFAULTS = Object.freeze({ keywords: [], maxBid: 10, budget: 50, intervalSeconds: 60,
  maxRemainingMinutes: 0, allowRebids: false });
export const marketKey = account => `wme:market:${account}`;
export const isAccount = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function marketSettings(input) {
  input = { ...MARKET_DEFAULTS, ...input };
  const keywords = normalizeBlockedWords(input?.keywords);
  if (!keywords.length || keywords.length > 40 || keywords.some(word => word.length > 100)) throw new Error('Ajoutez entre 1 et 40 mots-clés.');
  const result = { keywords };
  for (const [name, min, max] of [['maxBid', 1, 100_000], ['budget', 1, 100_000], ['intervalSeconds', 30, 1800], ['maxRemainingMinutes', 0, 1440]]) {
    const value = input?.[name];
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Vérifiez les limites et la fréquence.');
    result[name] = value;
  }
  if (typeof input.allowRebids !== 'boolean') throw new Error('Vérifiez l’option de surenchère.');
  result.allowRebids = input.allowRebids;
  return result;
}

export function withinBidWindow(auction, settings, now = Date.now()) {
  const minutes = settings.maxRemainingMinutes ?? MARKET_DEFAULTS.maxRemainingMinutes;
  const remaining = auction?.endAt - now;
  return Number.isFinite(remaining) && remaining > 0 && Number.isSafeInteger(minutes)
    && minutes >= 0 && minutes <= 1440 && (minutes === 0 || remaining <= minutes * 60_000);
}

// Count full accepted bids, even if later outbid: returned points never refill
// this session's allowance. Rebids require a confirmed earlier bid and a newer
// competing bid, so a stale listing cannot replay the previous amount.
export function eligibleBid(auction, session, account, now = Date.now()) {
  if (!session?.active || session.pending || !auction || !isAccount(account)) return null;
  if (!isAccount(auction.id) || !isAccount(auction.sellerId) || auction.sellerId === account
    || auction.bidderId === account || auction.status !== 'active'
    || !withinBidWindow(auction, session.settings, now)) return null;
  if (session.attempted?.includes(auction.id)) {
    const previous = session.lastBids?.[auction.id];
    if (session.settings.allowRebids !== true || !Number.isSafeInteger(previous) || previous < 1
      || !Number.isSafeInteger(auction.currentBid) || auction.currentBid <= previous
      || auction.minBid <= previous) return null;
  }
  if (!createBlockedWordMatcher(session.settings.keywords)({ card: auction.card })) return null;
  const amount = auction.minBid;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > session.settings.maxBid
    || !Number.isSafeInteger(session.used) || session.used < 0
    || amount > session.settings.budget - session.used) return null;
  return amount;
}
