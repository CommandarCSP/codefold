// 판단 테스트용 샘플 파일을 만든다. 결과 파일도 함께 커밋한다.
// 판단에 필요한 앞머리가 실제 형식과 같은 최소 파일이다.
// 실행: node packages/file-type-detector/test/fixtures/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'files');
mkdirSync(dir, { recursive: true });
const write = (name, bytes) => writeFileSync(join(dir, name), bytes);
const b64 = (s) => Buffer.from(s, 'base64');
const ascii = (s) => Buffer.from(s, 'latin1');

const PNG_1X1 = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

// 이미지
write('image.png', PNG_1X1);
write(
  'image.jpg',
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...ascii('JFIF'),
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]),
);
write('image.gif', b64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'));
write('image.webp', b64('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='));
write(
  'image.bmp',
  Buffer.concat([
    ascii('BM'),
    Buffer.from([0x3a, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0]),
    Buffer.alloc(44),
  ]),
);
write(
  'image.ico',
  Buffer.concat([
    Buffer.from([0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 32, 0]),
    Buffer.from([PNG_1X1.length, 0, 0, 0, 22, 0, 0, 0]),
    PNG_1X1,
  ]),
);
write('image.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\n'));

// 바이너리
write(
  'doc.pdf',
  ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
);
write('empty.zip', Buffer.concat([Buffer.from([0x50, 0x4b, 5, 6]), Buffer.alloc(18)]));
write('font.woff2', Buffer.concat([ascii('wOF2'), Buffer.from([0, 1, 0, 0]), Buffer.alloc(40)]));
write(
  'audio.mp3',
  Buffer.concat([ascii('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(32)]),
);
write(
  'program.elf',
  Buffer.concat([Buffer.from([0x7f]), ascii('ELF'), Buffer.from([2, 1, 1, 0]), Buffer.alloc(56)]),
);

// 텍스트
const KO = '안녕하세요, 세계! 한글 텍스트 파일입니다.\n';
write('utf8-ko.txt', Buffer.from(KO, 'utf8'));
write('utf8-bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(KO, 'utf8')]));
write('utf16le.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(KO, 'utf16le')]));
write(
  'utf16be.txt',
  Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(KO, 'utf16le').swap16()]),
);
write(
  'euc-kr.txt',
  Buffer.from([
    0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x2c, 0x20, 0xbc, 0xbc, 0xb0, 0xe8,
    0x21, 0x20, 0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xc5, 0xd8, 0xbd, 0xba, 0xc6, 0xae, 0x20, 0xc6, 0xc4,
    0xc0, 0xcf, 0xc0, 0xd4, 0xb4, 0xcf, 0xb4, 0xd9, 0x2e, 0x0a,
  ]),
);
write('Makefile', Buffer.from('build:\n\tpnpm build\n'));
write('empty.txt', Buffer.alloc(0));

// 경계 사례: 이름은 텍스트인데 내용은 PNG
write('logo.txt', PNG_1X1);
