import { Fragment, type Dispatch, type SetStateAction } from 'react';
import type { CalendarEvent } from '../../../types/calendar';
import { Search, Clock, ChevronRight } from 'lucide-react';
import { getEventSolidColor } from '../utils/eventColors';

interface AgendaViewProps {
  events: CalendarEvent[];
  agendaSearch: string;
  setAgendaSearch: (value: string) => void;
  displayedAgendaCount: number;
  setDisplayedAgendaCount: Dispatch<SetStateAction<number>>;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  activeCalendarView: string;
}

export default function AgendaView({
   events,
   agendaSearch,
   setAgendaSearch,
   displayedAgendaCount,
   setDisplayedAgendaCount,
   setSelectedEvent,
   activeCalendarView,
}: AgendaViewProps) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const agendaEvents = events
        .filter(ev => ev.endDate >= today)
        .filter(ev => {
          if (!agendaSearch.trim()) return true;
          const q = agendaSearch.toLowerCase();
          return (
            ev.title?.toLowerCase().includes(q) ||
            ev.description?.replace(/<[^>]*>?/gm,'').toLowerCase().includes(q) ||
            ev.location?.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

    const monthNames = ["LEDEN", "ÚNOR", "BŘEZEN", "DUBEN", "KVĚTEN", "ČERVEN", "ČERVENEC", "SRPEN", "ZÁŘÍ", "ŘÍJEN", "LISTOPAD", "PROSINEC"];

    return (
      <div className="flex-1 flex flex-col h-full relative overflow-hidden animate-in fade-in duration-300">
         
         {/* Mobilní Nadpis Agendy */}
         <div className="md:hidden px-6 pt-5 pb-3 bg-gradient-to-b from-[#020817]/60 to-transparent shrink-0 flex items-center justify-start gap-4 relative z-10">
            {/* Horní neonová linka */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>
            {/* Spodní laserová linka do ztracena */}
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff] via-[#00f3ff]/50 to-[#00f3ff]/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>

            <img src="/vr_calendar.svg" alt="Kalendář" draggable="false" className="h-14 w-auto object-contain" />
            <div className="flex-1 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,243,255,0.8)]">
                  CO MĚ ČEKÁ
                </h1>
                <div className="text-[10px] uppercase tracking-widest text-[#00f3ff]/60 mt-1">Systém // Nadcházející události</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('vr-mobile-search-toggle')); }}
                className="group relative p-3.5 rounded-full bg-[#061026]/80 backdrop-blur-md border border-[#00f3ff]/40 text-[#00f3ff] active:scale-90 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)] hover:shadow-[0_0_30px_rgba(0,243,255,0.6)] hover:bg-[#00f3ff]/10 ml-4 overflow-hidden focus:outline-none"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#00f3ff]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div className="absolute inset-[3px] rounded-full border border-[#00f3ff]/20 group-hover:border-[#00f3ff]/50 pointer-events-none"></div>
                <Search size={20} className="relative z-10 drop-shadow-[0_0_8px_rgba(0,243,255,1)] group-hover:drop-shadow-[0_0_12px_rgba(0,243,255,1)] transition-all" strokeWidth={2.5} />
              </button>
            </div>
         </div>

         {/* Desktop Title Bar (Sjednoceno s EmailApp.jsx - volně plující nahoře) */}
         <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 p-8 border-none bg-[#0a1630] backdrop-blur-md relative z-[100] overflow-visible">
            {/* Horní neonová linka (pro konzistenci) */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>

            {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
            <div className="absolute right-0 top-0 h-[150px] w-[300px] overflow-hidden pointer-events-none opacity-70 z-[5]">
               <img src="/neon_corner.png" alt="" draggable="false" className="absolute right-0 bottom-0 h-[170px] w-auto max-w-none" />
            </div>
            
            <div className="flex items-center gap-6 relative z-10 w-full justify-between">
              <div className="flex items-center gap-6">
                <div className="p-2 md:p-3 rounded-2xl bg-[#00f3ff]/10 border-2 border-[#00f3ff]/40 shadow-[0_0_25px_rgba(0,243,255,0.4)] transition-all">
                  <img src="/vr_calendar.svg" className="w-14 h-14 md:w-16 md:h-16 object-contain" alt="Kalendář" draggable="false" />
                </div>
                
                <div className="flex flex-col justify-center relative mt-1 select-none">
                  <div className="flex items-center gap-3 ml-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d9257b] shadow-[0_0_8px_rgba(217,37,123,0.8)]"></div>
                    <span className="text-[#00f3ff] text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                      System // Timeline // {activeCalendarView}
                    </span>
                  </div>
                  <div className="flex flex-row items-baseline">
                    <span className="text-[#00f3ff] text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                    <h1 className="text-4xl md:text-5xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal">
                      CO MĚ ČEKÁ
                    </h1>
                    <span className="text-[#00f3ff] text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Aplikace neonové lajny zespodu hlavní hlavičky složek - Synchronizováno s Emailem */}
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff] via-[#00f3ff]/50 to-[#00f3ff]/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>
         </div>

         {/* Sub-toolbar s vyhledáváním (Desktop) - teď samostatně! */}
         <div className="hidden md:flex items-center pl-7 py-3 pr-[38px] md:m-6 md:mb-0 md:h-[100px] md:rounded-2xl bg-[#0a1630] md:bg-[#061026] border-b md:border border-[#00f3ff]/10 md:border-[#00f3ff]/20 md:shadow-[0_5px_20px_rgba(0,0,0,0.5)] z-20 shrink-0">
            {/* Placeholder pro zachování zarovnání s EmailList */}
            <div className="w-[40px] pr-2" />
            
            <div className="w-[20%] pr-4 flex items-center">
              <span className="text-slate-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Nadcházející: ${agendaEvents.length} událostí`}>
                Výpis {agendaEvents.length} událostí
              </span>
            </div>

            <div className="flex-1 relative group pr-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/50 group-focus-within:text-[#00f3ff] transition-colors pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Hledat události..."
                value={agendaSearch}
                onChange={e => { setAgendaSearch(e.target.value); setDisplayedAgendaCount(7); }}
                className="pl-9 pr-9 py-1.5 w-full bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded-md text-xs text-white placeholder-[#00f3ff]/40 outline-none focus:border-[#00f3ff] transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
              />
              {agendaSearch && (
                <button
                  onClick={() => { setAgendaSearch(''); setDisplayedAgendaCount(7); }}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-[#00f3ff]/60 hover:text-[#d9257b] transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(217,37,123,0.5)] z-10 hover:scale-125"
                >✕</button>
              )}
            </div>
            {/* Spacer namísto tlacíka Nepřečtené */}
            <div className="shrink-0 z-20 pl-4 w-[140px]"></div>
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar px-2 md:px-6 sm:px-10 mt-2 md:mt-4 pb-6">
            {agendaEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50 relative top-[-40px]">
                    <Clock size={64} className="text-[#00f3ff] mb-6 drop-shadow-[0_0_15px_#00f3ff] opacity-80" />
                    <p className="text-[#00f3ff] uppercase tracking-[0.3em] font-bold text-lg mb-2 text-center drop-shadow-[0_0_10px_#00f3ff]">Databáze prázdná</p>
                    <p className="text-slate-500 font-mono text-sm tracking-tight text-center">V dohledné době se na obzoru nic neděje.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2 pb-8" >
                  {agendaEvents.slice(0, displayedAgendaCount).map((ev, index, slicedArray) => {
                     const isFirstOfDay = index === 0 || ev.fullDate.toDateString() !== slicedArray[index-1].fullDate.toDateString();
                     
                     const dayNames = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
                     const dateKey = `${dayNames[ev.fullDate.getDay()]} ${ev.fullDate.getDate()}. ${monthNames[ev.fullDate.getMonth()].toLowerCase()} ${ev.fullDate.getFullYear()}`;
                     const currentObj = ev.fullDate;
                     const isToday = currentObj.toDateString() === new Date().toDateString();

                     return (
                        <Fragment key={ev.id}>
                          {isFirstOfDay && (
                             <div className="mt-3 md:mt-4 mb-2 first:mt-0 pt-1 border-b border-[#00f3ff]/10">
                               <h3 className={`text-[13px] md:text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 md:gap-3 ${isToday ? 'text-[#d9257b]' : 'text-[#00f3ff]'}`}>
                                 {isToday && <span className="w-2 h-2 rounded-full bg-[#d9257b] shadow-[0_0_10px_#d9257b] animate-pulse" />}
                                 {isToday ? "Dnes" : dateKey}
                               </h3>
                               <div className={`h-px w-full mt-1.5 ${isToday ? 'bg-gradient-to-r from-[#d9257b]/60 to-transparent' : 'bg-gradient-to-r from-[#00f3ff]/30 to-transparent'}`} />
                             </div>
                          )}

                          <div 
                             onClick={() => setSelectedEvent(ev)}
                             className="cursor-pointer bg-[#061026] border border-[#0d1b38] hover:border-[#00f3ff]/30 rounded-xl md:rounded-2xl p-2 md:p-3 flex gap-2 md:gap-4 items-center justify-between group hover:bg-[#0d1b38] hover:shadow-[inset_4px_0_0_#00f3ff]"
                          >
                             <div className="flex gap-2 md:gap-4 items-center w-full min-w-0">
                                <div className={`w-1.5 h-8 md:h-10 rounded-full shrink-0 transition-transform group-hover:scale-y-110 ${getEventSolidColor(ev.colorId)}`} />

                                <div className="flex flex-col min-w-[50px] md:min-w-[70px] shrink-0 items-start justify-center pl-1">
                                    {ev.isAllDay ? (
                                        <div className="text-[9px] md:text-[10px] font-black tracking-[0.2em] uppercase text-[#00f3ff] bg-[#00f3ff]/10 py-1.5 px-1 md:px-2 rounded-md border border-[#00f3ff]/20">CELÝ DEN</div>
                                    ) : (
                                        <div className="text-sm md:text-xl font-bold text-slate-300 font-mono tracking-tight group-hover:text-[#00f3ff] transition-colors">{ev.fullDate.toTimeString().substring(0, 5)}</div>
                                    )}
                                </div>

                                <div className="flex flex-col flex-1 min-w-0 pl-1 md:pl-2">
                                   <div className="text-[15px] md:text-lg font-bold text-white truncate group-hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] transition-all">{ev.title}</div>
                                   {ev.description && (
                                     <div className="text-xs text-slate-500 font-mono tracking-tight truncate group-hover:text-slate-400 mt-0.5 md:mt-1">
                                       {ev.description.replace(/<[^>]*>?/gm, '')}
                                     </div>
                                   )}
                                </div>
                             </div>
                             
                             <div className="shrink-0 text-white/10 group-hover:text-[#00f3ff] transition-colors pr-1 md:pr-2">
                                <ChevronRight size={18} className="md:w-5 md:h-5" />
                             </div>
                          </div>
                        </Fragment>
                     )
                  })}
                  
                  {agendaEvents.length > displayedAgendaCount && (
                     <button 
                        onClick={() => setDisplayedAgendaCount(prev => prev + 7)}
                        className="mt-6 w-full py-4 rounded-xl border border-[#00f3ff]/30 bg-[#00f3ff]/5 hover:bg-[#00f3ff]/10 text-[#00f3ff] text-xs font-bold uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(0,243,255,0.2)] active:scale-[0.98]"
                     >
                        Načíst dalších 7 událostí ↓
                     </button>
                  )}
                </div>
            )}
         </div>
      </div>
    );
}
