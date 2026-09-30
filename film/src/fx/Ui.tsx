import React from 'react';
import { COLORS, FONT } from '../brand/tokens';

/* Pieces of the extension's interface, as it draws them on the site (graphite panels, blue
   primary buttons, small dark pills), rebuilt for the film. */
export const Panel: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      position: 'absolute',
      background: 'linear-gradient(180deg, #191c1b, #141716)',
      border: '1px solid #262b29',
      borderRadius: 26,
      boxShadow: '0 50px 100px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)',
      fontFamily: FONT.ui,
      color: COLORS.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Icon = {
  palette: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  ),
  eye: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  sound: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ),
  check: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  clock: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  home: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
};

export const Pill: React.FC<{ tone?: 'blue' | 'dark' | 'green'; press?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ tone = 'dark', press = 0, style, children }) => {
  const tones = {
    blue: { background: '#2f7cf6', color: '#fff', border: '1px solid #4a8ff8', boxShadow: '0 10px 30px rgba(47,124,246,.35)' },
    green: { background: '#3ddc97', color: '#07140e', border: '1px solid #6ee7b5', boxShadow: '0 10px 30px rgba(61,220,151,.3)' },
    dark: { background: '#1b1f1d', color: '#e6ebe8', border: '1px solid #2c3230', boxShadow: 'none' },
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 24px',
        borderRadius: 14,
        fontFamily: FONT.ui,
        fontWeight: 600,
        fontSize: 26,
        whiteSpace: 'nowrap',
        transform: `scale(${1 - press * 0.06})`,
        filter: press ? `brightness(${1 + press * 0.15})` : undefined,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// A pointer, drawn as the system's arrow.
export const Cursor: React.FC<{ x: number; y: number; press?: number; opacity?: number }> = ({ x, y, press = 0, opacity = 1 }) => (
  <div style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${1 - press * 0.12})`, transformOrigin: '0 0', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.5))', zIndex: 20 }}>
    <svg width="44" height="44" viewBox="0 0 24 24">
      <path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L17.5 14 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  </div>
);

// A click's ripple.
export const Ripple: React.FC<{ x: number; y: number; t: number; color?: string }> = ({ x, y, t, color = '#ffffff' }) =>
  t <= 0 || t >= 1 ? null : (
    <div style={{ position: 'absolute', left: x - 60, top: y - 60, width: 120, height: 120, borderRadius: '50%', border: `3px solid ${color}`, opacity: 1 - t, transform: `scale(${0.2 + t})`, zIndex: 19 }} />
  );
