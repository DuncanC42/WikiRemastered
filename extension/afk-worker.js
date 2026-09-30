const ALARM = 'wme:afk-packs';
const URLS = ['https://www.wiki-masters.com/*', 'https://wiki-masters.com/*'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyFor = account => `afk:${account}`;
let running;
let wakeAgain = false;
const verifiedAccounts = new Map();

async function send(tabId, message, timeoutMs = 5_000) {
  let timer;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  }
  catch { return null; }
  finally { clearTimeout(timer); }
}

async function load(account) {
  const key = keyFor(account);
  return (await chrome.storage.local.get(key))[key] || { history: [], nextCheckAt: 0, failures: 0 };
}

async function save(account, state) { await chrome.storage.local.set({ [keyFor(account)]: state }); }

function nextFull(snapshot) {
  const interval = snapshot.isPro ? 3 * 60_000 : 10 * 60_000;
  const since = Date.parse(snapshot.packsLastRegenAt);
  const due = Number.isFinite(since) ? since + (10 - snapshot.remaining) * interval : Date.now() + 60_000;
  // A regeneration timestamp is a scheduling hint, never proof of full stock.
  // Bound the delay so a stale native profile cannot postpone a fresh check for hours.
  return Math.max(Date.now() + 30_000, Math.min(Date.now() + 2 * 60_000, due));
}

function verificationState(state, snapshot = {}) {
  return { ...state, status: 'verification', message: 'Vérification requise sur Paquets.',
    attention: state.attention?.kind === 'verification' ? state.attention : {
      id: crypto.randomUUID(), kind: 'verification', since: Date.now(),
      verifiedAt: snapshot.humanVerifiedAt || null,
    } };
}

function needsVerification(state, snapshot) {
  if (snapshot.verificationRequired) return true;
  if (state.attention?.kind !== 'verification') return false;
  const verifiedAt = Date.parse(snapshot.humanVerifiedAt);
  const previous = Date.parse(state.attention.verifiedAt);
  return !Number.isFinite(verifiedAt) || (Number.isFinite(previous)
    ? verifiedAt <= previous : verifiedAt < state.attention.since);
}

function connectionRetry(state, retryAfterMs = 0) {
  const failures = Math.min((state.failures || 0) + 1, 5);
  return { ...state, failures,
    status: state.attention?.kind === 'verification' ? 'verification' : 'error',
    message: state.attention?.kind === 'verification' ? 'Vérification requise sur Paquets.' : 'Connexion à Wiki Masters en attente.',
    nextCheckAt: Date.now() + Math.max(retryAfterMs, state.attention?.kind === 'verification'
      ? 5 * 60_000 : Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1))) };
}

async function notifyOpened(account, jobId) {
  const tabs = await chrome.tabs.query({ url: URLS });
  await Promise.all(tabs.map(tab => send(tab.id, { type: 'wme:afk-opened', accountKey: account, jobId })));
}

async function finish(account, state, receipt) {
  const pending = state.pending;
  if (!pending || receipt?.jobId !== pending.jobId || receipt.accountKey !== account) return state;
  const next = { ...state, pending: null };
  if (receipt.kind === 'opened') {
    const entry = {
      id: pending.jobId, openedAt: receipt.at, cards: receipt.cards,
      packsRemaining: receipt.packsRemaining, status: 'opened',
    };
    next.history = [entry, ...(state.history || []).filter(item => item.id !== entry.id)].slice(0, 150);
    next.status = 'idle';
    next.message = '';
    next.attention = null;
    next.failures = 0;
    next.nextCheckAt = nextFull({ ...pending.snapshot, remaining: receipt.packsRemaining, packsLastRegenAt: receipt.packsLastRegenAt });
  } else if (receipt.kind === 'uncertain') {
    next.history = [{ id: pending.jobId, openedAt: pending.at, cards: [], status: 'uncertain' }, ...(state.history || [])].slice(0, 150);
    next.status = 'error';
    next.message = 'Dernière ouverture à vérifier dans la collection.';
    // No replay of an ambiguous mutation. A future full stock is re-read only
    // after a complete normal regeneration interval has elapsed.
    next.nextCheckAt = Date.now() + 11 * 60_000;
  } else {
    if (receipt.kind === 'verification') Object.assign(next, verificationState(next, pending.snapshot));
    else {
      next.status = receipt.kind === 'skipped' ? 'idle' : 'error';
      next.message = receipt.message || '';
    }
    next.failures = receipt.kind === 'skipped' ? 0 : Math.min((state.failures || 0) + 1, 5);
    next.nextCheckAt = Date.now() + Math.max(receipt.retryAfterMs || 0,
      receipt.kind === 'verification' ? 5 * 60_000 : Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, next.failures - 1)));
  }
  await save(account, next);
  await chrome.storage.local.remove(`afk:receipt:${pending.jobId}`);
  if (receipt.kind === 'opened' || receipt.kind === 'uncertain') await notifyOpened(account, pending.jobId);
  return next;
}

async function run() {
  if ((await chrome.storage.local.get('afkEnabled')).afkEnabled === false) return;
  const tabs = (await chrome.tabs.query({ url: URLS })).filter(tab => !tab.discarded);
  const reports = (await Promise.all(tabs.map(async tab => ({ tab, info: await send(tab.id, { type: 'wme:afk-probe' }) }))))
    .filter(item => item.info?.ready && UUID.test(item.info.accountKey));
  const accounts = [...new Set(reports.map(item => item.info.accountKey))];
  for (const account of accounts) {
    const peers = reports.filter(item => item.info.accountKey === account);
    let state = await load(account);
    if (state.pending) {
      const receipt = (await chrome.storage.local.get(`afk:receipt:${state.pending.jobId}`))[`afk:receipt:${state.pending.jobId}`];
      if (receipt) state = await finish(account, state, receipt);
      else if (Date.now() - state.pending.at > 2 * 60_000) {
        state = await finish(account, state, { accountKey: account, jobId: state.pending.jobId, kind: 'uncertain' });
      } else continue;
    }
    if (peers.some(item => item.info.manualOpening || (item.info.onPulls && item.info.idleMs < 30_000))) continue;
    const verifiedAt = verifiedAccounts.get(account);
    verifiedAccounts.delete(account);
    if (state.attention?.kind === 'verification' && Number.isFinite(verifiedAt)
      && verifiedAt > (Date.parse(state.attention.verifiedAt) || state.attention.since)) state.nextCheckAt = 0;
    if (Date.now() < state.nextCheckAt) continue;
    await save(account, state.attention?.kind === 'verification' ? verificationState(state) : { ...state, status: 'checking', message: '' });
    let worker;
    let snapshot;
    // A throttled or unresponsive background tab must not monopolize the job.
    for (const candidate of peers.sort((a, b) => Number(b.info.visible) - Number(a.info.visible)).slice(0, 2)) {
      worker = candidate;
      snapshot = await send(worker.tab.id, { type: 'wme:afk-snapshot', accountKey: account }, 35_000);
      if (snapshot?.nonce || snapshot?.retryAfterMs) break;
    }
    if (!snapshot || snapshot.accountKey !== account || !Number.isInteger(snapshot.remaining)
      || snapshot.remaining < 0 || snapshot.remaining > 10 || !snapshot.nonce) {
      if (snapshot?.nonce) await send(worker.tab.id, { type: 'wme:afk-release', nonce: snapshot.nonce });
      await save(account, connectionRetry(state, snapshot?.retryAfterMs || 0));
      continue;
    }
    const verification = needsVerification(state, snapshot);
    state = verification ? verificationState(state, snapshot) : { ...state, attention: null };
    state = { ...state, failures: 0, checkedAt: Date.now(), packsRemaining: snapshot.remaining,
      humanVerifiedAt: snapshot.humanVerifiedAt };
    if (snapshot.remaining < 10 || !snapshot.canOpen || verification) {
      await save(account, { ...state, status: verification ? 'verification' : 'idle',
        message: verification ? 'Vérification requise sur Paquets.' : snapshot.blocked ? 'Ouverture temporairement suspendue par le site.' : '',
        nextCheckAt: verification ? Date.now() + 5 * 60_000 : snapshot.remaining < 10 ? nextFull(snapshot) : Date.now() + 60_000 });
      await send(worker.tab.id, { type: 'wme:afk-release', nonce: snapshot.nonce });
      continue;
    }
    if ((await chrome.storage.local.get('afkEnabled')).afkEnabled === false) {
      await send(worker.tab.id, { type: 'wme:afk-release', nonce: snapshot.nonce });
      return;
    }
    const currentPeers = await Promise.all(peers.map(item => send(item.tab.id, { type: 'wme:afk-probe' })));
    if (currentPeers.some(info => info?.accountKey === account
      && (info.manualOpening || (info.onPulls && info.idleMs < 30_000)))) {
      await send(worker.tab.id, { type: 'wme:afk-release', nonce: snapshot.nonce });
      await save(account, { ...state, status: 'idle', message: '', nextCheckAt: Date.now() + 30_000 });
      continue;
    }
    const jobId = crypto.randomUUID();
    state = { ...state, status: 'opening', message: '', pending: { jobId, at: Date.now(), snapshot } };
    // Durable journal must exist before a consumable pack can be opened.
    await save(account, state);
    const result = await send(worker.tab.id, { type: 'wme:afk-open', accountKey: account, jobId, nonce: snapshot.nonce }, 35_000);
    const receiptKey = `afk:receipt:${jobId}`;
    const receipt = (await chrome.storage.local.get(receiptKey))[receiptKey];
    if (receipt) await finish(account, state, receipt);
    else if (result?.notStarted) await finish(account, state, { accountKey: account, jobId, kind: 'skipped' });
    // A closed tab or lost response leaves a journal to reconcile on the next run.
  }
}

function wake() {
  if (running) { wakeAgain = true; return running; }
  running = (async () => {
    do {
      wakeAgain = false;
      await run();
    } while (wakeAgain);
  })().catch(() => { /* Keep the journal; the next alarm reconciles it. */ }).finally(() => { running = null; });
  return running;
}

async function installAlarm() {
  if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) wake(); });
chrome.runtime.onInstalled.addListener(() => { installAlarm(); wake(); });
chrome.runtime.onStartup.addListener(() => { installAlarm(); wake(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || message?.type !== 'wme:afk-wake') return;
  const verifiedAt = Date.parse(message.verifiedAt);
  if (UUID.test(message.accountKey || '') && Number.isFinite(verifiedAt)) verifiedAccounts.set(message.accountKey, verifiedAt);
  installAlarm().then(wake).then(() => respond({ ok: true }), () => respond({ ok: false }));
  return true;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.afkEnabled?.newValue === true) wake();
});
installAlarm();
