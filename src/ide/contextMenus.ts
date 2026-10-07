import type { IdeCommandId } from './commands'

export const tabMenuCommands: readonly IdeCommandId[] = [
  'editor.close', 'editor.closeOthers', 'editor.closeRight', 'editor.closeSaved',
  'resource.rename', 'explorer.reveal', 'resource.copyPath',
]
export function explorerMenuCommands(kind: 'file' | 'directory' | null): readonly IdeCommandId[] {
  if (kind === 'file') return ['file.open', 'resource.rename', 'resource.delete', 'resource.copyPath', 'explorer.reveal']
  return ['file.new', 'java.newClass', 'folder.new', ...(kind === 'directory' ? ['resource.rename', 'resource.delete', 'resource.copyPath', 'explorer.reveal'] as IdeCommandId[] : [])]
}

export function menuTargetIndex(key: string, current: number, count: number): number | null {
  if (!count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (current < 0 && key === 'ArrowDown') return 0
  if (current < 0 && key === 'ArrowUp') return count - 1
  if (key === 'ArrowDown') return (current + 1 + count) % count
  if (key === 'ArrowUp') return (current - 1 + count) % count
  return null
}
