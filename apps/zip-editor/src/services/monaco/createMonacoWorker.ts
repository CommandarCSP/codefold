// apps/zip-editor/src/services/monaco/createMonacoWorker.ts
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

/**
 * `<CodeEditor createWorker>`에 넘기는 Monaco worker 생성 함수(ADR-0021). EditorHost만 부르므로 에디터 청크에 들어간다.
 * `monaco-editor`의 exports(`./*` → `./esm/vs/*.js`)로 경로를 찾는다.
 */
export function createMonacoWorker(label: string): Worker {
  switch (label) {
    case 'json':
      return new JsonWorker();
    case 'css':
    case 'scss':
    case 'less':
      return new CssWorker();
    case 'html':
    case 'handlebars':
    case 'razor':
      return new HtmlWorker();
    case 'typescript':
    case 'javascript':
      return new TsWorker();
    default:
      return new EditorWorker();
  }
}
