import { normalizeBlockedWords } from './protection.js';
import { createSteppedSlider, createHelpButton } from './controls.js';
import { MARKET_DEFAULTS } from './market-policy.js';

const numberFormat = new Intl.NumberFormat('fr-FR');
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const defaults = MARKET_DEFAULTS;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label) {
  const node = element('button', `button ${className}`, label);
  node.type = 'button';
  return node;
}

function surface(kind) {
  const host = element('div');
  host.dataset.wme = kind;
  host.dataset.theme = 'dark';
  const root = host.attachShadow({ mode: 'open' });
  for (const name of ['ui.css', 'market-ui.css']) {
    const link = element('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(name);
    root.append(link);
  }
  const controller = new AbortController();
  for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup']) {
    root.addEventListener(name, event => event.stopPropagation(), { signal: controller.signal });
  }
  return {
    element: host, root, signal: controller.signal,
    destroy() { controller.abort(); host.remove(); },
  };
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const lateLabels = {
  scheduled: 'Programmée', watching: 'Surveillance active', leading: 'En tête',
  bidding: 'Mise en cours…', limit: 'Plafond atteint', ended: 'Terminée',
  won: 'Remportée', lost: 'Non remportée', cancelled: 'Annulée',
  uncertain: 'À vérifier dans Mes enchères', error: 'Arrêtée',
};
const lateStatus = plan => plan?.status === 'watching' && plan.message ? plan.message : lateLabels[plan?.status] || 'En attente';
const lateBusy = plan => plan?.status !== 'uncertain' && Boolean(plan?.pending || plan?.status === 'bidding');
const lateCap = plan => validNumber(plan?.maxBid) ? `${numberFormat.format(plan.maxBid)} WB` : 'Non défini';

/** Presentation only. The caller owns persistence and every bid.
 * update({settings, active, busy, used, status, error, entries, accountReady, latePlans}).
 * onStart(settings) and onStop() may be async; update() supplies their result.
 */
export function createMarketToolbar({ onStart, onStop, onSettingsChange, onLateStop, onLateDismiss } = {}) {
  const view = surface('market-toolbar');
  const form = element('form', 'toolbar market-toolbar');
  form.lang = 'fr';
  form.setAttribute('aria-label', 'Enchères automatiques');
  const header = element('header', 'tool-heading market-header');
  const title = element('h2', 'toolbar-title', 'Marché');
  title.append(element('span', 'title-plus', '+'));
  const titleGroup = element('div', 'tool-title-group');
  titleGroup.append(title, element('p', 'tool-subtitle', 'Misez automatiquement sur les cartes qui vous intéressent, dans les limites que vous fixez.'));
  const sessionPill = element('span', 'session-pill');
  sessionPill.setAttribute('aria-hidden', 'true');
  const headerActions = element('div', 'tool-heading-actions');
  headerActions.append(sessionPill, createHelpButton('market', view.signal));
  header.append(titleGroup, headerActions);

  // Live session: what is running, how much of the budget is engaged, and Stop.
  const session = element('section', 'session-panel');
  session.setAttribute('aria-label', 'Session en cours');
  const sessionLine = element('div', 'session-line');
  const sessionLabel = element('strong', 'session-label');
  const sessionDetail = element('span', 'session-detail');
  sessionLine.append(sessionLabel, sessionDetail);
  const meter = element('div', 'budget-meter');
  const meterTrack = element('span', 'budget-track');
  const meterFill = element('span', 'budget-fill');
  meterTrack.append(meterFill);
  meterTrack.setAttribute('aria-hidden', 'true');
  const used = element('span', 'market-budget');
  used.title = 'Total des mises de la session. Les points rendus après une surenchère ne rechargent pas ce budget.';
  meter.append(used, meterTrack);
  const sessionActions = element('div', 'session-actions');
  session.title = 'Arrêtez la session pour modifier les réglages. Les mises déjà envoyées restent valables.';
  session.append(sessionLine, meter, sessionActions);

  const action = button('button-primary market-action', 'Activer les enchères');
  action.title = 'Miser selon les mots-clés, le temps restant et les limites choisis.';
  action.type = 'submit';

  function block(heading, note, ...children) {
    const section = element('section', 'tool-block market-block');
    const head = element('div', 'block-head');
    head.append(element('h3', 'block-title', heading), element('p', 'block-note', note));
    section.append(head, ...children);
    return section;
  }

  const keywordRow = element('div', 'market-keywords');
  const keywordLabel = element('label', 'sr-only', 'Cartes recherchées');
  keywordLabel.htmlFor = 'market-keywords';
  const wordField = element('div', 'word-field');
  const chips = element('ul', 'word-chips');
  chips.setAttribute('aria-label', 'Mots-clés recherchés');
  const wordInput = element('input', 'word-input');
  wordInput.id = 'market-keywords';
  wordInput.name = 'wme-market-keywords';
  wordInput.type = 'text';
  wordInput.autocomplete = 'off';
  wordInput.placeholder = 'Ajouter un mot-clé, puis Entrée';
  wordInput.setAttribute('aria-description', 'Une carte correspondant à au moins un de ces mots peut recevoir une mise. Entrée ou virgule pour ajouter.');
  const add = button('button-add-word', 'Ajouter');
  wordField.append(chips, wordInput, add);
  keywordRow.append(keywordLabel, wordField);

  const inputs = new Map();
  const sliders = new Map();
  const settingsRow = element('div', 'market-settings');
  const timingRow = element('div', 'market-settings');
  for (const [key, labelText, unit, min, max, levels, row] of [
    ['maxBid', 'Max par carte', 'WB', 1, 100_000, [1, 10, 25, 50, 100, 500], settingsRow],
    ['budget', 'Budget total', 'WB', 1, 100_000, [10, 25, 50, 100, 250, 500], settingsRow],
    ['intervalSeconds', 'Recherche toutes les', 's', 30, 1800, [30, 60, 120, 300, 600, 1800], timingRow],
  ]) {
    const slider = createSteppedSlider({ label: labelText, unit, value: defaults[key], min, max,
      levels, signal: view.signal });
    row.append(slider.element);
    inputs.set(key, slider.input);
    sliders.set(key, slider);
  }
  const remaining = createSteppedSlider({ label: 'Temps restant max', unit: 'min', value: defaults.maxRemainingMinutes,
    min: 0, max: 1440, levels: [1, 5, 15, 30, 60, 0],
    formatValue: value => value === 0 ? 'Sans limite' : value === 60 ? '1 h' : `${value} min`, signal: view.signal });
  remaining.element.title = 'Miser seulement lorsqu’il reste au maximum cette durée. Vérifié à chaque recherche.';
  inputs.set('maxRemainingMinutes', remaining.input);
  sliders.set('maxRemainingMinutes', remaining);
  timingRow.prepend(remaining.element);

  const rebidLabel = element('label', 'market-rebid');
  const rebidSwitch = element('input', 'market-switch-input');
  rebidSwitch.type = 'checkbox';
  rebidSwitch.name = 'wme-market-rebid';
  rebidSwitch.setAttribute('role', 'switch');
  const switchTrack = element('span', 'market-switch-track');
  switchTrack.setAttribute('aria-hidden', 'true');
  const rebidNote = 'Si quelqu’un vous dépasse, remise à la recherche suivante, jusqu’au max par carte et dans le budget restant.';
  rebidLabel.title = rebidNote;
  rebidSwitch.setAttribute('aria-description', rebidNote);
  rebidLabel.append(rebidSwitch, switchTrack, element('span', 'market-rebid-title', 'Surenchérir si dépassé'));

  const whatBlock = block('Quelles cartes ?', 'Un seul mot du titre ou de la catégorie suffit. Tout le marché est parcouru.', keywordRow);
  const amountBlock = block('Combien ?', 'Chaque mise compte en entier dans le budget, même si quelqu’un vous dépasse ensuite.', settingsRow);
  const timeBlock = block('Quand ?', 'Temps restant avant la fin de l’enchère, vérifié à chaque recherche.', timingRow);
  const blocks = element('div', 'market-blocks');
  blocks.append(whatBlock, amountBlock, timeBlock);

  const footer = element('div', 'market-footer');
  const rules = element('p', 'market-rules');
  const rulesBox = element('div', 'market-rules-box');
  const lastSession = element('p', 'market-last-session');
  rulesBox.append(rules, lastSession);
  const footerActions = element('div', 'market-footer-actions');
  footerActions.append(rebidLabel, action);
  footer.append(rulesBox, footerActions);

  const status = element('p', 'toolbar-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const statusSpinner = element('span', 'loading-spinner');
  statusSpinner.setAttribute('aria-hidden', 'true');
  const statusText = element('span');
  status.append(statusSpinner, statusText);
  // Activity: one segmented control switches between scheduled auctions and recent bids.
  const lists = element('section', 'market-activity');
  lists.setAttribute('aria-label', 'Activité');
  const tabs = element('div', 'activity-tabs');
  tabs.setAttribute('role', 'tablist');
  function tab(id, label) {
    const node = button('activity-tab', '');
    node.id = `activity-tab-${id}`;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-controls', `activity-${id}`);
    const name = element('span', 'activity-tab-label', label);
    const count = element('span', 'activity-tab-count', '0');
    node.append(name, count);
    return { node, count };
  }
  const lateTab = tab('late', 'Enchères forcées');
  const historyTab = tab('history', 'Dernières mises');
  tabs.append(lateTab.node, historyTab.node);
  const latePlans = element('div', 'activity-panel');
  latePlans.id = 'activity-late';
  latePlans.setAttribute('role', 'tabpanel');
  latePlans.setAttribute('aria-labelledby', lateTab.node.id);
  const latePlansTitle = lateTab.node;
  const lateList = element('ol', 'late-plan-list');
  const lateEmpty = element('p', 'activity-empty', 'Aucune enchère forcée. Programmez-en une depuis une carte ou sa fiche.');
  latePlans.append(lateList, lateEmpty);
  const history = element('div', 'activity-panel');
  history.id = 'activity-history';
  history.setAttribute('role', 'tabpanel');
  history.setAttribute('aria-labelledby', historyTab.node.id);
  const historyList = element('ol', 'market-history-list');
  const historyEmpty = element('p', 'activity-empty', 'Aucune mise pour l’instant. Elles apparaîtront ici pendant une session.');
  history.append(historyList, historyEmpty);
  const activityHead = element('div', 'activity-head');
  const activityToggle = button('button-quiet activity-toggle', '');
  const toggleLabel = element('span', '', 'Masquer');
  const chevron = element('span', 'activity-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
  activityToggle.append(toggleLabel, chevron);
  activityToggle.setAttribute('aria-controls', 'activity-late activity-history');
  activityHead.append(tabs, activityToggle);
  lists.append(activityHead, latePlans, history);
  function watchOverflow(list) {
    const sync = () => {
      const more = list.scrollHeight - list.clientHeight - list.scrollTop > 4;
      list.dataset.more = String(more);
    };
    list.addEventListener('scroll', sync, { passive: true, signal: view.signal });
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(sync);
      observer.observe(list);
      new MutationObserver(sync).observe(list, { childList: true });
      view.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    }
    return sync;
  }
  const syncLateFade = watchOverflow(lateList);
  const syncHistoryFade = watchOverflow(historyList);
  let activityCollapsed = false;
  const collapseKey = 'wme:market:activity-collapsed';
  chrome.storage?.local?.get(collapseKey).then(values => {
    activityCollapsed = values?.[collapseKey] === true;
    renderActivity();
  }, () => {});
  activityToggle.addEventListener('click', () => {
    activityCollapsed = !activityCollapsed;
    chrome.storage?.local?.set({ [collapseKey]: activityCollapsed }).catch(() => {});
    renderActivity();
  }, { signal: view.signal });
  let activityTab = null;
  let lateCount = 0;
  let historyCount = 0;
  function renderActivity() {
    // Both tabs always show; an empty list says how it fills up.
    lateEmpty.hidden = Boolean(lateCount);
    historyEmpty.hidden = Boolean(historyCount);
    lateTab.count.textContent = numberFormat.format(lateCount);
    historyTab.count.textContent = numberFormat.format(historyCount);
    activityTab ??= lateCount || !historyCount ? 'late' : 'history';
    lists.hidden = false;
    for (const [id, item, panel] of [['late', lateTab, latePlans], ['history', historyTab, history]]) {
      const selected = activityTab === id;
      item.node.setAttribute('aria-selected', String(selected));
      item.node.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected || activityCollapsed;
    }
    lists.dataset.collapsed = String(activityCollapsed);
    requestAnimationFrame(() => { syncLateFade(); syncHistoryFade(); });
    toggleLabel.textContent = activityCollapsed ? 'Afficher' : 'Masquer';
    activityToggle.setAttribute('aria-expanded', String(!activityCollapsed));
  }
  for (const [id, item] of [['late', lateTab], ['history', historyTab]]) {
    item.node.addEventListener('click', () => {
      activityTab = id;
      if (activityCollapsed) {
        activityCollapsed = false;
        chrome.storage?.local?.set({ [collapseKey]: false }).catch(() => {});
      }
      renderActivity();
    }, { signal: view.signal });
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const visible = [lateTab.node, historyTab.node];
    const next = visible[(visible.indexOf(view.root.activeElement) + (event.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
    if (!next) return;
    event.preventDefault();
    next.click();
    next.focus();
  }, { signal: view.signal });
  form.append(header, session, blocks, footer, status, lists);
  view.root.append(form);

  let state = { settings: { ...defaults }, active: false, busy: false, used: 0, status: '', error: '', entries: [], accountReady: false, latePlans: [] };
  let pending = '';
  let localError = '';
  let wordsSignature = '';
  let historySignature = '';
  const chipNodes = new Map();
  const lateNodes = new Map();
  const locked = () => state.active || Boolean(pending);
  const settingsCopy = () => ({ ...state.settings, keywords: [...state.settings.keywords] });
  const enteredWords = () => normalizeBlockedWords([...state.settings.keywords, ...wordInput.value.split(/[,;\r\n]+/)]);
  const numbersValid = () => [...inputs.values()].every(input => input.validity.valid && Number.isSafeInteger(input.valueAsNumber));

  function renderRules() {
    const value = key => inputs.get(key)?.valueAsNumber;
    const [maxBid, budget, minutes, interval] = ['maxBid', 'budget', 'maxRemainingMinutes', 'intervalSeconds'].map(value);
    if (![maxBid, budget, minutes, interval].every(Number.isFinite)) { rules.textContent = ''; return; }
    const when = minutes === 0 ? 'quel que soit le temps restant'
      : `quand il reste ${minutes === 60 ? '1 h' : `${numberFormat.format(minutes)} min`} ou moins`;
    const every = interval % 60 === 0 ? `${numberFormat.format(interval / 60)} min` : `${numberFormat.format(interval)} s`;
    rules.replaceChildren('Jusqu’à ', element('strong', '', `${numberFormat.format(maxBid)} WB`), ' par carte et ',
      element('strong', '', `${numberFormat.format(budget)} WB`), ` au total, ${when}. Recherche toutes les ${every}.`);
  }

  function renderAction() {
    renderRules();
    const stopping = pending === 'stop';
    action.type = state.active ? 'button' : 'submit';
    action.classList.toggle('button-primary', !state.active);
    action.classList.toggle('button-stop', state.active);
    action.textContent = stopping ? 'Arrêt…' : state.active ? 'Arrêter les enchères' : pending ? 'Activation…' : 'Activer les enchères';
    action.disabled = Boolean(pending) || (!state.active && (!state.accountReady || !enteredWords().length || !numbersValid()));
    add.disabled = locked() || !wordInput.value.trim();
  }

  function renderWords() {
    const words = state.settings.keywords;
    const signature = JSON.stringify(words);
    if (wordsSignature !== signature) {
      const focusedWord = [...chipNodes].find(([, item]) => item.remove === view.root.activeElement)?.[0];
      for (const [word, item] of chipNodes) {
        if (words.includes(word)) continue;
        item.node.remove();
        chipNodes.delete(word);
      }
      words.forEach((word, index) => {
        if (!chipNodes.has(word)) {
          const node = element('li', 'word-chip');
          const remove = button('word-remove', '×');
          remove.setAttribute('aria-label', `Retirer « ${word} »`);
          remove.title = `Retirer « ${word} »`;
          remove.addEventListener('click', () => {
            if (locked()) return;
            state.settings.keywords = state.settings.keywords.filter(entry => entry !== word);
            renderWords();
            renderAction();
            onSettingsChange?.(settingsCopy());
          }, { signal: view.signal });
          node.append(element('span', 'word-chip-label', word), remove);
          chipNodes.set(word, { node, remove });
        }
        const item = chipNodes.get(word);
        if (chips.children[index] !== item.node) chips.insertBefore(item.node, chips.children[index] || null);
      });
      if (focusedWord && !chipNodes.has(focusedWord)) wordInput.focus();
      wordsSignature = signature;
    }
    chips.hidden = !words.length;
    for (const item of chipNodes.values()) item.remove.disabled = locked();
    wordInput.disabled = locked();
  }

  function commitWords() {
    if (locked() || !wordInput.value.trim()) return;
    state.settings.keywords = enteredWords();
    wordInput.value = '';
    localError = '';
    renderWords();
    renderAction();
    onSettingsChange?.(settingsCopy());
  }

  function commitNumbers() {
    if (locked() || !numbersValid()) return false;
    for (const [key, input] of inputs) state.settings[key] = input.valueAsNumber;
    onSettingsChange?.(settingsCopy());
    return true;
  }

  function renderHistory() {
    const entries = Array.isArray(state.entries) ? state.entries.slice(0, 30) : [];
    const signature = JSON.stringify(entries);
    historyCount = entries.length;
    renderActivity();
    if (signature === historySignature) return;
    historySignature = signature;
    historyList.replaceChildren();
    const statusLabels = { success: 'Mise placée', placed: 'Mise placée', accepted: 'Mise placée', pending: 'En cours', unknown: 'À vérifier', failed: 'Échec', skipped: 'Ignorée' };
    for (const entry of entries) {
      const row = element('li', 'market-history-row');
      const linkable = typeof entry.id === 'string' && /^[0-9a-f-]{36}$/i.test(entry.id);
      const title = element(linkable ? 'a' : 'span', `market-history-name${linkable ? ' row-link' : ''}`, entry.title || 'Carte');
      if (linkable) title.href = `/marketplace/${entry.id}`;
      title.title = linkable ? `Voir l’enchère : ${entry.title || 'Carte'}` : entry.title || 'Carte';
      const amount = element('span', 'market-history-amount', validNumber(entry.amount) ? `${numberFormat.format(entry.amount)} WB` : '-');
      const detail = element('span', 'market-history-detail');
      const date = new Date(entry.at);
      const time = Number.isFinite(date.getTime()) ? timeFormat.format(date) : '';
      const result = statusLabels[entry.status] || (typeof entry.status === 'string' ? entry.status : '');
      detail.textContent = [result, time].filter(Boolean).join(' · ');
      detail.dataset.kind = typeof entry.status === 'string' ? entry.status : '';
      row.append(title, amount, detail);
      historyList.append(row);
    }
  }

  function renderLatePlans() {
    const priority = plan => plan.status === 'uncertain' ? 0 : plan.active ? 1 : 2;
    const plans = Array.isArray(state.latePlans) ? state.latePlans.filter(plan => plan && typeof plan.id === 'string')
      .sort((a, b) => priority(a) - priority(b) || (a.active ? a.endAt - b.endAt : (b.updatedAt || 0) - (a.updatedAt || 0))) : [];
    const ids = new Set(plans.map(plan => plan.id));
    lateCount = plans.length;
    renderActivity();
    for (const [id, item] of lateNodes) {
      if (ids.has(id)) continue;
      if (item.row.contains(view.root.activeElement)) latePlansTitle.focus();
      item.row.remove();
      lateNodes.delete(id);
    }
    plans.forEach((plan, index) => {
      let item = lateNodes.get(plan.id);
      if (!item) {
        const row = element('li', 'late-list-row');
        // The whole row opens the auction; its buttons stay clickable on top.
        const title = element('a', 'late-list-name row-link');
        title.href = `/marketplace/${plan.id}`;
        const cap = element('span', 'late-list-cap');
        const status = element('span', 'late-list-status');
        const capBox = element('span', 'late-list-capbox');
        capBox.append(cap, element('span', 'late-list-caplabel', 'plafond'));
        const stop = button('button-quiet late-list-stop', 'Arrêter');
        const dismiss = button('button-quiet late-list-dismiss', 'Retirer');
        const actions = element('span', 'late-list-actions');
        actions.append(dismiss, stop);
        const error = element('p', 'late-local-error');
        error.setAttribute('role', 'status');
        error.hidden = true;
        row.append(title, status, capBox, actions, error);
        item = { row, title, cap, status, stop, dismiss, error, plan, stopping: false, dismissing: false, localError: '' };
        lateNodes.set(plan.id, item);
        dismiss.addEventListener('click', async () => {
          if (item.dismissing || !onLateDismiss || item.plan.active || lateBusy(item.plan)) return;
          item.dismissing = true;
          item.localError = '';
          renderLatePlans();
          try { await onLateDismiss(item.plan.id); }
          catch (error) { item.localError = error?.message || 'Impossible de retirer cette enchère.'; }
          finally {
            item.dismissing = false;
            if (!view.signal.aborted) renderLatePlans();
          }
        }, { signal: view.signal });
        stop.addEventListener('click', async () => {
          if (item.stopping || !onLateStop || item.plan.status === 'uncertain' || !(item.plan.active || lateBusy(item.plan))) return;
          item.stopping = true;
          item.localError = '';
          renderLatePlans();
          try { await onLateStop(item.plan.id); }
          catch (error) { item.localError = error?.message || 'Impossible d’arrêter cette enchère.'; }
          finally {
            item.stopping = false;
            if (!view.signal.aborted) renderLatePlans();
          }
        }, { signal: view.signal });
      }
      if (item.plan.runId !== plan.runId) item.localError = '';
      item.plan = plan;
      item.title.textContent = plan.title || 'Carte';
      item.title.title = `Voir l’enchère : ${plan.title || 'Carte'}`;
      item.cap.textContent = lateCap(plan);
      item.cap.setAttribute('aria-label', `Plafond par enchère : ${lateCap(plan)}`);
      item.cap.title = 'Plafond / enchère';
      item.status.textContent = item.stopping ? 'Arrêt…' : lateStatus(plan);
      item.status.dataset.kind = plan.status || '';
      item.status.title = typeof plan.message === 'string' ? plan.message : '';
      const showStop = plan.status !== 'uncertain' && Boolean(plan.active || lateBusy(plan));
      if (!showStop && view.root.activeElement === item.stop) item.title.focus({ preventScroll: true });
      item.stop.hidden = !showStop;
      item.stop.disabled = item.stopping || !onLateStop;
      item.stop.setAttribute('aria-label', `Arrêter l’enchère forcée pour ${plan.title || 'cette carte'}`);
      // Finished plans can leave the list. An uncertain one needs an explicit
      // "I checked it" after a look at the auction, since it blocks a new plan.
      const uncertainPlan = plan.status === 'uncertain';
      const finished = !plan.active && !lateBusy(plan);
      item.dismiss.hidden = !finished || !onLateDismiss;
      item.dismiss.disabled = item.dismissing;
      item.dismiss.textContent = item.dismissing ? 'Retrait…' : uncertainPlan ? 'J’ai vérifié' : 'Retirer';
      item.dismiss.title = uncertainPlan ? 'Retirer après avoir vérifié le résultat dans Mes enchères' : 'Retirer de la liste';
      item.dismiss.setAttribute('aria-label', `${item.dismiss.textContent} : ${plan.title || 'cette carte'}`);
      item.row.dataset.kind = plan.status || '';
      item.error.textContent = item.localError;
      item.error.hidden = !item.localError;
      if (lateList.children[index] !== item.row) lateList.insertBefore(item.row, lateList.children[index] || null);
    });
  }

  function render() {
    form.dataset.active = String(state.active);
    form.setAttribute('aria-busy', String(state.busy || Boolean(pending)));
    for (const [key, slider] of sliders) {
      slider.setDisabled(locked());
      slider.setValue(state.settings[key]);
    }
    rebidSwitch.checked = state.settings.allowRebids === true;
    rebidSwitch.disabled = locked();
    renderWords();
    renderAction();
    const usedValue = validNumber(state.used) ? state.used : 0;
    const budget = state.settings.budget;
    form.dataset.session = state.active ? 'active' : 'idle';
    session.hidden = !state.active && pending !== 'stop';
    sessionPill.textContent = pending === 'start' ? 'Activation…' : pending === 'stop' ? 'Arrêt…' : state.active ? 'Active' : 'Inactive';
    sessionPill.dataset.on = String(state.active);
    sessionLabel.textContent = state.active ? 'Enchères actives' : 'Session terminée';
    sessionDetail.textContent = state.active && !state.error ? state.status || '' : '';
    used.textContent = `${numberFormat.format(usedValue)} / ${numberFormat.format(budget)} WB engagés`;
    used.setAttribute('aria-label', `${numberFormat.format(usedValue)} wikibidous engagés sur ${numberFormat.format(budget)} pour cette session`);
    meterFill.style.width = `${budget > 0 ? Math.min(100, usedValue / budget * 100) : 0}%`;
    meter.dataset.full = String(budget > 0 && usedValue >= budget);
    lastSession.hidden = state.active || !usedValue;
    lastSession.textContent = `Dernière session : ${numberFormat.format(usedValue)} / ${numberFormat.format(budget)} WB engagés.`;
    // The main action lives with the session while it runs, under the settings otherwise.
    const home = state.active || pending === 'stop' ? sessionActions : footerActions;
    if (action.parentElement !== home) home.append(action);
    // A running session reports its progress in the session panel, not twice.
    const message = localError || state.error || (state.active ? '' : state.status) || (!state.accountReady ? 'Connexion au compte…' : '');
    const loadingStatus = !localError && !state.error && (!state.accountReady || state.busy
      || (state.active && /reprise automatique/i.test(state.status || '')));
    statusSpinner.hidden = !loadingStatus;
    statusText.textContent = loadingStatus ? 'Chargement…' : message;
    statusText.classList.toggle('sr-only', loadingStatus);
    status.title = loadingStatus ? message || 'Chargement…' : '';
    status.hidden = !message && !loadingStatus;
    status.dataset.loading = String(Boolean(loadingStatus));
    status.dataset.error = String(Boolean(localError || state.error));
    renderLatePlans();
    renderHistory();
  }

  async function start(event) {
    event.preventDefault();
    if (locked() || !state.accountReady) return;
    commitWords();
    if (!enteredWords().length || !form.reportValidity() || !commitNumbers()) return;
    pending = 'start';
    localError = '';
    render();
    try { await onStart?.(settingsCopy()); }
    catch (error) { localError = error?.message || 'Impossible de démarrer la session.'; }
    finally {
      pending = '';
      if (!view.signal.aborted) render();
    }
  }

  async function stop() {
    if (!state.active || pending) return;
    pending = 'stop';
    localError = '';
    render();
    try { await onStop?.(); }
    catch (error) { localError = error?.message || 'Impossible d’arrêter la session.'; }
    finally {
      pending = '';
      if (!view.signal.aborted) render();
    }
  }

  form.addEventListener('submit', start, { signal: view.signal });
  action.addEventListener('click', () => { if (state.active) void stop(); }, { signal: view.signal });
  add.addEventListener('click', () => { commitWords(); wordInput.focus(); }, { signal: view.signal });
  wordInput.addEventListener('input', renderAction, { signal: view.signal });
  wordInput.addEventListener('keydown', event => {
    if (event.isComposing || !['Enter', ',', ';'].includes(event.key)) return;
    event.preventDefault();
    commitWords();
  }, { signal: view.signal });
  wordInput.addEventListener('paste', event => {
    const pasted = event.clipboardData?.getData('text') || '';
    if (locked() || !/[,;\r\n]/.test(pasted)) return;
    event.preventDefault();
    const start = wordInput.selectionStart ?? wordInput.value.length;
    const end = wordInput.selectionEnd ?? start;
    wordInput.value = `${wordInput.value.slice(0, start)}${pasted}${wordInput.value.slice(end)}`;
    commitWords();
  }, { signal: view.signal });
  wordInput.addEventListener('blur', event => {
    if (!event.relatedTarget?.closest?.('.word-remove')) commitWords();
  }, { signal: view.signal });
  for (const input of inputs.values()) {
    input.addEventListener('input', renderAction, { signal: view.signal });
    input.addEventListener('change', () => {
      input.setAttribute('aria-invalid', String(!input.validity.valid || !Number.isSafeInteger(input.valueAsNumber)));
      commitNumbers();
      renderAction();
    }, { signal: view.signal });
  }
  rebidSwitch.addEventListener('change', () => {
    if (locked()) return;
    state.settings.allowRebids = rebidSwitch.checked;
    onSettingsChange?.(settingsCopy());
  }, { signal: view.signal });

  function update(next = {}) {
    state = {
      ...state, ...next,
      settings: { ...state.settings, ...next.settings },
    };
    state.settings.keywords = normalizeBlockedWords(state.settings.keywords);
    if (next.active || next.error || next.status) localError = '';
    render();
  }

  render();
  return { element: view.element, update, destroy: view.destroy };
}

/** Shared form logic for card extras and the native auction detail. */
function makeLateBidControls(view, { onLateSet, onLateStop, onLateDismiss, detail = false } = {}) {
  const late = element('section', `late-auction${detail ? ' late-auction-detail' : ''}`);
  late.lang = 'fr';
  late.setAttribute('aria-label', 'Enchère forcée');
  const help = createHelpButton('late', view.signal);
  if (detail) {
    const heading = element('div', 'tool-heading late-detail-header');
    heading.append(element('h3', 'late-detail-heading', 'Enchère forcée'), help);
    late.append(heading);
  }
  const lateSummary = element('p', 'late-plan-summary');
  const planState = element('span', 'late-plan-state');
  const planCap = element('span', 'late-plan-cap');
  planCap.title = 'Plafond de l’enchère forcée';
  lateSummary.append(planState, planCap);
  const lateActions = element('div', 'late-actions');
  const lateTrigger = button('button-quiet late-trigger', 'Enchère forcée');
  lateTrigger.setAttribute('aria-expanded', 'false');
  lateTrigger.setAttribute('aria-controls', 'late-bid-form');
  const lateStop = button('button-quiet late-stop', 'Arrêter');
  lateStop.setAttribute('aria-label', 'Arrêter l’enchère forcée');
  const lateDismiss = button('button-quiet late-dismiss', 'J’ai vérifié');
  lateDismiss.title = 'Retirer après avoir vérifié le résultat dans Mes enchères';
  lateActions.append(lateTrigger, lateStop, lateDismiss);
  const lateForm = element('form', 'late-form');
  lateForm.id = 'late-bid-form';
  lateForm.hidden = true;
  const cap = createSteppedSlider({ label: 'Plafond', unit: 'WB', value: 50,
    min: 1, max: 100_000, levels: [1, 10, 25, 50, 100, 500], signal: view.signal });
  const capInput = cap.input;
  capInput.setAttribute('aria-describedby', 'late-timing');
  const timing = element('p', 'late-hint', 'Mise dans la dernière minute, jusqu’à votre plafond.');
  timing.id = 'late-timing';
  const formActions = element('div', 'late-form-actions');
  const program = button('button-primary', 'Programmer');
  program.type = 'submit';
  const cancel = button('button-quiet', 'Annuler');
  formActions.append(program, cancel);
  lateForm.append(cap.element, timing, formActions);
  if (!detail) lateForm.append(help);
  const lateError = element('p', 'late-local-error');
  lateError.setAttribute('role', 'status');
  lateError.setAttribute('aria-live', 'polite');
  lateError.hidden = true;
  late.append(lateSummary, lateActions, lateForm, lateError);
  let state = { latePlan: null, lateAvailable: false };
  let editing = Boolean(detail);
  let draftDirty = false;
  let saving = false;
  let stopping = false;
  let dismissing = false;
  let localError = '';

  const capValid = () => capInput.validity.valid && Number.isSafeInteger(capInput.valueAsNumber);
  const mayEdit = () => state.lateAvailable === true && Boolean(onLateSet)
    && state.latePlan?.status !== 'uncertain' && !lateBusy(state.latePlan) && !saving && !stopping;

  function renderLate() {
    const plan = state.latePlan;
    const uncertain = plan?.status === 'uncertain';
    late.hidden = !plan && !state.lateAvailable && !localError && !saving;
    if (uncertain) editing = false;
    lateSummary.hidden = !plan;
    planState.textContent = stopping ? 'Arrêt…' : lateStatus(plan);
    planState.dataset.kind = plan?.status || '';
    planState.title = typeof plan?.message === 'string' ? plan.message : '';
    planCap.textContent = plan ? `${lateCap(plan)} max` : '';
    lateTrigger.hidden = editing || uncertain || (Boolean(plan) && !state.lateAvailable);
    lateTrigger.disabled = !mayEdit();
    lateTrigger.textContent = plan ? (detail ? 'Modifier le plafond' : 'Modifier') : detail ? 'Programmer' : 'Enchère forcée';
    lateTrigger.title = plan ? 'Modifier le plafond de l’enchère forcée' : 'Miser automatiquement dans la dernière minute';
    lateTrigger.setAttribute('aria-expanded', String(editing));
    lateStop.hidden = uncertain || !(plan?.active || lateBusy(plan));
    lateStop.disabled = stopping || !onLateStop;
    lateStop.textContent = stopping ? 'Arrêt…' : 'Arrêter';
    lateDismiss.hidden = !uncertain || !onLateDismiss;
    lateDismiss.disabled = dismissing;
    lateDismiss.textContent = dismissing ? 'Retrait…' : 'J’ai vérifié';
    lateActions.hidden = lateTrigger.hidden && lateStop.hidden && lateDismiss.hidden;
    lateForm.hidden = !editing;
    lateForm.setAttribute('aria-busy', String(saving));
    cap.setDisabled(!mayEdit());
    program.disabled = !mayEdit() || !capValid();
    program.textContent = saving ? 'Enregistrement…' : plan?.active ? 'Enregistrer' : 'Programmer';
    cancel.hidden = detail && !plan;
    cancel.disabled = saving;
    lateError.textContent = localError;
    lateError.hidden = !localError;
  }

  lateTrigger.addEventListener('click', () => {
    if (!mayEdit()) return;
    cap.setValue(state.latePlan?.maxBid ?? 50);
    draftDirty = false;
    capInput.removeAttribute('aria-invalid');
    localError = '';
    editing = true;
    renderLate();
    capInput.focus({ preventScroll: true });
    capInput.select();
  }, { signal: view.signal });
  capInput.addEventListener('input', () => {
    draftDirty = true;
    capInput.removeAttribute('aria-invalid');
    renderLate();
  }, { signal: view.signal });
  capInput.addEventListener('change', () => {
    capInput.setAttribute('aria-invalid', String(!capValid()));
  }, { signal: view.signal });
  cancel.addEventListener('click', () => {
    if (saving) return;
    editing = false;
    draftDirty = false;
    localError = '';
    renderLate();
    if (!lateTrigger.hidden) lateTrigger.focus({ preventScroll: true });
  }, { signal: view.signal });
  lateForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!mayEdit() || !lateForm.reportValidity() || !capValid()) return;
    const maxBid = capInput.valueAsNumber;
    saving = true;
    localError = '';
    renderLate();
    try {
      await onLateSet(maxBid);
      editing = false;
    } catch (error) { localError = error?.message || 'Impossible de programmer cette enchère.'; }
    finally {
      saving = false;
      if (!view.signal.aborted) renderLate();
    }
  }, { signal: view.signal });
  lateDismiss.addEventListener('click', async () => {
    if (dismissing || !onLateDismiss || state.latePlan?.status !== 'uncertain') return;
    dismissing = true;
    localError = '';
    renderLate();
    try { await onLateDismiss(); }
    catch (error) { localError = error?.message || 'Impossible de retirer cette enchère.'; }
    finally {
      dismissing = false;
      if (!view.signal.aborted) renderLate();
    }
  }, { signal: view.signal });
  lateStop.addEventListener('click', async () => {
    if (stopping || !onLateStop || state.latePlan?.status === 'uncertain' || !(state.latePlan?.active || lateBusy(state.latePlan))) return;
    stopping = true;
    localError = '';
    renderLate();
    try { await onLateStop(); }
    catch (error) { localError = error?.message || 'Impossible d’arrêter cette enchère.'; }
    finally {
      stopping = false;
      if (!view.signal.aborted) renderLate();
    }
  }, { signal: view.signal });

  function update(next = {}) {
    const previousRun = state.latePlan?.runId;
    const previousCap = state.latePlan?.maxBid;
    state = { ...state, ...next };
    if (previousRun !== state.latePlan?.runId && !saving && !stopping) localError = '';
    // The initially expanded detail form receives the saved cap once. Native
    // polling never replaces a draft already touched by the user.
    if (detail && editing && !draftDirty && !saving && previousCap !== state.latePlan?.maxBid) {
      cap.setValue(state.latePlan?.maxBid ?? 50);
    }
    renderLate();
  }

  update();
  return { element: late, update };
}

/** Standalone controls, with no repeated views or price metrics.
 * detail opens the first form directly beneath the native bid block.
 */
export function createLateBidControls({ onLateSet, onLateStop, onLateDismiss, detail = false } = {}) {
  const view = surface('late-bid-controls');
  const controls = makeLateBidControls(view, { onLateSet, onLateStop, onLateDismiss, detail });
  view.root.append(controls.element);
  function update(next = {}) {
    if (Object.hasOwn(next, 'theme')) view.element.dataset.theme = next.theme === 'light' ? 'light' : 'dark';
    controls.update(next);
  }
  return { element: view.element, update, destroy: view.destroy };
}

/** Flat metrics and one optional auction plan. The caller owns all mutations.
 * price is the prices.js snapshot; latePlan and lateAvailable are authoritative.
 * onLateSet(maxBid) / onLateStop() may be async; update() supplies the result.
 */
export function createMarketExtras({ onLateSet, onLateStop, onLateDismiss } = {}) {
  const view = surface('market-extras');
  const extras = element('section', 'card-extras market-extras');
  extras.lang = 'fr';
  extras.setAttribute('aria-label', 'Vues et prix conseillé');
  const metrics = element('dl', 'metrics');
  function metric(label) {
    const row = element('div', 'metric');
    const value = element('dd', 'metric-value');
    row.append(element('dt', 'metric-label', label), value);
    metrics.append(row);
    return value;
  }
  const views = metric('Vues · 30 j');
  const price = metric('Prix conseillé');
  const late = makeLateBidControls(view, { onLateSet, onLateStop, onLateDismiss });
  extras.append(metrics, late.element);
  view.root.append(extras);
  let state = { views: null, price: null, theme: 'dark', metrics: false };
  let signature = '';

  function renderValue(node, value, loading, unit = '') {
    node.replaceChildren();
    node.classList.toggle('is-unavailable', !validNumber(value));
    node.classList.toggle('is-loading', loading);
    if (loading) {
      node.setAttribute('aria-label', 'Chargement');
      node.append(element('span', 'skeleton'));
      return;
    }
    node.removeAttribute('aria-label');
    node.append(document.createTextNode(validNumber(value) ? numberFormat.format(value) : 'Indisponible'));
    if (validNumber(value) && unit) node.append(element('span', 'metric-unit', ` ${unit}`));
  }

  function update(next = {}) {
    state = { ...state, ...next };
    view.element.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
    late.update(next);
    // Views and suggested price are opt-in (switch next to the native sort).
    metrics.hidden = !state.metrics;
    extras.hidden = !state.metrics && late.element.hidden;
    view.element.toggleAttribute('data-wme-empty', extras.hidden);
    extras.setAttribute('aria-label', state.metrics ? 'Vues et prix conseillé' : 'Enchère forcée');
    if (!state.metrics) return;
    const snapshot = state.price;
    const value = snapshot?.value;
    const loading = !validNumber(value?.price) && (!snapshot || ['idle', 'loading', 'paused'].includes(snapshot.status))
      && !['OFFLINE', 'AUTH_REQUIRED', 'PRICE_ACCESS_REQUIRED'].includes(snapshot?.errorCode);
    const nextSignature = JSON.stringify([state.views, value, loading, snapshot?.status, snapshot?.error, snapshot?.errorCode, snapshot?.stale]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    extras.setAttribute('aria-busy', String(loading));
    renderValue(views, state.views, false);
    renderValue(price, value?.price, loading, 'WB');
    const source = value?.source === 'average'
      ? 'Moyenne des ventes pour cette rareté, arrondie.'
      : value?.source === 'default' ? 'Aucune vente comparable. Valeur initiale du site : 10 wikibidous.' : '';
    const hint = [source, snapshot?.stale ? 'Dernier prix connu, actualisation automatique en attente.' : '', snapshot?.error].filter(Boolean).join(' ');
    price.parentElement.title = hint;
    if (hint) price.setAttribute('aria-description', hint);
    else price.removeAttribute('aria-description');
    if (!loading && !validNumber(value?.price)) {
      price.textContent = snapshot?.errorCode === 'OFFLINE' ? 'Hors ligne'
        : snapshot?.errorCode === 'AUTH_REQUIRED' ? 'Connexion requise'
          : snapshot?.errorCode === 'PRICE_ACCESS_REQUIRED' ? 'Accès réservé' : 'Indisponible';
    }
  }

  update();
  return { element: view.element, update, destroy: view.destroy };
}
