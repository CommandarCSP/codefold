// 빌드 결과의 청크 크기(gzip)를 perf-results/chunks.json에 기록한다(ADR-0027: 재서 기록만).
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const size = async (file) => {
  const code = await readFile(new URL(file, dist));
  return {
    file,
    rawKB: +(code.length / 1024).toFixed(1),
    gzipKB: +(gzipSync(code).length / 1024).toFixed(1),
  };
};

const firstScreen = new Set();
const visit = (key) => {
  if (firstScreen.has(key)) return;
  firstScreen.add(key);
  for (const next of manifest[key]?.imports ?? []) visit(next);
};
visit('index.html');
const firstFiles = [...firstScreen].map((key) => manifest[key].file);

const assets = (await readdir(new URL('assets/', dist))).filter((name) => name.endsWith('.js'));
const pick = (prefix) =>
  assets.filter((name) => name.startsWith(prefix)).map((name) => `assets/${name}`);
const groups = {
  firstScreen: firstFiles,
  editorHost: pick('EditorHost-'),
  monacoCore: pick('editor.api-'),
  workers: assets.filter((name) => name.includes('.worker-')).map((name) => `assets/${name}`),
  languageExamples: [
    ...pick('python-'),
    ...pick('typescript-'),
    ...pick('tsMode-'),
    ...pick('css-'),
    ...pick('html-'),
  ],
};
const out = {};
for (const [name, files] of Object.entries(groups)) {
  const list = await Promise.all(files.map(size));
  out[name] = { gzipKB: +list.reduce((sum, item) => sum + item.gzipKB, 0).toFixed(1), files: list };
}
const all = await Promise.all(assets.map((name) => size(`assets/${name}`)));
out.allJs = {
  count: all.length,
  gzipKB: +all.reduce((sum, item) => sum + item.gzipKB, 0).toFixed(1),
};
await mkdir(new URL('../perf-results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../perf-results/chunks.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
for (const [name, value] of Object.entries(out)) console.log(name, value.gzipKB, 'KB gzip');
