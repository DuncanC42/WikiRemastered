import { isAccount } from './market-policy.js';

export const LATE_BID_DEFAULT_MAX = 50;
export const LATE_BID_WINDOW_MS = 60_000;
export const lateBidKey = account => `wme:late-bids:${account}`;

/** A ceiling is the final bid on this auction, not an amount spent in advance
 * or a cumulative budget across refunded bids. Missing data never grants a bid. */
export function eligibleLateBid(plan, auction, account, now = Date.now()) {
  if (!plan?.active || plan.pending || plan.status === 'uncertain' || !auction
    || !isAccount(account) || !isAccount(plan.id) || auction.id !== plan.id
    || !isAccount(auction.sellerId) || auction.sellerId === account
    || auction.bidderId === account || (auction.bidderId !== null && !isAccount(auction.bidderId))
    || (auction.currentBid !== null && (!Number.isSafeInteger(auction.currentBid) || auction.currentBid < 1))
    || (auction.currentBid === null) !== (auction.bidderId === null)
    || auction.status !== 'active' || !Number.isFinite(auction.endAt)
    || auction.endAt <= now || auction.endAt - now > LATE_BID_WINDOW_MS
    || !Number.isSafeInteger(plan.maxBid) || plan.maxBid < 1 || plan.maxBid > 100_000) return null;
  const amount = auction.minBid;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > plan.maxBid
    || (auction.currentBid !== null && amount <= auction.currentBid)) return null;
  // An eventually consistent detail cannot replay our last confirmed bid.
  if (plan.lastBid && (!Number.isSafeInteger(plan.lastBid.amount)
    || !Number.isSafeInteger(auction.currentBid) || auction.currentBid <= plan.lastBid.amount
    || amount <= plan.lastBid.amount)) return null;
  return amount;
}
