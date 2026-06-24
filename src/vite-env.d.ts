/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMPERE_API_URL: string
  readonly VITE_AMPERE_DOCS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
