/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEWSLETTER_SUBSCRIBE_URL?: string;
  readonly VITE_NEWSLETTER_LIST_UUIDS?: string;
  readonly VITE_NEWSLETTER_CONFIRMATION_REQUIRED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
