import type { RuntimeState, RuntimeValue } from '../contracts/runtime'

export function formatValue(value: RuntimeValue, objects?: RuntimeState['objects']): string {
  switch (value.kind) {
    case 'unavailable': return `unavailable (${value.reason})`
    case 'uninitialized': return 'not observed'
    case 'null': return 'null'
    case 'primitive': return value.javaType === 'char' ? JSON.stringify(value.value) : String(value.value)
    case 'stringSummary': return JSON.stringify(value.value)
    case 'reference': {
      const object = objects?.[value.objectId]
      return object ? `→ ${object.className} #${object.displayId}` : `→ ${value.objectId}`
    }
  }
}
