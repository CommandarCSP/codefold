import type { TreeNode, VirtualFs } from '@codefold/virtual-fs';
import type { EditingState } from '../store';

/** 한 줄 목록의 행. 새 항목을 만드는 중이면 그 부모 폴더 맨 앞에 입력 행이 들어간다. */
export type TreeRowData =
  | {
      readonly type: 'node';
      readonly node: TreeNode;
      /** aria-level. 최상위가 1이다. */
      readonly depth: number;
      readonly expanded: boolean;
      readonly setSize: number;
      readonly posInSet: number;
      readonly parentPath: string;
    }
  | {
      readonly type: 'create';
      readonly parentPath: string;
      readonly depth: number;
      readonly isDirectory: boolean;
    };

/** 이름 입력칸을 그릴 자리. */
export type NameInputRow =
  | {
      readonly mode: 'create';
      readonly parentPath: string;
      readonly isDirectory: boolean;
      readonly depth: number;
    }
  | {
      readonly mode: 'rename';
      readonly path: string;
      readonly name: string;
      readonly depth: number;
    };

/**
 * 펼친 폴더만 따라가 한 줄 목록을 만든다(ADR-0029).
 * `structureVersion`은 계산에 쓰지 않지만 인자로 받아, 트리 구조가 바뀌면 React Compiler가 다시 계산하게 한다.
 */
export function flattenTree(
  fs: Pick<VirtualFs, 'children'>,
  expanded: ReadonlySet<string>,
  editing: EditingState,
  structureVersion: number,
): TreeRowData[] {
  void structureVersion;
  const rows: TreeRowData[] = [];
  const visit = (folder: string, depth: number) => {
    if (editing?.mode === 'create' && editing.parentPath === folder) {
      rows.push({ type: 'create', parentPath: folder, depth, isDirectory: editing.isDirectory });
    }
    const children = fs.children(folder);
    children.forEach((node, index) => {
      const open = node.isDirectory && expanded.has(node.path);
      rows.push({
        type: 'node',
        node,
        depth,
        expanded: open,
        setSize: children.length,
        posInSet: index + 1,
        parentPath: folder,
      });
      if (open) visit(node.path, depth + 1);
    });
  };
  visit('', 1);
  return rows;
}

/** 가상화 목록의 행 키. */
export function rowKey(row: TreeRowData): string {
  return row.type === 'node' ? row.node.path : `\u0000create:${row.parentPath}`;
}
