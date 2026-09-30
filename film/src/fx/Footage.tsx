import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Edit, sourceAt } from '../edit';

/* A captured take, at a frame of the scene, filmed by a camera that can move in: `zoom` about the
   point (x, y) of the frame (film pixels). */
export type Shot = { zoom: number; x: number; y: number; dx?: number; dy?: number };
export const shotTransform = ({ zoom, x, y, dx = 0, dy = 0 }: Shot) => `translate(${dx}px, ${dy}px) translate(${x}px, ${y}px) scale(${zoom}) translate(${-x}px, ${-y}px)`;
// Where a point of the capture (film pixels, unzoomed) lands on screen.
export const throughShot = ({ zoom, x, y, dx = 0, dy = 0 }: Shot, [px, py]: [number, number]): [number, number] => [x + (px - x) * zoom + dx, y + (py - y) * zoom + dy];

export const Footage: React.FC<{ edit: Edit; frame: number; shot: Shot; style?: React.CSSProperties }> = ({ edit, frame, shot, style }) => {
  const source = sourceAt(edit, frame);
  return (
    <AbsoluteFill style={{ background: '#0b0c0c', overflow: 'hidden', ...style }}>
      <Img src={staticFile(`capture/${edit.take}/f${String(source).padStart(5, '0')}.jpg`)} style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: shotTransform(shot) }} />
    </AbsoluteFill>
  );
};
