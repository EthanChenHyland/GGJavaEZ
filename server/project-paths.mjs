export const PROJECT_META = '.ggjavaez-project.json'
export const PROJECT_TEMP_PREFIX = '.ggjavaez-tmp-'

function invalid(message) {
  const error = new Error(message)
  error.status = error.statusCode = 400
  throw error
}

// Browser paths stay POSIX-relative on every host. Legacy imports/reads use the
// confinement rules; newly created destinations also use the portable rules.
export function projectPathParts(value, { portable = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) {
    invalid('Invalid project path')
  }
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part === PROJECT_META || part.startsWith(PROJECT_TEMP_PREFIX) || part.includes(':'))) {
    invalid('Invalid project path')
  }
  if (portable) parts.forEach(validatePortableComponent)
  return parts
}

export function validatePortableComponent(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || name.length > 255 || Buffer.byteLength(name, 'utf8') > 255 || /[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) || /[. ]$/.test(name)) {
    invalid('Invalid filename: use a portable name without illegal characters or a trailing dot or space')
  }
  // Windows reserves the base even with an extension. Its numbered device
  // aliases also recognize the three superscript digits.
  const base = name.split('.')[0].replace(/ +$/, '')
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/i.test(base)) {
    invalid('Invalid filename: Windows device names are reserved')
  }
  const folded = portableNameKey(name)
  if (folded === PROJECT_META || folded.startsWith(PROJECT_TEMP_PREFIX)) invalid('Invalid project path')
  return name
}

// Conservative collision policy independent of the host's case sensitivity or
// Unicode normalization. It does not rewrite the caller's path spelling.
export function portableNameKey(name) {
  return name.normalize('NFC').toLowerCase()
}
