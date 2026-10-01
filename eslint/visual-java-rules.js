/**
 * Visual Java architectural guardrails (spec tasks 0.2, requirement 15, INV-8/INV-15).
 *
 * no-fixture-literals: generic runtime code must not recognise curated examples by
 * name or by their hand-tuned coordinates. Checked in string literals, template text
 * and JSX text (not comments or identifiers such as loader function names).
 */
export const FIXTURE_WORDS = ['Person', 'setAge', 'factorial', 'bubble', 'Bubble', 'swap', 'Scanner', 'obj-person', '#17']
const WORD = new RegExp(`(?:^|[^A-Za-z0-9_$-])(${FIXTURE_WORDS.map((word) => word.replace(/[#-]/g, '\\$&')).join('|')})(?![A-Za-z0-9_$])`)

/** Hand-tuned curated-scene coordinates (audit D6). Extend when new fixture constants are found. */
export const FIXTURE_VEC3 = [[2.1, 2.18, -0.65]]

function numeric(node) {
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value
  return null
}

const noFixtureLiterals = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow curated-fixture names and coordinates in generic runtime modules' },
    schema: [],
    messages: {
      word: 'Generic runtime code must not depend on curated fixture "{{word}}". Move it to src/examples/ (spec R15).',
      vec3: 'Hand-tuned curated coordinate [{{value}}] in generic runtime code (audit D6). Derive it from world bounds, or move it to src/examples/.',
    },
  },
  create(context) {
    const checkText = (node, text) => {
      const match = typeof text === 'string' ? WORD.exec(text) : null
      if (match) context.report({ node, messageId: 'word', data: { word: match[1] } })
    }
    return {
      Literal(node) { if (typeof node.value === 'string') checkText(node, node.value) },
      TemplateElement(node) { checkText(node, node.value.cooked ?? node.value.raw) },
      JSXText(node) { checkText(node, node.value) },
      ArrayExpression(node) {
        if (node.elements.length !== 3) return
        const values = node.elements.map(numeric)
        if (values.some((value) => value === null)) return
        if (FIXTURE_VEC3.some((vector) => vector.every((value, index) => Math.abs(value - values[index]) < 1e-9)))
          context.report({ node, messageId: 'vec3', data: { value: values.join(', ') } })
      },
    }
  },
}

export default { rules: { 'no-fixture-literals': noFixtureLiterals } }
