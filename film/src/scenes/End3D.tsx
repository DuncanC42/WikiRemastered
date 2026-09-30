import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { World } from '../three/World';
import { ending } from '../three/scripts';
import { CORAL, FONT, GREEN } from '../brand/tokens';
import { ease, ramp } from '../lib/anim';
import { Headline, Scrim } from '../fx/Text';
import { END_CUES } from '../cues';

/* The ending, in 3D: every colour at once, the floor tiles itself ("Tout s'emboîte."), goes back
   into the ground from the middle out, the icon stays, the words rise; where to get it. */
export const END_LENGTH = 420;
export const END_WORDS = END_CUES.words; // The words start rising (3.35 s in the ending's script).
export const END_CTA = END_CUES.cta;

export const End3D: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const enter = ramp(frame, 0, 20);
  const cta = ramp(frame, END_CTA, 24, ease.out);
  const fine = ramp(frame, END_CTA + 14, 24, ease.out);
  const fade = ramp(frame, END_LENGTH - 30, 30, ease.inSoft);
  return (
    <AbsoluteFill style={{ opacity: enter, background: '#0b0c0c' }}>
      <ThreeCanvas width={width} height={height} shadows flat dpr={1} gl={{ antialias: true }} camera={{ fov: 30, near: 0.1, far: 80, position: [0, 6, 6] }}>
        <World script={ending} seed="end" />
      </ThreeCanvas>
      <Scrim opacity={0.8 * ramp(frame, 60, 18) * (1 - ramp(frame, 134, 18))} top={330} height={420} />
      <Headline lines={[[{ text: 'Tout s’' }, { text: 'emboîte', ink: GREEN }, { text: '.', ink: CORAL }]]} at={END_CUES.headline} exit={END_CUES.headline + 66} size={176} align="center" style={{ left: 0, right: 0, top: 440 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 752, display: 'flex', justifyContent: 'center', opacity: cta, transform: `translateY(${(1 - cta) * 24}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 30px', borderRadius: 16, background: '#f3f6f2', color: '#0c0d0c', fontFamily: FONT.ui, fontWeight: 700, fontSize: 30, boxShadow: '0 18px 40px rgba(0,0,0,.45)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          Gratuit sur le Chrome Web Store
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 846, textAlign: 'center', fontFamily: FONT.ui, fontWeight: 500, fontSize: 23, color: '#8a948f', opacity: fine, transform: `translateY(${(1 - fine) * 16}px)` }}>
        Open source · Extension non officielle pour Wiki Masters
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: fade }} />
    </AbsoluteFill>
  );
};
