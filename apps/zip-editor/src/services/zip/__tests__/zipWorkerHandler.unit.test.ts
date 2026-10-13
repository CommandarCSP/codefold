// @vitest-environment node
import type { ExportPlan } from '@codefold/react-code-editor';
import { NotZipError, openZip } from '@codefold/zip-archive';
import { describe, expect, test } from 'vitest';
import { deserializeError, type ZipResult } from '../zipProtocol';
import { createZipWorkerHandler, postHandled, type HandledResponse } from '../zipWorkerHandler';
import { bytes, EXECUTABLE, sampleZip } from './sampleZip';

function resultOf(handled: HandledResponse): ZipResult {
  if (!handled.response.ok) throw deserializeError(handled.response.error);
  return handled.response.result;
}

describe('ZIP Worker 처리기 (ADR-0028)', () => {
  test('open은 목록만 FileSource 항목 모양으로 돌려준다', async () => {
    const handle = createZipWorkerHandler();
    const result = resultOf(await handle({ id: 1, type: 'open', blob: await sampleZip() }));
    expect(result).toEqual({
      type: 'open',
      entries: [
        { path: 'src/a.txt', isDirectory: false, size: 6 },
        { path: 'run.sh', isDirectory: false, size: 18 },
        { path: 'logs', isDirectory: true, size: 0 },
      ],
    });
  });

  test('돌려주는 바이트는 버퍼를 따로 가져, transfer해도 다음 읽기가 된다', async () => {
    const handle = createZipWorkerHandler();
    resultOf(await handle({ id: 1, type: 'open', blob: await sampleZip() }));
    const handled = await handle({ id: 2, type: 'readAll', path: 'src/a.txt' });
    const result = resultOf(handled);
    if (result.type !== 'bytes') throw new Error('bytes 응답이 아니다');
    expect(result.bytes.byteLength).toBe(result.bytes.buffer.byteLength);
    expect(handled.transfer).toEqual([result.bytes.buffer]);
    // 메인 스레드로 보낸 것처럼 버퍼를 넘겨 분리한다.
    structuredClone(handled.response, { transfer: handled.transfer });
    expect(result.bytes.byteLength).toBe(0);
    expect(
      resultOf(await handle({ id: 3, type: 'readHead', path: 'src/a.txt', bytes: 3 })),
    ).toEqual({
      type: 'bytes',
      bytes: bytes('에'),
    });
  });

  test('export: copy는 원본 압축 바이트, write는 원래 경로의 속성, directory는 폴더 항목', async () => {
    const source = await sampleZip();
    const handle = createZipWorkerHandler();
    resultOf(await handle({ id: 1, type: 'open', blob: source }));
    const plan: ExportPlan = {
      entries: [
        { type: 'copy', path: 'src/a.txt', originalPath: 'src/a.txt' },
        { type: 'write', path: 'start.sh', originalPath: 'run.sh' },
        { type: 'write', path: 'new.txt' },
        { type: 'directory', path: 'logs' },
      ],
      versions: { 'start.sh': 4 },
      structureVersion: 2,
      hashes: {},
      paths: ['new.txt', 'src/a.txt', 'start.sh'],
    };
    const result = resultOf(
      await handle({
        id: 2,
        type: 'export',
        plan,
        dirtyContents: { 'start.sh': bytes('#!/bin/sh\necho bye\n'), 'new.txt': bytes('새 파일') },
      }),
    );
    if (result.type !== 'export') throw new Error('export 응답이 아니다');
    const [original, exported] = await Promise.all([openZip(source), openZip(result.blob)]);
    expect(exported.entries.map((entry) => entry.path)).toEqual([
      'src/a.txt',
      'start.sh',
      'new.txt',
      'logs',
    ]);
    const [before, after] = await Promise.all([
      original.readRaw('src/a.txt'),
      exported.readRaw('src/a.txt'),
    ]);
    expect(new Uint8Array(await after.data.arrayBuffer())).toEqual(
      new Uint8Array(await before.data.arrayBuffer()),
    );
    const start = exported.entries.find((entry) => entry.path === 'start.sh');
    expect(start?.externalAttributes).toBe(EXECUTABLE.externalAttributes);
    expect(new TextDecoder().decode(await exported.readAll('start.sh'))).toBe(
      '#!/bin/sh\necho bye\n',
    );
    expect(new TextDecoder().decode(await exported.readAll('new.txt'))).toBe('새 파일');
    expect(exported.entries.find((entry) => entry.path === 'new.txt')?.externalAttributes).not.toBe(
      EXECUTABLE.externalAttributes,
    );
    expect(exported.entries.find((entry) => entry.path === 'logs')?.isDirectory).toBe(true);
  });

  test('ZIP이 아니면 NotZipError로 되살릴 수 있는 오류를 돌려준다', async () => {
    const handled = await createZipWorkerHandler()({
      id: 1,
      type: 'open',
      blob: new Blob(['zip 아님']),
    });
    expect(handled.response.ok).toBe(false);
    if (handled.response.ok) return;
    expect(deserializeError(handled.response.error)).toBeInstanceOf(NotZipError);
  });

  test('열기 전에 읽거나, write 바이트가 없으면 이름으로 구분되는 오류다', async () => {
    const handle = createZipWorkerHandler();
    const early = await handle({ id: 1, type: 'readAll', path: 'a' });
    expect(early.response).toMatchObject({ ok: false, error: { name: 'ZipNotOpenError' } });
    await handle({ id: 2, type: 'open', blob: await sampleZip() });
    const missing = await handle({
      id: 3,
      type: 'export',
      plan: {
        entries: [{ type: 'write', path: 'x.txt' }],
        versions: {},
        structureVersion: 1,
        hashes: {},
        paths: ['x.txt'],
      },
      dirtyContents: {},
    });
    expect(missing.response).toMatchObject({
      ok: false,
      error: { name: 'MissingExportDataError', path: 'x.txt' },
    });
  });

  test('응답을 보내다 던지면(DataCloneError 등) 같은 id로 실패 응답을 보내 메인 스레드가 기다리지 않게 한다', () => {
    const posted: Array<{ message: unknown; transfer: readonly Transferable[] }> = [];
    const post = (message: unknown, transfer: Transferable[]) => {
      if (posted.length === 0) {
        posted.push({ message, transfer });
        throw new DOMException('복제할 수 없습니다', 'DataCloneError');
      }
      posted.push({ message, transfer });
    };
    const buffer = new ArrayBuffer(4);
    postHandled(
      {
        response: { id: 7, ok: true, result: { type: 'bytes', bytes: new Uint8Array(buffer) } },
        transfer: [buffer],
      },
      post,
    );
    expect(posted).toHaveLength(2);
    expect(posted[1]).toEqual({
      message: {
        id: 7,
        ok: false,
        error: { name: 'DataCloneError', message: '복제할 수 없습니다' },
      },
      transfer: [],
    });
  });
});
