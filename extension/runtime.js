// After the extension is reloaded or updated, scripts already running in open
// tabs are orphaned: every chrome.* call then throws "Extension context
// invalidated". Modules check extensionAlive() before touching chrome.* from
// observers, timers and listeners; the first failed check stops them all once
// and asks the page to be reloaded.
let alive = true;
const teardowns = new Set();

export function extensionAlive() {
  if (!alive) return false;
  try { if (chrome.runtime?.id) return true; } catch { /* Invalidated. */ }
  alive = false;
  for (const teardown of teardowns) {
    try { teardown(); } catch { /* Keep stopping the others. */ }
  }
  teardowns.clear();
  document.dispatchEvent(new Event('wme:reload-required'));
  return false;
}

export function onInvalidated(teardown) {
  if (alive) teardowns.add(teardown);
  else try { teardown(); } catch { /* Already stopped. */ }
}

export const invalidatedError = error => /context invalidated/i.test(error?.message || '');
