import { defineConfig } from 'orval'

// Generates a fully-typed client + TanStack Query hooks from the vendored
// Ampere OpenAPI spec. Re-run `npm run api:generate` whenever the API changes;
// `npm run typecheck` then proves every request still matches the contract.
export default defineConfig({
  ampere: {
    input: {
      target: './openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      schemas: './src/api/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      prettier: false,
      override: {
        mutator: {
          path: './src/api/mutator.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useInfinite: false,
        },
      },
    },
  },
})
