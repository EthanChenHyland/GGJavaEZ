import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ConsoleLines } from '../../../src/shell/ConsoleLines'
import type { ConsoleChunk } from '../../../src/shell/consoleLineIndex'
import '../../../src/shell/shell.css'

declare global { interface Window { consoleFixture: { set(chunks: ConsoleChunk[]): void } } }
const root = createRoot(document.getElementById('console-test')!)
window.consoleFixture = { set(chunks) {
  flushSync(() => root.render(<div className="shell"><div className="ide-console-output" style={{padding:24}}>
    <ConsoleLines chunks={chunks} label="Captured output"/>
  </div></div>))
} }
window.consoleFixture.set([{ key: 'pipe', channel: 'stdout', text: 'first\n' + 'middle\n'.repeat(999998) + 'last\n' }])
