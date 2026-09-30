import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CAPTURE_SCALE, lengthOf, PACK, startOf } from '../edit';
import { CORAL, GREEN } from '../brand/tokens';
import { ease, lerp, ramp, shake } from '../lib/anim';
import { Footage, Shot, throughShot } from '../fx/Footage';
import { Headline, Scrim } from '../fx/Text';
import { Cursor, Ripple } from '../fx/Ui';

/* The pack opening, filmed from the extension itself (scripts/capture.mjs): the pack arrives, a
   click on "Ouvrir le paquet", the scissors, the light, the cards; the legendary's staging; the
   summary. The camera moves in on the cut and on the legendary. */
export const PACK_LENGTH = lengthOf(PACK);
const READY = startOf(PACK, 'ready');
const OPEN = startOf(PACK, 'open');
const CHARGE = startOf(PACK, 'charge');
const LEGEND = startOf(PACK, 'legend');
const SUMMARY = startOf(PACK, 'summary');
const BUTTON: [number, number] = [720 * CAPTURE_SCALE, 760 * CAPTURE_SCALE];

export const PackFootage: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = ramp(frame, 0, 18, ease.out);
  const out = ramp(frame, PACK_LENGTH - 16, 16, ease.inSoft);
  // The camera: a slow push while the pack waits, in close on the top as it is cut, back out for
  // the light; a push on the legendary in the dark, which snaps back as it turns over.
  const wait = ramp(frame, 0, OPEN, ease.inOut);
  const cut = ramp(frame, OPEN + 6, 26, ease.inOut) * (1 - ramp(frame, OPEN + 52, 44, ease.inOut));
  const charge = ramp(frame, CHARGE, LEGEND - CHARGE + 8, ease.inSoft) * (1 - ramp(frame, LEGEND + 8, 18, ease.out));
  const shot: Shot = {
    zoom: lerp(1.12, 1, enter) + wait * 0.06 * (1 - ramp(frame, OPEN, 20)) + cut * 0.34 + charge * 0.16,
    x: 960,
    y: lerp(560, 300, cut) + charge * -60,
    dx: shake(frame, LEGEND + 10, 20, 7),
    dy: shake(frame, LEGEND + 10, 20, 5, 2),
  };
  // A pointer comes in and clicks "Ouvrir le paquet".
  const press = Math.max(0, 1 - Math.abs(frame - OPEN) / 6);
  const toButton = ramp(frame, OPEN - 44, 38, ease.inOut);
  const [bx, by] = throughShot(shot, BUTTON);
  const cursor: [number, number] = [lerp(1500, bx - 6, toButton), lerp(1180, by - 4, toButton)];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out) }}>
      <Footage edit={PACK} frame={frame} shot={shot} />
      <Ripple x={bx} y={by} t={(frame - OPEN) / 22} color={GREEN.face} />
      <Cursor x={cursor[0]} y={cursor[1]} press={press} opacity={ramp(frame, OPEN - 44, 10) * (1 - ramp(frame, OPEN + 14, 12))} />
      <Scrim opacity={0.55 * ramp(frame, READY, 20) * (1 - ramp(frame, OPEN - 8, 16))} top={260} height={560} />
      <Headline lines={[[{ text: 'Ouvrir un paquet' }], [{ text: 'devient un ' }, { text: 'moment', ink: GREEN }, { text: '.', ink: CORAL }]]} at={READY + 6} lineGap={22} exit={OPEN - 10} size={60} style={{ left: 96, top: 452 }} />
      <Headline lines={[[{ text: 'Les plus rares' }], [{ text: 'ont leur' }], [{ text: 'mise en scène', ink: GREEN }, { text: '.', ink: CORAL }]]} at={CHARGE + 4} lineGap={18} exit={LEGEND + 30} size={64} style={{ left: 104, top: 390 }} />
    </AbsoluteFill>
  );
};
export const PACK_CUES = { open: OPEN, legend: LEGEND, summary: SUMMARY, charge: CHARGE };
