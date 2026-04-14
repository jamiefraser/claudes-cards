/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_MODE: string;
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_B2C_CLIENT_ID?: string;
  readonly VITE_B2C_AUTHORITY?: string;
  readonly VITE_B2C_KNOWN_AUTHORITIES?: string;
  readonly VITE_B2C_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
