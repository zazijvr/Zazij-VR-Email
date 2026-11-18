import { invoke } from '@tauri-apps/api/core';
import { open as shellOpen } from '@tauri-apps/plugin-shell';

const IS_MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Otevře odkaz (http/https/mailto) v prohlížeči systému.
 * Počítač: přes Rust (open_external_url) – na Linuxu v AppImage s očištěným prostředím, jinak
 * systémový prohlížeč nešel spustit. Telefon: plugin shell. Mimo aplikaci: nová karta.
 */
export const openExternal = async (url: string): Promise<void> => {
  if (!window.__TAURI_INTERNALS__) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (IS_MOBILE) return shellOpen(url);
  return invoke('open_external_url', { url });
};
