import { EventEmitter } from 'node:events'

export function languageError(message, status = 503, code = -32002) {
  return Object.assign(new Error(message), { status, code })
}

/** Byte framing is independent of chunk/UTF-8 boundaries. No stdout logging. */
export class LspTransport extends EventEmitter {
  constructor(input, output, { maxFrameBytes = 8 * 1024 * 1024, timeoutMs = 15000, maxPending = 64 } = {}) {
    super()
    this.input = input
    this.output = output
    this.maxFrameBytes = maxFrameBytes
    this.timeoutMs = timeoutMs
    this.maxPending = maxPending
    this.buffer = Buffer.alloc(0)
    this.expected = null
    this.pending = new Map()
    this.nextId = 0
    this.closed = false
    this.stats = { receivedBytes: 0, sentBytes: 0, requests: 0, timeouts: 0 }
    this.onData = chunk => this.consume(chunk)
    this.onEnd = () => this.close(languageError('Language server stream closed'))
    this.onStreamError = error => this.close(error)
    input.on('data', this.onData)
    input.on('end', this.onEnd)
    input.on('error', this.onStreamError)
    output.on('error', this.onStreamError)
  }

  send(message) {
    if (this.closed) throw languageError('Language transport is closed')
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
    if (body.length > this.maxFrameBytes) throw languageError('Language message exceeds byte limit', 413)
    const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
    if (this.output.writableLength + frame.length > this.maxFrameBytes * 2) {
      throw languageError('Language transport backpressure limit reached', 429)
    }
    this.stats.sentBytes += frame.length
    this.output.write(frame)
  }

  notify(method, params) { this.send({ method, params }) }

  request(method, params, { timeoutMs = this.timeoutMs, signal } = {}) {
    if (this.closed) return Promise.reject(languageError('Language transport is closed'))
    if (signal?.aborted) return Promise.reject(languageError('Language request cancelled', 409, -32800))
    if (this.pending.size >= this.maxPending) return Promise.reject(languageError('Too many pending language requests', 429))
    const id = ++this.nextId
    this.stats.requests++
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending.delete(id) }
      const cancel = () => {
        cleanup()
        try { this.notify('$/cancelRequest', { id }) } catch { /* stream may have closed */ }
        reject(languageError('Language request cancelled', 409, -32800))
      }
      const timer = setTimeout(() => {
        this.stats.timeouts++
        cleanup()
        try { this.notify('$/cancelRequest', { id }) } catch { /* stream may have closed */ }
        reject(languageError(`Language request timed out: ${method}`, 504))
      }, Math.max(1, timeoutMs))
      this.pending.set(id, {
        resolve: value => { cleanup(); resolve(value) },
        reject: error => { cleanup(); reject(error) },
      })
      signal?.addEventListener('abort', cancel, { once: true })
      try { this.send({ id, method, params }) } catch (error) { cleanup(); reject(error) }
    })
  }

  consume(chunk) {
    if (this.closed) return
    try {
      this.stats.receivedBytes += chunk.length
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)])
      while (!this.closed) {
        if (this.expected === null) {
          const end = this.buffer.indexOf('\r\n\r\n')
          if (end < 0) {
            if (this.buffer.length > 8192) throw languageError('Invalid oversized LSP header')
            return
          }
          if (end > 8192) throw languageError('Invalid oversized LSP header')
          const headers = this.buffer.subarray(0, end).toString('ascii').split('\r\n')
          const lengths = headers.filter(line => /^content-length:/i.test(line))
          if (lengths.length !== 1 || !/^content-length:\s*\d+\s*$/i.test(lengths[0])) throw languageError('Invalid LSP Content-Length')
          this.expected = Number(lengths[0].split(':')[1].trim())
          if (!Number.isSafeInteger(this.expected) || this.expected < 1 || this.expected > this.maxFrameBytes) throw languageError('LSP frame exceeds byte limit')
          this.buffer = this.buffer.subarray(end + 4)
        }
        if (this.buffer.length < this.expected) return
        const body = this.buffer.subarray(0, this.expected)
        this.buffer = this.buffer.subarray(this.expected)
        this.expected = null
        const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
        if (!message || message.jsonrpc !== '2.0') throw languageError('Invalid JSON-RPC message')
        this.dispatch(message)
      }
    } catch (error) { this.close(error) }
  }

  dispatch(message) {
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        Promise.resolve().then(() => this.onRequest?.(message.method, message.params) ?? Promise.reject(languageError('Unsupported server request', 400, -32601)))
          .then(result => { if (!this.closed) this.send({ id: message.id, result: result ?? null }) }, error => {
            if (!this.closed) this.send({ id: message.id, error: { code: error.code ?? -32603, message: String(error.message).slice(0, 500) } })
          }).catch(error => this.close(error))
      } else this.emit('notification', message.method, message.params)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return // Cancelled/expired replies cannot resurrect requests.
    if (message.error) pending.reject(languageError(message.error.message ?? 'Language server error', 502, message.error.code))
    else if ('result' in message) pending.resolve(message.result)
    else pending.reject(languageError('Malformed language response', 502))
  }

  cancelPending(error = languageError('Language generation changed', 409)) {
    for (const pending of [...this.pending.values()]) pending.reject(error)
  }

  close(error = languageError('Language session stopped', 409)) {
    if (this.closed) return
    this.closed = true
    this.input.removeListener('data', this.onData)
    this.input.removeListener('end', this.onEnd)
    this.input.removeListener('error', this.onStreamError)
    this.output.removeListener('error', this.onStreamError)
    this.cancelPending(error)
    this.buffer = Buffer.alloc(0)
    this.emit('closed', error)
  }
}
