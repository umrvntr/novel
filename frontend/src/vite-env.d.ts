/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GENERATOR_URL: string
  readonly VITE_PRO_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
