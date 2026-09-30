import './market-worker.js';
import './late-bid-worker.js';

// The AFK openings were removed in 1.32.0: on update, their alarm and their stored state go too
// (the switch, each account's history, the opening receipts and the verification notices).
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clear('wme:afk-packs');
  const stored = await chrome.storage.local.get(null);
  const leftovers = Object.keys(stored).filter(key => key === 'afkEnabled' || key.startsWith('afk:'));
  if (leftovers.length) await chrome.storage.local.remove(leftovers);
});

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({
    url: ['https://www.wiki-masters.com/collection*', 'https://wiki-masters.com/collection*'],
    currentWindow: true,
  });
  if (tabs.length) await chrome.tabs.update(tabs[0].id, { active: true });
  else await chrome.tabs.create({ url: 'https://www.wiki-masters.com/collection' });
});
