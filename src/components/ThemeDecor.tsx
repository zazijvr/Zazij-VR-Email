import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { ThemeInfo } from '../theme';

// Výzdoba motivů (stejně jako v Moje Káře): sníh a Rudolf ve vánočním, padající lístky v Sakuře.
// Vykreslí se vždy, vidět jsou jen ve svém motivu (CSS v index.css).

/** Padající sníh – jen ve vánočním motivu */
export const Snowfall: React.FC = () => {
  const flakes = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const size = 2 + Math.random() * 3.5;
        return {
          key: i,
          style: {
            left: `${Math.random() * 100}%`,
            width: `${size}px`,
            height: `${size}px`,
            opacity: 0.35 + Math.random() * 0.5,
            animationDuration: `${9 + Math.random() * 10}s`,
            animationDelay: `${-Math.random() * 18}s`,
            '--sway': `${(Math.random() - 0.5) * 40}px`,
          } as React.CSSProperties,
        };
      }),
    []
  );
  return (
    <div className="vr-snow" aria-hidden="true">
      {flakes.map((f) => (
        <span key={f.key} style={f.style} />
      ))}
    </div>
  );
};

/** Padající okvětní lístky – jen v motivu Sakura */
export const Petals: React.FC = () => {
  const petals = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const size = 7 + Math.random() * 6;
        return {
          key: i,
          style: {
            left: `${Math.random() * 100}%`,
            width: `${size}px`,
            height: `${size * 0.8}px`,
            opacity: 0.45 + Math.random() * 0.4,
            animationDuration: `${12 + Math.random() * 10}s`,
            animationDelay: `${-Math.random() * 20}s`,
            '--sway': `${(Math.random() - 0.3) * 70}px`,
          } as React.CSSProperties,
        };
      }),
    []
  );
  return (
    <div className="vr-petals" aria-hidden="true">
      {petals.map((p) => (
        <span key={p.key} style={p.style} />
      ))}
    </div>
  );
};

/**
 * Logo ZažijVR jako sob Rudolf (jen vánoční motiv): parohy na brýlích VR, červený nos mezi V a R.
 * SVG ve stejných souřadnicích jako obrázek loga (150 × 50) – přes něj, parohy přesahují nahoru.
 */
export const RudolphOverlay: React.FC = () => (
  <svg viewBox="0 0 150 50" className="vr-xmas-only absolute inset-0 w-full h-full overflow-visible pointer-events-none" aria-hidden="true">
    <g stroke="#8b5a2b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M96 11 C93 4 90 -2 86 -8" />
      <path d="M92.5 2 C88 1 85 -1 82 -4" />
      <path d="M89.5 -3 C90 -7 91 -10 93 -13" />
      <path d="M124 11 C127 4 130 -2 134 -8" />
      <path d="M127.5 2 C132 1 135 -1 138 -4" />
      <path d="M130.5 -3 C130 -7 129 -10 127 -13" />
    </g>
    <g stroke="#c08552" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.8">
      <path d="M95.3 9 C92.8 3.5 90.3 -1.5 86.6 -7" />
      <path d="M124.7 9 C127.2 3.5 129.7 -1.5 133.4 -7" />
    </g>
    <circle className="vr-rudolph-nose" cx="105.6" cy="31.2" r="3.1" fill="#ef233c" />
    <circle cx="104.7" cy="30.2" r="0.95" fill="#ffffff" opacity="0.85" />
  </svg>
);

/** Okno po automatickém zapnutí vánočního motivu: nechat, nebo vrátit předchozí motiv */
export const XmasThemePrompt: React.FC<{ onKeep: () => void; onRevert: () => void }> = ({ onKeep, onRevert }) => (
  <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="vr-xmas-title"
      className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-navy-light to-navy-deep border border-neon-blue/40 p-5 text-center shadow-[0_0_30px_rgb(var(--c-neon-blue)/0.2)]"
    >
      <div className="text-4xl leading-none mb-2" aria-hidden="true">🎄</div>
      <h2 id="vr-xmas-title" className="text-lg font-bold font-rajdhani text-white tracking-wide">Vánoční motiv</h2>
      <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
        Na svátky jsme poštu převlékli do vánočního. Chceš ho nechat, nebo vrátit svůj motiv?
      </p>
      <p className="mt-1 text-[11px] text-slate-500">Po 1. lednu se motiv vrátí sám. Změnit ho jde kdykoli v Nastavení.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onRevert}
          className="py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-navy border border-slate-700 hover:border-slate-500"
        >
          Vrátit můj motiv
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="py-2.5 rounded-xl text-sm font-bold bg-neon-blue text-navy active:scale-95 transition-transform shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.4)]"
        >
          Nechat vánoční
        </button>
      </div>
    </div>
  </div>
);

/**
 * Náhled motivu v Nastavení: zmenšenina pošty (panel složek, seznam zpráv, tlačítko) v pevných
 * barvách daného motivu – každá dlaždice ukazuje svůj motiv.
 */
export const ThemeTile: React.FC<{ theme: ThemeInfo; selected: boolean; onSelect: () => void }> = ({ theme, selected, onSelect }) => {
  const p = theme.preview;
  const glow = theme.light || theme.id === 'dark' ? 'none' : `0 0 6px ${p.accent}`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex flex-col gap-1.5 p-1.5 rounded-xl border text-left transition-all ${
        selected ? 'border-neon-blue bg-neon-blue/10' : 'border-slate-700/80 bg-navy hover:border-slate-500'
      }`}
    >
      <span aria-hidden="true" className="flex w-full aspect-[4/3] rounded-lg overflow-hidden border" style={{ background: p.bg, borderColor: p.line }}>
        {/* Panel složek */}
        <span className="flex flex-col gap-1 w-1/3 p-1.5" style={{ borderRight: `1px solid ${p.line}` }}>
          <span className="h-2 rounded-sm" style={{ background: p.accent, boxShadow: glow, opacity: 0.9 }} />
          <span className="h-1 w-4/5 rounded-full" style={{ background: p.text, opacity: 0.7 }} />
          <span className="h-1 w-3/5 rounded-full" style={{ background: p.muted }} />
          <span className="h-1 w-2/3 rounded-full" style={{ background: p.muted }} />
        </span>
        {/* Seznam zpráv */}
        <span className="flex flex-col gap-1 flex-1 p-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1 p-1 rounded" style={{ background: p.card, border: `1px solid ${p.line}` }}>
              <span className="w-1 h-1 rounded-full shrink-0" style={{ background: i === 0 ? p.accent : 'transparent', boxShadow: i === 0 ? glow : 'none' }} />
              <span className="flex flex-col gap-0.5 flex-1">
                <span className="block h-1 rounded-full" style={{ background: p.text, opacity: 0.8, width: `${80 - i * 15}%` }} />
                <span className="block h-1 rounded-full" style={{ background: p.muted, width: `${55 - i * 8}%` }} />
              </span>
            </span>
          ))}
        </span>
      </span>
      <span className="px-0.5 pb-0.5">
        <span className={`block text-xs font-bold leading-tight ${selected ? 'text-neon-blue' : 'text-white'}`}>{theme.name}</span>
        <span className="block text-[10px] leading-tight text-slate-500">{theme.desc}</span>
      </span>
      {selected && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-neon-blue text-navy flex items-center justify-center">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
};
