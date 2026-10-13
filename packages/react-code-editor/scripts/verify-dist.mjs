// 빌드 결과가 ADR-0034의 약속을 지키는지 확인한다. build 스크립트 마지막에 돈다.
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const js = read('dist/index.js');
const css = read('dist/styles.css');
const pkg = JSON.parse(read('package.json'));
const externals = [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)];
const problems = [];

// React Compiler를 거친 코드는 react/compiler-runtime을 불러온다.
if (!js.includes('react/compiler-runtime')) problems.push('React Compiler를 거치지 않았습니다');

// 번들 밖에 두기로 한 의존성만 import하고, 그 밖의 라이브러리 코드는 번들에 들어가지 않았는지 본다.
for (const [, specifier] of js.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
  if (specifier.startsWith('.')) continue;
  if (!externals.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
    problems.push(`번들 밖에 두지 않은 의존성을 불러옵니다: ${specifier}`);
  }
}
// Monaco는 마운트될 때만 불러온다. 최상위 정적 import가 있으면 첫 화면 번들에 Monaco가 들어간다.
if (/\bfrom\s*["']monaco-editor/.test(js) || /^import\s*["']monaco-editor/m.test(js)) {
  problems.push('monaco-editor를 최상위에서 정적으로 불러옵니다');
}
if (js.length > 150_000)
  problems.push(`dist/index.js가 ${js.length}바이트입니다. 의존성이 번들에 들어갔는지 확인하세요`);

// CSS: cf 접두어 클래스가 --cf- 변수를 쓰고, 쓰는 쪽 페이지를 초기화하는 preflight(base 층)가 없다.
if (!css.includes('.cf\\:bg-background{background-color:var(--cf-background)}')) {
  problems.push('cf 접두어 클래스가 --cf- 변수를 쓰지 않습니다');
}
if (!css.includes('--cf-background:')) problems.push('--cf-background 변수가 없습니다');
if (css.includes('@layer base')) problems.push('Tailwind preflight(base 층)가 들어 있습니다');

if (problems.length > 0) {
  for (const problem of problems) console.error(`verify-dist: ${problem}`);
  process.exit(1);
}
console.log('verify-dist: 통과');
