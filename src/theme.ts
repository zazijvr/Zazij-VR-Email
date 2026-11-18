import { useEffect, useState } from 'react';

// Motivy vzhledu (Nastavení → Obecné → Vzhled) – stejné jako v Moje Káře.
// Barvy jsou CSS proměnné (src/themes.css, tailwind.config.js); motiv je přepne přes
// <html data-theme="…">. Volba je uložená v zařízení.

export type ThemeId = 'zazijvr' | 'light' | 'dark' | 'sakura' | 'xmas';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  desc: string;
  /** Sezónní motiv – v Nastavení jen během sezóny */
  seasonal?: boolean;
  /** Světlé schéma (tmavý text na světlém pozadí) */
  light?: boolean;
  /** Barvy pro náhled v Nastavení a pro obsah e-mailu (iframe nezná proměnné aplikace) */
  preview: { bg: string; card: string; line: string; accent: string; text: string; muted: string; link: string; linkHover: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'zazijvr',
    name: 'ZažijVR',
    desc: 'Neonový, tmavě modrý',
    preview: { bg: '#061026', card: '#0d1b38', line: '#1e293b', accent: '#00f3ff', text: '#e2e8f0', muted: '#64748b', link: '#00f3ff', linkHover: '#f72585' },
  },
  {
    id: 'light',
    name: 'Světlý',
    desc: 'Světlý, na sluníčko',
    light: true,
    preview: { bg: '#eef2f7', card: '#ffffff', line: '#e2e8f0', accent: '#0e7490', text: '#1e293b', muted: '#94a3b8', link: '#0e7490', linkHover: '#be185d' },
  },
  {
    id: 'dark',
    name: 'Tmavý',
    desc: 'Klidný grafit',
    preview: { bg: '#121417', card: '#1d2026', line: '#2e3238', accent: '#8ab4f8', text: '#e5e5e5', muted: '#737373', link: '#8ab4f8', linkHover: '#f48fb1' },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    desc: 'Pastelová, kvetoucí',
    light: true,
    preview: { bg: '#fdf2f6', card: '#ffffff', line: '#f3d4e1', accent: '#d6336c', text: '#3a1d33', muted: '#c49ab3', link: '#d6336c', linkHover: '#8e5cd9' },
  },
  {
    id: 'xmas',
    name: 'Vánoční',
    desc: 'Jen o svátcích ❄',
    seasonal: true,
    preview: { bg: '#0b1d16', card: '#143126', line: '#24453a', accent: '#f2c14e', text: '#f5f0e8', muted: '#a8a29e', link: '#f2c14e', linkHover: '#e63946' },
  },
];

export const themeInfo = (id: ThemeId): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0];

const THEME_KEY = 'vr-theme';
const CHANGE_EVENT = 'vr-theme-change';

export const getTheme = (): ThemeId => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === v) ? (v as ThemeId) : 'zazijvr';
  } catch {
    return 'zazijvr';
  }
};

/** Nastaví motiv na <html>, barvu lišty a (Android) barvu ikon stavového řádku */
export const applyTheme = (id: ThemeId = getTheme()) => {
  const root = document.documentElement;
  const info = themeInfo(id);
  if (id === 'zazijvr') delete root.dataset.theme;
  else root.dataset.theme = id;
  if (info.light) root.dataset.scheme = 'light';
  else delete root.dataset.scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', info.preview.bg);
  window.VrAndroid?.postMessage(JSON.stringify({ type: 'statusBar', light: !!info.light }));
};

export const setTheme = (id: ThemeId) => {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* bez úložiště jen pro toto spuštění */
  }
  applyTheme(id);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Aktuální motiv (překreslí se při změně) */
export const useTheme = (): ThemeId => {
  const [id, setId] = useState(getTheme);
  useEffect(() => {
    const on = () => setId(getTheme());
    window.addEventListener(CHANGE_EVENT, on);
    return () => window.removeEventListener(CHANGE_EVENT, on);
  }, []);
  return id;
};

// ───────── Vánoční motiv (sezónní) ─────────
// Sezóna: 1. prosince – 1. ledna. Při prvním spuštění v sezóně se motiv přepne na vánoční
// a aplikace se zeptá, jestli ho nechat; po sezóně se vrátí původní motiv.

export const isXmasSeason = (d = new Date()): boolean => d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 1);
/** Sezóna podle roku, ve kterém začala (1. leden patří k prosinci předchozího roku) */
const xmasSeasonId = (d: Date) => (d.getMonth() === 11 ? d.getFullYear() : d.getFullYear() - 1);

const XMAS_KEY = 'vr-xmas-v1';
interface XmasState {
  season: number;
  /** Motiv před automatickým přepnutím */
  previous: ThemeId;
  /** pending = čeká na odpověď v okně; kept / declined = rozhodnuto; restored = po sezóně vráceno */
  state: 'pending' | 'kept' | 'declined' | 'restored';
}
const readXmas = (): XmasState | null => {
  try {
    return JSON.parse(localStorage.getItem(XMAS_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeXmas = (s: XmasState) => {
  try {
    localStorage.setItem(XMAS_KEY, JSON.stringify(s));
  } catch {
    /* bez úložiště se jen nezapamatuje */
  }
};

/** Při spuštění a návratu do aplikace: v sezóně jednou zapne vánoční motiv, po sezóně vrátí původní */
export const initSeasonalTheme = (now = new Date()) => {
  const rec = readXmas();
  if (isXmasSeason(now)) {
    const season = xmasSeasonId(now);
    if (rec?.season === season) return;
    const previous = getTheme();
    if (previous === 'xmas') return;
    writeXmas({ season, previous, state: 'pending' });
    setTheme('xmas');
  } else if (rec && rec.state !== 'restored') {
    if (getTheme() === 'xmas') setTheme(rec.previous ?? 'zazijvr');
    writeXmas({ ...rec, state: 'restored' });
  }
};

/** Má se ukázat okno „Nechat vánoční motiv?“ */
export const xmasPromptPending = (): boolean => readXmas()?.state === 'pending';

/** Odpověď z okna: nechat vánoční, nebo vrátit motiv, který byl předtím */
export const resolveXmasPrompt = (keep: boolean) => {
  const rec = readXmas();
  if (!rec) return;
  if (!keep) setTheme(rec.previous);
  writeXmas({ ...rec, state: keep ? 'kept' : 'declined' });
};

/** Ruční volba motivu v Nastavení – v sezóně už se znovu nenabízí okno */
export const chooseTheme = (id: ThemeId) => {
  setTheme(id);
  const now = new Date();
  if (isXmasSeason(now)) {
    const rec = readXmas();
    const season = xmasSeasonId(now);
    if (!rec || rec.season !== season || rec.state === 'pending') {
      writeXmas({ season, previous: id === 'xmas' ? rec?.previous ?? 'zazijvr' : id, state: id === 'xmas' ? 'kept' : 'declined' });
    }
  }
};

/** Motivy k výběru v Nastavení (vánoční jen v sezóně, nebo když je právě zapnutý) */
export const selectableThemes = (current: ThemeId): ThemeInfo[] =>
  THEMES.filter((t) => !t.seasonal || isXmasSeason() || t.id === current);
