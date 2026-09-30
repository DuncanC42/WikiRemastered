/* Presentation adapter for Wiki Masters' native components.
 * Presentation attributes and accessible pagination labels only: no handlers,
 * values, React state, requests or native children are replaced.
 */
(() => {
  const ART = '.glow-c,.glow-pc,.glow-r,.glow-sr,.glow-ur,.glow-l,.glow-shiny,.shiny-card';
  const EXCLUDED = '[data-wme],[data-wme-card-art],.wr-body,.recharts-wrapper,.recharts-surface,canvas';
  const SURFACE = /(?:bg-\[var\(--color-(?:surface(?:-light)?|background)\)\]|bg-(?:zinc|neutral|gray|slate)-(?:800|900|950))(?:\/\d+)?$/;
  const INFO = '(?:blue|sky|cyan|indigo)';
  const infoText = new RegExp(`^text-${INFO}-\\d{2,3}(?:/\\d+)?$`);
  const infoBg = new RegExp(`^bg-${INFO}-\\d{2,3}(?:/\\d+)?$`);
  const infoBorder = new RegExp(`^border-${INFO}-\\d{2,3}(?:/\\d+)?$`);
  const ownedControlAttributes = ['data-wme-control', 'data-wme-selected', 'data-wme-switch', 'data-wme-rarity-choice', 'data-wme-color-label', 'data-wme-positioned', 'data-wme-icon'];
  let scheduled;

  function mark(element, name, value = '') {
    if (value === null || value === false) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value));
  }

  const tokens = element => [...element.classList].filter(token => !token.includes(':'));
  const excluded = element => Boolean(element.closest(EXCLUDED));
  const hasSurface = element => tokens(element).some(token => SURFACE.test(token));
  const hasPadding = element => tokens(element).some(token => /^p(?:x|y)?-/.test(token));
  const hasRounded = element => tokens(element).some(token => /^rounded(?:-|$)/.test(token));
  const compactText = element => (element.textContent || '').trim();

  function artRoot(element) {
    return element.matches(ART) || (element.matches('button')
      && (element.matches('.flex-col.items-center') && element.querySelector('img')
        || [...element.querySelectorAll('img')].some(image => /card_pack(?:\.|%2E|_)/i.test(image.getAttribute('src') || ''))));
  }

  function isSelected(element) {
    for (const attr of ['aria-selected', 'aria-pressed', 'aria-checked']) {
      if (element.hasAttribute(attr)) return element.getAttribute(attr) === 'true';
    }
    if (['active', 'checked', 'on'].includes(element.getAttribute('data-state'))) return true;
    const classes = tokens(element);
    return classes.some(token => /^bg-\[var\(--color-accent\)\](?:\/(?:10|15|20))?$/.test(token))
      || classes.some(token => /^border-\[var\(--color-accent\)\]$/.test(token));
  }

  function switchState(element) {
    if (element.getAttribute('role') === 'switch') return element.getAttribute('aria-checked') === 'true';
    const thumb = element.querySelector(':scope > span.w-5.h-5');
    return Boolean(thumb?.classList.contains('translate-x-5'));
  }

  function classifyControl(element) {
    for (const attr of ownedControlAttributes) mark(element, attr, null);
    if (excluded(element) || element.hasAttribute('data-wme-nav-item')) return;
    const classes = tokens(element);
    const role = element.getAttribute('role');
    const positioned = classes.some(token => /^(?:absolute|fixed)$/.test(token) || token.includes('translate-')) || element.style.transform;
    mark(element, 'data-wme-positioned', positioned ? '' : null);
    const isSwitch = role === 'switch' || (element.matches('button.relative.w-11.h-6.rounded-full')
      && element.querySelector(':scope > span.w-5.h-5'));
    if (isSwitch) {
      mark(element, 'data-wme-switch');
      mark(element, 'data-wme-selected', switchState(element));
      return;
    }
    if (element.querySelector(ART) || artRoot(element)) return;
    if (element.matches('button') && /^(C|PC|R|SR|UR|L)$/.test(compactText(element)) && element.style.color) {
      mark(element, 'data-wme-rarity-choice');
      return;
    }
    if (element.style.color && (element.style.backgroundColor || classes.includes('rounded-full') || role === 'option')) {
      mark(element, 'data-wme-color-label');
      return;
    }
    // Links representing people, auctions or conversations keep their row layout.
    if (element.matches('a') && (element.classList.contains('card-frame') || element.querySelector('h2,h3,img'))) return;
    if (element.matches('a') && !(hasRounded(element) && hasPadding(element))) return;
    const danger = classes.some(token => /^(?:bg|text|border)-(?:red|rose)-(?:[3-9]00|950)(?:\/\d+)?$/.test(token));
    const primary = classes.some(token => token === 'bg-[var(--color-accent)]'
      || /^bg-(?:emerald|green|teal|blue|sky|cyan|indigo)-(?:[4-7]00)$/.test(token));
    const choice = role === 'tab' || role === 'radio' || element.hasAttribute('aria-pressed')
      || Boolean(element.parentElement?.hasAttribute('data-wme-tabs'));
    const icon = !compactText(element) && Boolean(element.querySelector('svg,.animate-spin,[role="progressbar"]'));
    mark(element, 'data-wme-icon', icon ? '' : null);
    const row = role?.startsWith('menuitem') || role === 'option'
      || (element.classList.contains('w-full') && element.classList.contains('text-left') && !element.hasAttribute('aria-haspopup'));
    const quiet = row || (!hasSurface(element) && !classes.some(token => /^border(?:-|$)/.test(token)) && !primary);
    mark(element, 'data-wme-control', danger ? 'danger' : choice ? 'choice' : primary ? 'primary' : icon ? 'icon' : quiet ? 'quiet' : 'secondary');
    if (choice) mark(element, 'data-wme-selected', String(isSelected(element)));
  }

  function classifySurface(element) {
    if (excluded(element)) return;
    // Several native dialogs put role=dialog on the full-screen dismiss layer.
    // Its actual panel is qualified separately below; the layer stays transparent.
    if (element.matches('.fixed.inset-0')) {
      mark(element, 'data-wme-surface', null);
      mark(element, 'data-wme-panel', null);
      return;
    }
    const classes = tokens(element);
    const role = element.getAttribute('role');
    let kind = null;
    if (role === 'dialog' || element.getAttribute('aria-modal') === 'true' || element.tagName === 'DIALOG') kind = 'dialog';
    else if (['menu', 'listbox'].includes(role)) kind = 'menu';
    else if (role === 'tooltip') kind = 'tooltip';
    else if ((role === 'alert' || role === 'status') && element.closest('.fixed')) kind = 'toast';
    else if ((classes.includes('absolute') || classes.includes('fixed'))
      && ((hasRounded(element) && hasSurface(element))
        || (element.classList.contains('card-frame') && classes.some(token => /^shadow-(?:xl|2xl)$/.test(token))))
      && element.querySelector('button,[role="option"]')) kind = 'menu';
    else if (!element.matches('button,a,nav,header,footer') && (element.classList.contains('card-frame')
      || element.classList.contains('card-frame-solid')
      || (hasRounded(element) && hasSurface(element) && hasPadding(element)))) {
      kind = classes.includes('bg-[var(--color-surface-light)]') ? 'raised' : 'panel';
    }
    mark(element, 'data-wme-surface', kind);
    mark(element, 'data-wme-panel', ['panel', 'raised'].includes(kind) && !element.closest('.fixed,.absolute') ? '' : null);
  }

  function rangeFill(element) {
    const min = element.min === '' ? 0 : Number(element.min);
    const max = element.max === '' ? 100 : Number(element.max);
    const value = element.valueAsNumber;
    const fraction = Number.isFinite(value) && max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    const fill = `${Math.round(fraction * 1000) / 10}%`;
    if (element.style.getPropertyValue('--wme-range-fill') !== fill) element.style.setProperty('--wme-range-fill', fill);
  }

  function qualifyNativeDetails(path) {
    // Hide subscription advertising at its component boundary, never a whole page.
    for (const previous of document.querySelectorAll('[data-wme-pro]')) mark(previous, 'data-wme-pro', null);
    for (const element of document.querySelectorAll('[aria-labelledby="pro-subscription-heading"],a[href*="#pro-subscription-heading"]')) mark(element, 'data-wme-pro');
    for (const element of document.querySelectorAll('h2,h3,p,button,a,span')) {
      if (excluded(element)) continue;
      const text = compactText(element);
      if (text === 'PRO' && element.matches('span') && /(?:violet|purple|fuchsia)-/.test(element.className)) {
        mark(element.closest('button[role="tab"]') || element, 'data-wme-pro');
        continue;
      }
      if (text.length > 400 || !/(?:Wiki\s*Masters\s+PRO|pack PRO|marché PRO|(?:passe[rz]?|abonnement|statut|en)\s+(?:au\s+)?PRO\b)/i.test(text)) continue;
      const panel = element.closest('[aria-labelledby="pro-subscription-heading"],.relative.overflow-hidden.rounded-xl.border');
      const daily = /^Pack PRO du jour/i.test(text) ? element.closest('div.rounded-xl.border') : null;
      mark(panel || daily || element.closest('button,a') || element, 'data-wme-pro');
    }
    for (const previous of document.querySelectorAll('[data-wme-stepper]')) mark(previous, 'data-wme-stepper', null);
    for (const field of document.querySelectorAll('input[type="number"]')) {
      const group = field.parentElement;
      if (!excluded(field) && group?.querySelector(':scope > button[aria-label="Diminuer"]')
        && group.querySelector(':scope > button[aria-label="Augmenter"]')) mark(group, 'data-wme-stepper');
    }
    for (const previous of document.querySelectorAll('[data-wme-collection-filters]')) mark(previous, 'data-wme-collection-filters', null);
    if (path === '/collection') {
      const search = document.querySelector('main input[placeholder="Rechercher par titre ou catégorie..."]');
      if (search?.parentElement.querySelector('button[aria-haspopup="listbox"]')) mark(search.parentElement, 'data-wme-collection-filters');
    }
    // Native reveal pagination is made of empty 12px dots. Give each a visible
    // number without replacing React's children or the native navigation handler.
    if (path === '/pulls') {
      for (const button of document.querySelectorAll('main button.w-3.h-3')) {
        const group = button.parentElement;
        const buttons = [...group.children];
        if (excluded(button) || !buttons.every(item => item.matches('button.w-3.h-3') && !compactText(item))) continue;
        mark(group, 'data-wme-reveal-pages');
        const index = buttons.indexOf(button) + 1;
        mark(button, 'data-wme-page-index', index);
        mark(button, 'data-wme-page-active', String(isSelected(button)));
        mark(button, 'aria-label', `Carte ${index} sur ${buttons.length}`);
        mark(button, 'aria-current', isSelected(button) ? 'step' : null);
      }
    }
  }

  // Paquets page: presentation hooks on the native stage, pack, CTA and stock panel.
  // The regen bar is driven by CSS variables, refreshed every second from the
  // native countdown text; the adapter's own selectors are left untouched.
  let pullsTimer = null;
  function updatePulls() {
    const onPulls = (location.pathname.replace(/\/$/, '') || '/') === '/pulls';
    for (const previous of document.querySelectorAll('[data-wme-pulls]')) {
      if (!onPulls || !previous.isConnected) mark(previous, 'data-wme-pulls', null);
    }
    if (!onPulls) {
      clearInterval(pullsTimer);
      pullsTimer = null;
      return;
    }
    if (!pullsTimer) pullsTimer = setInterval(updatePulls, 1000);
    const pack = document.querySelector('main button:has(img[alt="Ouvrir un paquet"])');
    if (!pack) return;
    const stage = pack.parentElement;
    mark(stage, 'data-wme-pulls', 'stage');
    mark(pack, 'data-wme-pulls', 'pack');
    const cta = pack.querySelector(':scope > span');
    if (cta) mark(cta, 'data-wme-pulls', 'cta');
    const header = stage.querySelector(':scope > .text-center');
    if (header) mark(header, 'data-wme-pulls', 'header');
    const panel = pack.nextElementSibling?.querySelector('.card-frame');
    if (!panel) return;
    mark(panel, 'data-wme-pulls', 'stock');
    const stock = Number(panel.querySelector(':scope > div.text-lg > span')?.textContent.trim());
    let regen = 0;
    const timer = panel.querySelector('.font-mono');
    const match = timer?.textContent.trim().match(/^(\d+):(\d{2})$/);
    if (match) {
      let pro = false;
      try { pro = JSON.parse(pack.getAttribute('data-wme-pack-state'))?.isPro === true; } catch { /* Unknown until confirmed. */ }
      const interval = pro ? 180 : 600;
      regen = Math.max(0, Math.min(1, 1 - (Number(match[1]) * 60 + Number(match[2])) / interval));
    }
    const setVar = (name, value) => { if (panel.style.getPropertyValue(name) !== value) panel.style.setProperty(name, value); };
    if (Number.isInteger(stock)) setVar('--wme-stock', String(stock));
    setVar('--wme-regen', regen.toFixed(3));
    mark(panel, 'data-wme-full', stock === 10 ? '' : null);
  }

  // The site's wordmark is two spans, "Wiki" and "Masters" (menu, login page): marked, the
  // extension's WikiRemastered logo is drawn in their place (site-theme.css). The words stay in
  // the page for screen readers.
  function markLogos() {
    for (const span of document.querySelectorAll('span')) {
      if (span.textContent !== 'Wiki') continue;
      const next = span.nextElementSibling;
      const parent = span.parentElement;
      if (!parent || next?.tagName !== 'SPAN' || next.textContent !== 'Masters' || parent.children.length !== 2 || excluded(parent)) continue;
      // In the menu (the sidebar, the mobile bar) the compact lockup, the icon beside the name on
      // two lines; elsewhere (the login page) the full wordmark.
      mark(parent, 'data-wme-logo', parent.closest('nav, aside, header') ? 'compact' : 'full');
    }
  }

  function scan() {
    scheduled = null;
    const root = document.documentElement;
    if (!root) return;
    mark(root, 'data-wme-theme', 'graphite');
    if (!document.body) return;
    const path = location.pathname.replace(/\/$/, '') || '/';
    mark(document.body, 'data-wme-page', path.split('/')[1] || 'home');

    for (const element of document.querySelectorAll(`${ART},[data-wme-card-art],button:has(img)`)) {
      mark(element, 'data-wme-card-art', artRoot(element) ? '' : null);
    }
    qualifyNativeDetails(path);
    updatePulls();
    markLogos();
    for (const nav of document.querySelectorAll('nav')) {
      if (excluded(nav)) continue;
      const type = nav.classList.contains('md:hidden') ? 'mobile' : nav.classList.contains('w-64') ? 'desktop' : 'public';
      mark(nav, 'data-wme-nav', type);
      for (const link of nav.querySelectorAll('a[href]')) {
        const isItem = hasPadding(link) && (hasRounded(link) || Boolean(link.closest('.absolute.bottom-full')));
        mark(link, 'data-wme-nav-item', isItem ? '' : null);
        if (!isItem) continue;
        let target;
        try { target = new URL(link.getAttribute('href'), location.href); } catch { continue; }
        const current = target.origin === location.origin && (path === target.pathname || (target.pathname !== '/' && path.startsWith(`${target.pathname}/`)));
        mark(link, 'data-wme-current', String(current));
      }
    }
    for (const main of document.querySelectorAll('main')) {
      mark(main, 'data-wme-main');
      const pageContent = [...main.querySelectorAll('div.p-4,section.p-4,[class~="md:p-6"]')]
        .find(element => !excluded(element) && !element.closest('.fixed,.absolute'));
      for (const previous of main.querySelectorAll('[data-wme-page-content]')) if (previous !== pageContent) mark(previous, 'data-wme-page-content', null);
      if (pageContent) mark(pageContent, 'data-wme-page-content');
      for (const heading of main.querySelectorAll('h1')) {
        if (excluded(heading)) continue;
        const parent = heading.parentElement;
        if (parent?.matches('header,.flex') && !parent.hasAttribute('data-wme-page-content')) mark(parent, 'data-wme-header');
      }
    }

    // Native segmented controls use a common padded surface; action rows do not.
    for (const group of document.querySelectorAll('[role="tablist"],div[class],[data-wme-tabs]')) {
      if (excluded(group)) continue;
      const children = [...group.children];
      const tabs = group.getAttribute('role') === 'tablist' || (children.length >= 2 && children.length <= 8
        && children.every(child => child.matches('button,[role="tab"]'))
        && ((hasSurface(group) && hasRounded(group) && group.classList.contains('p-1'))
          || (group.classList.contains('border-b') && children.some(isSelected))));
      mark(group, 'data-wme-tabs', tabs ? '' : null);
    }
    for (const element of document.querySelectorAll('div[class],section[class],article[class],form[class],aside[class],dialog,[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[role="alert"],[role="status"]')) classifySurface(element);
    for (const previous of document.querySelectorAll('[data-wme-backdrop]')) mark(previous, 'data-wme-backdrop', null);
    for (const overlay of document.querySelectorAll('.fixed.inset-0')) {
      if (excluded(overlay)) continue;
      const backdrop = [overlay, ...overlay.children].find(element =>
        (element === overlay || element.matches('.absolute.inset-0,.fixed.inset-0'))
        && (tokens(element).some(token => /^bg-black(?:\/\d+)?$/.test(token))
          || [...element.classList].some(token => token.startsWith('backdrop-blur'))));
      if (backdrop) mark(backdrop, 'data-wme-backdrop');
      if (!backdrop && overlay.getAttribute('role') !== 'dialog' && overlay.getAttribute('aria-modal') !== 'true') continue;
      const surface = [...overlay.querySelectorAll('.card-frame,.card-frame-solid,[role="dialog"],[aria-modal="true"],[class*="max-w-"]')]
        .find(element => !excluded(element) && (hasSurface(element) || element.classList.contains('card-frame') || element.classList.contains('card-frame-solid')));
      if (surface) {
        mark(surface, 'data-wme-surface', 'dialog');
        mark(surface, 'data-wme-panel', null);
      }
    }
    for (const control of document.querySelectorAll('button,a,[role="button"],[role="tab"],[role="radio"],[role^="menuitem"],[role="option"]')) classifyControl(control);
    for (const field of document.querySelectorAll('input,select,textarea')) {
      mark(field, 'data-wme-input', null);
      mark(field, 'data-wme-range', null);
      if (excluded(field) || ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'color'].includes(field.type)) continue;
      if (field.matches('input[type="range"]')) {
        mark(field, 'data-wme-range');
        rangeFill(field);
        continue;
      }
      mark(field, 'data-wme-input');
    }
    for (const element of document.querySelectorAll('[class*="blue-"],[class*="sky-"],[class*="cyan-"],[class*="indigo-"],[data-wme-info-text],[data-wme-info-bg],[data-wme-info-border]')) {
      if (excluded(element)) continue;
      const classes = tokens(element);
      mark(element, 'data-wme-info-text', classes.some(token => infoText.test(token)) ? '' : null);
      mark(element, 'data-wme-info-bg', classes.some(token => infoBg.test(token)) ? '' : null);
      mark(element, 'data-wme-info-border', classes.some(token => infoBorder.test(token)) ? '' : null);
    }
  }

  function schedule() {
    if (!scheduled) scheduled = setTimeout(scan, 48);
  }

  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === document || (record.target instanceof Element && !excluded(record.target)))) schedule();
  });
  observer.observe(document, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'role', 'aria-selected', 'aria-pressed', 'aria-checked', 'aria-current', 'data-state', 'type'],
  });
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range' && !excluded(event.target)) rangeFill(event.target);
  }, { passive: true });
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  scan();
})();
