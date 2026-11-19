// Bundles src/ into one self-contained artifact page: dist/wortguss.html.
// three.js, manifold-3d (with its WASM inlined) and fflate are bundled because
// the artifact sandbox blocks fetching .wasm from CDNs.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  loader: { '.wasm': 'binary' },
  external: ['module'], // emscripten's Node-only branch; never runs in the browser
  legalComments: 'none',
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = readFileSync('src/page.html', 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script type="module">${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/wortguss.html', page);
console.log(`dist/wortguss.html ${(page.length / 1024).toFixed(0)} KB`);
