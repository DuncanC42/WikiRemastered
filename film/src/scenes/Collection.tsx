import React from 'react';
import { useCurrentFrame } from 'remotion';
import { REAL } from '../cards/catalog';
import { RealCard } from '../cards/RealCard';
import { CORAL, FONT, GREEN } from '../brand/tokens';
import { ease, lerp, ramp, springAt } from '../lib/anim';
import { EyeIcon, Feature, panelMotion, Switch } from '../fx/Feature';
import { Panel } from '../fx/Ui';
import { COLLECTION_CUES } from '../cues';

/* Collection +: a page of the collection full of doubles. "Empiler les doublons" switches on:
   the doubles fly onto their first copy, the page closes up, and every card shows its views over
   30 days and its estimated price. */
export const COLLECTION_LENGTH = 240;
const ITEMS = ['flamingo', 'fuji', 'flamingo', 'cat', 'panda', 'flamingo', 'lion', 'fuji', 'whale', 'cat', 'colosseum', 'bee'];
const UNIQUE = [...new Set(ITEMS)];
const CARD = 136;
const slot = (index: number) => ({ x: 44 + (index % 4) * 188, y: 118 + Math.floor(index / 4) * 262 });
export const COLLECTION_SWITCH = COLLECTION_CUES.switch;
const STACK = COLLECTION_CUES.stack;
const number = new Intl.NumberFormat('fr-FR');

export const Collection: React.FC = () => {
  const frame = useCurrentFrame();
  const toggle = ramp(frame, COLLECTION_SWITCH, 10, ease.inOut);
  const copies: Record<string, number> = {};
  return (
    <Feature tag="Collection +" tagColor={GREEN.face} lines={[[{ text: 'Vos doublons,' }], [{ text: 'bien ' }, { text: 'rangés', ink: GREEN }, { text: '.', ink: CORAL }]]} length={COLLECTION_LENGTH}>
      <Panel style={{ left: 1020, top: 104, width: 800, height: 872, transform: panelMotion(frame, COLLECTION_LENGTH), transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'absolute', left: 44, top: 36, fontWeight: 700, fontSize: 32 }}>Collection</div>
        <div style={{ position: 'absolute', right: 40, top: 34, display: 'flex', gap: 22, alignItems: 'center', fontSize: 19, fontWeight: 500, color: '#c9d2cd' }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>Empiler les doublons <Switch on={toggle} /></span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>Vues et prix <Switch on={1} /></span>
        </div>
        {ITEMS.map((key, index) => {
          const copy = copies[key] ?? 0;
          copies[key] = copy + 1;
          const count = ITEMS.filter(item => item === key).length;
          const from = slot(index);
          const to = slot(UNIQUE.indexOf(key));
          const move = ramp(frame, STACK + index * 3, 40, ease.inOut);
          const x = lerp(from.x, to.x + copy * 6, move);
          const y = lerp(from.y, to.y - copy * 6, move) - Math.sin(Math.PI * move) * (copy ? 70 : 14);
          const top = copy === count - 1;
          const badge = top && count > 1 ? springAt(frame, STACK + 52 + UNIQUE.indexOf(key) * 3, { damping: 10, stiffness: 210 }) : 0;
          const info = copy === 0 ? ramp(frame, STACK + 62 + UNIQUE.indexOf(key) * 3, 22) : 0;
          const tally = ramp(frame, STACK + 62 + UNIQUE.indexOf(key) * 3, 40, ease.out);
          const card = REAL[key];
          return (
            <React.Fragment key={index}>
              <div style={{ position: 'absolute', left: x, top: y, zIndex: 1 + copy + (move > 0 && move < 1 ? 20 : 0), transform: `rotate(${copy * 2.5 * move}deg)`, filter: 'drop-shadow(0 10px 14px rgba(0,0,0,.45))' }}>
                <RealCard card={card} width={CARD} />
                {badge > 0 && (
                  <div style={{ position: 'absolute', right: -14, top: -14, padding: '4px 11px', borderRadius: 12, background: GREEN.face, color: '#07140e', fontFamily: FONT.display, fontWeight: 900, fontSize: 22, transform: `scale(${badge})`, boxShadow: '0 6px 16px rgba(0,0,0,.4)' }}>×{count}</div>
                )}
              </div>
              {info > 0 && (
                <div style={{ position: 'absolute', left: to.x, top: to.y + CARD * 1.4 + 12, width: CARD + 6, opacity: info, fontSize: 19, lineHeight: 1.3, color: '#9aa59f', fontVariantNumeric: 'tabular-nums', transform: `translateY(${(1 - info) * 8}px)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><EyeIcon /><b style={{ color: '#e6ebe8', fontWeight: 600 }}>{number.format(Math.round(card.views * tally))}</b></div>
                  <div style={{ color: GREEN.face, fontWeight: 700 }}>≈ {Math.round(card.price * tally)} WB</div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </Panel>
    </Feature>
  );
};
