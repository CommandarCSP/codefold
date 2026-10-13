import { createWorkerEnvironment, type WorkerFactory } from '@codefold/monaco-binding';
import type * as MonacoModule from 'monaco-editor';

export type Monaco = typeof MonacoModule;

let loading: Promise<Monaco> | undefined;

/**
 * Monaco 전체를 한 번만 불러와 설정한다. 기본 진입점이 구문 강조 언어 전부와 언어 서비스 4종을 등록하고,
 * 실제 규칙과 worker는 그 언어 파일을 처음 열 때 불러온다(ADR-0026).
 * 브라우저에서 `<CodeEditor>`가 마운트될 때만 부른다.
 */
export function loadMonaco(createWorker: WorkerFactory): Promise<Monaco> {
  const scope = globalThis as { MonacoEnvironment?: unknown };
  // worker는 쓰는 쪽 함수로 만든다. 쓰는 쪽이 이미 직접 설정했으면 그대로 둔다(ADR-0021).
  scope.MonacoEnvironment ??= createWorkerEnvironment(createWorker);
  loading ??= import('monaco-editor').then(
    (monaco) => {
      configureMonaco(monaco);
      return monaco;
    },
    (error: unknown) => {
      // 내려받기에 실패했으면 다음 호출에서 다시 시도한다.
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/** TypeScript·JavaScript 언어 서비스가 열린 model 전체를 한 프로젝트로 보게 한다. */
export function configureMonaco(monaco: Monaco): void {
  const { typescript } = monaco;
  const options = {
    ...typescript.typescriptDefaults.getCompilerOptions(),
    allowJs: true,
    allowNonTsExtensions: true,
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    target: typescript.ScriptTarget.ESNext,
    esModuleInterop: true,
  };
  for (const defaults of [typescript.typescriptDefaults, typescript.javascriptDefaults]) {
    defaults.setCompilerOptions(options);
    // 열지 않은 파일은 모른다. 열린 model만 언어 서비스에 넘긴다.
    defaults.setEagerModelSync(true);
  }
}
