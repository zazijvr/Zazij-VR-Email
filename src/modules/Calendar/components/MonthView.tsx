import type { CalendarEvent } from '../../../types/calendar';
import { Search, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { getEventBgColor, getEventSolidColor, getEventColor } from '../utils/eventColors';

interface MonthViewProps {
  currentYear: number;
  currentMonthName: string;
  currentDate: Date;
  handleDateChange: (direction: 'prev' | 'next' | 'today') => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  firstDayOfMonth?: Date;
  daysInMonth: number;
  /** Kolik prázdných buněk je před 1. dnem měsíce */
  startingDay: number;
  totalCells: number;
  events: CalendarEvent[];
  /** Svátky podle data „RRRR-MM-DD“ */
  specialDays?: Record<string, string[]>;
  specialCalsLoading?: boolean;
  openCreateForDay: (day: Date) => void;
  /** Vybraný den „RRRR-MM-DD“ (mobil) */
  selectedCalDay: string | null;
  setSelectedCalDay: (day: string | null) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  activeCalendarView: string;
}

export default function MonthView({
  currentYear,
  currentMonthName,
  currentDate,
  handleDateChange,
  searchQuery,
  setSearchQuery,
  daysInMonth,
  startingDay,
  totalCells,
  events,
  specialDays,
  specialCalsLoading,
  openCreateForDay,
  selectedCalDay,
  setSelectedCalDay,
  setSelectedEvent,
  activeCalendarView,
}: MonthViewProps) {

  // Algoritmus pro generování buněk
  const calendarCells = [];
  for (let i = 0; i < totalCells; i++) {
    const isPrevMonth = i < startingDay;
    const isNextMonth = i >= startingDay + daysInMonth;
    const dayNumber = isPrevMonth
      ? new Date(currentYear, currentDate.getMonth(), 0).getDate() - startingDay + i + 1
      : isNextMonth
      ? i - startingDay - daysInMonth + 1
      : i - startingDay + 1;

    let cellDateObj: Date;
    if (isPrevMonth) {
      cellDateObj = new Date(currentYear, currentDate.getMonth() - 1, dayNumber);
    } else if (isNextMonth) {
      cellDateObj = new Date(currentYear, currentDate.getMonth() + 1, dayNumber);
    } else {
      cellDateObj = new Date(currentYear, currentDate.getMonth(), dayNumber);
    }
    const cellDateStr = `${cellDateObj.getFullYear()}-${String(cellDateObj.getMonth()+1).padStart(2,'0')}-${String(cellDateObj.getDate()).padStart(2,'0')}`;

    let isToday = false;
    if (!isPrevMonth && !isNextMonth) {
      const today = new Date();
      isToday = dayNumber === today.getDate() &&
                currentDate.getMonth() === today.getMonth() &&
                currentYear === today.getFullYear();
    }

    const cellSpecialDays = !isPrevMonth && !isNextMonth && specialDays && specialDays[cellDateStr] 
      ? specialDays[cellDateStr] 
      : [];

    const cellEvents = events.filter(e => {
        if (!e.fullDate) return false;
        return e.fullDate.getDate() === cellDateObj.getDate() &&
               e.fullDate.getMonth() === cellDateObj.getMonth() &&
               e.fullDate.getFullYear() === cellDateObj.getFullYear();
    });

    // Filtrování událostí v buňce
    const filteredCellEvents = cellEvents.filter(e => {
        if (!searchQuery) return true;
        return e.title.toLowerCase().includes(searchQuery.toLowerCase());
    });
    
    const isSelected = selectedCalDay === cellDateStr;

    calendarCells.push(
      <div 
        key={i} 
        onClick={() => {
            if (!isPrevMonth && !isNextMonth) {
                if (isSelected) {
                    setSelectedCalDay(null);
                } else {
                    setSelectedCalDay(cellDateStr);
                }
            }
        }}
        className={`min-h-[80px] sm:min-h-[100px] md:min-h-[120px] p-1 sm:p-2 border border-neon-blue/10 transition-all relative group flex flex-col cursor-pointer overflow-hidden
          ${isPrevMonth || isNextMonth ? 'opacity-30 bg-navy-card' : 'bg-neon-blue/5 hover:bg-neon-blue/10 hover:border-neon-blue/30'}
          ${isToday && !isSelected ? 'ring-2 ring-inset ring-neon-rose' : ''}
          ${isSelected ? 'bg-neon-blue/20 border border-neon-blue/60 shadow-[inset_0_0_20px_rgb(var(--c-neon-blue)/0.3)] z-10 scale-[1.02] ring-2 ring-neon-blue' : ''}
        `}
      >
        <div className="flex justify-between items-start z-10 pointer-events-none mb-1">
          <span className={`text-sm sm:text-lg font-black tracking-widest ${isToday ? 'text-neon-rose drop-shadow-[0_0_8px_rgb(var(--c-neon-rose)/1)]' : 'text-slate-400 group-hover:text-white transition-colors'}`}>
            {dayNumber}
          </span>
          {(!isPrevMonth && !isNextMonth) && (
             <div 
                className="w-6 sm:w-8 h-6 sm:h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-neon-blue/20 text-neon-blue transition-all opacity-0 group-hover:opacity-100 pointer-events-auto"
                onClick={(e) => { e.stopPropagation(); openCreateForDay(cellDateObj); }}
                title="Přidat událost na tento den"
             >
                <Plus size={16} />
             </div>
          )}
        </div>

        {/* Vyobrazení svátků */}
        {!isPrevMonth && !isNextMonth && cellSpecialDays.length > 0 && (
           <div className="flex flex-col gap-0.5 mb-1 z-10">
               {cellSpecialDays.map((holiday, idx) => (
                   <span key={idx} className="text-[7.5px] sm:text-[9.5px] text-neon-rose font-bold tracking-widest uppercase truncate pointer-events-none drop-shadow-[0_0_3px_rgb(var(--c-neon-rose))]">
                       {holiday}
                   </span>
               ))}
           </div>
        )}

        {/* Vyobrazení událostí */}
        <div className="flex flex-col gap-1 sm:gap-1.5 mt-auto sm:mt-1 overflow-visible relative flex-1">
          {(() => {
              const maxDisplay = 3;
              const displayEvents = filteredCellEvents.slice(0, maxDisplay);
              const extraCount = filteredCellEvents.length - maxDisplay;

              return (
                  <>
                      {displayEvents.map((ev) => {
                          const isPast = ev.endDate && ev.endDate < new Date();
                          return (
                          <div 
                              key={ev.id} 
                              className={`text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded truncate font-mono tracking-tight pointer-events-auto transition-all transform z-20 shadow-sm border ${
                                  isPast 
                                    ? 'bg-transparent border-dashed border-neon-blue/[0.15] text-white/30 opacity-40 grayscale line-through hover:opacity-100 hover:decoration-transparent hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.5)]'
                                    : `${getEventBgColor(ev.colorId)} ${getEventColor(ev.colorId)} hover:scale-105 hover:brightness-125`
                              }`}
                              onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                              title={ev.title}
                          >
                              {ev.isAllDay ? (
                                  <span className="font-bold opacity-90 block truncate">{ev.title}</span>
                              ) : (
                                  <div className="flex items-center gap-1 opacity-90 truncate">
                                      <span className="font-bold shrink-0">{ev.fullDate.toTimeString().substring(0, 5)}</span>
                                      <span className="truncate">{ev.title}</span>
                                  </div>
                              )}
                          </div>
                      )})}
                      
                      {extraCount > 0 && (
                          <div className="text-[8px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1 mt-0.5 pointer-events-none">
                              + dalších {extraCount}
                          </div>
                      )}
                  </>
              );
          })()}
        </div>

        {isSelected && (
           <div className="absolute inset-0 border-2 border-neon-blue rounded pointer-events-none" />
        )}
      </div>
    );
  }

  // Filtr pro svátky v side panelu
  const filteredEventsForGrid = events.filter(e => {
    if (!searchQuery) return true;
    return e.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-4 p-5 md:p-8 border-b border-neon-blue/20 bg-navy-card backdrop-blur-md relative z-10 overflow-visible">
         {/* Dekorativní kyberpunkové žíly Header */}
         <div className="hidden md:block absolute right-0 top-0 h-[114px] w-[400px] overflow-hidden pointer-events-none opacity-50 z-[5]">
             <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
               <defs>
                 <filter id="rightGlowSVG" x="-20%" y="-20%" width="140%" height="140%">
                   <feGaussianBlur stdDeviation="3" result="blur1" />
                   <feGaussianBlur stdDeviation="6" result="blur2" />
                   <feMerge>
                       <feMergeNode in="blur2" />
                       <feMergeNode in="blur1" />
                       <feMergeNode in="SourceGraphic" />
                   </feMerge>
                 </filter>
               </defs>
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" style={{ stroke: 'rgb(var(--c-neon-blue))' }} strokeWidth="2" filter="url(#rightGlowSVG)" />
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#rightGlowSVG)" />
               <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" style={{ stroke: 'rgb(var(--c-neon-rose))' }} strokeWidth="1.5" strokeOpacity="0.8" filter="url(#rightGlowSVG)" />
               <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" style={{ stroke: 'rgb(var(--c-neon-blue))' }} strokeWidth="1" strokeOpacity="0.5" filter="url(#rightGlowSVG)" />
               <circle cx="80" cy="40" r="4" style={{ fill: 'rgb(var(--c-navy-deep))', stroke: 'rgb(var(--c-neon-blue))' }} strokeWidth="1.5" filter="url(#rightGlowSVG)" />
               <circle cx="200" cy="80" r="3" style={{ fill: 'rgb(var(--c-neon-blue))' }} filter="url(#rightGlowSVG)" />
               <circle cx="35" cy="15" r="3" style={{ fill: 'rgb(var(--c-neon-rose))' }} filter="url(#rightGlowSVG)" />
               <circle cx="220" cy="50" r="5" style={{ fill: 'rgb(var(--c-navy-deep))', stroke: 'rgb(var(--c-neon-rose))' }} strokeWidth="1.5" filter="url(#rightGlowSVG)" />
               <circle cx="130" cy="100" r="2" style={{ fill: 'rgb(var(--c-neon-blue))' }} filter="url(#rightGlowSVG)" />
             </svg>
         </div>

         <div className="flex items-center gap-6 relative w-full justify-between">
           <div className="flex items-center gap-4 md:gap-6">
             <div className="p-2 md:p-3 rounded-2xl bg-neon-blue/10 border-2 border-neon-blue/40 shadow-[0_0_25px_rgb(var(--c-neon-blue)/0.4)] transition-all flex items-center justify-center min-w-[56px] md:min-w-[72px] min-h-[56px] md:min-h-[72px]">
               <img src="/vr_calendar.svg" className="w-10 h-10 md:w-16 md:h-16 object-contain" alt="Kalendář" draggable="false" />
             </div>
             
             <div className="flex flex-col justify-center relative mt-1 select-none">
               {/* MOBILE VIEW */}
               <div className="md:hidden flex flex-col">
                 <h1 className="text-3xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.8)] leading-tight flex items-center gap-2">
                   {currentMonthName} <span className="text-neon-rose drop-shadow-[0_0_10px_rgb(var(--c-neon-rose))]">{currentYear}</span>
                 </h1>
                 <div className="text-[10px] uppercase tracking-widest text-neon-blue/60 mt-1">
                   System // Timeline // {activeCalendarView}
                 </div>
               </div>

               {/* DESKTOP VIEW */}
               <div className="hidden md:flex flex-col justify-center w-full">
                 <div className="flex items-center gap-3 ml-2 mb-3">
                   <div className="w-1.5 h-1.5 rounded-full bg-neon-rose shadow-[0_0_8px_rgb(var(--c-neon-rose)/0.8)]"></div>
                   <span className="text-neon-blue text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                     System // Timeline // 0xE9
                   </span>
                 </div>
                 <div className="flex flex-row items-baseline">
                   <span className="text-neon-blue text-5xl font-light mr-4 opacity-70">[</span>
                   <h1 className="text-5xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_20px_rgb(var(--c-neon-blue)/0.8)] pt-2 pb-1 leading-normal">
                     {currentMonthName} <span className="text-neon-rose drop-shadow-[0_0_15px_rgb(var(--c-neon-rose)/0.8)]">{currentYear}</span>
                   </h1>
                   <span className="text-neon-blue text-5xl font-light ml-4 opacity-70">]</span>
                 </div>
               </div>
             </div>
           </div>

           {/* LUPA PRO MOBIL */}
           <button
             onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('vr-mobile-search-toggle')); }}
             className="md:hidden group relative p-3.5 rounded-full bg-navy/80 backdrop-blur-md border border-neon-blue/40 text-neon-blue active:scale-90 transition-all shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.3)] hover:shadow-[0_0_30px_rgb(var(--c-neon-blue)/0.6)] hover:bg-neon-blue/10 ml-4 overflow-hidden focus:outline-none"
           >
             <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
             <div className="absolute inset-[3px] rounded-full border border-neon-blue/20 group-hover:border-neon-blue/50 pointer-events-none"></div>
             <Search size={20} className="relative z-10 drop-shadow-[0_0_8px_rgb(var(--c-neon-blue)/1)] group-hover:drop-shadow-[0_0_12px_rgb(var(--c-neon-blue)/1)] transition-all" strokeWidth={2.5} />
           </button>
         </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        
        {/* Pravý sloupec - Kalendář */}
        <div className="flex-1 flex flex-col min-w-0 bg-navy-card backdrop-blur-sm z-0 relative">
          
          <div className="flex items-center pl-2 md:pl-7 py-2 border-b border-neon-blue/10 shrink-0 gap-2 md:gap-4 justify-between pr-2 md:pr-4">
             <div className="flex items-center gap-1 md:gap-2">
                 <button onClick={() => handleDateChange('prev')} className="p-1 sm:p-2 hover:bg-neon-blue/20 rounded-lg text-neon-blue transition-all"><ChevronLeft size={18} className="sm:w-5 sm:h-5" /></button>
                 <button 
                   onClick={() => handleDateChange('today')} 
                   className="px-3 sm:px-6 py-1 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] bg-neon-rose/10 hover:bg-neon-rose/20 rounded-lg text-neon-rose transition-all border border-neon-rose/50 shadow-[0_0_15px_rgb(var(--c-neon-rose)/0.3)] hover:shadow-[0_0_25px_rgb(var(--c-neon-rose)/0.6)] mx-1 md:mx-2 whitespace-nowrap drop-shadow-[0_0_5px_rgb(var(--c-neon-rose)/0.8)] focus:outline-none hover:scale-105"
                 >
                   Dnes
                 </button>
                 <button onClick={() => handleDateChange('next')} className="p-1 sm:p-2 hover:bg-neon-blue/20 rounded-lg text-neon-blue transition-all"><ChevronRight size={18} className="sm:w-5 sm:h-5" /></button>
             </div>

             <div className="hidden md:flex flex-1 max-w-sm relative group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-blue/50 group-focus-within:text-neon-blue transition-colors pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Hledat události v měsíci..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 py-1.5 w-full bg-neon-blue/5 border border-neon-blue/30 rounded-md text-xs text-white placeholder-neon-blue/40 outline-none focus:border-neon-blue transition-all duration-300 shadow-[inset_0_0_10px_rgb(var(--c-neon-blue)/0.05)] focus:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]"
                />
                {searchQuery && (
                   <button 
                     onClick={() => setSearchQuery('')}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-blue/60 hover:text-neon-blue transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.5)] z-10 hover:scale-125"
                   >✕</button>
                )}
             </div>
             {specialCalsLoading && <Loader2 size={16} className="text-neon-rose animate-spin hidden sm:block mx-4 shrink-0" />}
          </div>

          <div className="grid grid-cols-7 border-b border-neon-blue/20 bg-[#0a1120] shrink-0">
            {['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'].map(day => (
              <div key={day} className="py-2 sm:py-3 text-center text-xs sm:text-sm font-black tracking-widest text-neon-blue uppercase drop-shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.8)] border-r border-neon-blue/10 last:border-0">{day}</div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7 grid-rows-6 bg-[#000510] overflow-y-auto">
             {calendarCells}
          </div>
        </div>

        {/* Levý sloupec pro detail výběru dne (pouze desktop / širší obrazovka) */}
        {selectedCalDay && (
           <div className="hidden lg:flex w-80 flex-col bg-navy border-l border-neon-blue/20 animate-in slide-in-from-right duration-300 transform-gpu z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
               
               <div className="p-6 border-b border-neon-blue/10 bg-gradient-to-br from-navy-deep/60 to-transparent relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue opacity-5 rounded-full blur-2xl transform translate-x-10 -translate-y-10 group-hover:bg-neon-rose transition-colors duration-1000"></div>
                   
                   <div className="flex justify-between items-start mb-6 relative">
                       <h3 className="text-4xl font-black text-neon-blue tracking-widest drop-shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.8)] flex flex-col">
                           <span className="text-sm font-mono text-slate-400 tracking-tight uppercase mb-1 drop-shadow-none">Detail dne</span>
                           {parseInt(selectedCalDay.split('-')[2])}. {currentMonthName.substring(0,3)}
                       </h3>
                   </div>
                   
                   <button 
                       onClick={() => openCreateForDay(new Date(selectedCalDay))}
                       className="w-full py-4 rounded-xl border border-neon-blue/50 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue text-xs font-bold shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.15)] hover:shadow-[0_0_25px_rgb(var(--c-neon-blue)/0.4)] transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] active:scale-95"
                   >
                       <Plus size={16} /> Prázdný záznam
                   </button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
               {(() => {
                   const dayEvents = filteredEventsForGrid.filter(e => {
                       if (!e.fullDate) return false;
                       const d = e.fullDate;
                       return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === selectedCalDay;
                   });
                   const daySpecials = specialDays && specialDays[selectedCalDay] ? specialDays[selectedCalDay] : [];

                   if (dayEvents.length === 0 && daySpecials.length === 0) {
                       return (
                           <div className="h-full flex flex-col items-center justify-center opacity-40">
                               <div className="w-16 h-16 rounded-full border border-dashed border-slate-500 mb-4 flex items-center justify-center">
                                  <ChevronRight className="text-slate-500" />
                               </div>
                               <p className="text-xs font-mono uppercase tracking-widest">Žádná data</p>
                           </div>
                       );
                   }

                   return (
                       <>
                           {daySpecials.map((holiday, idx) => (
                               <div key={`hol-${idx}`} className="p-3 bg-neon-rose/10 border border-neon-rose/30 rounded-xl relative overflow-hidden group">
                                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-rose shadow-[0_0_10px_rgb(var(--c-neon-rose))]"></div>
                                   <div className="pl-2">
                                       <span className="text-[10px] font-black uppercase text-neon-rose tracking-[0.25em] drop-shadow-[0_0_5px_rgb(var(--c-neon-rose))]">Svátek</span>
                                       <p className="text-sm font-bold text-white mt-1 truncation">{holiday}</p>
                                   </div>
                               </div>
                           ))}

                           {dayEvents.map(ev => (
                               <div 
                                   key={ev.id}
                                   className={`p-3 rounded-xl border relative overflow-hidden group cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-md ${getEventBgColor(ev.colorId)} ${getEventColor(ev.colorId)}`}
                                   onClick={() => setSelectedEvent(ev)}
                               >
                                   <div className={`absolute left-0 top-0 bottom-0 w-1 shadow-md ${getEventSolidColor(ev.colorId)}`} />
                                   
                                   <div className="pl-3">
                                       {ev.isAllDay ? (
                                           <div className="text-[9px] font-black tracking-[0.2em] uppercase text-neon-blue bg-neon-blue/10 inline-block py-1 px-2 rounded border border-neon-blue/20 mb-2">CELÝ DEN</div>
                                       ) : (
                                           <div className="text-xs font-mono font-bold opacity-80 mb-1">{ev.fullDate.toTimeString().substring(0, 5)} - {ev.endDate.toTimeString().substring(0, 5)}</div>
                                       )}
                                       <h4 className="text-sm font-bold text-white leading-tight">{ev.title}</h4>
                                       
                                       {ev.location && (
                                           <div className="text-[10px] font-mono opacity-70 mt-2 truncate max-w-full">
                                               {ev.location}
                                           </div>
                                       )}
                                   </div>
                               </div>
                           ))}
                       </>
                   );
               })()}
               </div>
           </div>
        )}
      </div>
    </div>
  );
}
