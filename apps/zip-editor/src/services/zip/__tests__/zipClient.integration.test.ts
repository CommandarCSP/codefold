// @vitest-environment node
import type { ExportPlan } from '@codefold/react-code-editor';
import { NotZipError, openZip } from '@codefold/zip-archive';
import { describe, expect, test } from 'vitest';
import { openZipInWorker, ZipSourceDisposedError, ZipWorkerCrashedError } from '../zipClient';
import { createLoopbackPort } from './loopbackPort';
import { bytes, sampleZip } from './sampleZip';

const plan: ExportPlan = {
  entries: [
    { type: 'copy', path: 'src/a.txt', originalPath: 'src/a.txt' },
    { type: 'copy', path: 'run.sh', originalPath: 'run.sh' },
    { type: 'write', path: 'new.txt' },
  ],
  versions: {},
  structureVersion: 1,
  hashes: {},
  paths: ['new.txt', 'run.sh', 'src/a.txt'],
};

describe('ZIP 대리 객체 (ADR-0028)', () => {
  test('FileSource 모양으로 목록·앞부분·전체를 읽는다. Blob은 transfer 없이 그대로 넘긴다', async () => {
    const blob = await sampleZip();
    const port = createLoopbackPort();
    const source = await openZipInWorker(blob, () => port);
    expect((await source.list()).map((entry) => entry.path)).toEqual([
      'src/a.txt',
      'run.sh',
      'logs',
    ]);
    expect(await source.readHead('src/a.txt', 3)).toEqual(bytes('에'));
    expect(new TextDecoder().decode(await source.readAll('src/a.txt'))).toBe('에이');
    expect(port.sent[0]?.message).toMatchObject({ type: 'open' });
    expect(port.sent[0]?.transfer).toEqual([]);
  });

  test('exportZip은 계획과 새 바이트만 보내고 Blob 하나만 받는다. 원본 압축 바이트는 넘어오지 않는다', async () => {
    const port = createLoopbackPort();
    const source = await openZipInWorker(await sampleZip(), () => port);
    const dirtyContents = { 'new.txt': bytes('새 내용') };
    const zip = await source.exportZip({ plan, dirtyContents });
    expect(dirtyContents['new.txt'].byteLength).toBe(0);
    const exportSent = port.sent.at(-1);
    expect(exportSent?.message).toMatchObject({ type: 'export', plan });
    expect(exportSent?.transfer).toHaveLength(1);
    const exportReceived = port.received.at(-1);
    expect(exportReceived).toMatchObject({ ok: true, result: { type: 'export' } });
    expect(Object.keys(exportReceived?.ok ? exportReceived.result : {})).toEqual(['type', 'blob']);
    const reopened = await openZip(zip);
    expect(new TextDecoder().decode(await reopened.readAll('new.txt'))).toBe('새 내용');
  });

  test('열기에 실패하면 Worker를 끝내고 zip-archive 오류 class를 던진다', async () => {
    const port = createLoopbackPort();
    await expect(openZipInWorker(new Blob(['zip 아님']), () => port)).rejects.toBeInstanceOf(
      NotZipError,
    );
    expect(port.terminated).toBe(true);
  });

  test('Worker가 멈추면 기다리던 요청이 ZipWorkerCrashedError로 끝난다', async () => {
    const port = createLoopbackPort({ hold: (message) => message.type === 'readAll' });
    const source = await openZipInWorker(await sampleZip(), () => port);
    const reading = source.readAll('src/a.txt');
    port.crash(new ZipWorkerCrashedError('멈춤'));
    await expect(reading).rejects.toBeInstanceOf(ZipWorkerCrashedError);
    await expect(source.readAll('src/a.txt')).rejects.toBeInstanceOf(ZipWorkerCrashedError);
  });

  test('dispose하면 Worker를 끝내고, 기다리던 요청과 뒤의 요청은 ZipSourceDisposedError다', async () => {
    const port = createLoopbackPort({ hold: (message) => message.type === 'readAll' });
    const source = await openZipInWorker(await sampleZip(), () => port);
    const reading = source.readAll('src/a.txt');
    source.dispose();
    await expect(reading).rejects.toBeInstanceOf(ZipSourceDisposedError);
    await expect(source.readHead('src/a.txt', 1)).rejects.toBeInstanceOf(ZipSourceDisposedError);
    expect(port.terminated).toBe(true);
  });

  test('요청을 보내다 던지면 그 요청만 실패하고, 다음 요청은 그대로 된다', async () => {
    const port = createLoopbackPort();
    const source = await openZipInWorker(await sampleZip(), () => port);
    const post = port.postMessage.bind(port);
    port.postMessage = () => {
      throw new DOMException('복제할 수 없습니다', 'DataCloneError');
    };
    await expect(source.readAll('src/a.txt')).rejects.toMatchObject({ name: 'DataCloneError' });
    port.postMessage = post;
    expect(new TextDecoder().decode(await source.readAll('src/a.txt'))).toBe('에이');
  });
});
