/** Malý odznak s počtem nepřečtených (99+ nad 99); při nule se nezobrazí */
export default function UnreadBadge({ count, title, className = '' }: { count?: number; title?: string; className?: string }) {
  if (!count || count <= 0) return null;
  return (
    <span title={title} className={`shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-neon-blue/15 border border-neon-blue/40 text-neon-blue text-[11px] font-bold leading-[1.125rem] text-center ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
