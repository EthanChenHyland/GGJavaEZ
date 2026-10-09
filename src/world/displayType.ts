export interface DisplayTypeOptions {
  /** Source spelling supplied by recorded metadata; never inferred from a dollar sign. */
  sourceName?: string
  /** Arguments actually captured in the Recording; erased descriptors do not supply them. */
  recordedGenericArguments?: readonly string[]
  simple?: boolean
  /** Disambiguates a binary class named I from the JVM int descriptor I. */
  representation?: 'auto' | 'binary' | 'descriptor'
}

const primitiveDescriptors: Readonly<Record<string, string>> = {
  B: 'byte', C: 'char', D: 'double', F: 'float', I: 'int', J: 'long', S: 'short', Z: 'boolean', V: 'void',
}

function readDescriptor(text: string, start: number, allowVoid: boolean): { type: string; end: number } | null {
  let index = start
  while (text[index] === '[') index++
  const dimensions = index - start
  const code = text[index]
  let type: string
  if (code === 'L') {
    const end = text.indexOf(';', index)
    if (end <= index + 1) return null
    const binaryName = text.slice(index + 1, end)
    if (/[[()<>;]/.test(binaryName)) return null
    type = binaryName.replaceAll('/', '.')
    index = end + 1
  } else {
    type = primitiveDescriptors[code]
    if (!type || (code === 'V' && (!allowVoid || dimensions > 0))) return null
    index++
  }
  return { type: type + '[]'.repeat(dimensions), end: index }
}

/** Reads only a complete recorded JVM method descriptor; null means signature unavailable. */
export function methodParameterTypes(descriptor: string): readonly string[] | null {
  if (!descriptor.startsWith('(')) return null
  const parameters: string[] = []
  let index = 1
  while (index < descriptor.length && descriptor[index] !== ')') {
    const parsed = readDescriptor(descriptor, index, false)
    if (!parsed) return null
    parameters.push(parsed.type)
    index = parsed.end
  }
  if (descriptor[index] !== ')') return null
  const result = readDescriptor(descriptor, index + 1, true)
  return result?.end === descriptor.length ? parameters : null
}

/** Display is separate from identity. In particular a literal/anonymous/nested $ is preserved by default. */
export function displayType(canonical: string, options: DisplayTypeOptions = {}): string {
  const descriptor = options.representation === 'descriptor' || (options.representation !== 'binary' && (canonical.startsWith('[') || canonical.startsWith('L') && canonical.endsWith(';')))
  const parsed = descriptor ? readDescriptor(canonical, 0, true) : null
  const decoded = parsed?.end === canonical.length ? parsed.type : canonical.replaceAll('/', '.')
  const suffix = decoded.match(/(?:\[\])+$/)?.[0] ?? ''
  const base = decoded.slice(0, decoded.length - suffix.length)
  const genericAt = base.indexOf('<')
  const rawName = genericAt < 0 ? base : base.slice(0, genericAt)
  const capturedGenerics = genericAt < 0 ? '' : base.slice(genericAt)
  const name = options.sourceName ?? rawName
  const shown = options.sourceName ?? (options.simple === false ? name : name.slice(name.lastIndexOf('.') + 1))
  const generics = options.recordedGenericArguments
    ? options.recordedGenericArguments.length ? `<${options.recordedGenericArguments.map((arg) => displayType(arg, { simple: options.simple })).join(', ')}>` : ''
    : capturedGenerics
  return shown + generics + suffix
}

/** Canonical keys must be taken from canonical, never reconstructed from display. */
export function describeType(canonical: string, options: DisplayTypeOptions = {}): { canonical: string; display: string } {
  return { canonical, display: displayType(canonical, options) }
}
