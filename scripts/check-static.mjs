import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repoRoot, 'web');
const failures = [];

function requireFile(path, label) {
  if (!existsSync(path)) failures.push(`missing ${label}: ${relative(repoRoot, path)}`);
}

/* The repository intentionally remains raw-static: the application is under
   web/ and the root file is only the builder entrypoint/redirect. */
requireFile(join(repoRoot, 'index.html'), 'root entrypoint');
requireFile(join(webRoot, 'index.html'), 'canonical application entrypoint');
requireFile(join(webRoot, '.nojekyll'), 'Pages marker');
if (existsSync(join(repoRoot, 'package.json'))) {
  failures.push('root package.json exists; raw-static deployment must not trigger an npm build');
}

const rootHtml = existsSync(join(repoRoot, 'index.html'))
  ? readFileSync(join(repoRoot, 'index.html'), 'utf8') : '';
if (!/web\/?/.test(rootHtml)) failures.push('root index.html does not redirect/link to web/');

const webIndexPath = join(webRoot, 'index.html');
const webHtml = existsSync(webIndexPath) ? readFileSync(webIndexPath, 'utf8') : '';
const assetRefs = [...webHtml.matchAll(/(?:src|href)\s*=\s*["'](assets\/[^"']+)["']/gi)]
  .map(match => match[1]);
for (const asset of new Set(assetRefs)) {
  const assetPath = resolve(webRoot, join(...asset.split('/')));
  if (relative(webRoot, assetPath).startsWith('..')) {
    failures.push(`asset escapes web/: ${asset}`);
  } else {
    requireFile(assetPath, `referenced asset ${asset}`);
  }
}
for (const asset of ['assets/app.js', 'assets/styles.css']) {
  if (!assetRefs.includes(asset)) failures.push(`web/index.html does not reference ${asset}`);
}

if (failures.length) {
  console.error('Static preflight failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Static preflight passed: root redirect + ${new Set(assetRefs).size} web asset(s)`);
}
