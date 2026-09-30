import './afk-worker.js';
import './market-worker.js';
import './late-bid-worker.js';

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({
    url: ['https://www.wiki-masters.com/collection*', 'https://wiki-masters.com/collection*'],
    currentWindow: true,
  });
  if (tabs.length) await chrome.tabs.update(tabs[0].id, { active: true });
  else await chrome.tabs.create({ url: 'https://www.wiki-masters.com/collection' });
});
