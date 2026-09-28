import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConsoleEntry } from '../contracts/runtime'
import { ConsolePane, type ConsolePaneProps } from './ConsolePane'

const input: ConsoleEntry = {
  eventId: 'read-a', frameId: 'invocation-a', kind: 'input', text: '  +009\n',
  value: { kind: 'primitive', javaType: 'int', value: 9 },
  source: { fileId: 'Example.java', line: 12 }, destinationSlotId: 'raw', readerObjectId: 'reader',
}
const output: ConsoleEntry = {
  eventId: 'write-b', frameId: 'invocation-a', kind: 'output', text: 'Result: 9\n',
  value: { kind: 'primitive', javaType: 'int', value: 9 }, source: { fileId: 'Example.java', line: 24 },
}

function render(props: Partial<ConsolePaneProps> = {}) {
  return renderToStaticMarkup(<ConsolePane entries={[]} activeEventId={null} status="ready" {...props} />)
}

describe('ConsolePane applied runtime prefix', () => {
  it('renders exact supplied text in ordered INPUT and OUTPUT rows with accessible source hints', () => {
    const markup = render({ entries: [input, output], activeEventId: output.eventId, status: 'running' })
    expect(markup).toContain('data-console-kind="input"')
    expect(markup).toContain('data-console-kind="output"')
    expect(markup).toContain('>INPUT</span>')
    expect(markup).toContain('>OUTPUT</span>')
    expect(markup).toContain(`<pre class="console-pane__text">${input.text}</pre>`)
    expect(markup).toContain(`<pre class="console-pane__text">${output.text}</pre>`)
    expect(markup.indexOf('read-a')).toBeLessThan(markup.indexOf('write-b'))
    expect(markup).toContain('aria-label="Source Example.java, line 12"')
    expect(markup).toContain('aria-label="Source Example.java, line 24"')
    expect(markup).toContain('>L12</span>')
    expect(markup).toContain('title="Example.java:24"')
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1)
  })

  it('renders only the supplied prefix and no future output', () => {
    const markup = render({ entries: [input], activeEventId: 'later-non-io-event', status: 'running' })
    expect(markup).toContain(input.text)
    expect(markup).not.toContain(output.text)
    expect(markup).not.toContain('data-console-kind="output"')
    expect(markup).not.toContain('aria-current')
    expect(markup).toContain('1 entry')
  })

  it('removes output when seeking backward, clears the prefix on reset, and restores it on replay', () => {
    expect(render({ entries: [input, output], status: 'ended' })).toContain(output.text)
    const reversed = render({ entries: [input], activeEventId: input.eventId, status: 'running' })
    expect(reversed).toContain(input.text)
    expect(reversed).not.toContain(output.text)
    const reset = render()
    expect(reset).toContain('No console entries at this step.')
    expect(reset).toContain('0 entries')
    expect(reset).not.toContain('data-console-kind')
    expect(render({ entries: [input, output], status: 'ended' }).match(/data-console-kind=/g)).toHaveLength(2)
  })

  it('uses trace text rather than formatting or inferring output from its scalar value', () => {
    const entry: ConsoleEntry = { ...output, text: '  label\t= 0009\r\nsecond line\n' }
    expect(render({ entries: [entry] })).toContain(`<pre class="console-pane__text">${entry.text}</pre>`)
    expect(render({ entries: [{ ...output, text: '' }] })).toContain('<pre class="console-pane__text"></pre>')
  })

  it('escapes supplied HTML and provides an accessible fallback for missing source', () => {
    const markup = render({ entries: [{ ...output, text: '<script>alert("x")</script>&', source: null }] })
    expect(markup).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;')
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('aria-label="No source location"')
  })

  it.each(['ready', 'running', 'ended'] as const)('reports %s without inventing console entries', (status) => {
    const markup = render({ status })
    expect(markup).toContain(`data-console-status="${status}"`)
    expect(markup).toContain('aria-label="Execution status:')
    expect(markup).toContain('No console entries at this step.')
    expect(markup).not.toContain('data-console-kind')
  })

  it('starts compact mode collapsed with the last entry, count, and an accessible expand button', () => {
    const markup = render({ entries: [input, output], compact: true, status: 'ended' })
    expect(markup).toContain('console-pane--compact')
    expect(markup).toContain('2 entries')
    expect(markup).toContain('Expand console</button>')
    expect(markup).toContain('aria-expanded="false"')
    const controlledId = markup.match(/aria-controls="([^"]+)"/)?.[1]
    expect(controlledId).toBeTruthy()
    expect(markup).toContain(`id="${controlledId}" hidden=""`)
    expect(markup).toContain(output.text)
    expect(markup).not.toContain(input.text)
    expect(markup).not.toContain('data-console-kind')
  })

  it('clears the compact last-entry summary when the runtime prefix is reset', () => {
    expect(render({ entries: [output], compact: true })).toContain(output.text)
    const markup = render({ compact: true })
    expect(markup).not.toContain(output.text)
    expect(markup).toContain('0 entries')
    expect(markup).toContain('No console entries at this step.')
    expect(markup).toContain('Expand console</button>')
  })

  it('does not mutate frozen runtime entries or append presentation history', () => {
    const entries = Object.freeze([Object.freeze({ ...input }), Object.freeze({ ...output })])
    const props = { entries: entries as unknown as ConsoleEntry[], activeEventId: output.eventId }
    render(props)
    render({ ...props, compact: true })
    expect(entries).toEqual([input, output])
  })
})
