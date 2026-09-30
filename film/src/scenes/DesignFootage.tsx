import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CAPTURE_SCALE, DESIGN, frameOf, lengthOf } from '../edit';
import { CORAL, GREEN } from '../brand/tokens';
import { ease, lerp, ramp } from '../lib/anim';
import { Footage, Shot, throughShot } from '../fx/Footage';
import { Headline } from '../fx/Text';
import { Cursor, Ripple } from '../fx/Ui';

/* The design switch, filmed from the extension: three clicks on "Changer de design", and the pack
   turns right round each time, from the puzzle to the green, the globe and the dark foil. */
export const DESIGN_LENGTH = lengthOf(DESIGN);
export const DESIGN_CLICKS = [91, 181, 271].map(source => frameOf(DESIGN, source));
const BUTTON: [number, number] = [1119.25 * CAPTURE_SCALE, 34 * CAPTURE_SCALE];

export const DesignFootage: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = ramp(frame, 0, 16, ease.out);
  const out = ramp(frame, DESIGN_LENGTH - 16, 16, ease.inSoft);
  const shot: Shot = { zoom: lerp(1.06, 1.0, ramp(frame, 0, DESIGN_LENGTH, ease.inOut)), x: 960, y: 480 };
  const press = Math.max(0, ...DESIGN_CLICKS.map(at => 1 - Math.abs(frame - at) / 6));
  const [first, , last] = DESIGN_CLICKS;
  const toButton = ramp(frame, 0, first - 4, ease.inOut);
  const [bx, by] = throughShot(shot, BUTTON);
  // Between clicks the pointer rests just below the button; after the last it goes.
  const rest = Math.sin(Math.PI * Math.min(1, Math.max(0, ((frame - first) % 90) / 90))) * (frame > first && frame < last ? 1 : 0);
  const away = ramp(frame, last + 16, 40, ease.inOut);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out) }}>
      <Footage edit={DESIGN} frame={frame} shot={shot} />
      {DESIGN_CLICKS.map(at => <Ripple key={at} x={bx} y={by} t={(frame - at) / 22} />)}
      <Cursor x={lerp(lerp(1700, bx - 6, toButton), 1760, away) + rest * 18} y={lerp(lerp(620, by - 2, toButton), 700, away) + rest * 46} press={press} opacity={1 - ramp(frame, last + 40, 16)} />
      <Headline lines={[[{ text: 'Votre paquet,' }], [{ text: 'votre ' }, { text: 'style', ink: GREEN }, { text: '.', ink: CORAL }]]} at={10} lineGap={22} exit={DESIGN_LENGTH - 26} size={84} style={{ left: 104, top: 430 }} />
    </AbsoluteFill>
  );
};
