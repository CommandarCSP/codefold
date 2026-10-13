import type { NameProblem, TreeNode } from './types';

/**
 * 이름 하나만 보고 쓸 수 있는지 판단한다. 같은 폴더의 중복은 트리를 아는 쪽이 따로 본다.
 * 공백만 있는 이름은 빈 이름이다.
 */
export function checkName(name: string): Exclude<NameProblem, 'duplicate'> | undefined {
  if (name.trim() === '') return 'empty';
  if (name === '.' || name === '..') return 'reserved';
  if (name.includes('/') || name.includes('\\') || hasControlCharacter(name))
    return 'invalid-character';
  return undefined;
}

function hasControlCharacter(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * 중복을 비교하는 키. 대소문자와 NFC·NFD 차이를 무시한다.
 * 받은 ZIP을 macOS·Windows에서 풀면 이 차이만 있는 두 이름은 같은 파일이 된다.
 */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

const collator = new Intl.Collator('ko', { numeric: true });

/** 폴더가 먼저, 그다음 이름의 자연 정렬 순서. 같다고 나오면 코드 포인트 순서로 가른다. */
export function compareNodes(
  a: Pick<TreeNode, 'name' | 'isDirectory'>,
  b: Pick<TreeNode, 'name' | 'isDirectory'>,
): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  const byCollator = collator.compare(a.name, b.name);
  if (byCollator !== 0) return byCollator;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
