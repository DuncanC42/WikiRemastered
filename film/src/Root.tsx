import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { FontGate } from './lib/Fonts';
import { Open3D } from './scenes/Open3D';
import { FPS, HEIGHT, TOTAL, WIDTH } from './timeline';

const Lab3D: React.FC = () => (
  <FontGate>
    <Open3D />
  </FontGate>
);

export const Root: React.FC = () => (
  <>
    <Composition id="WikiRemastered" component={Film} durationInFrames={TOTAL} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Lab3D" component={Lab3D} durationInFrames={420} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
