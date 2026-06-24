// Fetch the live Ampere OpenAPI spec and vendor it as openapi.json.
// Run via `npm run api:pull`. Keeps builds reproducible while making it a
// one-command job to track API changes.
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SPEC_URL =
  process.env.AMPERE_SPEC_URL ||
  'https://ampere.prod.thunder.chargee.io/api/v2-json'

const OUT = resolve(__dirname, '..', 'openapi.json')

console.log(`Pulling OpenAPI spec from ${SPEC_URL} ...`)

try {
  const res = await fetch(SPEC_URL)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const spec = await res.json()
  writeFileSync(OUT, JSON.stringify(spec, null, 2) + '\n')
  const pathCount = Object.keys(spec.paths ?? {}).length
  console.log(`✓ Wrote ${OUT} (${pathCount} paths, openapi ${spec.openapi ?? spec.swagger})`)
} catch (err) {
  console.error(`✗ Failed to pull spec: ${err.message}`)
  process.exit(1)
}
