/** 파일 앞머리의 고정 바이트(magic bytes)로 알아보는 형식. */
export type Signature =
  | {
      readonly name: string;
      readonly category: 'image';
      readonly mime: string;
      matches(head: Uint8Array): boolean;
    }
  | { readonly name: string; readonly category: 'binary'; matches(head: Uint8Array): boolean };

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

function at(head: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (head.length < offset + expected.length) return false;
  return expected.every((value, i) => head[offset + i] === value);
}

// ISO BMFF(mp4, avif)의 첫 상자는 4바이트 크기 뒤에 'ftyp'가 온다. 'ftyp' 네 글자만 보면
// "The ftyp box…" 같은 문장도 맞으므로, 크기 칸이 실제 상자 크기(빅엔디언, 8 이상 1KB 이하,
// 4의 배수)인지도 확인한다.
function isFtypBox(head: Uint8Array): boolean {
  if (!at(head, 4, ascii('ftyp'))) return false;
  const size =
    ((head[0] ?? 0) << 24) | ((head[1] ?? 0) << 16) | ((head[2] ?? 0) << 8) | (head[3] ?? 0);
  return size >= 8 && size <= 1024 && size % 4 === 0;
}

// 글자로 된 짧은 서명(BM, ID3, PK)은 텍스트 파일 첫머리와 우연히 겹칠 수 있어,
// 뒤따르는 제어 바이트까지 함께 본다(ADR-0010).
const SIGNATURES: readonly Signature[] = [
  {
    name: 'png',
    category: 'image',
    mime: 'image/png',
    matches: (h) => at(h, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    name: 'jpeg',
    category: 'image',
    mime: 'image/jpeg',
    matches: (h) => at(h, 0, [0xff, 0xd8, 0xff]),
  },
  {
    name: 'gif',
    category: 'image',
    mime: 'image/gif',
    matches: (h) => at(h, 0, ascii('GIF87a')) || at(h, 0, ascii('GIF89a')),
  },
  {
    name: 'webp',
    category: 'image',
    mime: 'image/webp',
    matches: (h) => at(h, 0, ascii('RIFF')) && at(h, 8, ascii('WEBP')),
  },
  {
    name: 'bmp',
    category: 'image',
    mime: 'image/bmp',
    matches: (h) => at(h, 0, ascii('BM')) && at(h, 6, [0, 0, 0, 0]),
  },
  {
    name: 'ico',
    category: 'image',
    mime: 'image/x-icon',
    matches: (h) => at(h, 0, [0, 0, 1, 0]) && h.length >= 6 && (h[4] !== 0 || h[5] !== 0),
  },
  {
    name: 'avif',
    category: 'image',
    mime: 'image/avif',
    matches: (h) => isFtypBox(h) && (at(h, 8, ascii('avif')) || at(h, 8, ascii('avis'))),
  },
  { name: 'pdf', category: 'binary', matches: (h) => at(h, 0, ascii('%PDF-')) },
  {
    name: 'zip',
    category: 'binary',
    matches: (h) =>
      at(h, 0, [0x50, 0x4b, 3, 4]) || at(h, 0, [0x50, 0x4b, 5, 6]) || at(h, 0, [0x50, 0x4b, 7, 8]),
  },
  { name: 'gzip', category: 'binary', matches: (h) => at(h, 0, [0x1f, 0x8b]) },
  {
    name: '7z',
    category: 'binary',
    matches: (h) => at(h, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  },
  { name: 'rar', category: 'binary', matches: (h) => at(h, 0, [...ascii('Rar!'), 0x1a, 0x07]) },
  { name: 'woff', category: 'binary', matches: (h) => at(h, 0, ascii('wOFF')) },
  { name: 'woff2', category: 'binary', matches: (h) => at(h, 0, ascii('wOF2')) },
  {
    name: 'mp3',
    category: 'binary',
    matches: (h) =>
      at(h, 0, ascii('ID3')) && h.length >= 5 && (h[3] ?? 0) >= 2 && (h[3] ?? 0) <= 4 && h[4] === 0,
  },
  { name: 'ogg', category: 'binary', matches: (h) => at(h, 0, [...ascii('OggS'), 0]) },
  {
    name: 'wav',
    category: 'binary',
    matches: (h) => at(h, 0, ascii('RIFF')) && at(h, 8, ascii('WAVE')),
  },
  { name: 'elf', category: 'binary', matches: (h) => at(h, 0, [0x7f, 0x45, 0x4c, 0x46]) },
  { name: 'wasm', category: 'binary', matches: (h) => at(h, 0, [0x00, 0x61, 0x73, 0x6d]) },
  { name: 'java-class', category: 'binary', matches: (h) => at(h, 0, [0xca, 0xfe, 0xba, 0xbe]) },
  {
    name: 'sqlite',
    category: 'binary',
    matches: (h) => at(h, 0, [...ascii('SQLite format 3'), 0]),
  },
  // avif보다 뒤에 둔다. 같은 ftyp 상자를 쓰는 동영상(mp4, mov)이다.
  { name: 'mp4', category: 'binary', matches: isFtypBox },
];

/** 앞머리 바이트가 알려진 서명과 맞으면 그 서명을 돌려준다. */
export function matchSignature(head: Uint8Array): Signature | undefined {
  return SIGNATURES.find((signature) => signature.matches(head));
}
