import { useLayoutEffect, useRef, useState } from 'react'
import { ConsoleLineIndex, type ConsoleChunk } from './consoleLineIndex'
import { virtualPageRows, virtualRange } from './virtualRange'

const rowHeight = 24
const glyph = { stdout: '↗', stderr: '⚠\uFE0E', stdin: '›', exit: '■' }

/** Console owns following independently of World/Source. Manual navigation
 * stops following; the Last action explicitly returns to live output. */
export function ConsoleLines({ chunks, label }: { chunks: readonly ConsoleChunk[]; label: string }) {
  const [index] = useState(() => new ConsoleLineIndex())
  const count = index.update(chunks)
  const host = useRef<HTMLDivElement>(null), following = useRef(true)
  const [height, setHeight] = useState(120), [scroll, setScroll] = useState(0)
  const [pageIndex, setPageIndex] = useState(Math.max(0, count - 1))
  const [jump, setJump] = useState('1'), [revealRevision, setRevealRevision] = useState(0)
  const [detail, setDetail] = useState<{ channel: string; text: string; row: number } | null>(null)
  const positioned = useRef({ pageStart: -1, revision: -1 })
  const range = virtualRange(count, rowHeight, pageIndex, scroll, height, 3)
  useLayoutEffect(() => {
    const node = host.current; if (!node) return
    const observer = new ResizeObserver(() => setHeight(node.clientHeight)); observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    setPageIndex(value => following.current ? Math.max(0,count - 1) : Math.min(value,Math.max(0,count - 1)))
    setJump(value => Number(value) > count ? String(Math.max(1, count)) : value)
  }, [count])
  useLayoutEffect(() => {
    const node = host.current; if (!node) return
    const target = following.current ? count - 1 : Math.min(pageIndex, count - 1)
    if ((following.current || positioned.current.pageStart !== range.pageStart || positioned.current.revision !== revealRevision || pageIndex >= count) &&
      target >= range.pageStart && target < range.pageStart + range.pageCount) {
      node.scrollTop = (target - range.pageStart) * rowHeight
      setScroll(node.scrollTop)
    }
    positioned.current = { pageStart: range.pageStart, revision: revealRevision }
  }, [pageIndex, range.pageStart, range.pageCount, count, revealRevision])
  useLayoutEffect(() => { setDetail(null) }, [chunks])
  const reveal = (row: number, follow = false) => {
    if (!Number.isSafeInteger(row) || row < 0 || row >= count) return
    following.current = follow; setPageIndex(row); setJump(String(row + 1)); setRevealRevision(value => value + 1)
  }
  return <section className="console-lines" aria-label={label}>
    <div className="console-lines-heading">
      <strong>{label}</strong><span>{count.toLocaleString()} rows</span>
      <button onClick={() => reveal(0)} disabled={!count}>First</button>
      <button onClick={() => reveal(count - 1, true)} disabled={!count}>Last</button>
      <label>Row <input aria-label={`${label} row`} type="number" min="1" max={count} value={jump}
        onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); reveal(Number(jump) - 1) } }}/></label>
      <button onClick={() => reveal(Number(jump) - 1)} disabled={!count}>Go</button>
      {count > virtualPageRows && <>
        <button aria-label={`Previous ${label} page`} disabled={!range.pageStart} onClick={() => reveal(Math.max(0, range.pageStart - virtualPageRows))}>‹</button>
        <button aria-label={`Next ${label} page`} disabled={range.pageStart + range.pageCount >= count} onClick={() => reveal(range.pageStart + range.pageCount)}>›</button>
      </>}
    </div>
    <div className="console-lines-scroll" style={{height:`min(240px,22vh,${Math.max(1,count)*rowHeight}px)`}} ref={host} role="list" aria-label={`${label} rows`} tabIndex={0}
      onWheel={() => { following.current = false }} onPointerDown={() => { following.current = false }}
      onKeyDown={event => { following.current = false; if (event.key === 'Home' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); reveal(0) } else if (event.key === 'End' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); reveal(count - 1, true) } }}
      onScroll={event => { const node = event.currentTarget; setScroll(node.scrollTop); if (node.scrollTop + node.clientHeight < node.scrollHeight - rowHeight) following.current = false }}>
      <div style={{ height: range.height, position: 'relative' }}>{Array.from({ length: range.count }, (_, offset) => {
        const row = range.start + offset, value = index.row(row, 160), readExact = index.capture(row)
        return <div key={row} role="listitem" aria-setsize={count} aria-posinset={row + 1}
          style={{ position: 'absolute', top: (row - range.pageStart) * rowHeight, height: rowHeight, left: 0, right: 0 }}>
          <button className={`console-line ide-console-${value.channel}`} aria-label={`Open ${label} row ${row + 1}`}
            onClick={() => setDetail({ ...readExact(), row })}>
            <span className="console-line-glyph" aria-label={value.channel}>{glyph[value.channel]}</span>
            <span className="console-line-preview">{value.text.replace(/\r?\n$/, '')}{value.length > value.text.length ? '…' : ''}</span>
          </button>
        </div>
      })}</div>
    </div>
    {detail && <div className="console-line-detail" role="region" aria-label={`Exact ${label} row ${detail.row + 1}`}>
      <button onClick={() => setDetail(null)}>Close exact text</button><pre className={`ide-console-${detail.channel}`}>{detail.text}</pre>
    </div>}
  </section>
}
