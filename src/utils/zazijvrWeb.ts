import { open } from '@tauri-apps/plugin-shell';

export const ZAZIJVR_URL = 'https://zazijvr.cz';

/** Otevře web ZažijVR v prohlížeči (v aplikaci přes systém, v prohlížeči novou kartou) */
export const openZazijvrWeb = () => {
  if (window.__TAURI_INTERNALS__) open(ZAZIJVR_URL).catch(() => window.open(ZAZIJVR_URL, '_blank'));
  else window.open(ZAZIJVR_URL, '_blank', 'noopener');
};
