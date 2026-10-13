// 운영 사이트(Vercel)에 배포한다. 실행: pnpm deploy:prod
//
// 왜 이렇게 하나: 무료 요금제는 비공개 저장소의 배포를, 마지막 커밋 작성자가 Vercel 계정 주인일 때만
// 허용한다. 커밋 작성자가 계정 주인과 다르면 git 연동 배포와 저장소 안에서 돌린 CLI 배포가 모두
// 막힌다(Blocked). 그래서 로컬에서 빌드한 결과만 git이 없는 임시 폴더로 옮겨 올린다. 커밋 정보가
// 함께 올라가지 않으므로 작성자 검사를 받지 않는다(ADR-0043).
//
// 필요한 것: `npx vercel@latest login`으로 Vercel 계정 주인으로 로그인해 두기.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const productionUrl = process.env.DEPLOY_URL ?? 'https://codefold-zip-editor.vercel.app';
// 이 컴퓨터에 깔린 옛 CLI(28.x)는 Node 24 설정을 알아보지 못해 빌드가 실패한다. 늘 최신판을 쓴다.
const vercel = ['--yes', 'vercel@latest'];

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`실패: ${command} ${args.join(' ')}`);
}

function output(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8' }).stdout.trim();
}

const entryOf = (html) => html.match(/assets\/index-[\w-]+\.js/)?.[0];

// 1. 커밋하지 않은 변경은 배포하지 않는다. 운영 사이트가 어느 커밋인지 늘 알 수 있게 한다.
if (output('git', ['status', '--porcelain'])) {
  console.error(
    '커밋하지 않은 변경이 있어 배포하지 않습니다. 커밋하거나 되돌린 뒤 다시 실행하세요.',
  );
  process.exit(1);
}
const commit = output('git', ['rev-parse', '--short', 'HEAD']);

// 2. 프로젝트 설정(루트 폴더, Node 버전)이 없으면 받아 온다.
const projectFile = join(root, '.vercel/project.json');
const hasSettings = () =>
  existsSync(projectFile) && JSON.parse(readFileSync(projectFile, 'utf8')).settings;
if (!hasSettings()) run('npx', [...vercel, 'pull', '--yes', '--environment=production']);
const { rootDirectory } = JSON.parse(readFileSync(projectFile, 'utf8')).settings;

const staging = mkdtempSync(join(tmpdir(), 'zip-editor-deploy-'));
try {
  // 3. 운영 빌드. 결과는 .vercel/output에 생긴다.
  run('npx', [...vercel, 'build', '--prod']);
  const built = entryOf(readFileSync(join(root, '.vercel/output/static/index.html'), 'utf8'));

  // 4. 빌드 결과와 프로젝트 설정만 git이 없는 폴더로 옮긴다. Vercel은 프로젝트 설정의 루트 폴더가
  //    있어야 배포를 받으므로 빈 폴더를 만들어 둔다.
  mkdirSync(join(staging, '.vercel'), { recursive: true });
  cpSync(join(root, '.vercel/output'), join(staging, '.vercel/output'), { recursive: true });
  cpSync(projectFile, join(staging, '.vercel/project.json'));
  if (rootDirectory) mkdirSync(join(staging, rootDirectory), { recursive: true });

  // 5. 올린다.
  run('npx', [...vercel, 'deploy', '--prebuilt', '--prod', '--yes'], staging);

  // 6. 운영 주소가 방금 빌드한 첫 화면 JS를 돌려주는지 확인한다.
  // 배포 직후에는 운영 주소가 새 배포로 넘어가는 데 몇 초 걸린다. 최대 30초 동안 다시 확인한다.
  let served;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    served = entryOf(await (await fetch(productionUrl, { cache: 'no-store' })).text());
    if (served === built) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (served !== built) {
    throw new Error(`운영 주소의 JS(${served})가 방금 빌드한 JS(${built})와 다릅니다.`);
  }
  console.log(`배포 완료: ${commit} → ${productionUrl} (${built})`);
} finally {
  // 배포가 성공하든 실패하든 빌드 결과를 임시 폴더와 함께 지운다. 배포할 때마다 새로 만드는 파일이다.
  rmSync(join(root, '.vercel/output'), { recursive: true, force: true });
  // vercel build가 루트 폴더 안에도 .vercel을 남긴다. 루트 폴더가 없으면 지우지 않는다(프로젝트 연결 정보가 지워진다).
  if (rootDirectory) rmSync(join(root, rootDirectory, '.vercel'), { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
}
