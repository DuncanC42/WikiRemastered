import React from 'react';
import { useCurrentFrame } from 'remotion';
import { REAL } from '../cards/catalog';
import { RealCard } from '../cards/RealCard';
import { CORAL, FONT, GREEN } from '../brand/tokens';
import { ease, lerp, ramp, springAt } from '../lib/anim';
import { Feature, panelMotion } from '../fx/Feature';
import { Cursor, Icon, Panel, Pill, Ripple } from '../fx/Ui';
import { MARKET_CUES } from '../cues';

/* Marché +: bidding in batches. A few keywords, a ceiling per card and a budget; the session is
   switched on, and the market's cards that match get their bids one after another, within the
   limits, while the budget fills up. */
export const MARKET_LENGTH = 240;
const KEYWORDS = ['volcan', 'planète', 'tour'];
const MARKET = [
  { key: 'fuji', bid: 45, left: '18 min', match: 0 },
  { key: 'lion', bid: 60, left: '9 min', match: -1 },
  { key: 'saturn', bid: 70, left: '24 min', match: 1 },
  { key: 'panda', bid: 25, left: '6 min', match: -1 },
  { key: 'eiffel', bid: 90, left: '27 min', match: 2 },
];
const STEP = 5; // A bid goes this much over the current one.
const BUDGET = 300;

export const Market: React.FC = () => {
  const frame = useCurrentFrame();
  const { chips, activate, bids, done } = MARKET_CUES;
  const on = frame >= activate + 4;
  const press = Math.max(0, 1 - Math.abs(frame - activate) / 6);
  const placed = bids.filter(at => frame >= at).length;
  const spent = MARKET.filter(card => card.match >= 0 && card.match < placed).reduce((sum, card) => sum + card.bid + STEP, 0);
  const shown = lerp(spent - (MARKET.find(card => card.match === placed - 1)?.bid ?? 0) - STEP, spent, placed ? ramp(frame, bids[placed - 1], 16, ease.out) : 1);
  const toast = springAt(frame, done, { damping: 12, stiffness: 180 });
  const button = { x: 1000 + 820 - 40 - 130, y: 186 + 268 };
  return (
    <Feature tag="Marché +" tagColor="#6fa8ff" glow="#2f7cf6" lines={[[{ text: 'Misez en lot,' }], [{ text: 'par ' }, { text: 'mots-clés', ink: GREEN }, { text: '.', ink: CORAL }]]} length={MARKET_LENGTH}>
      <Panel style={{ left: 1000, top: 186, width: 820, height: 720, transform: panelMotion(frame, MARKET_LENGTH) }}>
        <div style={{ position: 'absolute', left: 40, top: 30, fontWeight: 700, fontSize: 32, whiteSpace: 'nowrap' }}>Marché +</div>
        <div style={{ position: 'absolute', left: 40, top: 74, fontSize: 18, color: '#9aa59f', whiteSpace: 'nowrap' }}>Misez automatiquement sur les cartes qui vous intéressent, dans vos limites.</div>
        {/* Which cards: keywords as chips. */}
        <div style={{ position: 'absolute', left: 40, top: 114, fontSize: 19, fontWeight: 600, color: '#c9d2cd' }}>Quelles cartes ?</div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 146, display: 'flex', gap: 10, alignItems: 'center' }}>
          {KEYWORDS.map((word, index) => {
            const pop = springAt(frame, chips[index], { damping: 11, stiffness: 240 });
            return pop > 0 ? (
              <span key={word} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12, background: '#1f2d45', border: '1px solid #3b5f95', color: '#cfe3ff', fontWeight: 600, fontSize: 19, transform: `scale(${pop})` }}>
                {word} <span style={{ opacity: 0.6 }}>×</span>
              </span>
            ) : null;
          })}
          <span style={{ padding: '8px 14px', borderRadius: 12, border: '1px dashed #2c3230', color: '#6f7a75', fontSize: 18 }}>Ajouter un mot-clé</span>
        </div>
        {/* How much: a ceiling per card, a budget; and the switch. */}
        <div style={{ position: 'absolute', left: 40, top: 204, fontSize: 19, fontWeight: 600, color: '#c9d2cd' }}>Combien ?</div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 236, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Pill style={{ padding: '9px 14px', fontSize: 19 }}>Max par carte <b style={{ color: '#fff' }}>100 WB</b></Pill>
          <Pill style={{ padding: '9px 14px', fontSize: 19 }}>Budget total <b style={{ color: '#fff' }}>{BUDGET} WB</b></Pill>
          <div style={{ marginLeft: 'auto' }}>
            {on ? (
              <Pill tone="green" style={{ padding: '10px 18px', fontSize: 19, boxShadow: 'none' }}><span style={{ width: 9, height: 9, borderRadius: 5, background: '#07140e' }} /> Session active</Pill>
            ) : (
              <Pill tone="blue" press={press} style={{ padding: '10px 18px', fontSize: 19 }}>Activer les enchères</Pill>
            )}
          </div>
        </div>
        {/* The market: the cards that match are bid on, one after another. */}
        <div style={{ position: 'absolute', left: 40, right: 40, top: 316, display: 'flex', justifyContent: 'space-between' }}>
          {MARKET.map(({ key, bid, left, match }) => {
            const card = REAL[key];
            const hit = match >= 0 && frame >= bids[match];
            const pop = match >= 0 ? springAt(frame, bids[match], { damping: 10, stiffness: 220 }) : 0;
            const dim = match < 0 && on ? ramp(frame, activate + 6, 16) : 0;
            return (
              <div key={key} style={{ width: 132, opacity: 1 - dim * 0.55, filter: dim ? `saturate(${1 - dim * 0.7})` : undefined }}>
                <div style={{ position: 'relative', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,.45))' }}>
                  <RealCard card={card} width={132} />
                  {match >= 0 && on && <div style={{ position: 'absolute', inset: -4, borderRadius: 12, border: `3px solid ${hit ? GREEN.face : '#3b5f95'}`, boxShadow: hit ? '0 0 18px rgba(61,220,151,.55)' : undefined, opacity: ramp(frame, activate + 6, 12) }} />}
                  {pop > 0 && (
                    <div style={{ position: 'absolute', left: '50%', bottom: -14, transform: `translateX(-50%) scale(${pop})`, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 10, background: GREEN.face, color: '#07140e', fontFamily: FONT.ui, fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>
                      ✓ {bid + STEP} WB
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 20, fontSize: 17, lineHeight: 1.35, color: '#9aa59f' }}>
                  <div>Enchère <b style={{ color: hit ? GREEN.face : '#e6ebe8' }}>{hit ? bid + STEP : bid} WB</b></div>
                  <div>Fin dans {left}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* The budget, as it is used. */}
        <div style={{ position: 'absolute', left: 40, right: 40, top: 626 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: '#9aa59f' }}>
            <span>Budget engagé</span>
            <b style={{ color: '#e6ebe8', fontVariantNumeric: 'tabular-nums' }}>{Math.round(shown)} / {BUDGET} WB</b>
          </div>
          <div style={{ marginTop: 10, height: 12, borderRadius: 6, background: '#232826', overflow: 'hidden' }}>
            <div style={{ width: `${(shown / BUDGET) * 100}%`, height: '100%', borderRadius: 6, background: GREEN.face }} />
          </div>
        </div>
        {toast > 0 && (
          <div style={{ position: 'absolute', right: 40, top: 574, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 14, background: 'rgba(61,220,151,.14)', border: '1px solid rgba(61,220,151,.5)', color: GREEN.face, fontWeight: 700, fontSize: 19, transform: `scale(${toast})`, transformOrigin: 'right center' }}>
            {Icon.check} {bids.length} enchères placées en lot
          </div>
        )}
      </Panel>
      <Ripple x={button.x} y={button.y} t={(frame - activate) / 22} />
      <Cursor x={lerp(1760, button.x - 4, ramp(frame, activate - 40, 36, ease.inOut))} y={lerp(900, button.y - 4, ramp(frame, activate - 40, 36, ease.inOut))} press={press} opacity={ramp(frame, activate - 40, 10) * (1 - ramp(frame, activate + 26, 14))} />
    </Feature>
  );
};
