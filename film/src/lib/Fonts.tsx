import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '@fontsource-variable/inter';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

// Holds the render until the faces are loaded, so no frame is drawn in a fallback font.
export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    Promise.all(['900 100px Rubik', '700 100px Rubik', '500 100px Rubik', '400 40px "Inter Variable"', '700 40px "Inter Variable"', '500 40px Outfit', '700 40px Outfit', '800 40px Outfit'].map(font => document.fonts.load(font)))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle));
  }, [handle]);
  return <>{children}</>;
};
