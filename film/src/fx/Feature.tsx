import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ease, ramp } from '../lib/anim';
import { Room } from './Room';
import { Headline, Line, Tag } from './Text';

/* A feature scene: its name and a headline on the left, the interface on the right, on a panel
   turned a little towards the middle of the frame. */
export const Feature: React.FC<{ tag: string; tagColor: string; lines: Line[]; length: number; glow?: string; size?: number; children: React.ReactNode }> = ({ tag, tagColor, lines, length, glow = '#3ddc97', size = 96, children }) => {
  const frame = useCurrentFrame();
  const enter = ramp(frame, 0, 24, ease.out);
  const out = ramp(frame, length - 18, 18, ease.inSoft);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out) }}>
      <Room glow={glow} glowStrength={0.1} x={72} y={50} />
      <Tag text={tag} color={tagColor} at={6} exit={length - 26} style={{ left: 112, top: 380 }} />
      <Headline lines={lines} at={10} lineGap={20} exit={length - 28} size={size} style={{ left: 104, top: 436 }} />
      <AbsoluteFill style={{ perspective: 2600 }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// The panel of the interface, swinging in and turned towards the middle.
export const panelMotion = (frame: number, length: number) => {
  const enter = ramp(frame, 0, 34, ease.out);
  return `translateX(${(1 - enter) * 160}px) rotateY(${-11 + enter * 2 + frame * 0.012}deg) rotateX(3deg)`;
};

export const Switch: React.FC<{ on: number }> = ({ on }) => (
  <span style={{ position: 'relative', display: 'inline-block', width: 52, height: 30, borderRadius: 15, background: on > 0.5 ? '#3ddc97' : '#2c3230', transition: 'none' }}>
    <span style={{ position: 'absolute', top: 4, left: 4 + on * 22, width: 22, height: 22, borderRadius: 11, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.3)' }} />
  </span>
);

export const EyeIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
