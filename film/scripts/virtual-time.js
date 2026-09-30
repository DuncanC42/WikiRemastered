/* Virtual time, injected before a page runs (see capture.mjs): the page's clock only moves when
 * the capture calls window.__vtAdvance(ms), so every frame of an animation can be taken at its
 * exact time, however long the screenshot takes. It covers what the pack opening uses:
 * performance.now, Date, timers, requestAnimationFrame, Math.random (seeded), and every Web
 * Animation and CSS animation or transition, which are held and moved by hand. */
(() => {
  if (window.__vtAdvance) return;
  const realTimeout = window.setTimeout.bind(window);
  const RealDate = Date;
  const epoch = RealDate.UTC(2026, 8, 30, 12, 0, 0);
  let now = 0;

  let seed = 20260930;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  performance.now = () => now;
  function VirtualDate(...args) {
    if (!new.target) return new RealDate(epoch + now).toString();
    return args.length ? new RealDate(...args) : new RealDate(epoch + now);
  }
  VirtualDate.prototype = RealDate.prototype;
  VirtualDate.now = () => epoch + now;
  VirtualDate.parse = RealDate.parse;
  VirtualDate.UTC = RealDate.UTC;
  window.Date = VirtualDate;

  // Timers: fired in time order by __vtAdvance.
  let timerId = 1;
  const timers = new Map();
  window.setTimeout = (fn, ms, ...args) => {
    const id = timerId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, id });
    return id;
  };
  window.setInterval = (fn, ms, ...args) => {
    const id = timerId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: now + every, fn, args, every, id });
    return id;
  };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestIdleCallback = fn => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 1);
  window.cancelIdleCallback = id => window.clearTimeout(id);

  let frameId = 1;
  let frames = new Map();
  window.requestAnimationFrame = fn => {
    const id = frameId++;
    frames.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = id => { frames.delete(id); };

  // Animations: each is held (paused) and its time set from the virtual clock.
  const proto = Animation.prototype;
  const native = {
    pause: proto.pause,
    play: proto.play,
    finish: proto.finish,
    reverse: proto.reverse,
    updatePlaybackRate: proto.updatePlaybackRate,
    currentTime: Object.getOwnPropertyDescriptor(proto, 'currentTime'),
    playbackRate: Object.getOwnPropertyDescriptor(proto, 'playbackRate'),
  };
  const getTime = animation => native.currentTime.get.call(animation);
  const setTime = (animation, time) => native.currentTime.set.call(animation, time);
  const setRate = (animation, rate) => native.playbackRate.set.call(animation, rate);
  const tracked = new Map();
  const endOf = animation => {
    try { return animation.effect ? animation.effect.getComputedTiming().endTime : 0; } catch { return 0; }
  };
  function adopt(animation) {
    let record = tracked.get(animation);
    if (record) return record;
    const state = animation.playState;
    const time = getTime(animation) ?? 0;
    record = { base: now, from: time, rate: native.playbackRate.get.call(animation), held: state === 'paused' || state === 'idle', done: state === 'finished' };
    tracked.set(animation, record);
    if (!record.done && state !== 'idle') {
      native.pause.call(animation);
      setTime(animation, time);
    }
    return record;
  }
  const rebase = (animation, record) => {
    record.from = getTime(animation) ?? 0;
    record.base = now;
  };
  proto.pause = function () {
    const record = adopt(this);
    rebase(this, record);
    record.held = true;
    native.pause.call(this);
  };
  proto.play = function () {
    const record = adopt(this);
    let time = getTime(this) ?? 0;
    const end = endOf(this);
    if (record.rate >= 0 && (record.done || time >= end)) time = 0;
    if (record.rate < 0 && (record.done || time <= 0)) time = end;
    native.pause.call(this);
    setTime(this, time);
    Object.assign(record, { base: now, from: time, held: false, done: false });
  };
  proto.reverse = function () {
    const record = adopt(this);
    rebase(this, record);
    record.rate = -record.rate;
    setRate(this, record.rate);
    Object.assign(record, { held: false, done: false });
    native.pause.call(this);
    setTime(this, record.from);
  };
  proto.updatePlaybackRate = function (rate) {
    const record = adopt(this);
    rebase(this, record);
    record.rate = rate;
    setRate(this, rate);
  };
  Object.defineProperty(proto, 'playbackRate', {
    configurable: true,
    get() { return native.playbackRate.get.call(this); },
    set(rate) {
      const record = adopt(this);
      rebase(this, record);
      record.rate = rate;
      setRate(this, rate);
    },
  });
  Object.defineProperty(proto, 'currentTime', {
    configurable: true,
    get() { return getTime(this); },
    set(time) {
      const record = adopt(this);
      setTime(this, time);
      Object.assign(record, { base: now, from: time ?? 0, done: false });
    },
  });
  proto.finish = function () {
    const record = adopt(this);
    record.done = true;
    native.finish.call(this);
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = animate.apply(this, args);
    adopt(animation);
    return animation;
  };

  function allAnimations() {
    const list = new Set(document.getAnimations());
    for (const host of document.querySelectorAll('*')) {
      if (host.shadowRoot) for (const animation of host.shadowRoot.getAnimations()) list.add(animation);
    }
    return list;
  }
  function sync() {
    for (const animation of allAnimations()) adopt(animation);
    for (const [animation, record] of tracked) {
      if (record.held || record.done) continue;
      if (animation.playState === 'idle') { tracked.delete(animation); continue; }
      const time = record.from + (now - record.base) * record.rate;
      const end = endOf(animation);
      if ((record.rate > 0 && time >= end) || (record.rate < 0 && time <= 0)) {
        record.done = true;
        native.finish.call(animation);
      } else setTime(animation, time);
    }
  }
  const settle = () => new Promise(resolve => realTimeout(resolve, 0));

  // Moves the clock by `ms`: timers due in that span fire in order, then one animation frame.
  window.__vtAdvance = async ms => {
    const target = now + ms;
    for (let guard = 0; guard < 5000; guard += 1) {
      let next = null;
      for (const timer of timers.values()) if (timer.at <= target && (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id))) next = timer;
      if (!next) break;
      now = Math.max(now, next.at);
      if (next.every) next.at += next.every;
      else timers.delete(next.id);
      sync();
      try { next.fn(...next.args); } catch (error) { console.error(error); }
      await settle();
    }
    now = target;
    sync();
    const due = frames;
    frames = new Map();
    for (const fn of due.values()) {
      try { fn(now); } catch (error) { console.error(error); }
    }
    await settle();
    sync();
    await settle();
    sync();
    return now;
  };
  window.__vtNow = () => now;
})();
