export const getEventSolidColor = (colorId: string | number | null | undefined): string => {
  const colors: Record<string, string> = {
    '1': 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]',
    '2': 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]',
    '3': 'bg-[#f72585] shadow-[0_0_10px_rgba(247,37,133,0.5)]',
    '4': 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]',
    '5': 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]',
    '6': 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]',
    '7': 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]',
    '8': 'bg-slate-500 shadow-[0_0_10px_rgba(100,116,139,0.5)]',
    '9': 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]',
    '10': 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]',
    '11': 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
  };
  return colors[String(colorId)] || 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]';
};

export const getEventBgColor = (colorId: string | number | null | undefined): string => {
  const colors: Record<string, string> = {
    '1': 'bg-indigo-500/10 border-indigo-500/30',
    '2': 'bg-teal-500/10 border-teal-500/30',
    '3': 'bg-[#f72585]/10 border-[#f72585]/30',
    '4': 'bg-pink-500/10 border-pink-500/30',
    '5': 'bg-yellow-500/10 border-yellow-500/30',
    '6': 'bg-orange-500/10 border-orange-500/30',
    '7': 'bg-cyan-500/10 border-cyan-500/30',
    '8': 'bg-slate-500/10 border-slate-500/30',
    '9': 'bg-[#00f3ff]/10 border-[#00f3ff]/30',
    '10': 'bg-green-500/10 border-green-500/30',
    '11': 'bg-red-500/10 border-red-500/30'
  };
  return colors[String(colorId)] || 'bg-[#00f3ff]/10 border-[#00f3ff]/30';
};

export const getEventColor = (colorId: string | number | null | undefined): string => {
  const colors: Record<string, string> = {
    '1': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
    '2': 'bg-teal-500/20 text-teal-400 border-teal-500/50',
    '3': 'bg-[#f72585]/20 text-[#f72585] border-[#f72585]/50', // purple
    '4': 'bg-pink-500/20 text-pink-400 border-pink-500/50',
    '5': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    '6': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    '7': 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50', // blue/cyan
    '8': 'bg-slate-500/20 text-slate-400 border-slate-500/50',
    '9': 'bg-blue-600/20 text-blue-400 border-blue-600/50',
    '10': 'bg-green-500/20 text-green-400 border-green-500/50',
    '11': 'bg-red-500/20 text-red-400 border-red-500/50'
  };
  return colors[String(colorId)] || 'bg-[#00f3ff]/10 text-white border-[#00f3ff]/30'; 
};
