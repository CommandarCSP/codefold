import type { KindCategory } from './types';

const IMAGE_MIME = new Map<string, string>([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
  ['ico', 'image/x-icon'],
  ['avif', 'image/avif'],
  ['svg', 'image/svg+xml'],
]);

const BINARY_EXTENSIONS = new Set([
  'pdf',
  'zip',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'jar',
  'war',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'o',
  'a',
  'class',
  'wasm',
  'pyc',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'psd',
  'tif',
  'tiff',
  'heic',
  'sqlite',
  'db',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'csv',
  'tsv',
  'log',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'vue',
  'svelte',
  'py',
  'rb',
  'php',
  'java',
  'kt',
  'kts',
  'scala',
  'go',
  'rs',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'm',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'sql',
  'graphql',
  'gql',
  'proto',
  'lua',
  'r',
  'dart',
  'ex',
  'exs',
  'clj',
]);

/**
 * 경로의 마지막 이름에서 확장자를 소문자로 돌려준다. 확장자가 없으면 빈 문자열이다.
 * 점으로 시작하는 이름(`.gitignore`)은 확장자가 없는 것으로 본다.
 */
export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** 확장자가 가리키는 종류. 모르는 확장자는 `undefined`라서 확장자 충돌로 보지 않는다. */
export function expectedCategory(extension: string): KindCategory | undefined {
  if (IMAGE_MIME.has(extension)) return 'image';
  if (BINARY_EXTENSIONS.has(extension)) return 'binary';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return undefined;
}

/** 이미지 확장자의 MIME. 이미지가 아니면 `undefined`다. */
export function imageMimeForExtension(extension: string): string | undefined {
  return IMAGE_MIME.get(extension);
}

/**
 * 압축을 풀지 않고 이름만으로 종류를 짐작한다. 파일 트리 아이콘용이다(ADR-0010).
 * 모르는 확장자는 `text`로 본다.
 */
export function guessKindByExtension(name: string): KindCategory {
  return expectedCategory(extensionOf(name)) ?? 'text';
}
