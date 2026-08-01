/**
 * body-diff.ts — compare matched ApiCall request bodies against OpenAPI BodyShape.
 *
 * Diffing only (request body); no Finding generation or scan() wiring.
 */

import * as ts from 'typescript'

import type { ApiCall } from '../model/api-call.js'

import type {
  BackendRoute,
  BasicSchemaType,
  BodyShape,
  ContractDiffResult,
  Discrepancy,
  MatchResult,
  SchemaField,
} from './model.js'

interface ParsedCallField {
  readonly name: string
  readonly inferredType: BasicSchemaType | undefined
}

type ParseCallBodyResult =
  | { readonly ok: true; readonly fields: readonly ParsedCallField[] }
  | { readonly ok: false; readonly reason: string }

function parseCallBody(requestBody: string): ParseCallBodyResult {
  const sourceFile = ts.createSourceFile(
    'body.ts',
    `const _ = ${requestBody}`,
    ts.ScriptTarget.Latest,
    true,
  )

  const statement = sourceFile.statements[0]
  if (statement === undefined || !ts.isVariableStatement(statement)) {
    return { ok: false, reason: 'Request body is not a statically analyzable object literal' }
  }

  const declaration = statement.declarationList.declarations[0]
  if (declaration?.initializer === undefined) {
    return { ok: false, reason: 'Request body is not a statically analyzable object literal' }
  }

  if (!ts.isObjectLiteralExpression(declaration.initializer)) {
    return { ok: false, reason: 'Request body is not a statically analyzable object literal' }
  }

  const fields: ParsedCallField[] = []

  for (const property of declaration.initializer.properties) {
    if (ts.isPropertyAssignment(property)) {
      const name = propertyNameText(property.name)
      if (name === undefined) {
        continue
      }
      fields.push({
        name,
        inferredType: inferTypeFromExpression(property.initializer),
      })
      continue
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      fields.push({
        name: property.name.text,
        inferredType: undefined,
      })
    }
  }

  return { ok: true, fields }
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) {
    return name.text
  }
  if (ts.isStringLiteral(name)) {
    return name.text
  }
  return undefined
}

function inferTypeFromExpression(node: ts.Expression): BasicSchemaType | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return 'string'
  }

  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text)
    return Number.isInteger(value) ? 'integer' : 'number'
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'boolean'
  }

  if (ts.isArrayLiteralExpression(node)) {
    return 'array'
  }

  if (ts.isObjectLiteralExpression(node)) {
    return 'object'
  }

  return undefined
}

function typesCompatible(schemaType: BasicSchemaType, callType: BasicSchemaType): boolean {
  if (schemaType === callType) {
    return true
  }

  if (schemaType === 'number' && (callType === 'number' || callType === 'integer')) {
    return true
  }

  if (schemaType === 'integer' && callType === 'integer') {
    return true
  }

  return false
}

function compareFields(
  schemaFields: readonly SchemaField[],
  callFields: readonly ParsedCallField[],
): Discrepancy[] {
  const discrepancies: Discrepancy[] = []
  const schemaByName = new Map(schemaFields.map((field) => [field.name, field]))
  const callByName = new Map(callFields.map((field) => [field.name, field]))

  for (const schemaField of schemaFields) {
    if (schemaField.required && !callByName.has(schemaField.name)) {
      discrepancies.push({
        kind: 'missing-required-field',
        field: schemaField.name,
        expected: schemaField.type,
        actual: undefined,
      })
    }
  }

  for (const callField of callFields) {
    const schemaField = schemaByName.get(callField.name)

    if (schemaField === undefined) {
      discrepancies.push({
        kind: 'unexpected-field',
        field: callField.name,
        expected: undefined,
        actual: callField.inferredType,
      })
      continue
    }

    if (
      callField.inferredType !== undefined &&
      !typesCompatible(schemaField.type, callField.inferredType)
    ) {
      discrepancies.push({
        kind: 'type-mismatch',
        field: callField.name,
        expected: schemaField.type,
        actual: callField.inferredType,
      })
    }
  }

  return discrepancies
}

function diffNoRouteBody(apiCallId: string, requestBody: string | undefined): ContractDiffResult {
  if (requestBody === undefined) {
    return {
      apiCallId,
      status: 'compatible',
      discrepancies: [],
      reason: undefined,
    }
  }

  const parsed = parseCallBody(requestBody)
  if (!parsed.ok) {
    return {
      apiCallId,
      status: 'not-diffable',
      discrepancies: [],
      reason: parsed.reason,
    }
  }

  if (parsed.fields.length === 0) {
    return {
      apiCallId,
      status: 'compatible',
      discrepancies: [],
      reason: undefined,
    }
  }

  const discrepancies: Discrepancy[] = parsed.fields.map((field) => ({
    kind: 'unexpected-field',
    field: field.name,
    expected: undefined,
    actual: field.inferredType,
  }))

  return {
    apiCallId,
    status: 'discrepancies-found',
    discrepancies,
    reason: undefined,
  }
}

function diffResolvedRouteBody(
  apiCallId: string,
  requestBody: string | undefined,
  routeBody: Extract<BodyShape, { kind: 'resolved' }>,
): ContractDiffResult {
  if (requestBody === undefined) {
    return {
      apiCallId,
      status: 'not-diffable',
      discrepancies: [],
      reason: 'Request body is not statically resolvable from source',
    }
  }

  const parsed = parseCallBody(requestBody)
  if (!parsed.ok) {
    return {
      apiCallId,
      status: 'not-diffable',
      discrepancies: [],
      reason: parsed.reason,
    }
  }

  const discrepancies = compareFields(routeBody.fields, parsed.fields)

  if (discrepancies.length > 0) {
    return {
      apiCallId,
      status: 'discrepancies-found',
      discrepancies,
      reason: undefined,
    }
  }

  return {
    apiCallId,
    status: 'compatible',
    discrepancies: [],
    reason: undefined,
  }
}

function diffSingleRequestBody(call: ApiCall, route: BackendRoute): ContractDiffResult {
  const routeBody = route.requestBody

  if (routeBody === undefined) {
    return diffNoRouteBody(call.id, call.requestBody)
  }

  if (routeBody.kind === 'unresolvable') {
    return {
      apiCallId: call.id,
      status: 'not-diffable',
      discrepancies: [],
      reason: routeBody.reason,
    }
  }

  return diffResolvedRouteBody(call.id, call.requestBody, routeBody)
}

/**
 * Diff request bodies for matched ApiCalls only. Unmatched and unresolvable
 * match results are skipped — no diff entry is produced for them.
 */
export function diffRequestBodies(
  apiCalls: readonly ApiCall[],
  matchResults: readonly MatchResult[],
  _routes: readonly BackendRoute[],
): ContractDiffResult[] {
  const callsById = new Map(apiCalls.map((call) => [call.id, call]))
  const results: ContractDiffResult[] = []

  for (const matchResult of matchResults) {
    if (matchResult.status !== 'matched' || matchResult.route === undefined) {
      continue
    }

    const call = callsById.get(matchResult.apiCallId)
    if (call === undefined) {
      continue
    }

    results.push(diffSingleRequestBody(call, matchResult.route))
  }

  return results
}
