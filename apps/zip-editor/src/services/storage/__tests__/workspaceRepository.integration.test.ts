// @vitest-environment node
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DB_NAME,
  openWorkspaceRepository,
  StorageUnavailableError,
  WorkspaceCorruptError,
  WorkspaceMissingError,
} from '../workspaceRepository';

beforeEach(() => {
  (globalThis as { indexedDB: unknown }).indexedDB = new IDBFactory();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const zip = () => new File(['PK 가짜'], 'project.zip', { type: 'application/zip' });

describe('작업 공간 저장소 (ADR-0014)', () => {
  test('저장본이 없으면 요약과 전체 모두 null이다', async () => {
    const repository = await openWorkspaceRepository();
    await expect(repository.readSummary()).resolves.toBeNull();
    await expect(repository.load()).resolves.toBeNull();
  });

  test('replace는 원본 Blob과 이름을 새 작업 공간으로 저장한다', async () => {
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'project.zip', zipBlob: zip(), now: 100 });
    await expect(repository.readSummary()).resolves.toEqual({
      zipName: 'project.zip',
      updatedAt: 100,
      unexported: { has: false, count: 0 },
    });
    const stored = await repository.load();
    expect(await stored?.record.zipBlob.text()).toBe('PK 가짜');
    expect(stored?.record).toMatchObject({
      createdAt: 100,
      treeChanges: [],
      layout: null,
      downloadRecord: null,
    });
    expect(stored?.files).toEqual({});
  });

  test('save는 파일 넣기·지우기, 트리 변경, 레이아웃, 다운로드 기록, 요약을 한 번에 쓴다', async () => {
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'project.zip', zipBlob: zip(), now: 100 });
    const workspaceId = (await repository.load())?.record.id ?? '';
    await repository.save({
      workspaceId,
      updatedAt: 200,
      files: { put: { 'a.txt': '하나', 'b.txt': '둘' }, remove: [] },
    });
    await repository.save({
      workspaceId,
      updatedAt: 300,
      files: { put: { 'c.txt': '셋' }, remove: ['a.txt'] },
      treeChanges: [{ type: 'add', path: 'c.txt', isDirectory: false }],
      layout: { grid: 'json' },
      downloadRecord: { files: { 'b.txt': 'ab12' }, paths: ['b.txt'], exportedAt: 250 },
      unexported: { has: true, count: 1 },
    });
    const stored = await repository.load();
    expect(stored?.files).toEqual({ 'b.txt': '둘', 'c.txt': '셋' });
    expect(stored?.record).toMatchObject({
      updatedAt: 300,
      treeChanges: [{ type: 'add', path: 'c.txt', isDirectory: false }],
      layout: { grid: 'json' },
      downloadRecord: { files: { 'b.txt': 'ab12' }, paths: ['b.txt'], exportedAt: 250 },
      unexported: { has: true, count: 1 },
    });
  });

  test('replace는 이전 파일 내용을 모두 지운다(작업 공간은 하나)', async () => {
    const repository = await openWorkspaceRepository();
    const workspaceId = await repository.replace({ zipName: 'old.zip', zipBlob: zip(), now: 1 });
    await repository.save({
      workspaceId,
      updatedAt: 2,
      files: { put: { 'a.txt': '옛 내용' }, remove: [] },
    });
    await repository.replace({ zipName: 'new.zip', zipBlob: zip(), now: 3 });
    const stored = await repository.load();
    expect(stored?.record.zipName).toBe('new.zip');
    expect(stored?.files).toEqual({});
  });

  test('clear는 두 저장소를 비운다', async () => {
    const repository = await openWorkspaceRepository();
    const workspaceId = await repository.replace({
      zipName: 'project.zip',
      zipBlob: zip(),
      now: 1,
    });
    await repository.save({
      workspaceId,
      updatedAt: 2,
      files: { put: { 'a.txt': 'x' }, remove: [] },
    });
    await repository.clear();
    await expect(repository.load()).resolves.toBeNull();
  });

  test('작업 공간이 없을 때 save하면 WorkspaceMissingError이고 아무것도 쓰지 않는다', async () => {
    const repository = await openWorkspaceRepository();
    await expect(
      repository.save({
        workspaceId: 'none',
        updatedAt: 1,
        files: { put: { 'a.txt': 'x' }, remove: [] },
      }),
    ).rejects.toBeInstanceOf(WorkspaceMissingError);
    const db = await openDB(DB_NAME);
    expect(await db.getAll('files')).toEqual([]);
    db.close();
  });

  test('모양이 깨진 기록은 WorkspaceCorruptError다', async () => {
    const repository = await openWorkspaceRepository();
    const db = await openDB(DB_NAME);
    await db.put('workspace', { zipName: 'project.zip', zipBlob: 'Blob 아님' }, 'current');
    db.close();
    await expect(repository.readSummary()).rejects.toBeInstanceOf(WorkspaceCorruptError);
    await expect(repository.load()).rejects.toBeInstanceOf(WorkspaceCorruptError);
  });

  test('IndexedDB를 열 수 없으면 StorageUnavailableError다', async () => {
    (globalThis as { indexedDB: unknown }).indexedDB = {
      open: () => {
        throw new DOMException('막힘', 'SecurityError');
      },
    };
    await expect(openWorkspaceRepository()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
  test('save는 다른 작업 공간 id로 쓰면 WorkspaceMissingError이고 지금 저장본을 바꾸지 않는다', async () => {
    const repository = await openWorkspaceRepository();
    const oldId = await repository.replace({ zipName: 'old.zip', zipBlob: zip(), now: 1 });
    const newId = await repository.replace({ zipName: 'new.zip', zipBlob: zip(), now: 2 });
    expect(newId).not.toBe(oldId);
    await expect(
      repository.save({
        workspaceId: oldId,
        updatedAt: 3,
        files: { put: { 'a.txt': '옛 편집' }, remove: [] },
        treeChanges: [{ type: 'delete', path: 'a.txt' }],
      }),
    ).rejects.toBeInstanceOf(WorkspaceMissingError);
    const stored = await repository.load();
    expect(stored?.record).toMatchObject({ id: newId, zipName: 'new.zip', updatedAt: 2 });
    expect(stored?.record.treeChanges).toEqual([]);
    expect(stored?.files).toEqual({});
  });

  test('save와 readSummary는 원본 ZIP 저장소를 읽지도 쓰지도 않는다(ADR-0027)', async () => {
    const repository = await openWorkspaceRepository();
    const workspaceId = await repository.replace({
      zipName: 'project.zip',
      zipBlob: zip(),
      now: 1,
    });
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await repository.save({
      workspaceId,
      updatedAt: 2,
      files: { put: { 'a.txt': 'x' }, remove: [] },
    });
    await repository.readSummary();
    expect(transaction).toHaveBeenCalled();
    for (const [stores] of transaction.mock.calls) {
      expect([stores].flat()).not.toContain('zip');
    }
    // 기록을 다시 쓸 때 ZIP 바이트를 함께 옮기지 않는다(저장마다 ZIP 크기만큼 드는 비용).
    for (const [value] of put.mock.calls) {
      expect(Object.values(value as object).some((field) => field instanceof Uint8Array)).toBe(
        false,
      );
    }
  });

  test('원본 ZIP은 기록과 다른 저장소에 Blob으로 두고, 작업 공간 기록에는 바이트를 두지 않는다', async () => {
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'project.zip', zipBlob: zip(), now: 1 });
    const db = await openDB(DB_NAME);
    const record: unknown = await db.get('workspace', 'current');
    const stored: unknown = await db.get('zip', 'current');
    db.close();
    expect(record).not.toHaveProperty('zipBytes');
    expect(record).not.toHaveProperty('zipBlob');
    expect((stored as { blob: unknown }).blob).toBeInstanceOf(Blob);
  });

  test('Blob을 넣을 수 없는 브라우저면 한 번 알아본 뒤 바이트로 쓰고, 그 뒤로는 알아보지 않는다', async () => {
    const put = IDBObjectStore.prototype.put;
    const blobPuts = vi.fn();
    // WebKit 자동화 빌드 흉내: Blob이 든 값을 넣으면 트랜잭션이 실패한다.
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = put.call(this, value, key);
      if (this.name === 'zip' && (value as { blob?: unknown }).blob instanceof Blob) {
        blobPuts();
        this.transaction.abort();
      }
      return request;
    });
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'first.zip', zipBlob: zip(), now: 1 });
    const stored = await repository.load();
    expect(stored?.record.zipName).toBe('first.zip');
    expect(await stored?.record.zipBlob.text()).toBe('PK 가짜');
    expect(stored?.record.zipBlob.type).toBe('application/zip');
    await repository.replace({ zipName: 'second.zip', zipBlob: zip(), now: 2 });
    expect(blobPuts).toHaveBeenCalledTimes(1);
    expect((await repository.load())?.record.zipName).toBe('second.zip');
  });

  test('알아보려고 넣은 Blob은 남기지 않는다', async () => {
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'project.zip', zipBlob: zip(), now: 1 });
    const db = await openDB(DB_NAME);
    expect(await db.getAllKeys('zip')).toEqual(['current']);
    db.close();
  });

  test('ZIP을 쓰다 실패하면(용량 초과) 그 오류로 끝나고 옛 저장본은 그대로다', async () => {
    const repository = await openWorkspaceRepository();
    await repository.replace({ zipName: 'old.zip', zipBlob: zip(), now: 1 });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'zip') throw new DOMException('용량 초과', 'QuotaExceededError');
      return put.call(this, value, key);
    });
    await expect(
      repository.replace({ zipName: 'big.zip', zipBlob: zip(), now: 2 }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    vi.restoreAllMocks();
    expect((await repository.load())?.record.zipName).toBe('old.zip');
  });

  describe('버전 1 저장본 옮기기', () => {
    async function seedV1(record: Record<string, unknown>) {
      const db = await openDB(DB_NAME, 1, {
        upgrade(database) {
          database.createObjectStore('workspace');
          database.createObjectStore('files', { keyPath: 'path' });
        },
      });
      await db.put('workspace', record, 'current');
      await db.put('files', { path: 'a.txt', text: '고친 내용', updatedAt: 5 });
      db.close();
    }
    const v1Fields = {
      zipName: 'old.zip',
      createdAt: 1,
      updatedAt: 5,
      treeChanges: [{ type: 'add', path: 'new', isDirectory: true }],
      layout: { grid: 'json' },
      downloadRecord: null,
      unexported: { has: true, count: 1 },
    };

    test.each([
      [
        '바이트+MIME',
        { zipBytes: new TextEncoder().encode('PK 옛 바이트'), zipType: 'application/zip' },
      ],
      ['Blob', { zipBlob: new Blob(['PK 옛 바이트'], { type: 'application/zip' }) }],
    ])('%s로 원본을 둔 옛 기록도 그대로 되살리고, 이어서 저장할 수 있다', async (_, zipFields) => {
      await seedV1({ ...v1Fields, ...zipFields });
      const repository = await openWorkspaceRepository();
      await expect(repository.readSummary()).resolves.toEqual({
        zipName: 'old.zip',
        updatedAt: 5,
        unexported: { has: true, count: 1 },
      });
      const stored = await repository.load();
      expect(stored?.files).toEqual({ 'a.txt': '고친 내용' });
      expect(stored?.record).toMatchObject({
        zipName: 'old.zip',
        treeChanges: v1Fields.treeChanges,
        layout: { grid: 'json' },
      });
      expect(await stored?.record.zipBlob.text()).toBe('PK 옛 바이트');
      expect(stored?.record.zipBlob.type).toBe('application/zip');
      const db = await openDB(DB_NAME);
      const record: unknown = await db.get('workspace', 'current');
      db.close();
      expect(record).not.toHaveProperty('zipBytes');
      expect(record).not.toHaveProperty('zipBlob');
      await repository.save({
        workspaceId: stored?.record.id ?? '',
        updatedAt: 6,
        files: { put: { 'b.txt': '둘' }, remove: [] },
      });
      expect((await repository.load())?.files).toEqual({ 'a.txt': '고친 내용', 'b.txt': '둘' });
    });
  });
});
