import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { random, useCurrentFrame } from 'remotion';
import { CAP_HEIGHT, glyph, glyphShapes, pieceShape, solid, Tones } from './geometry';
import { printMaterial } from './material';

/* The 3D puzzle world of the opening and the ending: a floor of interlocking pieces that rises out
   of the dark ground in waves, the icon's piece in the middle of it (the W and the plus land on
   it), and the two-line wordmark beside it, as in the site's menu. What moves, and the camera,
   come from a script: pure functions of the time in seconds. */

export const LEAN = Math.tan((6 * Math.PI) / 180);
const TONES: Record<string, Tones> = {
  green: { face: '#3ddc97', rim: '#b4f7d8', near: '#1c9e68', far: '#0a4a31' },
  white: { face: '#f3f6f2', rim: '#ffffff', near: '#9db3a8', far: '#3f4f47' },
  raised: { face: '#f6faf7', rim: '#ffffff', near: '#138557', far: '#0a4a31' },
  coral: { face: '#ff5a4c', rim: '#ffb3a8', near: '#c23b3b', far: '#6e1f1f' },
};
const ACCENTS = ['#3ddc97', '#ff5a4c', '#f2b23a', '#5146e8', '#ff8cc6', '#6fc3ff'];
const GRAPHITE = '#1b201e';

// The icon, in piece units (its square is 1 wide), from scripts/brand.mjs.
export const ICON = {
  depth: 0.2,
  bevel: 0.035,
  turn: (6 * Math.PI) / 180, // The icon is turned 6° anticlockwise.
  w: { at: [4 / 76, -2 / 76], height: 42 / 76, depth: 0.07, bevel: 0.014 },
  plus: { at: [42.76 / 76, -41.62 / 76], height: 27 / 76, depth: 0.09, bevel: 0.018, turn: (-8 * Math.PI) / 180 },
};
// The lockup of the menu (brand.mjs, staggered): words left at 0.705, baselines at -0.085 and
// 0.578, capitals 0.562 tall, leaning about the line between them (z = -0.035).
export const WORDS = { left: 0.705, baselines: [-0.085, 0.578], cap: 0.562, middle: -0.035, depth: 0.09, bevel: 0.015, right: 6.04 };
export const HEIGHT = ICON.depth + ICON.bevel * 2;

export type Cell = { col: number; row: number; x: number; z: number; d: number; seed: number; tabs: string; color: string };
export type Piece = { y: number; tiltX?: number; tiltZ?: number; scale?: number };
export type Letter = { word: number; index: number; x: number };
export type Script = {
  camera(t: number): { position: [number, number, number]; target: [number, number, number]; fov?: number };
  floor(t: number, cell: Cell): Piece | null;
  hero(t: number): { y: number; rotation?: [number, number, number]; squash?: number } | null;
  w(t: number): { y: number; scale?: number } | null;
  plus(t: number): { y: number; spin?: number; scale?: number } | null;
  letter(t: number, letter: Letter): { y: number } | null;
  accents?: number; // Share of coloured pieces in the floor.
  light?(t: number): number; // Turns the key light about the vertical, in radians.
};

// A floor of cols × rows interlocking pieces around the middle cell, which is the icon's
// (its tabs out at the top and right, in at the bottom and left).
export function floorCells(cols: number, rows: number, accents: number, seed: string): Cell[] {
  const [cc, cr] = [Math.floor(cols / 2), Math.floor(rows / 2)];
  const H = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (random(`${seed}h${r}-${c}`) > 0.5 ? 1 : -1)));
  const V = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (random(`${seed}v${r}-${c}`) > 0.5 ? 1 : -1)));
  V[cr - 1][cc] = -1;
  H[cr][cc] = 1;
  V[cr][cc] = -1;
  H[cr][cc - 1] = 1;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c === cc && r === cr) continue;
      const tabs = [r > 0 ? -V[r - 1][c] : 1, H[r][c], V[r][c], c > 0 ? -H[r][c - 1] : 1].join(',');
      const accent = random(`${seed}a${r}-${c}`) < accents;
      cells.push({ col: c - cc, row: r - cr, x: c - cc, z: r - cr, d: Math.hypot(c - cc, r - cr), seed: random(`${seed}s${r}-${c}`), tabs, color: accent ? ACCENTS[Math.floor(random(`${seed}i${r}-${c}`) * ACCENTS.length)] : GRAPHITE });
    }
  }
  return cells;
}

const Floor: React.FC<{ script: Script; t: number; cells: Cell[]; material: THREE.Material }> = ({ script, t, cells, material }) => {
  const groups = useMemo(() => {
    const byTabs = new Map<string, Cell[]>();
    for (const cell of cells) byTabs.set(cell.tabs, [...(byTabs.get(cell.tabs) ?? []), cell]);
    return [...byTabs.entries()].map(([tabs, list]) => ({ tabs, list, geometry: solid([pieceShape(tabs)], { depth: ICON.depth, bevel: ICON.bevel, tones: { face: '#ffffff', rim: '#ffffff', near: '#8d938f', far: '#3b403d' } }) }));
  }, [cells]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    groups.forEach((group, index) => {
      const mesh = meshes.current[index];
      if (!mesh) return;
      group.list.forEach((cell, k) => mesh.setColorAt(k, new THREE.Color(cell.color)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [groups]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => {
    groups.forEach((group, index) => {
      const mesh = meshes.current[index];
      if (!mesh) return;
      group.list.forEach((cell, k) => {
        const pose = script.floor(t, cell);
        if (!pose || pose.y < -HEIGHT - 0.2) {
          matrix.makeScale(0, 0, 0);
        } else {
          e.set(pose.tiltX ?? 0, 0, pose.tiltZ ?? 0);
          q.setFromEuler(e);
          v.set(cell.x, pose.y, cell.z);
          const k2 = pose.scale ?? 1;
          s.set(k2, k2, k2);
          matrix.compose(v, q, s);
        }
        mesh.setMatrixAt(k, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  });
  return (
    <group rotation={[0, ICON.turn, 0]}>
      {groups.map((group, index) => (
        <instancedMesh key={group.tabs} ref={node => { meshes.current[index] = node; }} args={[group.geometry, material, group.list.length]} castShadow receiveShadow frustumCulled={false} />
      ))}
    </group>
  );
};

export const World: React.FC<{ script: Script; seed?: string }> = ({ script, seed = 'floor' }) => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  const { camera, scene } = useThree();
  const material = useMemo(() => printMaterial(), []);
  const cells = useMemo(() => floorCells(27, 21, script.accents ?? 0.14, seed), [script.accents, seed]);

  const hero = useMemo(() => solid([pieceShape('1,1,-1,-1')], { depth: ICON.depth, bevel: ICON.bevel, tones: TONES.green }), []);
  const wGeometry = useMemo(() => {
    const W = glyph('W');
    const [left, top, right, bottom] = W.box;
    const scale = ICON.w.height / (bottom - top);
    const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
    return solid(glyphShapes(W.d, [scale, 0, -LEAN * scale, -scale, -scale * cx + LEAN * scale * cy, scale * cy]), { depth: ICON.w.depth, bevel: ICON.w.bevel, tones: TONES.raised, curveSegments: 8 });
  }, []);
  const plusGeometry = useMemo(() => {
    const plus = glyph('+');
    const [left, top, right, bottom] = plus.box;
    const scale = ICON.plus.height / (bottom - top);
    const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
    return solid(glyphShapes(plus.d, [scale, 0, 0, -scale, -scale * cx, scale * cy]), { depth: ICON.plus.depth, bevel: ICON.plus.bevel, tones: TONES.coral, curveSegments: 4 });
  }, []);
  // The two words, one geometry per letter (per outer contour), to raise them one after another.
  const letters = useMemo(() => {
    const scale = WORDS.cap / CAP_HEIGHT;
    return ['Wiki', 'Remastered'].flatMap((text, word) => {
      const ty = -WORDS.baselines[word];
      const matrix: [number, number, number, number, number, number] = [scale, 0, -LEAN * scale, -scale, WORDS.left + LEAN * (ty + WORDS.middle), ty];
      return glyphShapes(glyph(text).d, matrix).map((shape, index) => {
        const geometry = solid([shape], { depth: WORDS.depth, bevel: WORDS.bevel, tones: word === 0 ? TONES.green : TONES.white, curveSegments: 8 });
        const box = geometry.boundingBox!;
        return { geometry, letter: { word, index, x: (box.min.x + box.max.x) / 2 } };
      });
    });
  }, []);

  // Ground, fog and the key light's shadow.
  useLayoutEffect(() => {
    scene.background = new THREE.Color('#0b0c0c');
    scene.fog = new THREE.Fog('#0b0c0c', 13, 32);
  }, [scene]);
  const key = useRef<THREE.DirectionalLight>(null);
  const cam = script.camera(t);
  useLayoutEffect(() => {
    const camera3 = camera as THREE.PerspectiveCamera;
    camera3.up.set(0, 0, -1);
    camera3.position.set(...cam.position);
    camera3.lookAt(...cam.target);
    if (cam.fov && camera3.fov !== cam.fov) {
      camera3.fov = cam.fov;
      camera3.updateProjectionMatrix();
    }
    const light = key.current;
    if (light) {
      const turn = script.light?.(t) ?? 0;
      const [tx, , tz] = cam.target;
      const [ax, az] = [-3.6 * Math.cos(turn) + 2.6 * Math.sin(turn), -2.6 * Math.cos(turn) - 3.6 * Math.sin(turn)];
      light.position.set(tx + ax, 8.5, tz + az);
      light.target.position.set(tx, 0, tz);
      light.target.updateMatrixWorld();
      const shadow = light.shadow.camera as THREE.OrthographicCamera;
      Object.assign(shadow, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 30 });
      shadow.updateProjectionMatrix();
    }
  });

  const heroPose = script.hero(t);
  const wPose = script.w(t);
  const plusPose = script.plus(t);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#27302b', 1.55]} />
      <directionalLight ref={key} intensity={1.8} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0008} shadow-normalBias={0.03} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#090a0a" roughness={1} metalness={0} />
      </mesh>
      <Floor script={script} t={t} cells={cells} material={material} />
      {heroPose && (
        <group position={[0, heroPose.y, 0]} rotation={[0, ICON.turn, 0]}>
          <group rotation={heroPose.rotation ?? [0, 0, 0]} scale={[1 / Math.sqrt(heroPose.squash ?? 1), heroPose.squash ?? 1, 1 / Math.sqrt(heroPose.squash ?? 1)]}>
            <mesh geometry={hero} material={material} castShadow receiveShadow />
            {wPose && (
              <mesh geometry={wGeometry} material={material} position={[ICON.w.at[0], HEIGHT + wPose.y, ICON.w.at[1]]} scale={wPose.scale ?? 1} castShadow receiveShadow />
            )}
          </group>
        </group>
      )}
      {plusPose && heroPose && (
        <mesh geometry={plusGeometry} material={material} position={[ICON.plus.at[0], heroPose.y + HEIGHT + plusPose.y, ICON.plus.at[1]]} rotation={[0, ICON.plus.turn + (plusPose.spin ?? 0), 0]} scale={plusPose.scale ?? 1} castShadow receiveShadow />
      )}
      {letters.map(({ geometry, letter }) => {
        const pose = script.letter(t, letter);
        if (!pose || pose.y < -WORDS.depth - WORDS.bevel * 2 - 0.01) return null;
        return <mesh key={`${letter.word}-${letter.index}`} geometry={geometry} material={material} position={[0, pose.y, 0]} castShadow receiveShadow />;
      })}
    </>
  );
};
