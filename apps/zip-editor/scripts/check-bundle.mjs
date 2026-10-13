// apps/zip-editor/scripts/check-bundle.mjs
// 첫 화면 JS 크기 검사(ADR-0027). 빌드 결과의 엔트리와 그 정적 import만 센다.
// 동적 import(EditorHost, Monaco, 언어별 청크)는 ZIP을 열 때 내려받으므로 세지 않는다.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = Number(process.env.BUNDLE_LIMIT_KB ?? 150);
const EDITOR_ENTRY = 'src/components/domain/workspace/EditorHost.tsx';
// 첫 화면 청크에 이 문자열이 있으면 그 라이브러리 코드가 들어온 것이다.
const SIGNATURES = [
  ['Monaco', 'editorWorkerService'],
  ['dockview', 'dv-groupview'],
];

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const manifest = JSON.parse(await readFile(`${dist}.vite/manifest.json`, 'utf8'));

const firstScreen = new Set();
const visit = (key) => {
  if (firstScreen.has(key)) return;
  firstScreen.add(key);
  for (const next of manifest[key]?.imports ?? []) visit(next);
};
visit('index.html');

const problems = [];
let total = 0;
for (const key of firstScreen) {
  const file = manifest[key].file;
  const code = await readFile(`${dist}${file}`);
  const gzip = gzipSync(code).length;
  total += gzip;
  console.log(`${file}\t${(gzip / 1024).toFixed(1)} KB (gzip)`);
  const text = code.toString('utf8');
  for (const [name, signature] of SIGNATURES) {
    if (text.includes(signature)) problems.push(`${file}에 ${name} 코드가 들어 있습니다`);
  }
}
console.log(`첫 화면 JS 합계: ${(total / 1024).toFixed(1)} KB (gzip), 한도 ${LIMIT_KB} KB`);
if (total > LIMIT_KB * 1024)
  problems.push(`첫 화면 JS가 한도를 넘었습니다: ${(total / 1024).toFixed(1)} KB`);
if (!manifest[EDITOR_ENTRY]?.isDynamicEntry)
  problems.push(`${EDITOR_ENTRY}가 동적 청크가 아닙니다`);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
