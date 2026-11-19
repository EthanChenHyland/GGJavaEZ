import { useEffect, useId, useRef, useState } from 'react'
import type { SceneIo } from '../../contracts/world'
import { ioPortPreview } from '../../world/ioPortText'
import { shellStore } from '../../workspace/shellStore'
import { DialogFrame } from '../dialogs/DialogFrame'

export function IoPreviewDialog({ io, recordingId, cursor, onClose }: {
  io: SceneIo
  recordingId: string
  cursor: number
  onClose(): void
}) {
  const preview = ioPortPreview(io), description = useId()
  const contextKey = JSON.stringify([recordingId, cursor, io.id, io.lines, preview.available, preview.capturedText, preview.sourceTruncated])
  const currentKey = useRef(contextKey), request = useRef(0)
  currentKey.current = contextKey
  const [copy, setCopy] = useState<{ key: string; pending: boolean; message: string } | null>(null)
  // A late clipboard result must not label a new recording, Cursor or channel,
  // or publish state after the dialog has closed.
  useEffect(() => () => { request.current++ }, [contextKey])
  const copyCapturedPrefix = async () => {
    if (!preview.available) return
    const token = ++request.current
    setCopy({ key: contextKey, pending: true, message: '' })
    let message: string
    try {
      await navigator.clipboard.writeText(preview.capturedText)
      message = preview.sourceTruncated ? 'Captured prefix copied.' : 'Captured preview copied.'
    } catch {
      message = 'Clipboard unavailable. Select the preview to copy it.'
    }
    if (request.current === token && currentKey.current === contextKey) setCopy({ key: contextKey, pending: false, message })
  }
  const openConsole = () => {
    shellStore.setState({ tool: 'console', bottomOpen: true })
    onClose()
  }
  const pending = copy?.key === contextKey && copy.pending
  return <DialogFrame title={`${io.id} captured preview`} className="shell-io-preview" onClose={onClose} actions={<>
    <button type="button" onClick={onClose}>Close</button>
    <button type="button" disabled={!preview.available || pending} onClick={() => { void copyCapturedPrefix() }}>Copy captured prefix</button>
    <button type="button" onClick={openConsole}>Open Console</button>
  </>}>
    <section data-io-preview="true" data-recording-id={recordingId} data-channel={io.id} data-cursor={cursor}
      data-source-truncated={preview.sourceTruncated} data-preview-available={preview.available}>
      <p>Cursor {cursor} · {String(io.lines)} recorded {io.lines===1?'line':'lines'}</p>
      <p>{io.id === 'stdin' ? 'Current recorded consumption' : 'Last recorded line'}</p>
      <p id={description}>{!preview.available ? 'No recorded stdin consumption at this Cursor.' : preview.sourceTruncated
        ? 'First 60 captured characters · more text recorded. Copy includes this prefix without the ellipsis.'
        : preview.capturedText === '' ? 'Captured empty text.' : `${Array.from(preview.capturedText).length} captured characters. The World face may show a shorter preview.`}</p>
      <pre tabIndex={0} aria-label={`${io.id} raw captured prefix`} aria-describedby={description} data-io-preview-content="true"
        style={{ margin: 0, maxHeight: 'min(240px, 40dvh)', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', font: "400 13px/1.5 'JetBrains Mono', monospace" }}>{preview.capturedText}{preview.sourceTruncated&&<span aria-label="Additional recorded text omitted" data-derived-ellipsis="true" style={{userSelect:'none'}}>…</span>}</pre>
      <p role="status" aria-live="polite">{copy?.key === contextKey ? copy.message : ''}</p>
    </section>
  </DialogFrame>
}
