import type { editor } from 'monaco-editor'
import type { SourceMark } from './sourceScrollPolicy'

const marks: Record<SourceMark, { className: string; linesDecorationsClassName: string }> = {
  running: { className: 'executing-line', linesDecorationsClassName: 'executing-gutter' },
  paused: { className: 'debug-paused-line', linesDecorationsClassName: 'debug-paused-gutter' },
  history: { className: 'executing-line gg-source-history-line', linesDecorationsClassName: 'gg-source-history-gutter' },
  focus: { className: 'executing-line gg-source-focus-line', linesDecorationsClassName: 'executing-gutter' },
  reveal: { className: 'gg-source-reveal-line', linesDecorationsClassName: 'gg-source-reveal-gutter' },
}

/** One visual grammar for editable and recorded source; no editor loading here. */
export function sourceDecorations(line: number | null, mark: SourceMark, exceptionLine: number | null, lineCount: number): editor.IModelDeltaDecoration[] {
  const valid = (value: number | null): value is number => value !== null && Number.isInteger(value) && value >= 1 && value <= lineCount
  const range = (value: number) => ({ startLineNumber: value, endLineNumber: value, startColumn: 1, endColumn: 1 })
  const decorations: editor.IModelDeltaDecoration[] = []
  if (valid(line)) decorations.push({ range: range(line), options: {
    isWholeLine: true, ...marks[mark], lineNumberClassName: 'gg-source-current-number',
  } })
  if (valid(exceptionLine)) decorations.push({ range: range(exceptionLine), options: {
    isWholeLine: true, className: 'gg-source-exception-line', linesDecorationsClassName: 'gg-source-exception-gutter', lineNumberClassName: 'gg-source-exception-number',
  } })
  return decorations
}
