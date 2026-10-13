// apps/zip-editor/src/business/hooks/session/__tests__/downloadFlow.integration.test.ts
import { describe, expect, test } from 'vitest';
import { createFakeController, createTestFlows, deferred, zipFile } from '@/test/fakes';
import { messages } from '@/utils/messages';

async function readyFlows() {
  const harness = createTestFlows();
  await harness.flows.openFiles([zipFile('project.zip')]);
  const controller = createFakeController({
    hasChanges: true,
    unexportedCount: 1,
    contents: { 'a.txt': '고침' },
  });
  harness.flows.editorReady(1, controller);
  const source = harness.services.sources[0];
  if (!source) throw new Error('ZIP이 열리지 않았다');
  return { ...harness, controller, source };
}

describe('다운로드', () => {
  test('계획 → Worker ZIP → 원래 이름으로 내려받기 → 기록 → 지문 저장 → 라이브 영역 안내', async () => {
    const { flows, store, services, controller, source } = await readyFlows();
    await flows.download();
    expect(source.exported).toEqual([controller.exportRequest]);
    expect(services.saved).toEqual([{ blob: source.result, fileName: 'project.zip' }]);
    expect(controller.marked).toEqual([controller.exportRequest.plan]);
    await expect
      .poll(() => services.repository.record?.downloadRecord)
      .toEqual({
        files: { 'a.txt': 'ab12' },
        paths: ['a.txt'],
        exportedAt: 1000,
      });
    expect(Object.keys(services.repository.record?.downloadRecord ?? {})).toEqual([
      'files',
      'paths',
      'exportedAt',
    ]);
    expect(store.getState()).toMatchObject({
      downloading: false,
      hasChanges: true,
      announcement: { text: messages.downloadDone('project.zip') },
    });
  });

  test('만드는 동안 downloading이고, 두 번 눌러도 ZIP은 한 번만 만든다', async () => {
    const { flows, store, controller } = await readyFlows();
    const gate = deferred<void>();
    const original = controller.createExportPlan;
    controller.createExportPlan = async () => {
      await gate.promise;
      return original();
    };
    const first = flows.download();
    expect(store.getState().downloading).toBe(true);
    await flows.download();
    gate.resolve();
    await first;
    expect(controller.marked).toHaveLength(1);
  });

  test('ZIP 쓰기가 실패하면 오류를 남기고 다운로드 기록을 바꾸지 않는다', async () => {
    const { flows, store, services, controller, source } = await readyFlows();
    source.result = new Error('쓰기 실패');
    await flows.download();
    expect(store.getState()).toMatchObject({ downloading: false, downloadError: source.result });
    expect(controller.marked).toEqual([]);
    expect(services.saved).toEqual([]);
    expect(services.repository.record?.downloadRecord).toBeNull();
  });

  test('다시 누르면 앞의 오류를 지우고 다시 만든다', async () => {
    const { flows, store, source } = await readyFlows();
    source.result = new Error('쓰기 실패');
    await flows.download();
    source.result = new Blob(['PK']);
    await flows.download();
    expect(store.getState().downloadError).toBeNull();
    expect(source.exported).toHaveLength(2);
  });

  test('바뀐 것이 없으면 아무것도 하지 않는다', async () => {
    const { flows, controller, source } = await readyFlows();
    controller.emit.changes(false);
    await flows.download();
    expect(source.exported).toEqual([]);
  });

  test('만드는 사이 새 ZIP으로 바뀌면 옛 ZIP은 내려받지 않는다', async () => {
    const { flows, services, controller, dialogs } = await readyFlows();
    const gate = deferred<void>();
    const original = controller.createExportPlan;
    controller.createExportPlan = async () => {
      await gate.promise;
      return original();
    };
    const downloading = flows.download();
    dialogs.answers.push(true);
    await flows.openFiles([zipFile('next.zip')]);
    gate.resolve();
    await downloading;
    expect(services.saved).toEqual([]);
    expect(controller.marked).toEqual([]);
  });
});
