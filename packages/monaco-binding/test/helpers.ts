import type { TextModel } from '../src/types';

/** model 끝에 글자를 붙인다. 한 번 부를 때마다 undo 한 단계가 된다. */
export function typeInto(model: TextModel, text: string): void {
  model.pushStackElement();
  model.pushEditOperations(
    [],
    [{ range: model.getFullModelRange().collapseToEnd(), text }],
    () => null,
  );
  model.pushStackElement();
}
