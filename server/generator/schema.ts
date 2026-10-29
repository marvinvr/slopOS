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
