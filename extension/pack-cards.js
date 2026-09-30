/* Normalizes a POST /api/packs/open response, as observed on 27 September 2026:
 * { cards: [{ id, wikipedia_title, category, summary, image_url, hide_image,
 *   nsfw_image, rarity, atk, def, pageviews, ... }], packs_remaining,
 *   packs_last_regen_at, owned_copies: [{ id, card_id, is_shiny, ... }] }
 * The shiny flag belongs to the owned copy, not to the catalog card.
 */
export const RARITIES = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

function httpsURL(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value, location.origin);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch { return undefined; }
}

const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const text = (value, max) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

export function normalizePackCard(card, copy) {
  const title = text(card?.wikipedia_title, 500) ?? text(card?.title, 500);
  if (!card || typeof card.id !== 'string' || !title || !RARITIES.includes(card.rarity)) throw new Error('Cartes incomplètes');
  const hidden = card.hide_image === true || card.nsfw_image === true;
  return {
    id: card.id,
    title,
    rarity: card.rarity,
    subtitle: text(card.category, 300) ?? text(card.summary, 300),
    imageUrl: hidden ? undefined : httpsURL(card.image_url),
    pageviews: count(card.pageviews),
    atk: count(card.atk),
    def: count(card.def),
    isShiny: copy?.is_shiny === true || card.is_shiny === true,
    starred: copy?.starred === true,
    ownedId: typeof copy?.id === 'string' ? copy.id : undefined,
  };
}

export function normalizePackResponse(payload) {
  if (!Array.isArray(payload?.cards) || payload.cards.length < 1 || payload.cards.length > 10
    || !Number.isInteger(payload.packs_remaining) || payload.packs_remaining < 0 || payload.packs_remaining > 10) {
    throw new Error('Réponse incomplète');
  }
  // Pair each card with one owned copy, so duplicates keep their own shiny state.
  const copies = Array.isArray(payload.owned_copies) ? payload.owned_copies.filter(copy => copy && typeof copy.card_id === 'string') : [];
  const cards = payload.cards.map(card => {
    const index = copies.findIndex(copy => copy.card_id === card?.id);
    const copy = index >= 0 ? copies.splice(index, 1)[0] : undefined;
    return normalizePackCard(card, copy);
  });
  return { cards, packsRemaining: payload.packs_remaining, packsLastRegenAt: payload.packs_last_regen_at };
}
