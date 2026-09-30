import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT, Ink, LEAN, WHITE } from '../brand/tokens';
import { ease, mix, ramp } from '../lib/anim';

// The brand's solid letters, in CSS: the depth is a stack of hard shadows, near shade to far.
export const solidShadow = (ink: Ink, depth: number, steps = 8, lift = true) => {
  const length = Math.hypot(0.45, 1);
  const layers = Array.from({ length: steps }, (_, index) => {
    const offset = (depth * (index + 1)) / steps;
    return `${((0.45 / length) * offset).toFixed(2)}px ${((1 / length) * offset).toFixed(2)}px 0 ${mix(ink.near, ink.far, index / Math.max(1, steps - 1))}`;
  });
  if (lift) layers.push(`0 ${depth * 1.6}px ${depth * 2.4}px rgba(0, 0, 0, .45)`);
  return layers.join(', ');
};

export type Run = { text: string; ink?: Ink };
export type Line = Run[];

/* A display headline, word by word: each word rises into place out of a blur, and leaves the same
   way. `at` and `exit` are frames (relative to the scene); lines follow one another by `lineGap`. */
export const Headline: React.FC<{
  lines: Line[];
  at: number;
  exit?: number;
  size?: number;
  lineGap?: number;
  stagger?: number;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
  depth?: number;
}> = ({ lines, at, exit = Infinity, size = 150, lineGap = 30, stagger = 4, align = 'left', style, depth }) => {
  const frame = useCurrentFrame();
  const d = depth ?? Math.max(4, size * 0.055);
  let order = 0;
  return (
    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'center', ...style }}>
      {lines.map((line, row) => (
        <div key={row} style={{ display: 'flex', gap: size * 0.26, whiteSpace: 'nowrap', lineHeight: 1, marginTop: row ? -size * 0.04 : 0 }}>
          {line.flatMap((run, runIndex) =>
            run.text.split(' ').filter(Boolean).map((word, wordIndex) => {
              const index = order++;
              const start = at + row * lineGap + wordIndex * stagger + runIndex * stagger;
              const t = ramp(frame, start, 22, ease.out);
              const out = ramp(frame, exit + index * 2.5, 16, ease.inSoft);
              const ink = run.ink ?? WHITE;
              // A run that follows another without a space (a coloured word, its full stop) sticks to it.
              const glue = runIndex > 0 && wordIndex === 0 && !run.text.startsWith(' ') && !line[runIndex - 1].text.endsWith(' ');
              return (
                <span
                  key={`${runIndex}-${wordIndex}`}
                  style={{
                    display: 'inline-block',
                    marginLeft: glue ? -size * 0.26 : 0,
                    fontFamily: FONT.display,
                    fontWeight: 900,
                    fontSize: size,
                    letterSpacing: -size * 0.01,
                    color: ink.face,
                    textShadow: solidShadow(ink, d),
                    opacity: t * (1 - out),
                    filter: `blur(${(1 - t) * 14 + out * 12}px)`,
                    transform: `translateY(${(1 - t) * size * 0.45 - out * size * 0.35}px) skewX(${LEAN}deg)`,
                  }}
                >
                  {word}
                </span>
              );
            }),
          )}
        </div>
      ))}
    </div>
  );
};

// A small caption in the UI face: a coloured dot and a label, for the feature scenes.
export const Tag: React.FC<{ text: string; color: string; at: number; exit?: number; style?: React.CSSProperties }> = ({ text, color, at, exit = Infinity, style }) => {
  const frame = useCurrentFrame();
  const t = ramp(frame, at, 20);
  const out = ramp(frame, exit, 14, ease.inSoft);
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: FONT.ui,
        fontWeight: 600,
        fontSize: 30,
        letterSpacing: 0.2,
        color: '#c9d2cd',
        opacity: t * (1 - out),
        transform: `translateY(${(1 - t) * 20 - out * 16}px)`,
        ...style,
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: color, boxShadow: `0 0 18px ${color}` }} />
      {text}
    </div>
  );
};

// A soft dark pool behind a headline that sits over a busy picture.
export const Scrim: React.FC<{ opacity: number; top?: number; height?: number }> = ({ opacity, top = 300, height = 480 }) =>
  opacity <= 0 ? null : (
    <div style={{ position: 'absolute', left: -200, right: -200, top, height, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(6,7,6,.78), rgba(6,7,6,.45) 55%, transparent 100%)', opacity }} />
  );
