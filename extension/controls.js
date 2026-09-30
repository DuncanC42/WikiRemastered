const numberFormat = new Intl.NumberFormat('fr-FR');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

/** Discrete, equally spaced detents. The numeric field remains the source for
 * existing validation, but only a finished gesture/edit emits a change event.
 */
export function createSteppedSlider({ label, unit, value, levels, min, max, formatValue, signal }) {
  const element = node('div', 'property-slider');
  const track = node('div', 'property-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-orientation', 'horizontal');
  const fill = node('span', 'property-fill');
  const marks = node('span', 'property-marks');
  const marker = node('span', 'property-marker');
  for (const decoration of [fill, marks, marker]) decoration.setAttribute('aria-hidden', 'true');
  const text = node('span', 'property-label', label);
  const exact = node('label', 'property-exact');
  const input = node('input', 'property-value');
  input.type = 'number';
  // A name keeps browser form tooling (and DevTools' autofill audit) satisfied.
  input.name = `wme-${label.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
  input.inputMode = 'numeric';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.required = true;
  input.value = String(value);
  input.setAttribute('aria-label', `${label} (${unit})`);
  input.title = 'Saisir une valeur exacte';
  const readout = node('span', 'property-readout');
  input.hidden = Boolean(formatValue);
  if (formatValue) exact.append(input, readout);
  else exact.append(input, node('span', 'property-unit', unit));
  track.append(fill, marks, marker);
  element.append(track, text, exact);

  let drag = null;
  let keyboardStart = null;
  let editStart = null;
  let disabled = false;
  let stops = [...levels];
  let marksSignature = '';
  const valid = number => Number.isSafeInteger(number) && number >= min && number <= max;
  const emit = type => input.dispatchEvent(new Event(type, { bubbles: true }));
  // Exact amounts become a detent too; never round a saved spending limit up.
  // Keep this extra detent when selecting a preset, so the scale stays stable.
  function includeExact(number) {
    if (valid(number) && !stops.includes(number)) stops = [...levels, number].sort((a, b) => a - b);
  }
  const indexOf = number => stops.reduce((best, stop, index) =>
    Math.abs(stop - number) < Math.abs(stops[best] - number) ? index : best, 0);

  // Detents fade beneath the label and the value so both stay legible. The
  // text boxes are measured, not guessed: labels and values vary in length.
  const textRange = document.createRange();
  function measureText() {
    if (!element.isConnected) return;
    const box = element.getBoundingClientRect();
    if (!box.width) return;
    textRange.selectNodeContents(text);
    const label = textRange.getBoundingClientRect();
    const value = exact.getBoundingClientRect();
    const labelEnd = label.width ? Math.round(label.right - box.left + 10) : 0;
    const valueStart = value.width ? Math.round(value.left - box.left - 8) : Math.round(box.width);
    element.style.setProperty('--text-end', `${labelEnd}px`);
    element.style.setProperty('--value-start', `${valueStart}px`);
  }
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measureText);
    observer.observe(element);
    observer.observe(exact);
    signal?.addEventListener('abort', () => observer.disconnect(), { once: true });
  }

  function sync() {
    const number = editStart ?? input.valueAsNumber;
    const index = indexOf(Number.isFinite(number) ? number : min);
    const signature = stops.join(',');
    if (signature !== marksSignature) {
      marks.replaceChildren(...stops.map((stop, position) => {
        const mark = node('i');
        mark.style.setProperty('--mark', String(position / (stops.length - 1)));
        return mark;
      }));
      marksSignature = signature;
    }
    [...marks.children].forEach((mark, position) => {
      mark.classList.toggle('passed', position < index);
      mark.classList.toggle('current', position === index);
    });
    element.style.setProperty('--progress', String(index / (stops.length - 1)));
    element.dataset.edge = String(index === 0 || index === stops.length - 1);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(stops.length - 1));
    track.setAttribute('aria-valuenow', String(index));
    const valueText = formatValue ? formatValue(stops[index]) : `${numberFormat.format(stops[index])} ${unit}`;
    track.setAttribute('aria-valuetext', valueText);
    if (formatValue) readout.textContent = valueText;
    track.setAttribute('aria-disabled', String(disabled));
    track.tabIndex = disabled ? -1 : 0;
    element.dataset.disabled = String(disabled);
    input.disabled = disabled;
    requestAnimationFrame(measureText);
  }
  function preview(number) {
    if (input.valueAsNumber === number) return;
    input.value = String(number);
    input.removeAttribute('aria-invalid');
    sync();
    emit('input');
  }
  function choose(position) {
    preview(stops[clamp(Math.round(position), 0, stops.length - 1)]);
  }
  function endDrag(cancelled) {
    if (!drag) return;
    const gesture = drag;
    drag = null;
    delete element.dataset.dragging;
    if (track.hasPointerCapture(gesture.id)) track.releasePointerCapture(gesture.id);
    if (cancelled) preview(gesture.value);
    else if (input.valueAsNumber !== gesture.value) emit('change');
    sync();
  }
  track.addEventListener('pointerdown', event => {
    if (disabled || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    track.focus({ preventScroll: true });
    commitKeyboard();
    const rect = track.getBoundingClientRect();
    const width = Math.max(1, rect.width - 27);
    const start = input.valueAsNumber;
    const position = indexOf(start);
    const markerRect = marker.getBoundingClientRect();
    const onMarker = Math.abs(event.clientX - (markerRect.left + markerRect.width / 2)) <= 12;
    drag = { id: event.pointerId, x: event.clientX, value: start, position, width, moved: false };
    track.setPointerCapture(event.pointerId);
    element.dataset.dragging = 'true';
    // Marker, detents and hit testing share the same inset; grabbing never jumps.
    if (!onMarker) {
      choose((event.clientX - rect.left - 13.5) / width * (stops.length - 1));
      drag.position = indexOf(input.valueAsNumber);
    }
  }, { signal });
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 2) return;
    drag.moved = true;
    choose(drag.position + (event.clientX - drag.x) / drag.width * (stops.length - 1));
  }
  track.addEventListener('pointermove', move, { signal });
  track.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return;
    move(event);
    endDrag(false);
  }, { signal });
  track.addEventListener('pointercancel', () => endDrag(true), { signal });
  track.addEventListener('lostpointercapture', () => endDrag(true), { signal });
  track.addEventListener('keydown', event => {
    if (disabled) return;
    if (event.key === 'Escape') {
      if (!drag && keyboardStart === null) return;
      event.preventDefault();
      event.stopPropagation();
      endDrag(true);
      if (keyboardStart !== null) { const start = keyboardStart; keyboardStart = null; preview(start); }
      return;
    }
    const directions = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 2, PageDown: -2 };
    if (drag || (!(event.key in directions) && !['Home', 'End'].includes(event.key))) return;
    event.preventDefault();
    keyboardStart ??= input.valueAsNumber;
    choose(event.key === 'Home' ? 0 : event.key === 'End' ? stops.length - 1
      : indexOf(input.valueAsNumber) + directions[event.key]);
  }, { signal });
  function commitKeyboard() {
    if (keyboardStart === null) return;
    const previous = keyboardStart;
    keyboardStart = null;
    if (input.valueAsNumber !== previous) emit('change');
  }
  track.addEventListener('keyup', event => {
    if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) commitKeyboard();
  }, { signal });
  track.addEventListener('blur', commitKeyboard, { signal });

  function finishEdit(cancelled) {
    if (editStart === null) return;
    const previous = editStart;
    const draft = input.valueAsNumber;
    editStart = null;
    const next = cancelled || !Number.isFinite(draft) ? previous : clamp(Math.round(draft), min, max);
    includeExact(next);
    input.value = String(next);
    input.removeAttribute('aria-invalid');
    sync();
    emit('input');
    if (!cancelled && next !== previous) emit('change');
  }
  input.addEventListener('focus', () => { editStart = input.valueAsNumber; }, { signal });
  // Native number inputs may emit change while an arrow key is held. Drafts
  // commit only on blur/Enter, so Escape can restore without saving a new cap.
  input.addEventListener('change', event => {
    if (event.isTrusted) event.stopImmediatePropagation();
  }, { capture: true, signal });
  input.addEventListener('blur', () => finishEdit(false), { signal });
  input.addEventListener('keydown', event => {
    if (!['Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    finishEdit(event.key === 'Escape');
    input.blur();
  }, { signal });
  includeExact(value);
  sync();
  return {
    element, input, sync,
    get interacting() { return Boolean(drag || keyboardStart !== null || editStart !== null); },
    setValue(value) {
      if (!this.interacting) { includeExact(value); input.value = String(value); sync(); }
    },
    setDisabled(value) {
      disabled = Boolean(value);
      if (disabled) {
        endDrag(true);
        if (keyboardStart !== null) { const start = keyboardStart; keyboardStart = null; preview(start); }
        finishEdit(true);
      }
      sync();
    },
  };
}

export function createHelpButton(topic, signal) {
  const button = node('button', 'button button-quiet help-trigger', 'Comment ça marche ?');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { openHelp } = await import('./help.js');
      if (!signal?.aborted && button.isConnected) await openHelp(topic, button, signal);
    } catch { /* Leave the current tool usable when help cannot load. */ }
    finally { button.disabled = false; }
  }, { signal });
  return button;
}
