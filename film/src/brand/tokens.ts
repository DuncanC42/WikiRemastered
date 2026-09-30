/* The brand, as the extension draws it (scripts/brand.mjs, pack-opening.js). */
export type Ink = { face: string; rim: string; near: string; far: string };

// Inks of the 3D solids: a lit face, a light rim on the upper edges, a depth from near to far.
export const GREEN: Ink = { face: '#3ddc97', rim: '#b4f7d8', near: '#1c9e68', far: '#0a4a31' };
export const WHITE: Ink = { face: '#f3f6f2', rim: '#ffffff', near: '#9db3a8', far: '#3f4f47' };
export const CORAL: Ink = { face: '#ff5a4c', rim: '#ffb3a8', near: '#c23b3b', far: '#6e1f1f' };
export const COLORS = {
  ink: '#0c0d0c',
  room: '#121413',
  panel: '#181b1a',
  line: '#262b29',
  text: '#f3f6f2',
  muted: '#8a948f',
  green: '#3ddc97',
  coral: '#ff5a4c',
  blue: '#2f7cf6',
  marigold: '#f2b23a',
};

// The six rarities, as the pack opening colours them.
export const RARITY = {
  C: { name: 'Commune', color: '#b8f2d5' },
  PC: { name: 'Peu commune', color: '#b1cff2' },
  R: { name: 'Rare', color: '#c6a7f2' },
  SR: { name: 'Super rare', color: '#ed6fa3' },
  UR: { name: 'Ultra rare', color: '#fa9931' },
  L: { name: 'Légendaire', color: '#ffe144' },
} as const;
export type Rarity = keyof typeof RARITY;

export const FONT = {
  display: "'Rubik', system-ui, sans-serif",
  ui: "'Inter Variable', 'Inter', system-ui, sans-serif",
};
// The wordmark leans forward by 6 degrees; the film's display type does too.
export const LEAN = -6;
