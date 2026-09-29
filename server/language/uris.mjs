import { lstatSync } from 'node:fs'
import { resolve, relative, sep, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { languageError } from './transport.mjs'

const DROP = Symbol('external location')
const uriPattern = /^(?:file|inmemory|jdt|jar|zip):/i
const hostPathPattern = /(^|[\s"'(])((?:\/(?:[^\s/]+\/)+[^\s"')<>]+)|(?:[A-Za-z]:[\\/][^\s"')<>]+))/g
const embeddedFileUriPattern = /file:\/\/[^\s"')<>]+/gi

function hasHostPath(value) {
  hostPathPattern.lastIndex = 0
  embeddedFileUriPattern.lastIndex = 0
  return hostPathPattern.test(value) || embeddedFileUriPattern.test(value)
}
function removeHostPaths(value) {
  hostPathPattern.lastIndex = 0
  embeddedFileUriPattern.lastIndex = 0
  return value.replace(embeddedFileUriPattern, '[local path unavailable]').replace(hostPathPattern, '$1[local path unavailable]')
}
export function sanitizeHostPaths(value) { return removeHostPaths(String(value)) }

export function projectPath(value, allowRoot = false) {
  if (allowRoot && (value === '' || value === '.')) return ''
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f:#?]/.test(value) || isAbsolute(value)) {
    throw languageError('Invalid project-relative language path', 400)
  }
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.ggjavaez'))) {
    throw languageError('Invalid project-relative language path', 400)
  }
  return parts.join('/')
}

export class ProjectUris {
  constructor(projectId, projectRoot) {
    if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) throw languageError('Invalid language project ID', 400)
    this.projectId = projectId
    this.root = resolve(projectRoot)
    this.prefix = `inmemory://ggjavaez/${projectId}/`
    this.rootUri = pathToFileURL(this.root).href
    this.assertPath(this.root)
  }

  assertPath(path) {
    const rel = relative(this.root, path)
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw languageError('Language path escapes active project', 400)
    // Check existing ancestors as well as leafs, including newly-created unsaved files.
    const absoluteParts = rel ? rel.split(sep) : []
    let ancestor = this.root
    try { if (lstatSync(ancestor).isSymbolicLink()) throw languageError('Symlinks are not valid language source paths', 400) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    for (const part of absoluteParts.filter(Boolean)) {
      ancestor = resolve(ancestor, part)
      try {
        if (lstatSync(ancestor).isSymbolicLink()) throw languageError('Symlinks are not valid language source paths', 400)
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return path
  }

  fromRelative(value, allowRoot = false) {
    const path = projectPath(value, allowRoot)
    return pathToFileURL(this.assertPath(resolve(this.root, path))).href
  }

  toServer(uri) {
    if (typeof uri !== 'string' || !uri.startsWith(this.prefix)) throw languageError('Stale or foreign language URI', 409)
    let path
    try { path = decodeURIComponent(uri.slice(this.prefix.length)) } catch { throw languageError('Invalid encoded language URI', 400) }
    // Encoded separators are never interchangeable with actual path separators.
    if (/%(?:2f|5c)/i.test(uri.slice(this.prefix.length))) throw languageError('Encoded path separators are not allowed', 400)
    const result = this.fromRelative(path)
    if (this.toBrowser(result) !== uri) throw languageError('Non-canonical language URI', 400)
    return result
  }

  toBrowser(uri) {
    if (typeof uri !== 'string' || !uri.startsWith('file:')) return null
    try {
      const url = new URL(uri)
      if (url.search || url.hash || url.host) return null
      const path = fileURLToPath(url)
      this.assertPath(path)
      const rel = relative(this.root, path).split(sep).join('/')
      if (!rel) return null
      projectPath(rel)
      return this.prefix + rel.split('/').map(encodeURIComponent).join('/')
    } catch { return null }
  }

  mapIncoming(value) { return this.walk(value, true) }
  mapOutgoing(value) { const mapped = this.walk(value, false); return mapped === DROP ? null : mapped }

  walk(value, incoming, depth = 0) {
    if (depth > 48) throw languageError('Language payload nesting limit exceeded', 400)
    if (typeof value === 'string' && uriPattern.test(value)) {
      if (incoming) return this.toServer(value)
      return this.toBrowser(value) ?? DROP
    }
    if (typeof value === 'string' && !incoming) return removeHostPaths(value)
    if (Array.isArray(value)) {
      const entries = value.map(item => this.walk(item, incoming, depth + 1))
      return entries.filter(item => item !== DROP)
    }
    if (!value || typeof value !== 'object') return value
    const result = {}
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw languageError('Invalid language payload key', 400)
      let mappedKey = key
      if (uriPattern.test(key)) {
        if (incoming) mappedKey = this.toServer(key)
        else {
          mappedKey = this.toBrowser(key)
          // Workspace edits are atomic: do not quietly discard unsafe edit targets.
          if (!mappedKey) throw languageError('Workspace edit includes an external file', 422)
        }
      }
      const mapped = this.walk(item, incoming, depth + 1)
      if (mapped === DROP) {
        if (key === 'uri' || key === 'targetUri') return DROP
        continue
      }
      result[mappedKey] = mapped
    }
    return result
  }

  workspaceEdit(edit) {
    if (!edit || typeof edit !== 'object') throw languageError('Invalid semantic workspace edit', 422)
    if (edit.documentChanges?.some(change => change.kind || !change.textDocument?.uri)) {
      throw languageError('Resource operations are unsupported; workspace edit was rejected', 422)
    }
    for (const uri of Object.keys(edit.changes ?? {})) if (!this.toBrowser(uri)) throw languageError('Workspace edit includes an external file', 422)
    for (const change of edit.documentChanges ?? []) if (!this.toBrowser(change.textDocument.uri)) throw languageError('Workspace edit includes an external file', 422)
    const edits = [...Object.values(edit.changes ?? {}).flat(), ...(edit.documentChanges ?? []).flatMap(change => change.edits ?? [])]
    if (edits.some(item => typeof item.newText === 'string' && hasHostPath(item.newText))) {
      throw languageError('Workspace edit contains a host filesystem path', 422)
    }
    return this.mapOutgoing(edit)
  }
}
