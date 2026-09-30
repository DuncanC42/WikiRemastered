import { normalizeBlockedWords } from './protection.js';
import { createSteppedSlider, createHelpButton } from './controls.js';
import { RARITIES } from './pack-cards.js';

const numberFormat = new Intl.NumberFormat('fr-FR');
const RARITY_NAMES = { C: 'Commune', PC: 'Peu commune', R: 'Rare', SR: 'Super rare', UR: 'Ultra rare', L: 'Légendaire' };
const plural = (count, word) => `${numberFormat.format(count)} ${word}${count > 1 ? 's' : ''}`;
// Literal, accent-insensitive search for the review filter.
const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSurface(kind) {
  const element = makeElement('div');
  element.dataset.wme = kind;
  const root = element.attachShadow({ mode: 'open' });
  const stylesheet = makeElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('ui.css');
  root.append(stylesheet);
  const controller = new AbortController();
  for (const event of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup']) {
    root.addEventListener(event, (e) => e.stopPropagation(), { signal: controller.signal });
  }
  return {
    element,
    root,
    signal: controller.signal,
    destroy() {
      controller.abort();
      element.remove();
    },
  };
}

function makeButton(className, label) {
  const button = makeElement('button', `button ${className}`, label);
  button.type = 'button';
  return button;
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Pure presentation: the caller owns all reads, mutations, and operation state. */
export function createToolbar({ onBulk, onBulkConfirm, onBulkCancel, onReviewExclude, onReviewRestore, onStop, onRefresh, onScopeChange, onThresholdChange, onBlockedWordsChange, onRaritiesChange, onDuplicates, onStackChange }) {
  const surface = makeSurface('toolbar');
  const toolbar = makeElement('section', 'toolbar');
  toolbar.lang = 'fr';
  toolbar.setAttribute('aria-label', 'Outils de collection');
  const title = makeElement('h2', 'toolbar-title', 'Collection');
  title.append(makeElement('span', 'title-plus', '+'));
  const subtitle = makeElement('p', 'tool-subtitle', 'Faites le tri parmi vos cartes peu consultées, sans toucher à celles qui comptent.');
  const titleGroup = makeElement('div', 'tool-title-group');
  titleGroup.append(title, subtitle);
  const duplicatesButton = makeButton('button-quiet', 'Doublons');
  duplicatesButton.setAttribute('aria-haspopup', 'dialog');
  duplicatesButton.title = 'Voir les piles sur toute la collection';
  duplicatesButton.addEventListener('click', () => onDuplicates?.(), { signal: surface.signal });
  const refreshButton = makeButton('button-quiet refresh-button', '');
  const refreshSpinner = makeElement('span', 'loading-spinner');
  refreshSpinner.setAttribute('aria-hidden', 'true');
  refreshSpinner.hidden = true;
  refreshButton.append(refreshSpinner, makeElement('span', '', 'Actualiser'));
  refreshButton.setAttribute('aria-label', 'Actualiser la collection');
  refreshButton.title = 'Relire la collection et les vues';
  const stackLabel = makeElement('label', 'tool-switch');
  stackLabel.title = 'Regrouper les exemplaires d’une même carte en une pile, sur cette page';
  const stackSwitch = makeElement('input', 'tool-switch-input');
  stackSwitch.type = 'checkbox';
  stackSwitch.name = 'wme-stack-duplicates';
  stackSwitch.setAttribute('role', 'switch');
  stackSwitch.checked = true;
  const stackTrack = makeElement('span', 'tool-switch-track');
  stackTrack.setAttribute('aria-hidden', 'true');
  stackLabel.append(stackSwitch, stackTrack, makeElement('span', '', 'Empiler les doublons'));
  stackSwitch.addEventListener('change', () => onStackChange?.(stackSwitch.checked), { signal: surface.signal });
  const syncLabel = makeElement('span', 'sync-label');
  syncLabel.setAttribute('aria-live', 'off');
  const headingActions = makeElement('div', 'tool-heading-actions');
  headingActions.append(syncLabel, stackLabel, duplicatesButton, refreshButton, createHelpButton('collection', surface.signal));
  const heading = makeElement('header', 'tool-heading');
  heading.append(titleGroup, headingActions);

  // Bulk discard reads as a sentence: "Cards from [scope] with fewer than [n views] over 30 days".
  const discardBlock = makeElement('section', 'tool-block discard-block');
  discardBlock.setAttribute('aria-labelledby', 'discard-title');
  const discardHead = makeElement('div', 'block-head');
  const discardTitle = makeElement('h3', 'block-title', 'Défausse groupée');
  discardTitle.id = 'discard-title';
  discardHead.append(discardTitle, makeElement('p', 'block-note', 'Favoris, cartes en échange et mots protégés sont toujours conservés.'));

  const sentence = makeElement('div', 'discard-sentence');
  const scopeFieldset = makeElement('fieldset', 'scope-fieldset');
  const scopeText = makeElement('legend', 'sr-only', 'Cartes à traiter');
  const scopeTrack = makeElement('div', 'scope-track');
  const scopeIndicator = makeElement('span', 'scope-indicator');
  scopeIndicator.setAttribute('aria-hidden', 'true');
  scopeTrack.append(scopeIndicator);
  const scopeRadios = new Map();
  for (const [value, label] of [['page', 'Cette page'], ['collection', 'Toute la collection']]) {
    const option = makeElement('label', 'scope-option');
    const radio = makeElement('input', 'scope-radio sr-only');
    radio.type = 'radio';
    radio.name = 'collection-scope';
    radio.value = value;
    option.append(radio, makeElement('span', '', label));
    scopeTrack.append(option);
    scopeRadios.set(value, radio);
  }
  scopeFieldset.append(scopeText, scopeTrack);
  const threshold = createSteppedSlider({ label: 'Seuil', unit: 'vues', value: 30,
    min: 0, max: Number.MAX_SAFE_INTEGER, levels: [0, 10, 30, 50, 100, 1000], signal: surface.signal });
  threshold.element.classList.add('collection-threshold');
  threshold.element.title = 'Cartes strictement sous ce nombre de vues sur 30 jours';
  const thresholdInput = threshold.input;
  sentence.append(
    makeElement('span', 'sentence-word', 'Cartes de'), scopeFieldset,
    makeElement('span', 'sentence-word', 'sous'), threshold.element,
    makeElement('span', 'sentence-word', 'sur 30 jours'));

  const discardFooter = makeElement('div', 'discard-footer');
  const summary = makeElement('p', 'discard-summary');
  const actions = makeElement('div', 'toolbar-actions');
  const bulkButton = makeButton('button-primary', 'Défausser');
  const stopButton = makeButton('button-stop', 'Arrêter');
  stopButton.hidden = true;
  actions.append(bulkButton, stopButton);
  discardFooter.append(summary, actions);
  // Review before a bulk discard: the exact cards, then an explicit confirmation.
  const review = makeElement('div', 'discard-review');
  review.hidden = true;
  review.setAttribute('role', 'region');
  review.setAttribute('aria-label', 'Cartes à défausser');
  const reviewHead = makeElement('div', 'review-head');
  const reviewTitle = makeElement('p', 'review-title');
  const reviewNote = makeElement('p', 'block-note', 'Définitif. Favoris, échanges et mots protégés sont revérifiés juste avant chaque lot. Les cartes de cette page sont encadrées.');
  reviewHead.append(reviewTitle, reviewNote);
  // Narrow the list by name or rarity, then take cards out of this discard.
  const reviewFilters = makeElement('div', 'review-filters');
  const reviewSearch = makeElement('input', 'review-search');
  reviewSearch.type = 'search';
  reviewSearch.name = 'wme-review-search';
  reviewSearch.placeholder = 'Rechercher une carte';
  reviewSearch.autocomplete = 'off';
  reviewSearch.setAttribute('aria-label', 'Rechercher dans les cartes à défausser');
  const reviewRarities = makeElement('div', 'review-rarities');
  reviewRarities.setAttribute('role', 'radiogroup');
  reviewRarities.setAttribute('aria-label', 'Filtrer par rareté');
  const reviewBulkRemove = makeButton('review-bulk-remove', '');
  reviewFilters.append(reviewSearch, reviewRarities, reviewBulkRemove);
  const reviewList = makeElement('ol', 'review-list');
  const reviewEmpty = makeElement('p', 'review-empty', 'Aucune carte ne correspond à ce filtre.');
  const reviewActions = makeElement('div', 'review-actions');
  const reviewExcluded = makeElement('p', 'review-excluded');
  const restoreButton = makeButton('button-quiet review-restore', 'Tout remettre');
  reviewExcluded.hidden = true;
  const confirmButton = makeButton('button-primary', 'Confirmer la défausse');
  const cancelButton = makeButton('button-quiet', 'Annuler');
  reviewActions.append(reviewExcluded, cancelButton, confirmButton);
  review.append(reviewHead, reviewFilters, reviewList, reviewEmpty, reviewActions);
  let reviewFilter = { query: '', rarity: '' };
  let reviewOpen = false;
  const matchesFilter = item => (!reviewFilter.rarity || item.rarity === reviewFilter.rarity)
    && (!reviewFilter.query || fold(`${item.title} ${item.category || ''}`).includes(reviewFilter.query));
  reviewSearch.addEventListener('input', () => { reviewFilter.query = fold(reviewSearch.value.trim()); renderReview(); }, { signal: surface.signal });
  reviewRarities.addEventListener('click', event => {
    const choice = event.target.closest?.('[data-rarity-filter]');
    if (!choice) return;
    reviewFilter.rarity = choice.dataset.rarityFilter;
    renderReview();
  }, { signal: surface.signal });
  reviewList.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-review-id]');
    if (!toggle || busy()) return;
    const id = toggle.dataset.reviewId;
    if (toggle.dataset.mode === 'restore') onReviewRestore?.([id]);
    else onReviewExclude?.([id]);
  }, { signal: surface.signal });
  reviewBulkRemove.addEventListener('click', () => {
    if (busy()) return;
    const shown = (state.review || []).filter(matchesFilter);
    const active = shown.filter(item => !item.excluded);
    if (active.length) onReviewExclude?.(active.map(item => item.id));
    else if (shown.length) onReviewRestore?.(shown.map(item => item.id));
  }, { signal: surface.signal });
  restoreButton.addEventListener('click', () => onReviewRestore?.(), { signal: surface.signal });
  confirmButton.addEventListener('click', () => { if (!confirmButton.disabled) onBulkConfirm?.(); }, { signal: surface.signal });
  cancelButton.addEventListener('click', () => onBulkCancel?.(), { signal: surface.signal });

  // Progress while discarding: count, bar and the cards of the current lot.
  const progressPanel = makeElement('div', 'discard-progress');
  progressPanel.hidden = true;
  progressPanel.setAttribute('role', 'status');
  progressPanel.setAttribute('aria-live', 'polite');
  const progressLine = makeElement('p', 'progress-line');
  const progressTrack = makeElement('span', 'progress-track');
  const progressFill = makeElement('span', 'progress-fill');
  progressTrack.append(progressFill);
  progressTrack.setAttribute('aria-hidden', 'true');
  const progressNow = makeElement('p', 'progress-now');
  progressPanel.append(progressLine, progressTrack, progressNow);

  discardBlock.append(discardHead, sentence, discardFooter, review, progressPanel);

  const protectionRow = makeElement('section', 'tool-block protection-row');
  const protectionHead = makeElement('div', 'block-head');
  const wordsLabel = makeElement('label', 'block-title words-label', 'Toujours garder');
  wordsLabel.htmlFor = 'protected-words';
  protectionHead.append(wordsLabel, makeElement('p', 'block-note', 'Un mot du titre, de la catégorie ou d’une étiquette suffit : « chanteur » protège aussi « chanteurs ».'));
  const wordField = makeElement('div', 'word-field');
  const chipList = makeElement('ul', 'word-chips');
  chipList.setAttribute('aria-label', 'Mots protégés de la défausse automatique');
  chipList.hidden = true;
  const wordInput = makeElement('input', 'word-input');
  wordInput.type = 'text';
  wordInput.id = 'protected-words';
  wordInput.name = 'wme-protected-words';
  wordInput.placeholder = 'Ajouter un mot, puis Entrée';
  wordInput.autocomplete = 'off';
  wordInput.setAttribute('aria-description', 'Conserve les cartes correspondantes pendant la défausse groupée. Entrée, virgule ou point-virgule pour ajouter.');
  const addWordButton = makeButton('button-primary button-add-word', 'Ajouter');
  addWordButton.setAttribute('aria-label', 'Ajouter les mots protégés');
  wordField.append(chipList, wordInput, addWordButton);
  const wordsBlock = makeElement('div', 'protection-block');
  wordsBlock.append(protectionHead, wordField);

  // Which rarities a bulk discard may touch. Unselected rarities are always kept.
  const rarityBlock = makeElement('div', 'protection-block rarity-block');
  const rarityHead = makeElement('div', 'block-head');
  const rarityTitle = makeElement('p', 'block-title', 'Raretés à défausser');
  rarityTitle.id = 'discard-rarities-title';
  const rarityNote = makeElement('p', 'block-note');
  rarityHead.append(rarityTitle, rarityNote);
  const rarityGroup = makeElement('div', 'rarity-picker');
  rarityGroup.setAttribute('role', 'group');
  rarityGroup.setAttribute('aria-labelledby', 'discard-rarities-title');
  const rarityButtons = new Map();
  for (const rarity of RARITIES) {
    const option = makeElement('button', 'rarity-option');
    option.type = 'button';
    option.dataset.rarity = rarity;
    option.title = RARITY_NAMES[rarity];
    const code = makeElement('span', 'rarity-code', rarity);
    const count = makeElement('span', 'rarity-count');
    option.append(code, count);
    option.addEventListener('click', () => {
      if (busy()) return;
      const current = new Set(state.rarities);
      if (current.has(rarity)) current.delete(rarity); else current.add(rarity);
      // At least one rarity stays selected: an empty choice would read as "all".
      if (!current.size) return;
      state.rarities = RARITIES.filter(value => current.has(value));
      renderRarities();
      onRaritiesChange?.([...state.rarities]);
    }, { signal: surface.signal });
    rarityGroup.append(option);
    rarityButtons.set(rarity, { option, count });
  }
  rarityBlock.append(rarityHead, rarityGroup);
  protectionRow.append(wordsBlock, rarityBlock);

  const status = makeElement('p', 'toolbar-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.hidden = true;
  const statusSpinner = makeElement('span', 'loading-spinner');
  statusSpinner.setAttribute('aria-hidden', 'true');
  const statusText = makeElement('span');
  status.append(statusSpinner, statusText);
  toolbar.append(heading, discardBlock, protectionRow, status);
  surface.root.append(toolbar);

  let state = { phase: 'idle', status: '', total: 0, eligible: 0, processed: 0, scope: 'page', threshold: 30, blockedWords: [], rarities: [...RARITIES], rarityCounts: {}, error: '' };
  let renderedWords = '';
  const chips = new Map();
  const busy = () => state.phase === 'processing' || state.phase === 'scanning';

  function renderWords() {
    const words = normalizeBlockedWords(state.blockedWords);
    state.blockedWords = words;
    const signature = JSON.stringify(words);
    if (signature !== renderedWords) {
      const focusedWord = [...chips].find(([, item]) => item.button === surface.root.activeElement)?.[0];
      for (const [word, item] of chips) {
        if (words.includes(word)) continue;
        item.element.remove();
        chips.delete(word);
      }
      words.forEach((word, index) => {
        if (!chips.has(word)) {
          const element = makeElement('li', 'word-chip');
          const text = makeElement('span', 'word-chip-label', word);
          const button = makeButton('word-remove', '×');
          button.setAttribute('aria-label', `Retirer « ${word} »`);
          button.title = `Retirer « ${word} »`;
          button.addEventListener('click', () => {
            if (busy()) return;
            updateWords(state.blockedWords.filter((entry) => entry !== word));
          }, { signal: surface.signal });
          element.append(text, button);
          chips.set(word, { element, button });
        }
        const item = chips.get(word);
        if (chipList.children[index] !== item.element) chipList.insertBefore(item.element, chipList.children[index] || null);
      });
      if (focusedWord) {
        const target = chips.get(focusedWord)?.button || wordInput;
        if (surface.root.activeElement !== target) target.focus();
      }
      renderedWords = signature;
      chipList.hidden = words.length === 0;
    }
    for (const item of chips.values()) item.button.disabled = busy();
    wordInput.disabled = busy();
    addWordButton.disabled = busy() || !wordInput.value.trim();
  }

  function renderRarities() {
    const selected = new Set(Array.isArray(state.rarities) && state.rarities.length ? state.rarities : RARITIES);
    for (const [rarity, { option, count }] of rarityButtons) {
      const on = selected.has(rarity);
      const value = state.rarityCounts?.[rarity];
      option.setAttribute('aria-pressed', String(on));
      option.disabled = busy();
      count.textContent = Number.isInteger(value) ? numberFormat.format(value) : '';
      option.setAttribute('aria-label', `${RARITY_NAMES[rarity]}${Number.isInteger(value) ? `, ${plural(value, 'carte')} sous le seuil` : ''}${on ? '' : ', conservée'}`);
    }
    const kept = RARITIES.filter(rarity => !selected.has(rarity)).map(rarity => RARITY_NAMES[rarity].toLocaleLowerCase('fr-FR'));
    rarityNote.textContent = kept.length ? `Toujours gardées : ${kept.join(', ')}.` : 'Toutes les raretés sont concernées. Le chiffre compte les cartes sous le seuil.';
  }

  // "− Retirer" / "+ Remettre": one labelled button, same wording for a row or a filtered group.
  function setToggle(button, mode, text) {
    if (button.dataset.mode === mode && button.dataset.text === text) return;
    button.dataset.mode = mode;
    button.dataset.text = text;
    const sign = makeElement('span', 'action-sign', mode === 'restore' ? '+' : '−');
    sign.setAttribute('aria-hidden', 'true');
    button.replaceChildren(sign, makeElement('span', '', text));
  }

  // Rows are kept between renders, so a click never moves the list or the focus.
  const reviewRows = new Map();
  function reviewRow(item) {
    let entry = reviewRows.get(item.id);
    if (entry) return entry;
    const element = makeElement('li', 'review-row');
    if (item.rarity) element.dataset.rarity = item.rarity;
    const name = makeElement('span', 'review-name');
    name.append(makeElement('span', 'review-title-text', item.title || 'Carte'));
    if (item.category) name.append(makeElement('span', 'review-category', item.category));
    name.title = [item.title, item.category].filter(Boolean).join(' · ');
    const toggle = makeButton('review-remove', '');
    toggle.dataset.reviewId = item.id;
    element.append(name, makeElement('span', 'review-rarity', item.rarity || ''),
      makeElement('span', 'review-views', `${numberFormat.format(item.views)} vue${item.views > 1 ? 's' : ''}`), toggle);
    entry = { element, toggle, title: item.title || 'cette carte' };
    reviewRows.set(item.id, entry);
    return entry;
  }

  function renderReview() {
    const items = Array.isArray(state.review) ? state.review : [];
    const active = items.filter(item => !item.excluded);
    const present = RARITIES.filter(rarity => items.some(item => item.rarity === rarity));
    if (reviewFilter.rarity && !present.includes(reviewFilter.rarity)) reviewFilter.rarity = '';
    const choices = [['', 'Toutes', active.length], ...present.map(rarity => [rarity, rarity, active.filter(item => item.rarity === rarity).length])];
    const choiceSignature = JSON.stringify([choices, reviewFilter.rarity]);
    if (reviewRarities.dataset.signature !== choiceSignature) {
      reviewRarities.dataset.signature = choiceSignature;
      reviewRarities.replaceChildren(...choices.map(([value, label, count]) => {
        const choice = makeElement('button', 'review-rarity-choice');
        choice.type = 'button';
        choice.dataset.rarityFilter = value;
        if (value) choice.dataset.rarity = value;
        choice.setAttribute('role', 'radio');
        choice.setAttribute('aria-checked', String(reviewFilter.rarity === value));
        choice.title = value ? RARITY_NAMES[value] : 'Toutes les raretés';
        choice.append(makeElement('span', '', label), makeElement('span', 'review-choice-count', numberFormat.format(count)));
        return choice;
      }));
    }
    reviewRarities.hidden = present.length < 2;
    const shown = items.filter(matchesFilter);
    const shownActive = shown.filter(item => !item.excluded);
    const filtered = Boolean(reviewFilter.query || reviewFilter.rarity);
    reviewBulkRemove.hidden = !filtered || !shown.length;
    if (shownActive.length) setToggle(reviewBulkRemove, 'remove', shownActive.length > 1 ? `Retirer ces ${numberFormat.format(shownActive.length)}` : 'Retirer cette carte');
    else setToggle(reviewBulkRemove, 'restore', shown.length > 1 ? `Remettre ces ${numberFormat.format(shown.length)}` : 'Remettre cette carte');
    const signature = JSON.stringify(shown.map(item => item.id));
    if (reviewList.dataset.signature !== signature) {
      if (reviewList.dataset.signature !== undefined && !shown.every(item => reviewRows.has(item.id))) reviewList.scrollTop = 0;
      reviewList.dataset.signature = signature;
      reviewList.replaceChildren(...shown.map(item => reviewRow(item).element));
    }
    const live = new Set(items.map(item => item.id));
    for (const id of reviewRows.keys()) if (!live.has(id)) reviewRows.delete(id);
    for (const item of shown) {
      const { element, toggle, title } = reviewRow(item);
      const mode = item.excluded ? 'restore' : 'remove';
      element.dataset.excluded = String(Boolean(item.excluded));
      setToggle(toggle, mode, item.excluded ? 'Remettre' : 'Retirer');
      const label = item.excluded ? `Remettre ${title} dans la défausse` : `Retirer ${title} de la défausse`;
      if (toggle.getAttribute('aria-label') !== label) toggle.setAttribute('aria-label', label);
      toggle.disabled = busy();
    }
    reviewBulkRemove.disabled = busy();
    reviewEmpty.hidden = shown.length > 0 || !items.length;
    const excluded = items.length - active.length;
    reviewExcluded.hidden = !excluded;
    reviewExcluded.replaceChildren(`${plural(excluded, 'carte')} retirée${excluded > 1 ? 's' : ''}`, restoreButton);
  }

  function updateWords(words) {
    state.blockedWords = normalizeBlockedWords(words);
    renderWords();
    onBlockedWordsChange?.([...state.blockedWords]);
  }

  function commitWords({ focus = false } = {}) {
    if (busy() || !wordInput.value.trim()) return;
    const added = wordInput.value.split(/[,;\r\n]+/);
    wordInput.value = '';
    updateWords([...state.blockedWords, ...added]);
    if (focus && !busy()) wordInput.focus();
  }

  bulkButton.addEventListener('click', () => {
    // A word already typed protects the batch, even if Enter was not pressed.
    commitWords();
    if (!bulkButton.disabled) onBulk?.();
  }, { signal: surface.signal });
  stopButton.addEventListener('click', () => {
    if (stopButton.disabled) return;
    stopButton.disabled = true;
    stopButton.textContent = 'Arrêt…';
    onStop?.();
  }, { signal: surface.signal });
  refreshButton.addEventListener('click', () => {
    if (!refreshButton.disabled) onRefresh?.();
  }, { signal: surface.signal });
  for (const [value, radio] of scopeRadios) {
    radio.addEventListener('change', () => {
      if (!radio.checked || busy()) return;
      state.scope = value;
      scopeTrack.dataset.scope = value;
      onScopeChange?.(value);
    }, { signal: surface.signal });
  }
  addWordButton.addEventListener('click', () => commitWords({ focus: true }), { signal: surface.signal });
  wordInput.addEventListener('input', () => {
    addWordButton.disabled = busy() || !wordInput.value.trim();
  }, { signal: surface.signal });
  wordInput.addEventListener('keydown', (event) => {
    if (event.isComposing || !['Enter', ',', ';'].includes(event.key)) return;
    event.preventDefault();
    commitWords({ focus: true });
  }, { signal: surface.signal });
  wordInput.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!/[,;\r\n]/.test(pasted) || busy()) return;
    event.preventDefault();
    const start = wordInput.selectionStart ?? wordInput.value.length;
    const end = wordInput.selectionEnd ?? start;
    wordInput.value = `${wordInput.value.slice(0, start)}${pasted}${wordInput.value.slice(end)}`;
    commitWords({ focus: true });
  }, { signal: surface.signal });
  wordInput.addEventListener('blur', (event) => {
    if (!event.relatedTarget?.closest?.('.word-remove')) commitWords();
  }, { signal: surface.signal });
  thresholdInput.addEventListener('change', () => {
    const value = thresholdInput.valueAsNumber;
    if (!validNumber(value) || !Number.isSafeInteger(value)) {
      thresholdInput.value = String(state.threshold);
      threshold.sync();
      return;
    }
    state.threshold = value;
    onThresholdChange?.(value);
  }, { signal: surface.signal });

  function update(next) {
    const previousPhase = state.phase;
    state = { ...state, ...next };
    const processing = state.phase === 'processing';
    const scanning = state.phase === 'scanning';
    const busy = processing || scanning;
    toolbar.dataset.phase = state.phase;
    toolbar.setAttribute('aria-busy', String(busy));
    threshold.setDisabled(busy);
    scopeFieldset.disabled = busy;
    const refreshing = scanning || Boolean(state.retryLoading) || Boolean(state.refreshing);
    refreshButton.disabled = busy || refreshing;
    renderSync();
    stackSwitch.checked = state.stackDuplicates !== false;
    // Reading the collection: the button itself shows it is working.
    refreshSpinner.hidden = !refreshing;
    refreshButton.setAttribute('aria-busy', String(refreshing));
    refreshButton.title = refreshing ? 'Actualisation en cours…' : 'Relire la collection et les vues';
    duplicatesButton.textContent = Number.isInteger(state.duplicateGroups) ? `Doublons (${numberFormat.format(state.duplicateGroups)})` : 'Doublons';
    duplicatesButton.disabled = processing;
    threshold.setValue(state.threshold);
    scopeTrack.dataset.scope = state.scope;
    for (const [value, radio] of scopeRadios) radio.checked = value === state.scope;
    renderWords();
    renderRarities();
    const eligible = validNumber(state.eligible) ? state.eligible : 0;
    const count = numberFormat.format(eligible);
    bulkButton.textContent = eligible > 0 ? `Défausser ${count} carte${eligible > 1 ? 's' : ''}` : 'Défausser';
    bulkButton.disabled = state.phase !== 'ready' || eligible < 1;
    bulkButton.title = eligible > 0 ? 'Action définitive, par lots de 50 cartes au plus.' : '';
    const where = state.scope === 'collection' ? 'dans toute la collection' : 'sur cette page';
    const limit = `${numberFormat.format(state.threshold)} vue${state.threshold > 1 ? 's' : ''}`;
    // Review and progress panels.
    const reviewItems = Array.isArray(state.review) ? state.review : null;
    const reviewing = Boolean(reviewItems) && !processing;
    review.hidden = !reviewing;
    sentence.inert = reviewing || processing;
    discardFooter.hidden = reviewing || processing;
    discardBlock.dataset.mode = processing ? 'progress' : reviewing ? 'review' : 'idle';
    if (reviewing && !reviewOpen) {
      // A new review starts unfiltered.
      reviewFilter = { query: '', rarity: '' };
      reviewSearch.value = '';
      reviewList.scrollTop = 0;
      reviewList.dataset.signature = '';
    }
    if (!reviewing) reviewRows.clear();
    reviewOpen = reviewing;
    if (reviewing) {
      const active = reviewItems.filter(item => !item.excluded).length;
      const reviewCount = numberFormat.format(active);
      reviewTitle.textContent = active
        ? `${reviewCount} carte${active > 1 ? 's' : ''} ser${active > 1 ? 'ont' : 'a'} défaussée${active > 1 ? 's' : ''}`
        : 'Aucune carte à défausser';
      reviewFilters.hidden = reviewItems.length < 2;
      renderReview();
      confirmButton.textContent = active ? `Défausser ${reviewCount} carte${active > 1 ? 's' : ''}` : 'Défausser';
      confirmButton.disabled = state.phase !== 'ready' || !active;
    }
    progressPanel.hidden = !processing;
    if (processing) {
      const total = Math.max(1, state.total || 0);
      progressLine.replaceChildren(makeElement('strong', '', 'Défausse en cours'),
        ` · ${numberFormat.format(state.processed || 0)} / ${numberFormat.format(state.total || 0)}`);
      progressFill.style.width = `${Math.min(100, (state.processed || 0) / total * 100)}%`;
      const names = Array.isArray(state.processingTitles) ? state.processingTitles : [];
      progressNow.textContent = names.length
        ? `En ce moment : ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` et ${numberFormat.format(names.length - 3)} autre${names.length - 3 > 1 ? 's' : ''}` : ''}`
        : 'Vérification des cartes…';
    }
    summary.replaceChildren();
    if (scanning) summary.append('Analyse de la collection…');
    else if (processing) summary.append(`Défausse en cours · ${numberFormat.format(state.processed)} / ${numberFormat.format(state.total)}`);
    else if (eligible > 0) summary.append(makeElement('strong', 'summary-count', count), ` carte${eligible > 1 ? 's' : ''} concernée${eligible > 1 ? 's' : ''}`);
    else summary.append(state.phase === 'ready' ? 'Aucune carte concernée' : 'Préparation…');
    summary.title = `Sous ${limit}, ${where}`;
    discardBlock.dataset.ready = String(eligible > 0 && state.phase === 'ready');

    bulkButton.hidden = processing;
    stopButton.hidden = !processing;
    if (processing && stopButton.parentElement !== progressPanel) progressPanel.append(stopButton);
    if (!processing || previousPhase !== 'processing') {
      stopButton.disabled = false;
      stopButton.textContent = 'Arrêter';
    }
    const progress = processing && state.total > 0
      ? `${numberFormat.format(state.processed)} / ${numberFormat.format(state.total)} cartes traitées`
      : scanning ? 'Lecture de la collection…' : '';
    const message = state.error || (processing ? '' : state.status || progress);
    const loadingStatus = !state.error && (scanning || state.retryLoading);
    statusSpinner.hidden = !loadingStatus;
    statusText.textContent = loadingStatus ? 'Chargement…' : typeof message === 'string' ? message : String(message);
    statusText.classList.toggle('sr-only', Boolean(loadingStatus));
    status.title = loadingStatus ? message || 'Chargement…' : '';
    status.hidden = !message && !loadingStatus;
    status.dataset.loading = String(Boolean(loadingStatus));
    status.dataset.error = String(Boolean(state.error));
    status.dataset.kind = !state.error && state.statusKind === 'success' ? 'success' : '';
  }

  // "Updated 3 min ago": how old the numbers on screen are, refreshed every 30 s.
  function renderSync() {
    const at = state.syncedAt;
    if (state.refreshing) syncLabel.textContent = 'Mise à jour…';
    else if (!Number.isFinite(at) || at <= 0) syncLabel.textContent = '';
    else {
      const minutes = Math.floor((Date.now() - at) / 60_000);
      syncLabel.textContent = minutes < 1 ? 'À jour' : minutes < 60 ? `Mise à jour il y a ${minutes} min`
        : `Mise à jour à ${new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    syncLabel.hidden = !syncLabel.textContent;
    syncLabel.title = at > 0 ? `Collection lue le ${new Date(at).toLocaleString('fr-FR')}` : '';
  }
  const syncTimer = setInterval(renderSync, 30_000);
  surface.signal.addEventListener('abort', () => clearInterval(syncTimer), { once: true });

  update(state);
  return { element: surface.element, update, destroy: surface.destroy };
}

export function createCardExtras({ onDiscard, onRetry, onDuplicates, onStackToggle }) {
  const surface = makeSurface('card-extras');
  const extras = makeElement('section', 'card-extras');
  extras.lang = 'fr';
  extras.setAttribute('aria-label', 'Vues et enchères');
  const metrics = makeElement('dl', 'metrics');
  function metric(label) {
    const wrapper = makeElement('div', 'metric');
    const term = makeElement('dt', 'metric-label', label);
    const value = makeElement('dd', 'metric-value', 'Indisponible');
    wrapper.append(term, value);
    metrics.append(wrapper);
    return value;
  }
  const views = metric('Vues · 30 j');
  const price = metric('Départ estimé');
  const button = makeButton('button-discard', 'Défausser');
  const copies = makeButton('button-quiet duplicate-shortcut', '');
  copies.hidden = true;
  copies.setAttribute('aria-haspopup', 'dialog');
  copies.addEventListener('click', () => {
    if (state.stack) onStackToggle?.();
    else onDuplicates?.();
  }, { signal: surface.signal });
  const status = makeElement('p', 'card-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  extras.append(metrics, copies, button, status);
  surface.root.append(extras);
  let state = {
    views: null,
    price: null,
    loading: true,
    priceLoading: false,
    priceHint: '',
    priceError: '',
    priceStatus: '',
    busy: false,
    error: '',
    disabled: false,
    protected: false,
    protectedReason: '',
  };

  button.addEventListener('click', () => {
    if (button.disabled) return;
    if (state.error) onRetry?.();
    else onDiscard?.();
  }, { signal: surface.signal });

  function renderValue(element, value, loading, unit) {
    const available = validNumber(value);
    element.replaceChildren();
    element.classList.toggle('is-unavailable', !available);
    element.classList.toggle('is-loading', Boolean(loading));
    if (loading) {
      element.setAttribute('aria-label', 'Chargement');
      element.append(makeElement('span', 'skeleton'));
      return;
    }
    element.removeAttribute('aria-label');
    element.append(document.createTextNode(available ? numberFormat.format(value) : 'Indisponible'));
    if (available && unit) {
      const suffix = makeElement('span', 'metric-unit', ` ${unit}`);
      suffix.title = 'wikibidous';
      element.append(suffix);
    }
  }

  function update(next) {
    state = { ...state, ...next };
    extras.setAttribute('aria-busy', String(Boolean(state.loading || state.priceLoading || state.busy)));
    extras.dataset.busy = String(Boolean(state.busy));
    // In a stack: the front card unfolds or folds it. Otherwise, open every copy in Doublons.
    const stack = state.stack;
    copies.classList.toggle('is-stack', Boolean(stack));
    if (stack) {
      copies.hidden = stack.index !== 0;
      copies.textContent = stack.expanded ? 'Replier la pile' : `Déplier les ${numberFormat.format(stack.count)} exemplaires`;
      copies.setAttribute('aria-expanded', String(Boolean(stack.expanded)));
      copies.title = stack.expanded ? 'Regrouper ces exemplaires' : 'Afficher chaque exemplaire, avec son propre bouton Défausser';
    } else {
      copies.hidden = !onDuplicates || !(state.copyCount > 1);
      copies.removeAttribute('aria-expanded');
      copies.textContent = `${numberFormat.format(state.copyCount || 0)} exemplaires`;
      copies.title = 'Voir toutes les variantes, de la plus rare à la plus commune';
    }
    copies.disabled = Boolean(state.busy);
    renderValue(views, state.views, state.loading);
    renderValue(price, state.price, state.loading || state.priceLoading, 'WB');
    price.parentElement.title = state.priceHint || state.priceError || '';
    if (state.priceHint) price.setAttribute('aria-description', state.priceHint);
    else price.removeAttribute('aria-description');
    if (!state.loading && !state.priceLoading && !validNumber(state.price) && (state.priceError || state.priceStatus)) {
      price.textContent = state.priceStatus || 'Prix indisponible';
      price.classList.add('is-unavailable');
    }
    // A folded stack never offers a discard: unfold it to pick the exact copy.
    button.hidden = Boolean(stack && !stack.expanded);
    button.disabled = Boolean(state.loading || state.busy || state.disabled || state.protected);
    button.classList.toggle('is-retry', Boolean(state.error));
    const unavailableReason = !state.loading && state.disabled && state.protectedReason;
    button.textContent = state.busy ? 'Défausse…' : state.protected ? state.protectedReason || 'Protégée' : state.error ? 'Réessayer' : unavailableReason || 'Défausser';
    button.title = state.protected ? state.protectedReason || 'Cette carte est protégée.' : unavailableReason || '';
    const error = typeof state.error === 'string' ? state.error : state.error ? 'Données indisponibles.' : '';
    status.textContent = error;
    status.hidden = !error;
  }

  update(state);
  return { element: surface.element, update, destroy: surface.destroy };
}
