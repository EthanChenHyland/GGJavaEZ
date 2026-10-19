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
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session()} hasRecording={false} entries={[]}/>)
    expect(html).toContain('cross-channel order not recorded')
    expect(html).toContain('aria-label="stdout rows"'); expect(html).toContain('aria-label="stderr rows"')
    expect(html.match(/console-line-preview">same</g)).toHaveLength(2)
  })
  it('uses actual run-event order rather than appending pipe copies', () => {
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session({ runEvents: [
      {id: 4, kind: 'stderr', text: 'first\n'}, {id: 5, kind: 'stdout', text: 'second\n'}, {id: 6, kind: 'stdin', text: 'exact & <input>'},
    ] })} hasRecording={false} entries={[]}/>)
    expect(html).toContain('Ordered process events'); expect(html).not.toContain('cross-channel order not recorded')
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'))
    expect(html).toContain('exact &amp; &lt;input&gt;'); expect(html).not.toContain('console-line-preview">same')
  })
  it('keeps cap and archive failure notices associated with the actual session, including ordered fallback output', () => {
    const html = renderToStaticMarkup(<ConsoleOutput build={null} execution={session({ outputTruncated: true,
      outputArchiveAvailable: true, outputArchiveError: 'disk full', runEvents: [{id: 1, kind: 'stdout', text: 'retained\n'}],
    })} hasRecording={false} entries={[]}/>)
    expect(html.indexOf('retained')).toBeLessThan(html.indexOf('Inline console retention limit reached here'))
    expect(html).toContain('/api/execution/session-owned/output/stdout')
    expect(html).toContain('/api/execution/session-owned/output/stderr'); expect(html).toContain('disk full')
  })
})

const prefixInput = {eventId:'captured-input',frameId:'invocation',kind:'input' as const,text:'  +009\n',value:{kind:'primitive' as const,javaType:'int' as const,value:9},source:{fileId:'Unit.java',line:12},destinationSlotId:'raw'}
const prefixOutput = {eventId:'captured-output',frameId:'invocation',kind:'output' as const,text:'Result: 9\n',value:{kind:'primitive' as const,javaType:'int' as const,value:9},source:{fileId:'Unit.java',line:24}}
const prefixMarkup=(entries:readonly import('../contracts/runtime').ConsoleEntry[])=>renderToStaticMarkup(<ConsoleOutput build={null} execution={null} hasRecording entries={entries}/>)
describe('applied-prefix successors of the retired standalone ConsolePane',()=>{
 it('renders captured input/output in recorder order with their actual channel glyphs',()=>{
  const html=prefixMarkup([prefixInput,prefixOutput])
  expect(html).toContain('aria-label="Recorded console rows"');expect(html).toContain('aria-label="stdin"');expect(html).toContain('aria-label="stdout"')
  expect(html).toContain('  +009');expect(html).toContain('Result: 9');expect(html.indexOf('  +009')).toBeLessThan(html.indexOf('Result: 9'))
 })
 it('removes future output on reverse seek, clears reset and restores the exact replay prefix',()=>{
  expect(prefixMarkup([prefixInput,prefixOutput])).toContain('Result: 9')
  const reversed=prefixMarkup([prefixInput]);expect(reversed).toContain('  +009');expect(reversed).not.toContain('Result: 9')
  const reset=prefixMarkup([]);expect(reset).toContain('0 rows');expect(reset).not.toContain('  +009');expect(reset).not.toContain('Result: 9')
  expect(prefixMarkup([prefixInput,prefixOutput])).toContain('Result: 9')
 })
 it('uses supplied text rather than its scalar value and retains exact whitespace inside line previews',()=>{
  const html=prefixMarkup([{...prefixOutput,text:'  label\t= 0009\r\nsecond line\n'}])
  expect(html).toContain('  label\t= 0009');expect(html).toContain('second line');expect(html).not.toContain('Result: 9')
  expect(prefixMarkup([{...prefixOutput,text:''}])).not.toContain('Result: 9')
 })
 it('escapes recorded markup without fabricating a missing source location',()=>{
  const html=prefixMarkup([{...prefixOutput,text:'<script>alert("x")</script>&',source:null}])
  expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;');expect(html).not.toContain('<script>');expect(html).not.toContain('Unit.java')
 })
 it('does not mutate frozen recorded entries or append presentation history across prefix replacements',()=>{
  const entries=Object.freeze([Object.freeze({...prefixInput}),Object.freeze({...prefixOutput})]),before=JSON.stringify(entries)
  prefixMarkup(entries);prefixMarkup(entries.slice(0,1));prefixMarkup([]);prefixMarkup(entries)
  expect(JSON.stringify(entries)).toBe(before)
 })
})
