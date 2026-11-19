// Builds the page twice from the same source:
//  dist/wortguss.html  the Claude artifact (body content; claude.ai adds the skeleton)
//  site/index.html     the GitHub Pages site (full document, direct .3mf/.stl downloads)
// three.js, manifold-3d (WASM inlined) and fflate are bundled because the artifact
// sandbox blocks fetching .wasm from CDNs.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const template = readFileSync('src/page.html', 'utf8');
async function bundle(target) {
  const res = await build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    loader: { '.wasm': 'binary', '.woff': 'binary' },
    external: ['module'], // emscripten's Node-only branch; never runs in the browser
    define: { __TARGET__: JSON.stringify(target) },
    legalComments: 'none',
    logLevel: 'warning',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return template.replace('<script>/*BUNDLE*/</script>', () => `<script type="module">${js}</script>`);
}

mkdirSync('dist', { recursive: true });
const artifact = await bundle('artifact');
writeFileSync('dist/wortguss.html', artifact);
console.log(`dist/wortguss.html ${(artifact.length / 1024).toFixed(0)} KB`);

mkdirSync('../site', { recursive: true });
const site = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${await bundle('pages')}
</body>
</html>
`;
writeFileSync('../site/index.html', site);
console.log(`site/index.html ${(site.length / 1024).toFixed(0)} KB`);
