// apps/zip-editor/src/business/hooks/session/__tests__/sessionBusiness.test.ts
import {
  CorruptZipError,
  EncryptedZipError,
  InvalidZipItemError,
  NotZipError,
  SplitZipError,
} from '@codefold/zip-archive';
import { describe, expect, test } from 'vitest';
import { MissingExportDataError } from '@/services/zip/zipProtocol';
import { createAppStore, type AppState } from '@/store/stores/appStore';
import { createFakeZipSource } from '@/test/fakes';
import { messages } from '@/utils/messages';
import {
  canDownload,
  canUpload,
  classifyDownloadError,
  classifyUploadError,
  isLargeZip,
  LARGE_ZIP_BYTES,
  pickDroppedFile,
  replaceConfirmation,
  shouldWarnBeforeUnload,
  snapshotFromStored,
  workspaceView,
} from '../sessionBusiness';

const state = (overrides: Partial<AppState>): AppState => ({
  ...createAppStore().getState(),
  ...overrides,
});
const workspace = () => ({ id: 1, zipName: 'project.zip', source: createFakeZipSource() });
const file = (name: string) => new File(['x'], name);

describe('세션 규칙', () => {
  test('놓은 파일: 없음·하나·여럿을 가른다', () => {
    expect(pickDroppedFile([])).toEqual({ kind: 'none' });
    const one = file('a.zip');
    expect(pickDroppedFile([one])).toEqual({ kind: 'single', file: one });
    expect(pickDroppedFile([one, file('b.zip')])).toEqual({ kind: 'multiple' });
  });

  test('1GB를 넘어야 큰 ZIP이다', () => {
    expect(isLargeZip(LARGE_ZIP_BYTES)).toBe(false);
    expect(isLargeZip(LARGE_ZIP_BYTES + 1)).toBe(true);
  });

  test('열기 오류는 네 종류와 그 밖으로 나뉜다', () => {
    expect(classifyUploadError(new NotZipError())).toBe('notZip');
    expect(classifyUploadError(new CorruptZipError('x'))).toBe('corrupt');
    expect(classifyUploadError(new EncryptedZipError())).toBe('encrypted');
    expect(classifyUploadError(new SplitZipError())).toBe('split');
    expect(classifyUploadError(new Error('Worker 멈춤'))).toBe('unknown');
  });

  test('다운로드 오류는 쓸 수 없는 항목·새 내용 없음과 그 밖으로 나누고, 큰 ZIP이나 메모리 부족이면 메모리 안내를 붙인다', () => {
    expect(classifyDownloadError(new InvalidZipItemError('a/', '이유'), false)).toEqual({
      reason: { kind: 'invalidItem', path: 'a/' },
      memoryHint: false,
    });
    expect(classifyDownloadError(new MissingExportDataError('b.txt'), false)).toEqual({
      reason: { kind: 'missingData' },
      memoryHint: false,
    });
    expect(classifyDownloadError(new Error('쓰기 실패'), true)).toEqual({
      reason: { kind: 'unknown' },
      memoryHint: true,
    });
    expect(classifyDownloadError(new RangeError('Array buffer allocation failed'), false)).toEqual({
      reason: { kind: 'unknown' },
      memoryHint: true,
    });
  });

  test('교체 확인: 받지 않은 변경이 있을 때만 묻는다', () => {
    expect(replaceConfirmation(state({ phase: 'ready', workspace: workspace() }))).toBeUndefined();
    expect(
      replaceConfirmation(
        state({ phase: 'ready', workspace: workspace(), unexported: { has: true, count: 2 } }),
      ),
    ).toMatchObject({ title: messages.replace.title, description: messages.replace.description });
    const saved = { zipName: 'old.zip', updatedAt: 1, unexported: { has: true, count: 1 } };
    expect(replaceConfirmation(state({ phase: 'restorePrompt', saved }))).toMatchObject({
      description: messages.discardSaved('old.zip'),
    });
    expect(
      replaceConfirmation(
        state({
          phase: 'restorePrompt',
          saved: { ...saved, unexported: { has: false, count: 0 } },
        }),
      ),
    ).toBeUndefined();
    expect(replaceConfirmation(state({ phase: 'restoreFailed' }))).toMatchObject({
      description: messages.replace.unknownSaved,
    });
    expect(replaceConfirmation(state({ phase: 'empty' }))).toBeUndefined();
  });

  test('저장본을 <CodeEditor> 스냅샷으로 옮긴다', () => {
    const record = {
      id: 'ws-1',
      zipName: 'p.zip',
      zipBlob: new Blob([]),
      createdAt: 1,
      updatedAt: 2,
      treeChanges: [{ type: 'delete', path: 'a.txt' }] as const,
      layout: { grid: 1 },
      downloadRecord: { files: { 'b.txt': 'ab' }, paths: ['b.txt'], exportedAt: 3 },
      unexported: { has: true, count: 1 },
    };
    expect(snapshotFromStored({ record, files: { 'b.txt': '고침' } })).toEqual({
      treeChanges: record.treeChanges,
      contents: { 'b.txt': '고침' },
      layout: { grid: 1 },
      downloadRecord: record.downloadRecord,
    });
  });

  test('이탈 경고: 잠금을 쥐고 작업 공간이 있고 저장이 끝나지 않았을 때만', () => {
    const open = { workspace: workspace(), lock: 'holding' as const };
    expect(
      shouldWarnBeforeUnload(
        state({ ...open, saveStatus: 'saved', unexported: { has: true, count: 3 } }),
      ),
    ).toBe(false);
    expect(shouldWarnBeforeUnload(state({ ...open, saveStatus: 'pending' }))).toBe(true);
    expect(shouldWarnBeforeUnload(state({ ...open, saveStatus: 'failed' }))).toBe(true);
    expect(shouldWarnBeforeUnload(state({ ...open, saveStatus: 'unavailable' }))).toBe(true);
    expect(shouldWarnBeforeUnload(state({ ...open, lock: 'lost', saveStatus: 'pending' }))).toBe(
      false,
    );
    expect(shouldWarnBeforeUnload(state({ lock: 'holding', saveStatus: 'unavailable' }))).toBe(
      false,
    );
  });

  test('업로드는 잠금을 쥐고 여는 중이 아닐 때만', () => {
    expect(canUpload(state({ lock: 'holding', phase: 'empty' }))).toBe(true);
    expect(canUpload(state({ lock: 'holding', phase: 'restorePrompt' }))).toBe(true);
    expect(canUpload(state({ lock: 'holding', phase: 'opening' }))).toBe(false);
    expect(canUpload(state({ lock: 'holding', phase: 'restoring' }))).toBe(false);
    expect(canUpload(state({ lock: 'busy', phase: 'empty' }))).toBe(false);
    expect(canUpload(state({ lock: 'lost', phase: 'ready' }))).toBe(false);
  });

  test('다운로드는 ready이고 제어 API가 있고 바뀐 것이 있고 만드는 중이 아닐 때만', () => {
    const controller = {} as AppState['controller'];
    const ready = { phase: 'ready' as const, controller, hasChanges: true };
    expect(canDownload(state(ready))).toBe(true);
    expect(canDownload(state({ ...ready, hasChanges: false }))).toBe(false);
    expect(canDownload(state({ ...ready, downloading: true }))).toBe(false);
    expect(canDownload(state({ ...ready, phase: 'opening' }))).toBe(false);
    expect(canDownload(state({ ...ready, controller: null }))).toBe(false);
  });

  test('본문 영역은 잠금 안내 → 에디터 → 단계 순서로 정한다', () => {
    expect(workspaceView(state({ lock: 'pending' }))).toBe('booting');
    expect(workspaceView(state({ lock: 'busy' }))).toBe('lock');
    expect(workspaceView(state({ lock: 'granted' }))).toBe('lock');
    expect(
      workspaceView(state({ lock: 'holding', phase: 'opening', workspace: workspace() })),
    ).toBe('editor');
    expect(workspaceView(state({ lock: 'holding', phase: 'opening' }))).toBe('opening');
    expect(workspaceView(state({ lock: 'holding', phase: 'restoring' }))).toBe('opening');
    expect(workspaceView(state({ lock: 'holding', phase: 'restoreFailed' }))).toBe('restoreFailed');
    expect(workspaceView(state({ lock: 'holding', phase: 'restorePrompt' }))).toBe('empty');
    expect(workspaceView(state({ lock: 'lost', phase: 'empty' }))).toBe('empty');
  });
});
