// Shared test setup: geometry engine + bundled font.
import Module from 'manifold-3d';
import { readFileSync } from 'node:fs';
import { initGeometry } from '../src/geometry.js';
import { loadFont } from '../src/text.js';

export async function setup() {
  initGeometry(await Module());
  loadFont(readFileSync(new URL('../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url)));
}
