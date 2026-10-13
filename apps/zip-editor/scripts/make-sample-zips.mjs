// 사람이 직접 해 보는 테스트(docs/manual-test-scenarios.md)에 쓸 샘플 ZIP을 samples/에 만든다.
// 실제 압축 도구처럼 Deflate로 압축하고, 이름은 UTF-8 플래그로 적는다.
// 실행: pnpm --filter @codefold/zip-editor samples
import { mkdir, writeFile } from 'node:fs/promises';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

const out = new URL('../samples/', import.meta.url);

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, content] of Object.entries(entries)) {
    const directory = content === null;
    const name = Buffer.from(directory ? `${path}/` : path, 'utf8');
    const data = directory ? Buffer.alloc(0) : Buffer.from(content);
    const deflated = deflateRawSync(data);
    const useDeflate = !directory && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const header = (signature, size) => {
      const b = Buffer.alloc(size);
      b.writeUInt32LE(signature, 0);
      return b;
    };
    const local = header(0x04034b50, 30);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x5b21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = header(0x02014b50, 46);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(0x5b21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(directory ? 0x10 : 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// 눈으로 확인할 수 있는 이미지. 파일을 저장소에 두지 않으려고 픽셀을 직접 그린다.
// paint(x, y)는 [r, g, b, a]를 돌려준다.
function png(width, height, paint) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8비트 RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x++) raw.set(paint(x, y), row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 24비트 BMP. 줄은 아래에서 위로, 4바이트 단위로 채운다.
function bmp(width, height, paint) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const file = Buffer.alloc(54 + stride * height);
  file.write('BM', 0, 'ascii');
  file.writeUInt32LE(file.length, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      file.set([b, g, r], row + x * 3);
    }
  }
  return file;
}

// 보라 원 로고(바깥은 투명)
const LOGO = png(128, 128, (x, y) => {
  const d = Math.hypot(x - 63.5, y - 63.5);
  if (d > 60) return [0, 0, 0, 0];
  return d > 44 ? [109, 40, 217, 255] : [237, 233, 254, 255];
});
// 가로 그라데이션과 체크 무늬
const PHOTO = png(480, 300, (x, y) => {
  const check = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0 ? 30 : 0;
  return [Math.round((x / 479) * 255), Math.round((y / 299) * 200) + check, 180 - check, 255];
});
// 화면보다 넓은 이미지. 창에 맞춰 줄어드는지 본다.
const WIDE = png(2400, 300, (x, y) => [
  (x * 7) % 256,
  (y * 3) % 256,
  200,
  y < 20 || y > 279 || x < 20 || x > 2379 ? 255 : 230,
]);
// 반투명 영역. 뒤 배경이 비치는지 본다.
const ALPHA = png(200, 200, (x, y) => [239, 68, 68, Math.round((x / 199) * 255)]);
const BANNER = bmp(240, 80, (x, y) =>
  y > 30 && y < 50 ? [255, 255, 255] : [16, 185, 129 - Math.round((x / 239) * 100)],
);
const BINARY = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 1, 2, 3, 0, 0, 255, 254, 0, 9]);
// "안녕하세요 " (EUC-KR)
const EUC_KR = Buffer.from([0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x20]);

const samples = {
  'basic.zip': {
    'README.md': '# 샘플 프로젝트\n\n직접 테스트용 ZIP입니다.\n',
    'src/main.py': 'from util import greet\n\nprint(greet("Codefold"))\n',
    'src/util.py': 'def greet(name):\n    return f"안녕하세요, {name}님"\n',
    'data/input.txt': '첫 줄\n둘째 줄\n',
    'images/logo.png': LOGO,
    'images/icon.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#6d28d9"/><script>alert("실행되면 안 됨")</script></svg>',
    'bin/app.bin': BINARY,
    'legacy/old.py': 'print("지울 폴더")\n',
    '한글 이름 문서.txt': '파일 이름이 한글이고 공백이 있습니다.\n',
    'empty-folder': null,
    '__MACOSX/src/._main.py': BINARY,
    '.DS_Store': BINARY,
  },
  'ts-project.zip': {
    'src/index.ts': "import { formatPrice } from './price';\n\nconsole.log(formatPrice(1000));\n",
    'src/price.ts':
      "export function formatPrice(value: number): string {\n  return `${value.toLocaleString('ko-KR')}원`;\n}\n\nexport const CURRENCY = 'KRW';\n",
    'styles.css': 'body {\n  color: #333;\n}\n',
    'index.html':
      '<!doctype html>\n<html><body><script>window.__ran = true</script></body></html>\n',
    'data.json': '{\n  "name": "sample"\n}\n',
    'long-line.txt': `${'가나다라마바사아자차카타파하 '.repeat(40)}\n`,
  },
  'images.zip': {
    'logo.png': LOGO,
    'photo.png': PHOTO,
    'wide.png': WIDE,
    'alpha.png': ALPHA,
    'banner.bmp': BANNER,
    'icon.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#0ea5e9"/><path d="M30 62l20 20 40-44" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round"/></svg>',
    // 확장자는 이미지인데 내용은 텍스트
    'not-really.png': '이 파일은 확장자만 PNG인 텍스트입니다.\n',
  },
  'euc-kr.zip': { '옛날 문서.txt': Buffer.concat(Array(60).fill(EUC_KR)) },
  'large-10000.zip': Object.fromEntries(
    Array.from({ length: 10_000 }, (_, i) => [
      `d${String(Math.floor(i / 100)).padStart(3, '0')}/f${String(i % 100).padStart(4, '0')}.ts`,
      `export const v${i} = ${i};\n`,
    ]),
  ),
};

await mkdir(out, { recursive: true });
for (const [name, entries] of Object.entries(samples)) {
  await writeFile(new URL(name, out), makeZip(entries));
  console.log(`samples/${name}`);
}
// ZIP이 아닌 파일(오류 안내 확인용)
await writeFile(new URL('not-a-zip.zip', out), 'ZIP이 아닌 텍스트 파일입니다.\n');
console.log('samples/not-a-zip.zip');
