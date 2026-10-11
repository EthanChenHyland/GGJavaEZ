import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ExecutionSession } from '../execution/contracts'
import { ConsoleOutput } from './ConsoleOutput'

const session = (changes: Partial<ExecutionSession> = {}): ExecutionSession => ({
  id: 'session-owned', revision: 1, projectId: 'project', mainClass: 'Main', kind: 'run', phase: 'COMPLETED',
  support: 'FULL', supportReason: null, build: null, rawEvents: [], sourceManifest: { sources: [], classes: [] }, capability: null,
  stdout: 'same\n', stderr: 'same\n', runEvents: [], pause: null, breakpoints: [], terminalStatus: 'complete',
  exitCode: 0, diagnostic: null, failureKind: null, startedAt: '2026-10-11T00:00:00Z', ...changes,
})
describe('Console output ownership', () => {
  it('labels unordered pipes separately and never deduplicates repeated equal captured text', () => {
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session()} recordingIsCurrent={false} entries={[]}/>)
    expect(html).toContain('cross-channel order not recorded')
    expect(html).toContain('aria-label="stdout rows"'); expect(html).toContain('aria-label="stderr rows"')
    expect(html.match(/console-line-preview">same</g)).toHaveLength(2)
  })
  it('uses actual run-event order rather than appending pipe copies', () => {
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session({ runEvents: [
      {id: 4, kind: 'stderr', text: 'first\n'}, {id: 5, kind: 'stdout', text: 'second\n'}, {id: 6, kind: 'stdin', text: 'exact & <input>'},
    ] })} recordingIsCurrent={false} entries={[]}/>)
    expect(html).toContain('Ordered process events'); expect(html).not.toContain('cross-channel order not recorded')
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'))
    expect(html).toContain('exact &amp; &lt;input&gt;'); expect(html).not.toContain('console-line-preview">same')
  })
  it('keeps cap and archive failure notices associated with the actual session, including ordered fallback output', () => {
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session({ outputTruncated: true,
      outputArchiveAvailable: true, outputArchiveError: 'disk full', runEvents: [{id: 1, kind: 'stdout', text: 'retained\n'}],
    })} recordingIsCurrent={false} entries={[]}/>)
    expect(html.indexOf('retained')).toBeLessThan(html.indexOf('Inline console retention limit reached here'))
    expect(html).toContain('/api/execution/session-owned/output/stdout')
    expect(html).toContain('/api/execution/session-owned/output/stderr'); expect(html).toContain('disk full')
  })
})
