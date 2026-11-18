import React, { useEffect, useState } from 'react';

// Panáček VR (public/vr_*.svg) vložený přímo do stránky – barvy čar bere z motivu (--vr-m-* v index.css).
// Jako <img> by SVG proměnné stránky neviděl a zůstal by neonový. Soubory jsou vlastní statické
// soubory aplikace; načtou se jednou a drží v paměti.

const cache = new Map<string, Promise<string>>();
const load = (src: string) => {
  let p = cache.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => (t.trimStart().startsWith('<svg') ? t : ''))
      .catch(() => '');
    cache.set(src, p);
  }
  return p;
};

export const Mascot: React.FC<{ src: string; className?: string; alt?: string }> = ({ src, className = '', alt = '' }) => {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    load(src).then((t) => alive && setSvg(t));
    return () => { alive = false; };
  }, [src]);
  // Než se načte (nebo kdyby načtení selhalo): obyčejný obrázek ve výchozích barvách
  if (!svg) return <img src={src} className={className} alt={alt} draggable="false" />;
  return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} className={`vr-mascot inline-block ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
};
