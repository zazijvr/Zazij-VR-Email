import { Fragment, type Dispatch, type SetStateAction } from 'react';
import type { CalendarEvent } from '../../../types/calendar';
import { Search, Clock, ChevronRight } from 'lucide-react';
import { Mascot } from '../../../components/Mascot';
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
         <div className="md:hidden px-6 pt-5 pb-3 bg-gradient-to-b from-navy-deep/60 to-transparent shrink-0 flex items-center justify-start gap-4 relative z-10">
            {/* Horní neonová linka */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.5)] pointer-events-none z-20"></div>
            {/* Spodní laserová linka do ztracena */}
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue via-neon-blue/50 to-neon-blue/10 drop-shadow-[0_0_10px_rgb(var(--c-neon-blue))] pointer-events-none z-20"></div>

            <Mascot src="/vr_calendar.svg" alt="Kalendář" className="h-14 w-auto object-contain" />
            <div className="flex-1 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.8)]">
                  CO MĚ ČEKÁ
                </h1>
                <div className="text-[10px] uppercase tracking-widest text-neon-blue/60 mt-1">Systém // Nadcházející události</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('vr-mobile-search-toggle')); }}
                className="group relative p-3.5 rounded-full bg-navy/80 backdrop-blur-md border border-neon-blue/40 text-neon-blue active:scale-90 transition-all shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.3)] hover:shadow-[0_0_30px_rgb(var(--c-neon-blue)/0.6)] hover:bg-neon-blue/10 ml-4 overflow-hidden focus:outline-none"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div className="absolute inset-[3px] rounded-full border border-neon-blue/20 group-hover:border-neon-blue/50 pointer-events-none"></div>
                <Search size={20} className="relative z-10 drop-shadow-[0_0_8px_rgb(var(--c-neon-blue)/1)] group-hover:drop-shadow-[0_0_12px_rgb(var(--c-neon-blue)/1)] transition-all" strokeWidth={2.5} />
              </button>
            </div>
         </div>

         {/* Desktop Title Bar (Sjednoceno s EmailApp.jsx - volně plující nahoře) */}
         <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 p-8 border-none bg-navy-card backdrop-blur-md relative z-[100] overflow-visible">
            {/* Horní neonová linka (pro konzistenci) */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.5)] pointer-events-none z-20"></div>

            {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
            <div className="absolute right-0 top-0 h-[150px] w-[300px] overflow-hidden pointer-events-none opacity-70 z-[5]">
               <img src="/neon_corner.png" alt="" draggable="false" className="vr-neon-art absolute right-0 bottom-0 h-[170px] w-auto max-w-none" />
            </div>
            
            <div className="flex items-center gap-6 relative z-10 w-full justify-between">
              <div className="flex items-center gap-6">
                <div className="p-2 md:p-3 rounded-2xl bg-neon-blue/10 border-2 border-neon-blue/40 shadow-[0_0_25px_rgb(var(--c-neon-blue)/0.4)] transition-all">
                  <Mascot src="/vr_calendar.svg" className="w-14 h-14 md:w-16 md:h-16 object-contain" alt="Kalendář" />
                </div>
                
                <div className="flex flex-col justify-center relative mt-1 select-none">
                  <div className="flex items-center gap-3 ml-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-neon-rose shadow-[0_0_8px_rgb(var(--c-neon-rose)/0.8)]"></div>
                    <span className="text-neon-blue text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                      System // Timeline // {activeCalendarView}
                    </span>
                  </div>
                  <div className="flex flex-row items-baseline">
                    <span className="text-neon-blue text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                    <h1 className="text-4xl md:text-5xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_20px_rgb(var(--c-neon-blue)/0.8)] pt-2 pb-1 leading-normal">
                      CO MĚ ČEKÁ
                    </h1>
                    <span className="text-neon-blue text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Aplikace neonové lajny zespodu hlavní hlavičky složek - Synchronizováno s Emailem */}
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue via-neon-blue/50 to-neon-blue/10 drop-shadow-[0_0_10px_rgb(var(--c-neon-blue))] pointer-events-none z-20"></div>
         </div>

         {/* Sub-toolbar s vyhledáváním (Desktop) - teď samostatně! */}
         <div className="hidden md:flex items-center pl-7 py-3 pr-[38px] md:m-6 md:mb-0 md:h-[100px] md:rounded-2xl bg-navy-card md:bg-navy border-b md:border border-neon-blue/10 md:border-neon-blue/20 md:shadow-[0_5px_20px_rgba(0,0,0,0.5)] z-20 shrink-0">
            {/* Placeholder pro zachování zarovnání s EmailList */}
            <div className="w-[40px] pr-2" />
            
            <div className="w-[20%] pr-4 flex items-center">
              <span className="text-slate-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Nadcházející: ${agendaEvents.length} událostí`}>
                Výpis {agendaEvents.length} událostí
              </span>
            </div>

            <div className="flex-1 relative group pr-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-blue/50 group-focus-within:text-neon-blue transition-colors pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Hledat události..."
                value={agendaSearch}
                onChange={e => { setAgendaSearch(e.target.value); setDisplayedAgendaCount(7); }}
                className="pl-9 pr-9 py-1.5 w-full bg-neon-blue/5 border border-neon-blue/30 rounded-md text-xs text-white placeholder-neon-blue/40 outline-none focus:border-neon-blue transition-all duration-300 shadow-[inset_0_0_10px_rgb(var(--c-neon-blue)/0.05)] focus:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]"
              />
              {agendaSearch && (
                <button
                  onClick={() => { setAgendaSearch(''); setDisplayedAgendaCount(7); }}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-neon-blue/60 hover:text-neon-rose transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgb(var(--c-neon-rose)/0.5)] z-10 hover:scale-125"
                >✕</button>
              )}
            </div>
            {/* Spacer namísto tlacíka Nepřečtené */}
            <div className="shrink-0 z-20 pl-4 w-[140px]"></div>
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar px-2 md:px-6 sm:px-10 mt-2 md:mt-4 pb-6">
            {agendaEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50 relative top-[-40px]">
                    <Clock size={64} className="text-neon-blue mb-6 drop-shadow-[0_0_15px_rgb(var(--c-neon-blue))] opacity-80" />
                    <p className="text-neon-blue uppercase tracking-[0.3em] font-bold text-lg mb-2 text-center drop-shadow-[0_0_10px_rgb(var(--c-neon-blue))]">Databáze prázdná</p>
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
                             <div className="mt-3 md:mt-4 mb-2 first:mt-0 pt-1 border-b border-neon-blue/10">
                               <h3 className={`text-[13px] md:text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 md:gap-3 ${isToday ? 'text-neon-rose' : 'text-neon-blue'}`}>
                                 {isToday && <span className="w-2 h-2 rounded-full bg-neon-rose shadow-[0_0_10px_rgb(var(--c-neon-rose))] animate-pulse" />}
                                 {isToday ? "Dnes" : dateKey}
                               </h3>
                               <div className={`h-px w-full mt-1.5 ${isToday ? 'bg-gradient-to-r from-neon-rose/60 to-transparent' : 'bg-gradient-to-r from-neon-blue/30 to-transparent'}`} />
                             </div>
                          )}

                          <div 
                             onClick={() => setSelectedEvent(ev)}
                             className="cursor-pointer bg-navy border border-navy-light hover:border-neon-blue/30 rounded-xl md:rounded-2xl p-2 md:p-3 flex gap-2 md:gap-4 items-center justify-between group hover:bg-navy-light hover:shadow-[inset_4px_0_0_rgb(var(--c-neon-blue))]"
                          >
                             <div className="flex gap-2 md:gap-4 items-center w-full min-w-0">
                                <div className={`w-1.5 h-8 md:h-10 rounded-full shrink-0 transition-transform group-hover:scale-y-110 ${getEventSolidColor(ev.colorId)}`} />

                                <div className="flex flex-col min-w-[50px] md:min-w-[70px] shrink-0 items-start justify-center pl-1">
                                    {ev.isAllDay ? (
                                        <div className="text-[9px] md:text-[10px] font-black tracking-[0.2em] uppercase text-neon-blue bg-neon-blue/10 py-1.5 px-1 md:px-2 rounded-md border border-neon-blue/20">CELÝ DEN</div>
                                    ) : (
                                        <div className="text-sm md:text-xl font-bold text-slate-300 font-mono tracking-tight group-hover:text-neon-blue transition-colors">{ev.fullDate.toTimeString().substring(0, 5)}</div>
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
                             
                             <div className="shrink-0 text-white/10 group-hover:text-neon-blue transition-colors pr-1 md:pr-2">
                                <ChevronRight size={18} className="md:w-5 md:h-5" />
                             </div>
                          </div>
                        </Fragment>
                     )
                  })}
                  
                  {agendaEvents.length > displayedAgendaCount && (
                     <button 
                        onClick={() => setDisplayedAgendaCount(prev => prev + 7)}
                        className="mt-6 w-full py-4 rounded-xl border border-neon-blue/30 bg-neon-blue/5 hover:bg-neon-blue/10 text-neon-blue text-xs font-bold uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)] active:scale-[0.98]"
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
