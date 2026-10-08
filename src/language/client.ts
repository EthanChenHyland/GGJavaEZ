import { documentPath, documentUri, type LanguageSnapshot } from './protocol'

export class StaleLanguageResponse extends Error { constructor() { super('Language response belongs to an older project or document'); this.name = 'StaleLanguageResponse' } }
class LanguageHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
interface DocumentState { text: string; version: number; sentVersion: number; timer?: ReturnType<typeof setTimeout> }
interface RequestOptions { signal?: AbortSignal; path?: string }
interface ClientOptions { fetch?: typeof fetch; debounceMs?: number; pollMs?: number; timeoutMs?: number }

/** One project/session owner. No React or language-server implementation dependencies. */
export class LanguageClient {
  private readonly fetcher: typeof fetch
  private readonly debounceMs: number
  private readonly pollMs: number
  private readonly timeoutMs: number
  private listeners = new Set<(snapshot: LanguageSnapshot) => void>()
  private documents = new Map<string, DocumentState>()
  private epoch = 0
  private queue: Promise<void> = Promise.resolve()
  private opening: Promise<void> = Promise.resolve()
  private polling?: ReturnType<typeof setTimeout>
  private controllers = new Set<AbortController>()
  private snapshot: LanguageSnapshot = { projectId: null, generation: 0, status: 'stopped', message: null, diagnostics: [], metrics: {} }

  constructor(options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? ((...args) => fetch(...args))
    this.debounceMs = options.debounceMs ?? 180
    this.pollMs = options.pollMs ?? 1000
    this.timeoutMs = options.timeoutMs ?? 20000
  }
  get projectId() { return this.snapshot.projectId }
  get generation() { return this.epoch }
  getSnapshot() { return this.snapshot }
  getDocumentVersion(path: string) { return this.documents.get(path)?.version }
  getDocumentText(path: string) { return this.documents.get(path)?.text }
  hasDocument(path: string) { return this.documents.has(path) }
  subscribe(listener: (snapshot: LanguageSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }
  private publish(snapshot: LanguageSnapshot) { this.snapshot = snapshot; this.listeners.forEach((listener) => listener(snapshot)) }
  private invalidate() {
    this.epoch++
    clearTimeout(this.polling)
    this.controllers.forEach((controller) => controller.abort())
    this.documents.forEach((doc) => clearTimeout(doc.timer))
    this.queue = Promise.resolve()
  }
  async open(projectId: string): Promise<LanguageSnapshot> {
    this.invalidate()
    this.documents.clear()
    const epoch = this.epoch
    this.publish({ projectId, generation: 0, status: 'starting', message: 'Starting language service…', diagnostics: [], metrics: {} })
    this.opening = this.connect('open', epoch)
    await this.opening
    return this.snapshot
  }
  async restart(): Promise<LanguageSnapshot> {
    if (!this.projectId) return this.snapshot
    this.invalidate()
    const epoch = this.epoch
    this.documents.forEach((doc) => { doc.sentVersion = 0 })
    this.publish({ ...this.snapshot, status: 'starting', diagnostics: [], message: 'Restarting language service…' })
    this.opening = this.connect('restart', epoch)
    await this.opening
    if (epoch === this.epoch) await this.flush()
    return this.snapshot
  }
  private async connect(action: string, epoch: number) {
    try {
      let status: LanguageSnapshot
      try { status = await this.http<LanguageSnapshot>(action, 'POST', {}, epoch) }
      catch (error) {
        // The bridge owns one language project. Another window may have
        // replaced it. An explicit retry reopens this client's actual project
        // before its retained documents are flushed to the new generation.
        if (action !== 'restart' || !(error instanceof LanguageHttpError) || error.status !== 409 || error.message !== 'Language project is not open') throw error
        status = await this.http<LanguageSnapshot>('open', 'POST', {}, epoch)
      }
      this.acceptStatus(status, epoch)
    } catch (error) { this.unavailable(error, epoch) }
    if (epoch === this.epoch) this.schedulePoll(epoch)
  }
  private acceptStatus(status: LanguageSnapshot, epoch: number) {
    if (epoch !== this.epoch || status.projectId !== this.projectId) return
    if (status.generation < this.snapshot.generation) return
    const changed = status.generation !== this.snapshot.generation && this.snapshot.generation !== 0
    if (changed) { this.invalidate(); this.documents.forEach((doc) => { doc.sentVersion = 0 }); epoch = this.epoch }
    this.publish({ ...status, diagnostics: status.diagnostics.filter((group) => {
      const path = documentPath(group.uri, this.projectId!)
      if (!path) return false
      const version = this.getDocumentVersion(path)
      return group.version == null || version == null || group.version === version
    }) })
    if (changed) { void this.flush().catch((error) => this.unavailable(error, epoch)); this.schedulePoll(epoch) }
  }
  private schedulePoll(epoch: number) {
    clearTimeout(this.polling)
    if (!this.pollMs || !['starting', 'indexing', 'ready'].includes(this.snapshot.status)) return
    this.polling = setTimeout(async () => {
      try { this.acceptStatus(await this.http<LanguageSnapshot>('', 'GET', undefined, epoch), epoch) }
      catch (error) { this.unavailable(error, epoch) }
      if (epoch === this.epoch) this.schedulePoll(epoch)
    }, this.pollMs)
  }
  private unavailable(error: unknown, epoch: number) {
    if (epoch === this.epoch && !(error instanceof StaleLanguageResponse)) {
      clearTimeout(this.polling)
      this.publish({ ...this.snapshot, status: 'unavailable', message: error instanceof Error ? error.message : String(error), diagnostics: [] })
    }
  }
  private async http<T>(suffix: string, method: string, body: unknown, epoch: number, signal?: AbortSignal): Promise<T> {
    const id = this.projectId
    if (!id || epoch !== this.epoch) throw new StaleLanguageResponse()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    this.controllers.add(controller)
    const timeout = setTimeout(abort, this.timeoutMs)
    try {
      const response = await this.fetcher(`/api/projects/${encodeURIComponent(id)}/language${suffix ? `/${suffix}` : ''}`, {
        method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      })
      const payload = await response.json()
      if (epoch !== this.epoch) throw new StaleLanguageResponse()
      if (!response.ok) throw new LanguageHttpError(payload.error ?? `Language service unavailable (${response.status})`, response.status)
      return payload as T
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); this.controllers.delete(controller) }
  }
  private enqueue(method: string, params: unknown) {
    const epoch = this.epoch
    const task = this.queue.then(async () => { await this.opening; await this.http('notify', 'POST', { method, params }, epoch) })
    this.queue = task.catch((error) => this.unavailable(error, epoch))
    return task
  }
  openDocument(path: string, text: string) {
    if (!this.projectId) return
    if (this.documents.has(path)) { this.changeDocument(path, text); return }
    documentUri(this.projectId, path)
    this.documents.set(path, { text, version: 1, sentVersion: 0 })
    void this.syncDocument(path).catch(() => {})
  }
  changeDocument(path: string, text: string) {
    const doc = this.documents.get(path)
    if (!doc) { this.openDocument(path, text); return }
    if (doc.text === text) return
    doc.text = text; doc.version++
    clearTimeout(doc.timer)
    this.publish({ ...this.snapshot, diagnostics: this.snapshot.diagnostics.filter((group) => documentPath(group.uri, this.projectId!) !== path) })
    doc.timer = setTimeout(() => { void this.syncDocument(path).catch(() => {}) }, this.debounceMs)
  }
  private async syncDocument(path: string) {
    const doc = this.documents.get(path)
    if (!doc || !this.projectId || doc.sentVersion === doc.version) return
    clearTimeout(doc.timer)
    const version = doc.version
    const text = doc.text
    const wasOpen = doc.sentVersion > 0
    doc.sentVersion = version
    try {
      await this.enqueue(wasOpen ? 'textDocument/didChange' : 'textDocument/didOpen', wasOpen
        ? { textDocument: { uri: documentUri(this.projectId, path), version }, contentChanges: [{ text }] }
        : { textDocument: { uri: documentUri(this.projectId, path), languageId: 'java', version, text } })
    } catch (error) { if (this.documents.get(path) === doc && doc.sentVersion === version) doc.sentVersion = 0; throw error }
  }
  async flush(path?: string) {
    await this.opening
    if (path) await this.syncDocument(path)
    else await Promise.all([...this.documents.keys()].map((item) => this.syncDocument(item)))
    await this.queue
  }
  async saveDocument(path: string, text?: string) {
    if (!this.projectId) return
    await this.flush(path)
    await this.enqueue('textDocument/didSave', { textDocument: { uri: documentUri(this.projectId, path) }, text: text ?? this.documents.get(path)?.text })
  }
  async closeDocument(path: string) {
    const doc = this.documents.get(path)
    if (!doc || !this.projectId) return
    clearTimeout(doc.timer)
    this.documents.delete(path)
    await this.enqueue('textDocument/didClose', { textDocument: { uri: documentUri(this.projectId, path) } })
    this.publish({ ...this.snapshot, diagnostics: this.snapshot.diagnostics.filter((group) => documentPath(group.uri, this.projectId!) !== path) })
  }
  async request<T = unknown>(method: string, params: unknown, options: RequestOptions = {}): Promise<T> {
    const epoch = this.epoch
    const version = options.path ? this.getDocumentVersion(options.path) : undefined
    await this.flush()
    if (epoch !== this.epoch || (options.path && version !== this.getDocumentVersion(options.path))) throw new StaleLanguageResponse()
    const serverGeneration = this.snapshot.generation
    const result = await this.http<T>('request', 'POST', { method, params }, epoch, options.signal)
    if (epoch !== this.epoch || serverGeneration !== this.snapshot.generation || (options.path && version !== this.getDocumentVersion(options.path))) throw new StaleLanguageResponse()
    return result
  }
  dispose() { this.invalidate(); this.documents.clear(); this.publish({ projectId: null, generation: 0, status: 'stopped', message: null, diagnostics: [], metrics: {} }); this.listeners.clear() }
}
