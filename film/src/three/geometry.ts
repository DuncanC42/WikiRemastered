/* Solids for the 3D scenes: the brand's jigsaw pieces and letters, extruded with a rounded bevel
   and coloured like its 2D solids (a lit face, and sides going from a near shade to a far one),
   lying on the ground: y is up, the shape's top (its SVG top) points to -z. */
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import PIECES from '../brand/pieces.json';
import GLYPHS from '../brand/glyphs.json';

export type Tones = { face: string; near: string; far: string; rim?: string };
const OUTLINES = PIECES as Record<string, string>;

// A jigsaw outline (pieces.json: 100 wide, centred, SVG y-down) as a shape one unit wide, y up.
export function pieceShape(tabs: string): THREE.Shape {
  const numbers = OUTLINES[tabs].match(/-?\d+(\.\d+)?/g)!.map(Number);
  const points: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push(new THREE.Vector2(numbers[i] / 100, -numbers[i + 1] / 100));
  return new THREE.Shape(points);
}

type Glyph = { text: string; d: string; width: number; box: [number, number, number, number] };
const FONT = GLYPHS as unknown as { capHeight: number; words: Glyph[] };
export const glyph = (text: string) => FONT.words.find(word => word.text === text)!;
export const CAP_HEIGHT = FONT.capHeight;

/* A glyph path as shapes, through the SVG matrix (a b c d e f), which also flips y: points in
   font units come out in shape units (y up). Each outer contour is its own shape (a letter, or
   the dot of an i), holes included. */
export function glyphShapes(d: string, matrix: [number, number, number, number, number, number]): THREE.Shape[] {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" transform="matrix(${matrix.join(' ')})"/></svg>`);
  return data.paths.flatMap(path => SVGLoader.createShapes(path));
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Extrudes shapes into a solid lying on the ground (bottom at y = 0), with vertex colours: the
   face on top, the rim along its upper bevel, the sides from near (top) to far (bottom). Without
   `tones`, the colours are shades of white, to be tinted per instance. */
export function solid(shapes: THREE.Shape[], { depth, bevel, segments = 3, curveSegments = 10, tones }: { depth: number; bevel: number; segments?: number; curveSegments?: number; tones?: Tones }) {
  const extruded = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelOffset: -bevel * 0.9, bevelSegments: segments, curveSegments, steps: 1 });
  extruded.rotateX(-Math.PI / 2);
  extruded.translate(0, bevel, 0);
  extruded.deleteAttribute('uv');
  const geometry = toCreasedNormals(extruded, Math.PI / 5);
  flattenCaps(geometry);
  const height = depth + bevel * 2;
  const face = new THREE.Color(tones?.face ?? '#ffffff');
  const rim = new THREE.Color(tones?.rim ?? tones?.face ?? '#ffffff');
  const near = new THREE.Color(tones?.near ?? '#8c8c8c');
  const far = new THREE.Color(tones?.far ?? '#3a3a3a');
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const side = new THREE.Color();
  const out = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const up = normal.getY(i);
    const u = Math.min(1, Math.max(0, position.getY(i) / height));
    side.copy(far).lerp(near, u);
    out.copy(side).lerp(rim, smooth(0.15, 0.6, up) * smooth(0.55, 1, u));
    out.lerp(face, smooth(0.62, 0.92, up));
    colors.set([out.r, out.g, out.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// The caps are flat: their normals straight up (or down), whatever the smoothing did at their rim,
// so their big triangles never show.
function flattenCaps(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (Math.abs(face.y) > 0.9999) for (let k = 0; k < 3; k += 1) normal.setXYZ(i + k, 0, Math.sign(face.y), 0);
  }
  normal.needsUpdate = true;
}

// The middle of a geometry's footprint, and its size.
export function footprint(geometry: THREE.BufferGeometry) {
  const box = geometry.boundingBox!;
  return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, width: box.max.x - box.min.x, height: box.max.y };
}
