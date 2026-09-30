import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Grain } from './fx/Room';
import { FontGate } from './lib/Fonts';
import { Open3D } from './scenes/Open3D';
import { PackFootage } from './scenes/PackFootage';
import { DesignFootage } from './scenes/DesignFootage';
import { Collection } from './scenes/Collection';
import { Discard } from './scenes/Discard';
import { Market } from './scenes/Market';
import { End3D } from './scenes/End3D';
import { SCENES } from './timeline';

const at = ([from, to]: readonly [number, number]) => ({ from, durationInFrames: to - from });

export const Film: React.FC = () => (
  <FontGate>
    <AbsoluteFill style={{ background: '#0b0c0c' }}>
      <Sequence {...at(SCENES.open)} name="Opening (3D)">
        <Open3D />
      </Sequence>
      <Sequence {...at(SCENES.pack)} name="Pack opening (capture)">
        <PackFootage />
      </Sequence>
      <Sequence {...at(SCENES.design)} name="Design (capture)">
        <DesignFootage />
      </Sequence>
      <Sequence {...at(SCENES.collection)} name="Collection +">
        <Collection />
      </Sequence>
      <Sequence {...at(SCENES.discard)} name="Discard">
        <Discard />
      </Sequence>
      <Sequence {...at(SCENES.market)} name="Market +">
        <Market />
      </Sequence>
      <Sequence {...at(SCENES.end)} name="Ending (3D)">
        <End3D />
      </Sequence>
      <Grain />
      <Audio src={staticFile('audio/soundtrack.wav')} />
    </AbsoluteFill>
  </FontGate>
);
