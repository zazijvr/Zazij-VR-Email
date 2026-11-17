/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID_DESKTOP: string;
  readonly VITE_GOOGLE_CLIENT_ID_MOBILE: string;
  readonly VITE_GOOGLE_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Přítomné jen uvnitř Tauri aplikace (ne v prohlížeči) */
  __TAURI_INTERNALS__?: unknown;
}
