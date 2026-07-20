// Fetch the live Ampere OpenAPI spec and vendor it as openapi.json.
// Run via `npm run api:pull`. Keeps builds reproducible while making it a
// one-command job to track API changes.
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SPEC_URL =
  process.env.AMPERE_SPEC_URL ||
  'https://ampere.chargee.io/api/v2-json'

const OUT = resolve(__dirname, '..', 'openapi.json')

// --- Spec normalization ---------------------------------------------------
// The upstream Ampere spec serializes some scalar fields as `{"type":"object"}`
// even though the field is really a string/number/boolean (its `example` proves
// it). Left as-is, orval generates useless `{ [key: string]: unknown }` types
// for these — see e.g. `brand`, `whSum`, the flex targets. We coerce any
// property that is `type: "object"` with NO object structure (no properties /
// additionalProperties) but WITH a scalar `example` to the primitive type its
// example implies. Genuine object schemas are left untouched.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/

function scalarType(example) {
  if (typeof example === 'boolean') return { type: 'boolean' }
  if (typeof example === 'number') return { type: Number.isInteger(example) ? 'integer' : 'number' }
  if (typeof example === 'string')
    return ISO_DATE.test(example) ? { type: 'string', format: 'date-time' } : { type: 'string' }
  return null
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return 0
  let fixed = 0
  const isBareObject =
    schema.type === 'object' &&
    schema.properties === undefined &&
    schema.additionalProperties === undefined
  if (isBareObject && 'example' in schema && schema.example !== null && typeof schema.example !== 'object') {
    const coerced = scalarType(schema.example)
    if (coerced) {
      schema.type = coerced.type
      if (coerced.format) schema.format = coerced.format
      fixed += 1
    }
  }
  for (const key of ['properties', 'components', 'schemas']) {
    if (schema[key] && typeof schema[key] === 'object')
      for (const v of Object.values(schema[key])) fixed += normalizeSchema(v)
  }
  for (const key of ['items', 'additionalProperties']) {
    if (schema[key] && typeof schema[key] === 'object') fixed += normalizeSchema(schema[key])
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) for (const v of schema[key]) fixed += normalizeSchema(v)
  }
  return fixed
}

console.log(`Pulling OpenAPI spec from ${SPEC_URL} ...`)

try {
  const res = await fetch(SPEC_URL)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const spec = await res.json()
  const fixed = normalizeSchema(spec.components ?? {})
  writeFileSync(OUT, JSON.stringify(spec, null, 2) + '\n')
  const pathCount = Object.keys(spec.paths ?? {}).length
  console.log(`✓ Wrote ${OUT} (${pathCount} paths, openapi ${spec.openapi ?? spec.swagger})`)
  console.log(`  Normalized ${fixed} mis-typed scalar field(s) (type:object → primitive from example).`)
} catch (err) {
  console.error(`✗ Failed to pull spec: ${err.message}`)
  process.exit(1)
}
