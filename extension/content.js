import { loadCollection, loadProtections, discardCard, discardCards } from './api.js';
import { createToolbar, createCardExtras } from './ui.js';
import { createPriceLoader } from './prices.js';
import { planDiscardBatches, parseDiscardBatchResult } from './discard.js';
import { normalizeBlockedWords, createBlockedWordMatcher } from './protection.js';
import { getNetworkPause } from './network.js';
import { RARITIES } from './pack-cards.js';
import { extensionAlive, onInvalidated } from './runtime.js';

const format = new Intl.NumberFormat('fr-FR');
const NOTICE_KEY = 'wme:collection-notice';
const RECOVERY_IDLE_MS = 45_000;
// Last collection read, per account: shown at once, then revalidated in the background.
// Display only: a discard always re-reads the collection and trades before any mutation.
const CACHE_VERSION = 1;
const CACHE_FRESH_MS = 10 * 60_000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const cacheKey = account => `wme:collection-cache:${account}`;

function compactRow(row) {
  const card = row.card || {};
  return {
    id: row.id, card_id: row.card_id, user_id: row.user_id, count: row.count,
    snapshot_rarity: row.snapshot_rarity, snapshot_atk: row.snapshot_atk, snapshot_def: row.snapshot_def,
    is_shiny: row.is_shiny, starred: row.starred,
    tags: Array.isArray(row.tags) ? row.tags.map(tag => ({ name: tag?.name })) : [],
    card: {
      id: card.id, wikipedia_title: card.wikipedia_title, category: card.category, rarity: card.rarity,
      pageviews: card.pageviews, image_url: card.image_url, hide_image: card.hide_image, nsfw_image: card.nsfw_image,
      atk: card.atk, def: card.def,
    },
  };
}

async function readCollectionCache(account) {
  if (!uuid.test(account || '')) return null;
  try {
    const value = (await chrome.storage.local.get(cacheKey(account)))[cacheKey(account)];
    if (value?.version !== CACHE_VERSION || !Array.isArray(value.rows) || !Array.isArray(value.pending)
      || !Number.isFinite(value.at) || Date.now() - value.at > CACHE_MAX_AGE_MS || value.at > Date.now() + 60_000) return null;
    if (value.rows.some(row => typeof row?.id !== 'string' || typeof row.card?.id !== 'string')) return null;
    return value;
  } catch { return null; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const accountNow = () => document.documentElement.getAttribute('data-wme-account');
let current = null;
let lifecycleTimer;

const onCollection = () => location.pathname.replace(/\/$/, '') === '/collection';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pageTheme() {
  const color = getComputedStyle(document.body).getPropertyValue('--color-background').trim();
  let channels;
  if (/^#[\da-f]{6}$/i.test(color)) channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  else if (/^#[\da-f]{3}$/i.test(color)) channels = [...color.slice(1)].map((channel) => parseInt(channel + channel, 16));
  else if (color.startsWith('rgb')) channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (channels?.length === 3) return (channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722) < 140 ? 'dark' : 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function viewsOf(row) {
  const value = row?.card?.pageviews;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function createSession() {
  const session = {
    alive: true,
    accountKey: accountNow(),
    phase: 'scanning',
    rows: new Map(),
    pending: new Set(),
    views: new Map(),
    priceLoader: null,
    priceAccount: null,
    scope: 'collection',
    threshold: 30,
    blockedWords: [],
    blockedWordFor: createBlockedWordMatcher([]),
    preferenceError: '',
    ready: false,
    status: '',
    error: '',
    completed: 0,
    operationTotal: 0,
    busyIds: new Set(),
    stopped: false,
    operation: false,
    controller: new AbortController(),
    readController: null,
    syncedAt: 0,
    stackDuplicates: true,
    review: null,
    reviewExcluded: new Set(),
    rarities: [...RARITIES],
    statusKind: '',
    expandedStacks: new Set(),
    backgroundRead: false,
    fromCache: false,
  };
  let preferenceWrites = Promise.resolve();
  let pendingPreferenceWrites = 0;
  let recoveryTimer;
  let recoveryPending = false;
  let recoveryAt = 0;
  let recoveryAttempts = 0;
  let recoveryNeedsIdle = true;
  let lastInteractionAt = Date.now();
  let duplicates = null;
  let duplicateLoad = null;
  let duplicateError = '';
  function loadDuplicates() {
    if (duplicates) return Promise.resolve(duplicates);
    if (!duplicateLoad) duplicateLoad = Promise.resolve().then(() => import(chrome.runtime.getURL('duplicates.js'))).then(({ createDuplicateBrowser }) => {
      if (!session.alive) return null;
      duplicates = createDuplicateBrowser();
      duplicates.update(session.rows, session.ready && !recoveryPending && !session.operation);
      render();
      return duplicates;
    }).catch(() => {
      duplicateError = 'Rechargez la page pour afficher les doublons.';
      if (session.alive) render();
      return null;
    });
    return duplicateLoad;
  }
  async function showDuplicates(id = null) {
    const browser = await loadDuplicates();
    if (browser) await browser.open(id);
    else if (session.alive) { session.error = duplicateError; render(); }
  }
  const toolbar = createToolbar({
    onDuplicates: () => showDuplicates(),
    onBulk: () => openReview(),
    onBulkConfirm: () => {
      const ids = reviewIds();
      session.review = null;
      if (ids?.length) runDiscard(undefined, ids);
      else render();
    },
    onBulkCancel: () => { session.review = null; render(); },
    onReviewExclude: (ids) => {
      if (!session.review || session.operation) return;
      for (const id of ids) if (session.review.includes(id)) session.reviewExcluded.add(id);
      render();
    },
    onReviewRestore: (ids) => {
      if (Array.isArray(ids)) for (const id of ids) session.reviewExcluded.delete(id);
      else session.reviewExcluded.clear();
      render();
    },
    onRaritiesChange: (rarities) => {
      session.review = null;
      setRarities(rarities);
      session.status = '';
      savePreferences({ discardRarities: session.rarities });
      render();
    },
    onStop: () => {
      session.stopped = true;
      session.readController?.abort();
      session.status = 'Arrêt après le lot en cours…';
      render();
    },
    onRefresh: () => refresh(),
    onStackChange: (value) => {
      session.stackDuplicates = Boolean(value);
      session.expandedStacks.clear();
      chrome.storage.local.set({ stackDuplicates: session.stackDuplicates }).catch(() => {});
      render();
    },
    onScopeChange: (scope) => {
      session.review = null;
      session.scope = scope;
      session.status = '';
      savePreferences({ scope });
      render();
    },
    onThresholdChange: (threshold) => {
      session.review = null;
      session.threshold = threshold;
      session.status = '';
      savePreferences({ threshold });
      render();
    },
    onBlockedWordsChange: (words) => {
      session.review = null;
      setBlockedWords(words);
      session.status = '';
      savePreferences({ blockedWords: session.blockedWords });
      render();
    },
  });
  session.toolbar = toolbar;

  const intersection = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const view = session.views.get(entry.target);
      if (!view) continue;
      view.inView = entry.isIntersecting;
    }
    syncPrices();
  }, { rootMargin: '300px' });

  function writeCache() {
    if (!uuid.test(session.accountKey || '') || !session.syncedAt) return;
    const value = { version: CACHE_VERSION, at: session.syncedAt,
      rows: [...session.rows.values()].map(compactRow), pending: [...session.pending] };
    chrome.storage.local.set({ [cacheKey(session.accountKey)]: value }).catch(() => {});
  }

  // Cards on screen that the cached copy does not know: the collection moved on.
  let staleCheckDone = false;
  function checkCacheAgainstPage() {
    if (!session.fromCache || staleCheckDone || session.readController || session.operation) return;
    const unknown = [...session.views.values()].some(view => view.wrapper.isConnected && !session.rows.has(view.id));
    if (!unknown) return;
    staleCheckDone = true;
    refresh({ background: true });
  }

  function setRarities(value) {
    const chosen = Array.isArray(value) ? RARITIES.filter(rarity => value.includes(rarity)) : [];
    session.rarities = chosen.length ? chosen : [...RARITIES];
  }
  const rarityOf = row => row?.snapshot_rarity ?? row?.card?.rarity;
  const rarityExcluded = row => !session.rarities.includes(rarityOf(row));

  function setBlockedWords(words) {
    session.blockedWords = normalizeBlockedWords(words);
    session.blockedWordFor = createBlockedWordMatcher(session.blockedWords);
  }

  function armRecovery() {
    clearTimeout(recoveryTimer);
    if (!session.alive || !recoveryPending || session.operation || session.readController || navigator.onLine === false) return;
    const wait = Math.max(0, recoveryAt - Date.now(), getNetworkPause().until - Date.now(),
      recoveryNeedsIdle ? lastInteractionAt + RECOVERY_IDLE_MS - Date.now() : 0);
    recoveryTimer = setTimeout(() => {
      if (!onCollection()) return;
      refresh({ automatic: true, background: session.ready });
    }, wait);
  }

  function queueRecovery({ wait = RECOVERY_IDLE_MS, needsIdle = true } = {}) {
    recoveryPending = true;
    recoveryNeedsIdle = needsIdle;
    recoveryAt = Math.max(recoveryAt, Date.now() + wait);
    session.ready = false;
    session.priceLoader?.setPaused(Boolean(session.operation || session.readController));
    if (!session.operation) {
      session.phase = 'waiting';
      session.error = '';
      session.status = navigator.onLine === false ? 'Hors ligne · reprise automatique' : 'Actualisation en attente…';
    }
    armRecovery();
    render();
  }

  function onCollectionChanged() {
    // New cards invalidate reads, never interrupt or restart a mutation in flight.
    if (!session.operation) session.readController?.abort();
    queueRecovery();
  }

  function onActivity(event) {
    if (!event.isTrusted) return;
    lastInteractionAt = Date.now();
    if (recoveryPending) armRecovery();
  }

  function onConnectivityChange() {
    if (navigator.onLine === false) {
      if (!session.operation) session.readController?.abort();
      queueRecovery({ needsIdle: false });
    } else {
      armRecovery();
    }
  }

  function savePreferences(changes) {
    pendingPreferenceWrites += 1;
    preferenceWrites = preferenceWrites.then(() => chrome.storage.local.set(changes)).then(() => {
      session.preferenceError = '';
    }, () => {
      session.preferenceError = 'Impossible d’enregistrer vos protections. Défausse automatique suspendue.';
    }).finally(() => {
      pendingPreferenceWrites -= 1;
      render();
    });
  }

  function onPreferencesChanged(changes, area) {
    if (area !== 'local' || !session.alive || pendingPreferenceWrites) return;
    if (changes.blockedWords) setBlockedWords(changes.blockedWords.newValue);
    if (changes.discardRarities) setRarities(changes.discardRarities.newValue);
    if (Number.isSafeInteger(changes.threshold?.newValue) && changes.threshold.newValue >= 0) session.threshold = changes.threshold.newValue;
    if (['page', 'collection'].includes(changes.scope?.newValue)) session.scope = changes.scope.newValue;
    if (changes.blockedWords || changes.discardRarities || changes.threshold || changes.scope) render();
  }

  function liveReason(id, row) {
    if (!row) return 'Indisponible';
    let starred = Boolean(row.starred);
    let pending = session.pending.has(row.card.id);
    for (const [wrapper, view] of session.views) {
      if (view.id !== id || !wrapper.isConnected) continue;
      starred = starred || wrapper.dataset.wmeStarred === 'true';
      pending = pending || wrapper.dataset.wmePending === 'true';
    }
    if (starred) return 'Favorite';
    if (pending) return 'En échange';
    return '';
  }

  function underThreshold(id, row, visible) {
    const views = viewsOf(row);
    return (session.scope === 'collection' || visible.has(id))
      && views !== null && views < session.threshold && !liveReason(id, row) && !session.blockedWordFor(row);
  }

  function eligibleIds() {
    if (!session.ready || session.preferenceError) return [];
    const visible = new Set([...session.views.values()].filter((view) => view.wrapper.isConnected).map((view) => view.id));
    return [...session.rows].filter(([id, row]) => underThreshold(id, row, visible) && !rarityExcluded(row)).map(([id]) => id);
  }

  /* Duplicate stacks: copies of one card on this page sit behind the most valuable
     one (rarity, then shiny). A stack unfolds in place; its copies are then shown
     side by side, each with its own discard button. Display only: React's DOM is
     never reordered, only hidden or visually ordered with CSS. */
  const rarityRank = (view) => {
    const row = session.rows.get(view.id) || view.displayRow;
    return RARITIES.indexOf(row?.snapshot_rarity ?? row?.card?.rarity);
  };
  const shinyOf = (view) => (session.rows.get(view.id) || view.displayRow)?.is_shiny === true;
  const rarityColors = { C: '#b8f2d5', PC: '#b1cff2', R: '#c6a7f2', SR: '#ed6fa3', UR: '#fa9931', L: '#ffe144' };

  function stackLayers(view, copies) {
    if (!view.layers) {
      view.layers = document.createElement('div');
      view.layers.dataset.wme = 'stack-layers';
      view.layers.setAttribute('aria-hidden', 'true');
      view.layers.append(document.createElement('span'), document.createElement('span'), document.createElement('b'));
    }
    // Write only on change: every DOM write here would wake the page observers.
    const badge = view.layers.lastElementChild;
    const count = `×${copies.length}`;
    if (badge.textContent !== count) badge.textContent = count;
    const card = [...view.wrapper.children].find(child => !child.hasAttribute('data-wme'));
    const height = card ? `${card.offsetHeight}px` : '';
    if (view.layers.style.height !== height) view.layers.style.height = height;
    [...view.layers.querySelectorAll(':scope > span')].forEach((layer, index) => {
      const copy = copies[index + 1];
      const row = copy ? session.rows.get(copy.id) || copy.displayRow : null;
      if (layer.hidden !== !copy) layer.hidden = !copy;
      const color = rarityColors[row?.snapshot_rarity ?? row?.card?.rarity] || '#3a3a42';
      if (layer.style.getPropertyValue('--layer') !== color) layer.style.setProperty('--layer', color);
    });
    if (view.layers.parentElement !== view.wrapper) view.wrapper.append(view.layers);
  }

  function applyStacks() {
    const connected = [...session.views.values()].filter(view => view.wrapper.isConnected && !view.removed);
    const groups = new Map();
    if (session.stackDuplicates) {
      for (const view of connected) {
        const id = view.wrapper.dataset.wmeCatalogId;
        if (!id) continue;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(view);
      }
    }
    const grid = connected[0]?.wrapper.parentElement;
    const ordered = grid && /grid|flex/.test(getComputedStyle(grid).display);
    const domIndex = new Map(connected.map(view => [view, [...view.wrapper.parentElement.children].indexOf(view.wrapper)]));
    for (const view of session.views.values()) view.stack = null;
    for (const [id, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => rarityRank(b) - rarityRank(a) || Number(shinyOf(b)) - Number(shinyOf(a)) || domIndex.get(a) - domIndex.get(b));
      const expanded = session.expandedStacks.has(id);
      list.forEach((view, index) => { view.stack = { id, index, count: list.length, expanded, front: list[0] }; });
    }
    for (const view of session.views.values()) {
      const wrapper = view.wrapper;
      const stack = view.stack;
      const set = (name, value) => {
        if (value === null) wrapper.removeAttribute(name);
        else if (wrapper.getAttribute(name) !== value) wrapper.setAttribute(name, value);
      };
      set('data-wme-stack', stack && stack.index === 0 ? String(stack.count) : null);
      set('data-wme-stack-state', stack ? (stack.expanded ? 'open' : 'closed') : null);
      set('data-wme-stack-hidden', stack && stack.index > 0 && !stack.expanded ? '' : null);
      set('data-wme-review', session.review?.includes(view.id) && !session.reviewExcluded.has(view.id) && !session.operation ? '' : null);
      set('data-wme-discarding', session.busyIds.has(view.id) ? '' : null);
      // Unfolded copies follow their front card in the grid.
      const order = ordered && stack?.expanded ? String(domIndex.get(stack.front) * 100 + stack.index)
        : ordered && session.stackDuplicates && domIndex.has(view) ? String(domIndex.get(view) * 100) : '';
      if (wrapper.style.order !== order) wrapper.style.order = order;
      if (stack && stack.index === 0 && !stack.expanded) {
        const copies = [...groups.get(stack.id)];
        stackLayers(view, copies);
      } else if (view.layers?.isConnected) view.layers.remove();
    }
  }

  function openReview() {
    if (!session.ready || session.operation) return;
    const ids = eligibleIds();
    session.review = ids.length ? ids : null;
    session.reviewExcluded.clear();
    render();
  }

  // The frozen review minus the cards taken out of it.
  function reviewIds() {
    return session.review ? session.review.filter(id => !session.reviewExcluded.has(id)) : null;
  }

  // The whole frozen review; the ones taken out stay listed so they can be put back.
  function reviewItems() {
    if (!session.review) return null;
    return session.review.map(id => {
      const row = session.rows.get(id);
      return { id, title: row?.card?.wikipedia_title || 'Carte', category: row?.card?.category || '',
        rarity: rarityOf(row) ?? '', views: viewsOf(row) ?? 0, excluded: session.reviewExcluded.has(id) };
    }).sort((a, b) => a.views - b.views);
  }

  // Cards under the threshold, per rarity, whatever rarities are selected.
  function rarityCounts() {
    if (!session.ready || session.preferenceError) return {};
    const visible = new Set([...session.views.values()].filter((view) => view.wrapper.isConnected).map((view) => view.id));
    const counts = Object.fromEntries(RARITIES.map(rarity => [rarity, 0]));
    for (const [id, row] of session.rows) {
      const rarity = rarityOf(row);
      if (rarity in counts && underThreshold(id, row, visible)) counts[rarity] += 1;
    }
    return counts;
  }

  function toggleStack(view) {
    if (!view.stack) return;
    if (session.expandedStacks.has(view.stack.id)) session.expandedStacks.delete(view.stack.id);
    else session.expandedStacks.add(view.stack.id);
    render();
  }

  function renderCard(view) {
    if (view.removed) {
      view.ui.update({ loading: false, busy: false, protected: true, protectedReason: 'Défaussée', disabled: true, copyCount: 0 });
      return;
    }
    const confirmedRow = session.rows.get(view.id);
    const row = confirmedRow || view.displayRow;
    const price = row ? session.priceLoader?.snapshot(row) : null;
    const value = price?.value;
    const protectedReason = liveReason(view.id, confirmedRow);
    const sourceHint = value?.source === 'average'
      ? `Moyenne des ventes pour cette rareté, arrondie : ${format.format(value.average)} wikibidous. Estimation de Collection +.`
      : value?.source === 'default'
        ? 'Aucune vente comparable. Valeur initiale du site : 10 wikibidous.'
        : '';
    const waitHint = price?.retryAt > Date.now()
      ? `Reprise automatique à partir de ${new Date(price.retryAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : '';
    const priceHint = [sourceHint, price?.stale ? 'Dernier prix connu, actualisation en attente.' : '', price?.error, waitHint].filter(Boolean).join(' ');
    view.ui.update({
      copyCount: duplicates?.countFor(row?.card?.id) || 0,
      views: viewsOf(row),
      price: value?.price ?? null,
      priceHint,
      loading: !row && ['scanning', 'waiting'].includes(session.phase),
      priceLoading: Boolean(row && !value && (!price || ['idle', 'loading', 'paused'].includes(price.status))
        && !['OFFLINE', 'AUTH_REQUIRED', 'PRICE_ACCESS_REQUIRED'].includes(price?.errorCode)),
      priceError: price?.error || '',
      priceStatus: price?.errorCode === 'OFFLINE' ? 'Hors ligne'
        : price?.errorCode === 'AUTH_REQUIRED' ? 'Connexion requise'
        : price?.errorCode === 'PRICE_ACCESS_REQUIRED' ? 'Accès réservé'
          : 'Prix indisponible',
      busy: session.busyIds.has(view.id),
      disabled: session.operation || recoveryPending || ((!session.ready || !confirmedRow) && !view.error),
      protected: Boolean(protectedReason && confirmedRow),
      protectedReason,
      error: view.error || '',
      stack: view.stack ? { count: view.stack.count, index: view.stack.index, expanded: view.stack.expanded } : null,
    });
  }

  function render() {
    if (!session.alive) return;
    duplicates?.update(session.rows, session.ready && !recoveryPending && !session.operation);
    let status = session.status;
    if (!status && session.ready && !session.operation) {
      const unknown = [...session.rows.values()].filter((row) => viewsOf(row) === null).length;
      status = session.rows.size === 0
        ? 'Votre collection est vide.'
        : unknown ? `${format.format(unknown)} carte${unknown > 1 ? 's' : ''} sans vues ignorée${unknown > 1 ? 's' : ''}.` : '';
    }
    toolbar.update({
      duplicateGroups: duplicates && (session.ready || session.rows.size) ? duplicates.size : null,
      retryLoading: recoveryPending && navigator.onLine !== false && !session.ready,
      refreshing: session.backgroundRead,
      stackDuplicates: session.stackDuplicates,
      review: reviewItems(),
      rarities: session.rarities,
      rarityCounts: rarityCounts(),
      processingTitles: session.processingTitles || [],
      statusKind: session.statusKind,
      syncedAt: session.ready ? session.syncedAt : 0,
      phase: session.phase,
      scope: session.scope,
      threshold: session.threshold,
      blockedWords: session.blockedWords,
      eligible: eligibleIds().length,
      total: session.operationTotal,
      processed: session.completed,
      status,
      error: session.error || session.preferenceError,
    });
    applyStacks();
    for (const view of session.views.values()) renderCard(view);
  }

  function syncPrices() {
    if (!session.alive || !session.priceLoader) return;
    const visibleRows = [...session.views.values()]
      .filter(view => view.inView && !view.removed && view.wrapper.isConnected)
      .map(view => session.rows.get(view.id) || view.displayRow).filter(Boolean);
    session.priceLoader.sync(visibleRows);
  }

  function initPrices() {
    const accountKey = uuid.test(accountNow() || '') ? accountNow() : null;
    if (session.priceAccount === accountKey && session.priceLoader) return;
    session.priceLoader?.destroy();
    session.priceAccount = accountKey;
    session.priceLoader = accountKey ? createPriceLoader({
      accountKey,
      signal: session.controller.signal,
      onChange: () => { if (session.alive) for (const view of session.views.values()) renderCard(view); },
    }) : null;
    session.priceLoader?.setPaused(Boolean(session.readController || session.operation));
    syncPrices();
  }

  function syncDOM() {
    if (!session.alive) return;
    const theme = pageTheme();
    toolbar.element.dataset.theme = theme;
    const main = document.querySelector('main');
    const title = main?.querySelector('h1') || [...(main?.querySelectorAll('h2') || [])]
      .find(element => /collection/i.test(element.textContent));
    const page = title?.closest('[data-wme-page-content], div.p-4, section.p-4, [class~="md:p-6"]')
      || main?.querySelector('[data-wme-page-content]');
    if (title) {
      // Stay inside the padded page, including when its header arrives after us.
      let anchor = title;
      if (page?.contains(title)) {
        while (anchor.parentElement !== page) anchor = anchor.parentElement;
      } else if (title.parentElement.matches('header, .flex, [data-wme-header]') && title.parentElement !== main) {
        anchor = title.parentElement;
      }
      if (anchor.nextElementSibling !== toolbar.element) anchor.after(toolbar.element);
    } else if (page && toolbar.element.parentElement !== page) {
      page.prepend(toolbar.element);
    }
    for (const [wrapper, view] of session.views) {
      if (!wrapper.isConnected || wrapper.dataset.wmeOwnedId !== view.id) {
        intersection.unobserve(wrapper);
        view.ui.destroy();
        session.views.delete(wrapper);
      }
    }
    for (const wrapper of document.querySelectorAll('main [data-wme-owned-id]')) {
      if (session.views.has(wrapper)) continue;
      const view = { wrapper, id: wrapper.dataset.wmeOwnedId, inView: false, removed: false, error: '' };
      view.ui = createCardExtras({
        onDuplicates: () => {
          const row = session.rows.get(view.id) || view.displayRow;
          if (row?.card?.id) void showDuplicates(row.card.id);
        },
        onDiscard: () => runDiscard(view.id),
        onStackToggle: () => toggleStack(view),
        onRetry: () => {
          view.error = '';
          refresh();
        },
      });
      session.views.set(wrapper, view);
      wrapper.append(view.ui.element);
      intersection.observe(wrapper);
    }
    for (const view of session.views.values()) {
      view.ui.element.dataset.theme = theme;
      try {
        const row = JSON.parse(view.wrapper.getAttribute('data-wme-owned-row'));
        if (row?.id === view.id && row?.card?.id === view.wrapper.dataset.wmeCatalogId && uuid.test(row.card.id)) view.displayRow = row;
      } catch { /* Keep the last facts for this exact mounted card. */ }
    }
    initPrices();
    syncPrices();
    render();
    checkCacheAgainstPage();
  }

  async function refresh({ initial = false, automatic = false, background = false } = {}) {
    if (!session.alive || session.operation || session.readController) return;
    if (navigator.onLine === false) {
      queueRecovery({ needsIdle: false });
      return;
    }
    if (automatic && (!recoveryPending || Date.now() < Math.max(recoveryAt, getNetworkPause().until,
      recoveryNeedsIdle ? lastInteractionAt + RECOVERY_IDLE_MS : 0))) {
      armRecovery();
      return;
    }
    clearTimeout(recoveryTimer);
    recoveryPending = false;
    recoveryAt = 0;
    session.readController = new AbortController();
    const controller = session.readController;
    // Background: the cached copy stays usable; only the refresh button shows work.
    session.backgroundRead = background && session.ready;
    if (!session.backgroundRead) {
      session.priceLoader?.setPaused(true);
      session.phase = 'scanning';
      session.ready = false;
      session.status = 'Lecture de la collection…';
    }
    session.error = '';
    if (!initial && !session.backgroundRead) {
      for (const view of session.views.values()) view.error = '';
    }
    render();
    try {
      const rows = await loadCollection({
        signal: controller.signal,
        onProgress: ({ loaded, total }) => {
          if (session.backgroundRead) return;
          session.status = `Lecture des cartes : ${format.format(loaded)}${total === null ? '' : ` / ${format.format(total)}`}`;
          render();
        },
      });
      if (!session.alive || controller.signal.aborted) return;
      const pending = await loadProtections(rows, { signal: controller.signal });
      if (!session.alive || controller.signal.aborted) return;
      session.rows = rows;
      session.pending = pending;
      session.syncedAt = Date.now();
      session.fromCache = false;
      writeCache();
      initPrices();
      session.priceLoader?.setPaused(false);
      recoveryAttempts = 0;
      session.phase = 'ready';
      session.ready = true;
      if (!session.backgroundRead) {
        const notice = initial ? takeNotice() : { text: '', kind: '' };
        session.status = notice.text;
        session.statusKind = notice.kind;
      }
      syncDOM();
      syncPrices();
    } catch (error) {
      if (error.name !== 'AbortError' && session.alive && session.backgroundRead) {
        // Keep the cached copy on screen; try again later, quietly.
        recoveryPending = true;
        recoveryNeedsIdle = true;
        recoveryAt = Date.now() + Math.max(RECOVERY_IDLE_MS, (error.retryAfter || 0) * 1000);
      } else if (error.name !== 'AbortError' && session.alive) {
        if (['COLLECTION_CHANGED', 'NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'NETWORK_PAUSED', 'SERVICE_UNAVAILABLE', 'FORBIDDEN', 'INVALID_RESPONSE'].includes(error.code)
          || error.status >= 500) {
          const wait = Math.max(RECOVERY_IDLE_MS, Math.min(5 * 60_000, RECOVERY_IDLE_MS * 2 ** Math.min(recoveryAttempts++, 3)), (error.retryAfter || 0) * 1000);
          queueRecovery({ wait, needsIdle: error.code === 'COLLECTION_CHANGED' });
        } else {
          session.phase = 'error';
          session.error = error.message;
          session.status = '';
        }
      }
    } finally {
      if (session.readController === controller) {
        session.readController = null;
        session.backgroundRead = false;
      }
      session.priceLoader?.setPaused(Boolean(session.operation));
      armRecovery();
      render();
    }
  }

  async function runDiscard(singleId, frozenIds) {
    if (!session.alive || !session.ready || session.operation) return;
    if (session.backgroundRead) session.readController?.abort();
    session.review = null;
    session.statusKind = '';
    const candidates = singleId ? [singleId] : frozenIds ?? eligibleIds();
    if (!candidates.length) return;
    const threshold = session.threshold;
    const blockedAtStart = session.blockedWordFor;
    const raritiesAtStart = new Set(session.rarities);
    session.operation = true;
    session.priceLoader?.setPaused(true);
    session.phase = 'processing';
    session.stopped = false;
    session.error = '';
    session.status = 'Vérification des cartes…';
    session.completed = 0;
    session.operationTotal = candidates.length;
    render();
    let succeeded = 0;
    let skipped = 0;
    let operationError = null;
    try {
      // One mutation queue per origin, including other collection tabs.
      await navigator.locks.request('wme:discard', { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('Une défausse est déjà en cours dans un autre onglet.');
        if (!singleId) {
          await preferenceWrites;
          if (session.preferenceError) throw new Error(session.preferenceError);
          const preferences = await chrome.storage.local.get('blockedWords');
          if (preferences.blockedWords !== undefined && !Array.isArray(preferences.blockedWords)) {
            throw new Error('Impossible de lire les mots protégés. Défausse automatique suspendue.');
          }
          setBlockedWords(preferences.blockedWords);
        }
        session.readController = new AbortController();
        const signal = session.readController.signal;
        const fresh = await loadCollection({ signal });
        const pending = await loadProtections(fresh, { signal });
        session.readController = null;
        if (!session.alive || session.stopped) return;
        session.rows = fresh;
        session.pending = pending;
        session.syncedAt = Date.now();
        const options = {
          rows: fresh, viewsOf, threshold, single: Boolean(singleId),
          isProtected: (id, row) => liveReason(id, row)
            || (!singleId && (blockedAtStart(row) || session.blockedWordFor(row) || !raritiesAtStart.has(rarityOf(row)))),
        };
        const plan = planDiscardBatches(candidates, options);
        skipped += plan.skippedIds.length;
        session.completed += plan.skippedIds.length;
        // Freeze IDs selected when the user clicked. Pagination shifts cannot add cards.
        for (const plannedBatch of plan.batches) {
          if (!session.alive || !onCollection() || session.stopped) break;
          // Include any favorite toggled since the initial scan, before sending this lot.
          const checked = planDiscardBatches(plannedBatch, options);
          const batch = checked.batches.flat();
          skipped += checked.skippedIds.length;
          session.completed += checked.skippedIds.length;
          if (!batch.length) continue;
          session.busyIds = new Set(batch);
          session.processingTitles = batch.map(id => session.rows.get(id)?.card?.wikipedia_title || 'Carte');
          session.status = `Défausse de ${format.format(batch.length)} carte${batch.length > 1 ? 's' : ''} : ${format.format(session.completed)} / ${format.format(candidates.length)} traitées`;
          render();
          let result;
          try {
            // Stop cancels the queue, never an in-flight mutation whose result matters.
            const beforeSend = () => session.alive && onCollection() && !session.stopped
              && accountNow() === session.accountKey && !session.preferenceError
              && planDiscardBatches(batch, options).batches.flat().length === batch.length;
            if (singleId) {
              await discardCard(singleId, { beforeSend });
              result = { discardedCount: 1, successfulIds: [singleId], partial: false };
            } else {
              result = parseDiscardBatchResult(await discardCards(batch, { beforeSend }), batch);
            }
          } catch (error) {
            if (singleId) for (const view of session.views.values()) if (view.id === singleId) view.error = error.message;
            throw error; // No automatic retry, and no further destructive calls after an error.
          }
          succeeded += result.discardedCount;
          session.completed += batch.length;
          for (const id of result.successfulIds) {
            session.rows.delete(id);
            for (const view of session.views.values()) {
              if (view.id !== id) continue;
              view.removed = true;
              view.wrapper.dataset.wmeRemoved = 'true';
            }
          }
          if (result.discardedCount) document.dispatchEvent(new Event('wme:balance-refresh'));
          session.busyIds.clear();
          render();
          if (result.partial) throw new Error(`${format.format(result.failedCount)} carte${result.failedCount > 1 ? 's' : ''} refusée${result.failedCount > 1 ? 's' : ''} par le site. Série arrêtée.`);
          // Yield once so Arrêter remains actionable between lots, without per-card delay.
          if (session.completed < candidates.length) await delay(0);
        }
      });
    } catch (error) {
      if (error.name !== 'AbortError') operationError = error;
    } finally {
      session.readController = null;
      session.busyIds.clear();
      session.processingTitles = [];
      if (operationError?.code === 'COLLECTION_CHANGED') {
        session.operation = false;
        queueRecovery();
        return;
      }
      const reload = succeeded > 0 || operationError?.uncertain;
      session.operation = Boolean(reload);
      const result = operationError?.uncertain
        ? `${format.format(succeeded)} défausse${succeeded > 1 ? 's' : ''} confirmée${succeeded > 1 ? 's' : ''}. Résultat du dernier lot à vérifier.`
        : `${format.format(succeeded)} carte${succeeded > 1 ? 's' : ''} défaussée${succeeded > 1 ? 's' : ''}${succeeded ? ` (+${format.format(succeeded)} WB)` : ''}.`;
      const summary = `${session.stopped ? 'Arrêté. ' : ''}${result}${skipped ? ` ${format.format(skipped)} préservée${skipped > 1 ? 's' : ''}.` : ''}${operationError ? ` ${operationError.message}` : ''}`;
      session.status = summary;
      session.error = operationError ? summary : '';
      session.phase = reload ? 'scanning' : operationError ? 'error' : 'ready';
      session.ready = !operationError;
      render();
      if (reload) {
        // The copy read for this discard, minus the discarded cards, stays fresh after the reload.
        if (!operationError?.uncertain) writeCache();
        // Refresh React's collection, pagination and wallet together, without patching its state.
        try { sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ text: summary, at: Date.now(), kind: operationError ? '' : 'success' })); } catch {}
        await delay(650);
        if (session.alive && onCollection()) location.reload();
      } else {
        if (recoveryPending) {
          session.ready = false;
          if (!operationError) {
            session.phase = 'waiting';
            session.status = 'Actualisation en attente…';
          }
          armRecovery();
          render();
        } else session.priceLoader?.setPaused(false);
        syncPrices();
      }
    }
  }

  session.syncDOM = syncDOM;
  session.destroy = () => {
    session.alive = false;
    session.stopped = true;
    clearTimeout(recoveryTimer);
    session.controller.abort();
    session.priceLoader?.destroy();
    try { chrome.storage.onChanged.removeListener(onPreferencesChanged); } catch { /* Invalidated. */ }
    session.readController?.abort();
    intersection.disconnect();
    toolbar.destroy();
    duplicates?.destroy();
    for (const view of session.views.values()) {
      view.ui.destroy();
      view.layers?.remove();
      for (const name of ['data-wme-stack', 'data-wme-stack-state', 'data-wme-stack-hidden']) view.wrapper.removeAttribute(name);
      view.wrapper.style.order = '';
    }
    session.views.clear();
  };

  chrome.storage.onChanged.addListener(onPreferencesChanged);
  document.addEventListener('wme:collection-changed', onCollectionChanged, { signal: session.controller.signal });
  for (const event of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart']) {
    document.addEventListener(event, onActivity, { capture: true, passive: true, signal: session.controller.signal });
  }
  window.addEventListener('online', onConnectivityChange, { signal: session.controller.signal });
  window.addEventListener('offline', onConnectivityChange, { signal: session.controller.signal });
  document.addEventListener('visibilitychange', armRecovery, { signal: session.controller.signal });
  document.addEventListener('wme:network-state', armRecovery, { signal: session.controller.signal });
  chrome.storage.local.get(['threshold', 'scope', 'blockedWords', 'stackDuplicates', 'discardRarities']).then((preferences) => {
    setRarities(preferences.discardRarities);
    if (typeof preferences.stackDuplicates === 'boolean') session.stackDuplicates = preferences.stackDuplicates;
    if (Number.isSafeInteger(preferences.threshold) && preferences.threshold >= 0) session.threshold = preferences.threshold;
    if (['page', 'collection'].includes(preferences.scope)) session.scope = preferences.scope;
    if (preferences.blockedWords !== undefined && !Array.isArray(preferences.blockedWords)) throw new Error('Invalid protections');
    setBlockedWords(preferences.blockedWords);
  }).catch(() => {
    session.preferenceError = 'Impossible de lire vos protections. Défausse automatique suspendue.';
  }).finally(async () => {
    if (!session.alive) return;
    const cached = await readCollectionCache(session.accountKey);
    if (!session.alive) return;
    if (!cached) { refresh({ initial: true }); return; }
    session.rows = new Map(cached.rows.map(row => [row.id, row]));
    session.pending = new Set(cached.pending);
    session.syncedAt = cached.at;
    session.fromCache = true;
    session.phase = 'ready';
    session.ready = true;
    const notice = takeNotice();
    session.status = notice.text;
    session.statusKind = notice.kind;
    initPrices();
    syncDOM();
    syncPrices();
    render();
    if (Date.now() - cached.at > CACHE_FRESH_MS) refresh({ background: true });
    else checkCacheAgainstPage();
  });
  document.dispatchEvent(new Event('wme:scan'));
  syncDOM();
  void loadDuplicates();
  return session;
}

function takeNotice() {
  try {
    const notice = JSON.parse(sessionStorage.getItem(NOTICE_KEY) || 'null');
    sessionStorage.removeItem(NOTICE_KEY);
    return notice && Date.now() - notice.at < 60_000 ? { text: String(notice.text || ''), kind: notice.kind || '' } : { text: '', kind: '' };
  } catch { return { text: '', kind: '' }; }
}

function updateLifecycle() {
  if (!extensionAlive()) return;
  if (!onCollection()) {
    current?.destroy();
    current = null;
    return;
  }
  if (current && current.accountKey !== accountNow()) { current.destroy(); current = null; }
  if (!current) current = createSession();
  else current.syncDOM();
}

function scheduleLifecycle() {
  if (lifecycleTimer) return;
  lifecycleTimer = setTimeout(() => { lifecycleTimer = null; updateLifecycle(); }, 100);
}

// Mutations made only by the extension (inside its nodes, or adding them) never
// trigger a resync. A removal of one of its nodes still does, so it gets restored.
const insideOwn = node => Boolean((node instanceof Element ? node : node?.parentElement)?.closest?.('[data-wme]'));
const ownRecord = record => insideOwn(record.target)
  || (record.type === 'childList' && !record.removedNodes.length && record.addedNodes.length > 0
    && [...record.addedNodes].every(node => node instanceof Element && node.hasAttribute('data-wme')));
const lifecycleObserver = new MutationObserver(records => {
  if (!records.every(ownRecord)) scheduleLifecycle();
});
lifecycleObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-wme-owned-id', 'data-wme-owned-row', 'data-wme-starred', 'data-wme-pending', 'data-wme-account', 'data-wme-page-content', 'data-wme-header'],
});
window.addEventListener('popstate', scheduleLifecycle);
window.addEventListener('pageshow', scheduleLifecycle);
const themeObserver = new MutationObserver(scheduleLifecycle);
for (const element of [document.documentElement, document.body]) {
  themeObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleLifecycle);
onInvalidated(() => {
  lifecycleObserver.disconnect();
  themeObserver.disconnect();
  clearTimeout(lifecycleTimer);
  current?.destroy();
  current = null;
});
updateLifecycle();
