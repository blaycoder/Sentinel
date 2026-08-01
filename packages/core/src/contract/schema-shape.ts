/**
 * schema-shape.ts — flatten simple JSON Schema object bodies to BodyShape.
 *
 * Resolution tradeoffs (this pass vs. deferred):
 *   - $ref / components.schemas     → unresolvable (deferred: full ref resolution)
 *   - allOf / oneOf / anyOf / not   → unresolvable (deferred: combinator merge)
 *   - Nested object properties      → unresolvable (deferred: multi-level flatten)
 *   - parameters, non-JSON content  → ignored at parser level
 *   - YAML / OAS 2.0                → rejected at parser level
 */

import type { BasicSchemaType, BodyShape, SchemaField } from './model.js'

const PRIMITIVE_TYPES = new Set<BasicSchemaType>(['string', 'number', 'integer', 'boolean'])

const UNSUPPORTED_COMBINATORS = ['allOf', 'oneOf', 'anyOf', 'not'] as const

/**
 * Resolve a request/response JSON Schema to a flat BodyShape.
 * Never throws — returns unresolvable for unsupported constructs.
 */
export function resolveBodyShape(schema: unknown): BodyShape {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return unresolvable('schema is missing or not an object')
  }

  const schemaObj = schema as Record<string, unknown>

  if (hasUnsupportedConstruct(schemaObj)) {
    return unresolvable('schema uses $ref or unsupported JSON Schema combinators')
  }

  const properties = schemaObj.properties
  if (properties === undefined || typeof properties !== 'object' || Array.isArray(properties)) {
    return unresolvable('root schema is not a flat object with properties')
  }

  const explicitType = schemaObj.type
  if (explicitType !== undefined && explicitType !== 'object') {
    return unresolvable('root schema is not a flat object')
  }

  const propertiesObj = properties as Record<string, unknown>
  const requiredSet = toRequiredSet(schemaObj.required)
  const fields: SchemaField[] = []

  for (const [name, propSchema] of Object.entries(propertiesObj)) {
    const fieldResult = resolvePropertyField(name, propSchema, requiredSet.has(name))
    if (fieldResult === undefined) {
      return unresolvable(`property '${name}' uses an unsupported schema shape`)
    }
    fields.push(fieldResult)
  }

  return { kind: 'resolved', fields }
}

function resolvePropertyField(
  name: string,
  propSchema: unknown,
  required: boolean,
): SchemaField | undefined {
  if (propSchema === null || typeof propSchema !== 'object' || Array.isArray(propSchema)) {
    return undefined
  }

  const prop = propSchema as Record<string, unknown>

  if (hasUnsupportedConstruct(prop)) {
    return undefined
  }

  const propType = prop.type

  if (propType === 'array') {
    if (!isPrimitiveArrayItems(prop.items)) {
      return undefined
    }
    return { name, type: 'array', required }
  }

  if (propType === 'object') {
    if (prop.properties !== undefined) {
      return undefined
    }
    return { name, type: 'object', required }
  }

  if (typeof propType !== 'string' || !PRIMITIVE_TYPES.has(propType as BasicSchemaType)) {
    return undefined
  }

  return { name, type: propType as BasicSchemaType, required }
}

function isPrimitiveArrayItems(items: unknown): boolean {
  if (items === null || typeof items !== 'object' || Array.isArray(items)) {
    return false
  }

  const itemsObj = items as Record<string, unknown>

  if (hasUnsupportedConstruct(itemsObj)) {
    return false
  }

  const itemType = itemsObj.type
  return typeof itemType === 'string' && PRIMITIVE_TYPES.has(itemType as BasicSchemaType)
}

function hasUnsupportedConstruct(schema: Record<string, unknown>): boolean {
  if ('$ref' in schema) {
    return true
  }

  for (const key of UNSUPPORTED_COMBINATORS) {
    if (key in schema) {
      return true
    }
  }

  return false
}

function toRequiredSet(required: unknown): Set<string> {
  if (!Array.isArray(required)) {
    return new Set()
  }

  return new Set(required.filter((item): item is string => typeof item === 'string'))
}

function unresolvable(reason: string): BodyShape {
  return { kind: 'unresolvable', reason }
}
