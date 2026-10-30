import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, strict: false })

export function validateJson(schema: Record<string, unknown> | undefined, data: unknown): string[] {
  if (!schema) return []
  let validate: ReturnType<typeof ajv.compile>
  try {
    validate = ajv.compile(schema)
  } catch (err) {
    return [err instanceof Error ? err.message : 'schema is invalid']
  }
  if (validate(data)) return []
  return (validate.errors || []).map((error) => `${error.instancePath || '/'} ${error.message || 'invalid'}`.trim())
}

const STRICT_DROP = new Set(['$schema', '$comment', 'default', 'examples', 'unevaluatedProperties', 'patternProperties'])

/**
 * Codex and Claude reject a response schema unless every object lists all of its
 * properties in `required` and sets `additionalProperties` to false. The copy is
 * what those CLIs enforce. Callers keep their own schema for anything else.
 */
export function strictOutputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return tighten(schema) as Record<string, unknown>
}

function tighten(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(tighten)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRICT_DROP.has(key)) continue
    out[key] = value
  }
  const hasProps = out.properties && typeof out.properties === 'object' && !Array.isArray(out.properties)
  if (hasProps || out.type === 'object') {
    const props: Record<string, unknown> = {}
    if (hasProps) {
      for (const [key, value] of Object.entries(out.properties as Record<string, unknown>)) props[key] = tighten(value)
    }
    out.type = 'object'
    out.properties = props
    out.additionalProperties = false
    out.required = Object.keys(props)
  }
  if (out.items) out.items = tighten(out.items)
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(out[key])) out[key] = (out[key] as unknown[]).map(tighten)
  }
  if (out.additionalProperties && typeof out.additionalProperties === 'object') out.additionalProperties = false
  return out
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? trimmed).trim()
  const start = body.search(/[[{]/)
  if (start < 0) throw new Error('response was not JSON')
  return JSON.parse(body.slice(start))
}

export const ROUTE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['route'],
  properties: {
    route: { type: 'string', enum: ['existing', 'view', 'app'] },
    appId: { type: 'string' },
  },
}
