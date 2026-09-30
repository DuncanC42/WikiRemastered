import React from 'react';
import { Img, staticFile } from 'remotion';
import { RealCardData } from './catalog';
import './real-card.css';

// The rarities as the opening draws them (extension/pack-opening.js, META).
const META = {
  C: { rgb: '184 242 213', frame: 'commun', tier: 0 },
  PC: { rgb: '177 207 242', frame: 'peu_commun', tier: 0 },
  R: { rgb: '198 167 242', frame: 'rare', tier: 1 },
  SR: { rgb: '237 111 163', frame: 'super_rare', tier: 2 },
  UR: { rgb: '250 153 49', frame: 'ultra_rare', tier: 3 },
  L: { rgb: '255 225 68', frame: 'legendaire', tier: 4 },
} as const;
const HOLO = [0, 0.1, 0.17, 0.24, 0.32];
const number = new Intl.NumberFormat('fr-FR');

const Swords = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
    <line x1="13" x2="19" y1="19" y2="13" />
    <line x1="16" x2="20" y1="16" y2="20" />
    <line x1="19" x2="21" y1="21" y2="19" />
    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
    <line x1="5" x2="9" y1="14" y2="18" />
    <line x1="7" x2="4" y1="17" y2="20" />
    <line x1="3" x2="5" y1="19" y2="21" />
  </svg>
);
const Shield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

/* A card of the game, `width` pixels wide. `flip` 1 shows the face, 0 the back (the puzzle
   pack's). `sheen` (0 to 1) runs a pass of light across the face; `holo` moves the foil. */
export const RealCard: React.FC<{ card: RealCardData; width: number; flip?: number; sheen?: number; holo?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ card, width, flip = 1, sheen, holo = 0.5, style, children }) => {
  const meta = META[card.rarity];
  return (
    <div className="rc" style={{ width, ['--c-rgb' as string]: meta.rgb, ...style }}>
      <div className="rc-flip" style={{ transform: `rotateY(${(1 - flip) * 180}deg)` }}>
        <div className="rc-face rc-front">
          <Img className="rc-frame" src={`https://www.wiki-masters.com/${meta.frame}.png`} />
          <div className="rc-art">
            <Img src={card.image} referrerPolicy="no-referrer" />
          </div>
          <span className="rc-chip">{card.rarity}</span>
          <div className="rc-body">
            <h3>{card.title}</h3>
            <p>{card.category}</p>
            <div className="rc-stats">
              <span className="atk"><Swords />{number.format(card.atk)}</span>
              <span className="def"><Shield />{number.format(card.def)}</span>
            </div>
          </div>
          {meta.tier > 0 && <div className="rc-holo" style={{ opacity: HOLO[meta.tier], ['--hx' as string]: `${holo * 100}%` }} />}
          {sheen !== undefined && sheen > 0 && sheen < 1 && <div className="rc-sheen" style={{ ['--sx' as string]: `${220 - sheen * 320}%` }} />}
        </div>
        <div className="rc-face rc-back">
          <Img src={staticFile('art/card-back.png')} />
        </div>
      </div>
      {children}
    </div>
  );
};
