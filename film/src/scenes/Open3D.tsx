import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { World } from '../three/World';
import { opening } from '../three/scripts';
import { ease, ramp } from '../lib/anim';

export const OPEN_LENGTH = 420;

/* 0:00 The opening, in 3D: the piece, the floor's wave, the icon and the menu's lockup. */
export const Open3D: React.FC = () => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const out = ramp(frame, OPEN_LENGTH - 24, 24, ease.inSoft);
  return (
    <AbsoluteFill style={{ background: '#0b0c0c', opacity: 1 - out }}>
      <ThreeCanvas width={width} height={height} shadows flat dpr={1} gl={{ antialias: true }} camera={{ fov: 30, near: 0.1, far: 80, position: [0, 6, 6] }}>
        <World script={opening} seed="open" />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
