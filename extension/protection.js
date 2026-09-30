// Literal text matching only: user input is never interpreted as a regular expression.
function searchText(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr-FR').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function normalizeBlockedWords(words) {
  if (!Array.isArray(words)) return [];
  const seen = new Set();
  return words.filter(word => typeof word === 'string')
    .map(word => word.trim().replace(/\s+/g, ' '))
    .filter(word => {
      const key = searchText(word);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Match titles, native categories and user tag names, including word fragments. */
export function createBlockedWordMatcher(words) {
  const terms = normalizeBlockedWords(words).map(word => ({ word, key: searchText(word) }));
  return row => {
    if (!terms.length || !row?.card) return '';
    const fields = [row.card.wikipedia_title, row.card.category,
      ...(Array.isArray(row.tags) ? row.tags.map(tag => tag?.name) : [])]
      .filter(value => typeof value === 'string').map(searchText);
    return terms.find(term => fields.some(field => field.includes(term.key)))?.word || '';
  };
}
