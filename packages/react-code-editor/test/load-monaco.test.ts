import { createModelRegistry } from '@codefold/monaco-binding';
import { beforeAll, describe, expect, test } from 'vitest';
import { EDITOR_OPTIONS } from '../src/monaco/editor-options';
import { loadMonaco } from '../src/monaco/load-monaco';

const fakeWorker = () => ({}) as Worker;

// monaco-editor 전체를 처음 불러오는 데 몇 초 걸린다. 병렬 실행에서도 각 테스트 시간 제한에 걸리지 않게 먼저 불러 둔다.
beforeAll(() => loadMonaco(fakeWorker), 60_000);

describe('loadMonaco (ADR-0026)', () => {
  test('구문 강조 언어와 언어 서비스를 모두 등록한다', async () => {
    const monaco = await loadMonaco(fakeWorker);
    const ids = monaco.languages.getLanguages().map((language) => language.id);
    expect(ids.length).toBeGreaterThanOrEqual(81);
    for (const id of [
      'python',
      'typescript',
      'javascript',
      'json',
      'css',
      'html',
      'dockerfile',
      'markdown',
      'java',
      'go',
    ]) {
      expect(ids).toContain(id);
    }
  });

  test('두 번 불러도 같은 Monaco를 돌려준다', async () => {
    expect(await loadMonaco(fakeWorker)).toBe(await loadMonaco(fakeWorker));
  });

  test('쓰는 쪽 worker 함수로 MonacoEnvironment를 설정하고, 이미 있으면 건드리지 않는다', async () => {
    type Environment = { getWorker?: (id: string, label: string) => unknown };
    const scope = globalThis as { MonacoEnvironment?: Environment };
    const labels: string[] = [];
    delete scope.MonacoEnvironment;
    await loadMonaco((label) => {
      labels.push(label);
      return {} as Worker;
    });
    // delete 뒤라 TypeScript가 undefined로 좁히므로, loadMonaco가 넣은 값을 다시 읽는다.
    (scope.MonacoEnvironment as Environment | undefined)?.getWorker?.('id', 'json');
    expect(labels).toEqual(['json']);
    const mine = { getWorker: () => ({}) as Worker };
    scope.MonacoEnvironment = mine;
    await loadMonaco(fakeWorker);
    expect(scope.MonacoEnvironment).toBe(mine);
  });

  test('TypeScript는 JS·JSX를 받고 열린 model 전체를 한 프로젝트로 본다', async () => {
    const monaco = await loadMonaco(fakeWorker);
    const options = monaco.typescript.typescriptDefaults.getCompilerOptions();
    expect(options).toMatchObject({
      allowJs: true,
      allowNonTsExtensions: true,
      jsx: monaco.typescript.JsxEmit.ReactJSX,
      module: monaco.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    });
    expect(monaco.typescript.typescriptDefaults.getEagerModelSync()).toBe(true);
    expect(monaco.typescript.javascriptDefaults.getEagerModelSync()).toBe(true);
  });

  test('언어는 확장자·파일 이름·shebang으로 정하고, 모르면 일반 텍스트다', async () => {
    const monaco = await loadMonaco(fakeWorker);
    const registry = createModelRegistry(monaco);
    expect(registry.open('src/main.py', 'print(1)').getLanguageId()).toBe('python');
    expect(registry.open('Dockerfile', 'FROM node').getLanguageId()).toBe('dockerfile');
    expect(registry.open('run', '#!/usr/bin/env python\nprint(1)').getLanguageId()).toBe('python');
    expect(registry.open('notes.zzz', 'hello').getLanguageId()).toBe('plaintext');
    registry.dispose();
  });

  test('다른 언어는 열린 모든 파일의 단어를 자동완성 후보로 쓴다', () => {
    expect(EDITOR_OPTIONS.wordBasedSuggestions).toBe('allDocuments');
  });
});
