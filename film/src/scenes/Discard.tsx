import React from 'react';
import { useCurrentFrame } from 'remotion';
import { REAL } from '../cards/catalog';
import { RealCard } from '../cards/RealCard';
import { CORAL, FONT, GREEN } from '../brand/tokens';
import { ease, lerp, ramp, springAt } from '../lib/anim';
import { Feature, panelMotion } from '../fx/Feature';
import { Cursor, Panel, Pill, Ripple } from '../fx/Ui';
import { DISCARD_CUES } from '../cues';

/* The bulk discard: the cards nobody looks at (under 30 views in 30 days, common or uncommon)
   are marked, favourites and cards in a trade stay protected; one click, and they are gone. */
export const DISCARD_LENGTH = 240;
const ITEMS = ['paperclip', 'machu', 'peg', 'cone', 'eiffel', 'roundabout', 'brick', 'colosseum', 'can', 'ada', 'pylon', 'canyon'];
const USELESS = new Set(['paperclip', 'peg', 'cone', 'roundabout', 'brick', 'can', 'pylon']);
const KEPT = ITEMS.filter(key => !USELESS.has(key));
const PROTECTED: Record<string, string> = { eiffel: '★ Favori', ada: 'En échange' };
const CARD = 136;
const slot = (index: number) => ({ x: 44 + (index % 4) * 188, y: 212 + Math.floor(index / 4) * 232 });
const MARK = DISCARD_CUES.mark;
export const DISCARD_CLICK = DISCARD_CUES.click;

export const Discard: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = ramp(frame, MARK, 16, ease.out);
  const press = Math.max(0, 1 - Math.abs(frame - DISCARD_CLICK) / 6);
  const button = { x: 1652, y: 254 };
  const done = springAt(frame, DISCARD_CLICK + 60, { damping: 12, stiffness: 180 });
  return (
    <Feature tag="Défausse groupée" tagColor={CORAL.face} glow="#ff5a4c" lines={[[{ text: 'Défaussez' }], [{ text: 'l’' }, { text: 'inutile', ink: GREEN }, { text: '.', ink: CORAL }]]} length={DISCARD_LENGTH}>
      <Panel style={{ left: 1020, top: 104, width: 800, height: 872, transform: panelMotion(frame, DISCARD_LENGTH), transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'absolute', left: 44, top: 36, fontWeight: 700, fontSize: 32 }}>Défausse groupée</div>
        <div style={{ position: 'absolute', left: 44, top: 84, fontSize: 18, color: '#9aa59f' }}>Favoris, cartes en échange et mots protégés sont toujours conservés.</div>
        <div style={{ position: 'absolute', left: 44, right: 40, top: 128, display: 'flex', alignItems: 'center', gap: 12, fontSize: 19 }}>
          <Pill style={{ padding: '10px 16px', fontSize: 19 }}>Seuil <b style={{ color: '#fff' }}>30 vues</b></Pill>
          {['C', 'PC'].map(r => <Pill key={r} tone="green" style={{ padding: '10px 14px', fontSize: 19, boxShadow: 'none' }}>{r}</Pill>)}
          {['R', 'SR'].map(r => <Pill key={r} style={{ padding: '10px 14px', fontSize: 19, opacity: 0.5 }}>{r}</Pill>)}
          <div style={{ marginLeft: 'auto' }}>
            <Pill tone="blue" press={press} style={{ padding: '10px 18px', fontSize: 20 }}>{frame < DISCARD_CLICK + 20 ? `Défausser ${USELESS.size} cartes` : 'Défausse…'}</Pill>
          </div>
        </div>
        {ITEMS.map((key, index) => {
          const card = REAL[key];
          const useless = USELESS.has(key);
          const from = slot(index);
          const order = useless ? [...USELESS].indexOf(key) : KEPT.indexOf(key);
          const gone = useless ? ramp(frame, DISCARD_CLICK + 8 + order * 4, 26, ease.in) : 0;
          const move = useless ? 0 : ramp(frame, DISCARD_CLICK + 44 + order * 3, 36, ease.inOut);
          const to = useless ? from : slot(order);
          const x = lerp(from.x, to.x, move);
          const y = lerp(from.y, to.y, move) + gone * 90;
          const tag = PROTECTED[key];
          if (gone >= 1) return null;
          return (
            <div key={key} style={{ position: 'absolute', left: x, top: y, opacity: 1 - gone, transform: `scale(${1 - gone * 0.35}) rotate(${gone * (order % 2 ? 12 : -12)}deg)`, filter: `drop-shadow(0 10px 14px rgba(0,0,0,.45))${useless && mark ? ` saturate(${1 - mark * 0.6}) brightness(${1 - mark * 0.25})` : ''}` }}>
              <RealCard card={card} width={CARD} />
              {useless && mark > 0 && (
                <>
                  <div style={{ position: 'absolute', inset: -4, borderRadius: 12, border: `3px solid ${CORAL.face}`, opacity: mark, boxShadow: `0 0 18px rgba(255,90,76,${0.5 * mark})` }} />
                  <div style={{ position: 'absolute', left: '50%', bottom: -14, transform: `translateX(-50%) scale(${mark})`, padding: '3px 10px', borderRadius: 10, background: CORAL.face, color: '#fff', fontFamily: FONT.ui, fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>{card.views} vues</div>
                </>
              )}
              {tag && mark > 0 && (
                <div style={{ position: 'absolute', left: '50%', bottom: -14, transform: `translateX(-50%) scale(${mark})`, padding: '3px 10px', borderRadius: 10, background: '#1f2d45', color: '#8ec1ff', border: '1px solid #3b5f95', fontFamily: FONT.ui, fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>{tag}</div>
              )}
            </div>
          );
        })}
        {done > 0 && (
          <div style={{ position: 'absolute', left: 44, bottom: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderRadius: 16, background: 'rgba(61,220,151,.14)', border: '1px solid rgba(61,220,151,.5)', color: GREEN.face, fontWeight: 700, fontSize: 22, transform: `scale(${done})`, transformOrigin: 'left center' }}>
            ✓ {USELESS.size} cartes défaussées · protégées conservées
          </div>
        )}
      </Panel>
      <Ripple x={button.x} y={button.y} t={(frame - DISCARD_CLICK) / 22} />
      <Cursor x={lerp(1780, button.x - 4, ramp(frame, 60, DISCARD_CLICK - 64, ease.inOut))} y={lerp(900, button.y - 4, ramp(frame, 60, DISCARD_CLICK - 64, ease.inOut))} press={press} opacity={ramp(frame, 60, 10) * (1 - ramp(frame, DISCARD_CLICK + 30, 14))} />
    </Feature>
  );
};
