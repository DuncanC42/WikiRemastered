import * as THREE from 'three';

/* The brand's material: matte, coloured by the geometry's vertex colours (and an instance colour,
   for the floor), with a print grain: fine light and dark specks fixed to the object. */
export function printMaterial({ roughness = 0.62, grain = 1 }: { roughness?: number; grain?: number } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.uniforms.grainAmount = { value: grain };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrain;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrain = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGrain;
uniform float grainAmount;
float grainHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Grain about two pixels wide at any distance: the cell size follows the screen, in powers of
  // two, blended, so it never swims as the camera moves.
  float px = max(length(fwidth(vGrain)), 1e-6);
  float level = log2(1.0 / (px * 2.0));
  float f0 = exp2(floor(level));
  float blend = fract(level);
  float fine = mix(grainHash(floor(vGrain * f0)), grainHash(floor(vGrain * f0 * 2.0)), blend);
  float speck = mix(grainHash(floor(vGrain * f0 * 0.5) + 11.0), grainHash(floor(vGrain * f0) + 11.0), blend);
  diffuseColor.rgb *= 1.0 + (fine - 0.5) * 0.09 * grainAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, step(0.975, speck) * 0.7 * grainAmount);
  diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), diffuseColor.rgb * 1.35 + 0.04), step(0.985, 1.0 - speck) * 0.55 * grainAmount);
}`);
  };
  return material;
}
