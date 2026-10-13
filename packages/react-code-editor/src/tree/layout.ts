/** 트리 한 행의 높이(px). 가상화 목록의 행 크기 추정값으로도 쓴다. */
export const TREE_ROW_HEIGHT = 24;

/** 깊이에 따른 왼쪽 여백(px). */
export function indentOf(depth: number): number {
  return 4 + (depth - 1) * 12;
}
