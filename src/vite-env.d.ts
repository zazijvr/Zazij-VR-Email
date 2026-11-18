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
  /**
   * Android: tah Zpět od levého okraje (volá MainActivity.kt). Vysune menu, když je tlačítko menu
   * vidět, a vrátí true; jinak false a provede se běžné Zpět.
   */
  __vrOpenMenu?: () => boolean;
  /** Android: Zpět by aplikaci zavřelo – zeptat se (vrátí true, když se dotaz zobrazil) */
  __vrConfirmExit?: () => boolean;
  /** Android: klepnutí na upozornění o nové poště (MainActivity.kt) – JSON { kind, account, messageId, folder } */
  __vrOpenFromNotification?: (json: string) => boolean;
  /** Android: most do MainActivity.kt (jen hlavní stránka aplikace) */
  VrAndroid?: {
    postMessage: (message: string) => void;
    addEventListener?: (type: 'message', listener: (e: { data: string }) => void) => void;
    removeEventListener?: (type: 'message', listener: (e: { data: string }) => void) => void;
  };
}
