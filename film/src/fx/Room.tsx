import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { rand } from '../lib/anim';

// The graphite room: a soft pool of light in the middle, dark corners.
export const Room: React.FC<{ glow?: string; glowStrength?: number; x?: number; y?: number }> = ({ glow = '#3ddc97', glowStrength = 0, x = 50, y = 50 }) => (
  <AbsoluteFill style={{ background: '#0b0c0b' }}>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 80% at ${x}% ${y}%, #1b1f1d 0%, #121413 45%, #080908 100%)` }} />
    {glowStrength > 0 && (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 40% 45% at ${x}% ${y}%, ${glow} 0%, transparent 70%)`, opacity: glowStrength, mixBlendMode: 'screen' }} />
    )}
  </AbsoluteFill>
);

// Film grain over everything, moving every frame, and a vignette.
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const x = Math.floor(rand(`gx${frame}`) * 384);
  const y = Math.floor(rand(`gy${frame}`) * 384);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)' }} />
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile('fx-grain.png')})`,
          backgroundPosition: `${x}px ${y}px`,
          opacity: 0.09,
          mixBlendMode: 'overlay',
        }}
      />
      <Img src={staticFile('fx-grain.png')} style={{ display: 'none' }} />
    </AbsoluteFill>
  );
};
