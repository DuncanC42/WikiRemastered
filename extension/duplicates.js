import { RARITIES } from './pack-cards.js';
import { createHelpButton } from './controls.js';

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
const rarityOf = row => row.snapshot_rarity ?? row.card.rarity;
const rank = row => RARITIES.indexOf(rarityOf(row));
const sortCopies = (a, b) => rank(b) - rank(a)
  || Number(b.is_shiny === true) - Number(a.is_shiny === true) || collator.compare(a.id, b.id);

// Catalog identity, never the title: distinct owned IDs remain distinct copies.
export function groupDuplicates(rows) {
  const groups = new Map();
  for (const row of rows.values()) {
    if (!row?.id || !row.card?.id) continue;
    let group = groups.get(row.card.id);
    if (!group) {
      group = { id: row.card.id, title: row.card.wikipedia_title || 'Carte', copies: [] };
      groups.set(group.id, group);
    }
    group.copies.push(row);
  }
  for (const [id, group] of groups) {
    if (group.copies.length < 2) groups.delete(id);
    else group.copies.sort(sortCopies);
  }
  return groups;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function imageURL(card) {
  if (card.hide_image || card.nsfw_image || !card.image_url) return null;
  try {
    const url = new URL(card.image_url, location.origin);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function createDuplicateBrowser() {
  const host = node('div');
  host.dataset.wme = 'duplicates';
  host.dataset.theme = 'dark';
  const root = host.attachShadow({ mode: 'open' });
  const controller = new AbortController();
  const { signal } = controller;
  const stylesheet = name => new Promise(resolve => {
    const link = node('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(name);
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
    root.append(link);
  });
  const stylesReady = Promise.all(['ui.css', 'duplicates.css'].map(stylesheet));
  const dialog = node('dialog', 'duplicates-dialog');
  dialog.lang = 'fr';
  dialog.setAttribute('aria-labelledby', 'duplicates-title');
  const header = node('header', 'duplicates-header');
  const heading = node('div');
  const total = node('p', 'duplicates-total');
  const title = node('h2', '', 'Doublons');
  title.id = 'duplicates-title';
  heading.append(title, total);
  const close = node('button', 'button button-quiet duplicates-close', 'Fermer');
  close.type = 'button';
  header.append(heading, close);
  const controls = node('div', 'duplicates-controls');
  const search = node('input', 'duplicates-search');
  search.type = 'search';
  search.name = 'wme-duplicates-search';
  search.placeholder = 'Rechercher une carte';
  search.setAttribute('aria-label', 'Rechercher dans les doublons');
  const sort = node('select', 'duplicates-sort');
  sort.name = 'wme-duplicates-sort';
  sort.setAttribute('aria-label', 'Trier les piles');
  for (const [value, label] of [['most', 'Plus d’exemplaires'], ['least', 'Moins d’exemplaires'], ['name', 'Nom de A à Z']]) {
    const option = node('option', '', label);
    option.value = value;
    sort.append(option);
  }
  const reset = node('button', 'button button-quiet', 'Toutes les piles');
  reset.type = 'button';
  reset.hidden = true;
  controls.append(search, sort, reset, createHelpButton('duplicates', signal));
  const region = node('div', 'duplicates-content');
  const status = node('p', 'duplicates-status');
  status.setAttribute('role', 'status');
  const grid = node('div', 'duplicates-grid');
  const more = node('button', 'button button-quiet duplicates-more', 'Afficher la suite');
  more.type = 'button';
  region.append(status, grid, more);
  dialog.append(header, controls, region);
  root.append(dialog);
  document.body.append(host);

  let groups = new Map();
  let source;
  let sourceSize = -1;
  let confirmed = false;
  let ready = false;
  let focusedGroup = null;
  let limit = 48;
  let returnFocus;
  let sortTouched = false;
  const expanded = new Set();

  function makeStack(group) {
    const front = group.copies[0];
    const item = node('details', 'duplicate-stack');
    item.dataset.rarity = rarityOf(front);
    item.dataset.layers = group.copies.length > 2 ? '3' : '2';
    item.open = expanded.has(group.id);
    const summary = node('summary', 'duplicate-summary');
    const preview = node('div', 'duplicate-preview');
    const face = node('div', 'duplicate-face');
    face.dataset.shiny = String(front.is_shiny === true);
    const art = node('div', 'duplicate-art');
    const url = imageURL(front.card);
    if (url) {
      const image = node('img');
      image.src = url;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.remove(); art.textContent = 'WM'; }, { once: true });
      art.append(image);
    } else art.textContent = 'WM';
    const badges = node('div', 'duplicate-badges');
    badges.append(node('span', 'duplicate-rarity', rarityOf(front) || '?'));
    if (front.is_shiny === true) badges.append(node('span', 'duplicate-shiny', 'Shiny'));
    face.append(art, badges, node('h3', 'duplicate-name', group.title));
    const count = node('span', 'duplicate-count', `×${group.copies.length}`);
    count.setAttribute('aria-label', `${group.copies.length} exemplaires`);
    preview.append(face, count);
    summary.append(preview, node('span', 'duplicate-disclosure', 'Voir les exemplaires'));
    const copies = node('ol', 'duplicate-copies');
    let copiesBuilt = false;
    const fillCopies = () => {
      if (copiesBuilt) return;
      copiesBuilt = true;
      for (const row of group.copies) {
        const copy = node('li', 'duplicate-copy');
        copy.dataset.rarity = rarityOf(row);
        copy.append(node('span', 'duplicate-rarity', rarityOf(row) || '?'));
        const traits = [];
        if (row.is_shiny === true) traits.push('Shiny');
        if (row.starred) traits.push('Favorite');
        const atk = row.snapshot_atk ?? row.card.atk;
        const def = row.snapshot_def ?? row.card.def;
        const stats = Number.isFinite(atk) && Number.isFinite(def) ? `ATK ${atk} · DEF ${def}` : '';
        const description = node('span', 'duplicate-copy-description');
        if (traits.length) description.append(node('span', '', traits.join(' · ')));
        if (stats) description.append(node('span', 'duplicate-copy-stats', stats));
        copy.append(description);
        copies.append(copy);
      }
    };
    if (item.open) fillCopies();
    item.addEventListener('toggle', () => {
      if (!item.isConnected) return;
      if (item.open) { expanded.add(group.id); fillCopies(); }
      else expanded.delete(group.id);
      summary.lastChild.textContent = item.open ? 'Replier' : 'Voir les exemplaires';
    });
    summary.lastChild.textContent = item.open ? 'Replier' : 'Voir les exemplaires';
    item.append(summary, copies);
    return item;
  }

  function render() {
    if (!dialog.open) return;
    const query = normalize(search.value).trim();
    const filtered = [...groups.values()].filter(group => (!focusedGroup || group.id === focusedGroup)
      && normalize(group.title).includes(query));
    filtered.sort((a, b) => (sort.value === 'most' ? b.copies.length - a.copies.length
      : sort.value === 'least' ? a.copies.length - b.copies.length : 0)
      || collator.compare(a.title, b.title) || collator.compare(a.id, b.id));
    const count = [...groups.values()].reduce((sum, group) => sum + group.copies.length, 0);
    total.textContent = confirmed ? `${groups.size} piles · ${count} exemplaires · toute la collection` : 'Lecture de la collection…';
    status.textContent = !confirmed ? 'Les piles apparaîtront après la lecture complète.'
      : !ready ? 'Actualisation en cours · derniers exemplaires connus'
        : !filtered.length ? query || focusedGroup ? 'Aucun doublon correspondant.' : 'Aucun doublon dans votre collection.' : '';
    status.hidden = !status.textContent;
    reset.hidden = !focusedGroup;
    grid.replaceChildren(...filtered.slice(0, limit).map(makeStack));
    more.hidden = filtered.length <= limit;
  }

  function dismiss() { dialog.close(); }
  close.addEventListener('click', dismiss, { signal });
  dialog.addEventListener('close', () => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, { signal });
  search.addEventListener('input', () => { focusedGroup = null; limit = 48; render(); }, { signal });
  sort.addEventListener('change', () => {
    sortTouched = true;
    limit = 48;
    render();
    chrome.storage.local.set({ duplicateSort: sort.value }).catch(() => {});
  }, { signal });
  reset.addEventListener('click', () => { focusedGroup = null; search.value = ''; limit = 48; render(); }, { signal });
  more.addEventListener('click', () => { limit += 48; render(); }, { signal });
  for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
    root.addEventListener(name, event => event.stopPropagation(), { signal });
  }
  chrome.storage.local.get('duplicateSort').then(values => {
    if (!signal.aborted && !sortTouched && ['most', 'least', 'name'].includes(values.duplicateSort)) {
      sort.value = values.duplicateSort;
      render();
    }
  }).catch(() => {});

  return {
    get size() { return groups.size; },
    countFor(id) { return groups.get(id)?.copies.length || 0; },
    update(rows, isReady) {
      const changed = source !== rows || sourceSize !== rows.size || ready !== isReady;
      if (source !== rows || sourceSize !== rows.size) {
        source = rows;
        sourceSize = rows.size;
        groups = groupDuplicates(rows);
        for (const id of expanded) if (!groups.has(id)) expanded.delete(id);
      }
      ready = isReady;
      confirmed ||= ready;
      if (changed) render();
    },
    async open(id = null) {
      const trigger = document.activeElement?.shadowRoot?.activeElement || document.activeElement;
      const loaded = await stylesReady;
      if (signal.aborted || !loaded.every(Boolean)) return;
      if (!dialog.open) returnFocus = trigger;
      focusedGroup = id;
      search.value = '';
      limit = 48;
      if (id) expanded.add(id);
      if (!dialog.open) dialog.showModal();
      render();
      region.scrollTop = 0;
      close.focus({ preventScroll: true });
    },
    destroy() {
      if (dialog.open) dialog.close();
      controller.abort();
      host.remove();
    },
  };
}
