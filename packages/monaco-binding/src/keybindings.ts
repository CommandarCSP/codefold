import type { MonacoApi } from './types';

/** undo: Ctrl+Z(macOS는 Cmd+Z). 운영체제와 상관없이 같도록 명시한다. */
export function undoKeybinding(monaco: MonacoApi): number {
  return monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ;
}

/** redo: Ctrl+Shift+Z(macOS는 Cmd+Shift+Z). Monaco 기본값은 Windows에서 Ctrl+Y라 명시해서 등록한다(ADR-0021). */
export function redoKeybinding(monaco: MonacoApi): number {
  return monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ;
}
