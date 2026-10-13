// apps/zip-editor/src/services/appServices.ts
import { requestPersistence } from './browser/persistStorage';
import { saveFile } from './browser/saveFile';
import { createScheduleIdle, type ScheduleIdle } from './browser/scheduleIdle';
import { createEditLock, type EditLock } from './lock/editLock';
import { createLockChannel, type LockChannel } from './lock/lockChannel';
import { openWorkspaceRepository, type WorkspaceRepository } from './storage/workspaceRepository';
import { createZipWorker } from './zip/createZipWorker';
import { openZipInWorker, type ZipSource } from './zip/zipClient';

/** 세션 흐름이 쓰는 브라우저 기능 묶음. 테스트는 가짜 묶음을 넘긴다. */
export interface AppServices {
  readonly openZip: (blob: Blob) => Promise<ZipSource>;
  readonly openRepository: () => Promise<WorkspaceRepository>;
  readonly editLock: EditLock;
  readonly lockChannel: LockChannel;
  readonly saveFile: (blob: Blob, fileName: string) => void;
  readonly requestPersistence: () => Promise<boolean>;
  readonly scheduleIdle: ScheduleIdle;
}

/** 실제 브라우저 기능. 잠금·채널은 처음 쓸 때 만든다. 지원하지 않는 브라우저에서도 만들기만으로는 깨지지 않는다. */
export function createBrowserServices(): AppServices {
  return {
    openZip: (blob) => openZipInWorker(blob, createZipWorker),
    openRepository: openWorkspaceRepository,
    editLock: createEditLock(),
    lockChannel: createLockChannel(),
    saveFile: (blob, fileName) => saveFile(blob, fileName),
    requestPersistence: () => requestPersistence(),
    scheduleIdle: createScheduleIdle(),
  };
}
