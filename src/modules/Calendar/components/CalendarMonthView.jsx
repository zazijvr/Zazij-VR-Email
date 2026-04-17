import React from 'react';
import { ChevronLeft, ChevronRight, Loader2, MapPin, Search } from 'lucide-react';

export default function CalendarMonthView({
  events,
  currentYear,
  currentDate,
  searchQuery,
  setSearchQuery,
  isLoading,
  handlePrevMonth,
  handleNextMonth,
  handleToday,
  setSelectedEvent,
  selectedCalDay,
  setSelectedCalDay,
  openCreateForDay,
  activeCalendarView,
  currentMonthName
}) {
  const getEventColor = (colorId) => {
    const colors = {
      '1': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
      '2': 'bg-teal-500/20 text-teal-400 border-teal-500/50',
      '3': 'bg-[#f800ff]/20 text-[#f800ff] border-[#f800ff]/50', // purple
      '4': 'bg-pink-500/20 text-pink-400 border-pink-500/50',
      '5': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      '6': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      '7': 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50', // blue/cyan
      '8': 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      '9': 'bg-blue-600/20 text-blue-400 border-blue-600/50',
      '10': 'bg-green-500/20 text-green-400 border-green-500/50',
      '11': 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[colorId] || 'bg-[#00f3ff]/10 text-white border-[#00f3ff]/30'; 
  };

  const getEventSolidColor = (colorId) => {
    const colors = {
      '1': 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]',
      '2': 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]',
      '3': 'bg-[#f800ff] shadow-[0_0_10px_rgba(248,0,255,0.5)]',
      '4': 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]',
      '5': 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]',
      '6': 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]',
      '7': 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]',
      '8': 'bg-gray-500 shadow-[0_0_10px_rgba(107,114,128,0.5)]',
      '9': 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]',
      '10': 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]',
      '11': 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
    };
    return colors[colorId] || 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]'; 
  };


  // Příprava logiky Mřížky
  const daysInMonth = new Date(currentYear, currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentDate.getMonth(), 1).getDay(); 
  const startingDay = (firstDayOfMonth + 6) % 7; 
  const totalCells = 42; // Máme 6 řádků po 7 dnech



  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-4 p-8 border-b border-[#f800ff]/20 bg-black/30 backdrop-blur-md relative z-[100] overflow-visible">
        
        {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
        <div className="absolute right-0 top-0 h-[114px] w-[400px] overflow-hidden pointer-events-none opacity-50 z-[5]">
             <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
               <defs>
                 <filter id="headerRightGlowSVGC" x="-20%" y="-20%" width="140%" height="140%">
                   <feGaussianBlur stdDeviation="3" result="blur1" />
                   <feGaussianBlur stdDeviation="6" result="blur2" />
                   <feMerge>
                       <feMergeNode in="blur2" />
                       <feMergeNode in="blur1" />
                       <feMergeNode in="SourceGraphic" />
                   </feMerge>
                 </filter>
               </defs>
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#f800ff" strokeWidth="2" filter="url(#headerRightGlowSVGC)" />
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVGC)" />
               <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#00f3ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#headerRightGlowSVGC)" />
               <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#f800ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="80" cy="40" r="4" fill="#0f172a" stroke="#f800ff" strokeWidth="1.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="200" cy="80" r="3" fill="#f800ff" filter="url(#headerRightGlowSVGC)" />
               <circle cx="35" cy="15" r="3" fill="#00f3ff" filter="url(#headerRightGlowSVGC)" />
               <circle cx="220" cy="50" r="5" fill="#0f172a" stroke="#00f3ff" strokeWidth="1.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="130" cy="100" r="2" fill="#f800ff" filter="url(#headerRightGlowSVGC)" />
             </svg>
        </div>

        <div className="flex items-center gap-6 relative z-10 w-full">
          <div className="flex items-center gap-6">
            <div className="p-2 md:p-3 rounded-2xl bg-[#f800ff]/10 border-2 border-[#f800ff]/40 shadow-[0_0_25px_rgba(248,0,255,0.4)] transition-all flex items-center justify-center min-w-[72px] min-h-[72px]">
              <img src="/vr_calendar_trans.png" className="w-14 h-14 md:w-16 md:h-16 object-contain filter drop-shadow-[0_0_15px_rgba(248,0,255,0.8)]" alt="Kalendář" draggable="false" />
            </div>
            
            <div className="flex flex-col justify-center relative mt-1 select-none">
              <div className="flex items-center gap-3 ml-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_rgba(0,243,255,0.8)]"></div>
                <span className="text-[#f800ff] text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                  System // Timeline // {activeCalendarView}
                </span>
              </div>
              <div className="flex flex-row items-baseline">
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                <h1 className="text-4xl md:text-5xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal flex items-center gap-4">
                  {currentMonthName} {currentYear}
                  {isLoading && <Loader2 size={32} className="text-[#00f3ff] animate-spin" />}
                </h1>
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zde přidáváme backdrop wrapper ala EmailList */}
      <div className="flex-1 relative bg-[#0f172a]/80 backdrop-blur-sm flex flex-col h-full shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Kontrolní panel: Výpis, Hledání, Navigace DNES - vytaženo VEN z grid wrapperu aby lícoval z EmailListem */}
        <div className="flex items-center pl-7 py-2 pr-[38px] bg-black/40 border-b border-[#00f3ff]/10 z-20 shrink-0 w-full">
          
          {/* Placeholder šířky pro sloupec s Checkboxy (odpovídá EmailListu) */}
          <div className="w-[40px] pr-2" />


        {/* Šířka pro sloupec Odesílatel */}
        <div className="w-[20%] pr-4 flex items-center">
          <span className="text-gray-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Zobrazeno ${events.length} událostí v API poolu`}>
            Výpis {events.length} záznamů
          </span>
        </div>

        {/* Šířka pro sloupec Předmět (Zarovná Search Bar) */}
        <div className="flex-1 relative group pr-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/50 group-focus-within:text-[#00f3ff] transition-colors pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Hledat události..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 py-1.5 w-full bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded-md text-xs text-white placeholder-[#00f3ff]/40 outline-none focus:border-[#00f3ff] transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-[#00f3ff]/60 hover:text-[#00f3ff] transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(0,243,255,0.5)] z-10 hover:scale-125"
              title="Vymazat hledání"
            >
              ✕
            </button>
          )}
        </div>

        {/* Pravý blok s tlačítky - flex rozvržení upraveno pro čistotu */}
        <div className="shrink-0 z-20 pl-4 flex items-center gap-2">
          <button onClick={handleToday} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all rounded-md flex items-center gap-2 bg-[#f800ff]/5 text-[#f800ff] border border-[#f800ff]/40 shadow-[0_0_10px_rgba(248,0,255,0.15)] hover:bg-[#f800ff]/20 hover:shadow-[0_0_20px_rgba(248,0,255,0.4)]">
            DNES
          </button>
          <div className="flex items-center gap-1">
             <button onClick={handlePrevMonth} className="px-2 py-1.5 rounded-md border border-[#00f3ff]/20 hover:border-[#00f3ff]/40 text-[#00f3ff]/70 hover:text-[#00f3ff] transition-all bg-black/50 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:bg-[#00f3ff]/10">
               <ChevronLeft size={16} />
             </button>
             <button onClick={handleNextMonth} className="px-2 py-1.5 rounded-md border border-[#00f3ff]/20 hover:border-[#00f3ff]/40 text-[#00f3ff]/70 hover:text-[#00f3ff] transition-all bg-black/50 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:bg-[#00f3ff]/10">
               <ChevronRight size={16} />
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col pt-4 px-8 pb-4 relative z-10 w-full overflow-hidden">
       <div className="absolute top-[-20%] left-[20%] w-[50%] h-[50%] bg-[#f800ff]/5 rounded-[100%] blur-[120px] pointer-events-none z-[-1]" />

       <div className="grid grid-cols-7 mb-2">
         {['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'].map(day => (
           <div key={day} className="text-center font-black tracking-widest text-sm text-gray-400 bg-white/5 mx-1 py-1 rounded-md border border-white/5">{day}</div>
         ))}
       </div>

       <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-2">
         {Array.from({ length: totalCells }).map((_, i) => {
           const isCurrentMonth = i >= startingDay && i < startingDay + daysInMonth;
           const dayNum = isCurrentMonth ? i - startingDay + 1 : (i < startingDay ? new Date(currentYear, currentDate.getMonth(), 0).getDate() - startingDay + i + 1 : i - startingDay - daysInMonth + 1);

           let cellMonth = currentDate.getMonth();
           let cellYear = currentYear;
           if (i < startingDay) { cellMonth -= 1; if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; } }
           else if (i >= startingDay + daysInMonth) { cellMonth += 1; if (cellMonth > 11) { cellMonth = 0; cellYear += 1; } }
           const cellDate = new Date(cellYear, cellMonth, dayNum);
           const isSelected = isCurrentMonth && selectedCalDay && cellDate.toDateString() === selectedCalDay.toDateString();

           const today = new Date();
           const isToday = isCurrentMonth && dayNum === today.getDate() && currentDate.getMonth() === today.getMonth() && currentYear === today.getFullYear();
           
           return (
             <div 
               key={`bg-${i}`}
               onClick={() => isCurrentMonth && setSelectedCalDay(isSelected ? null : cellDate)}
               className={`col-start-${(i % 7) + 1} row-start-${Math.floor(i / 7) + 1} relative p-2.5 rounded-xl flex flex-col transition-all duration-200 overflow-visible ${
                 !isCurrentMonth ? 'bg-black/10 border border-white/5 opacity-40 z-0 cursor-default' :
                 isSelected ? 'bg-[#00f3ff]/10 border border-[#00f3ff]/60 shadow-[inset_0_0_20px_rgba(0,243,255,0.1),0_0_20px_rgba(0,243,255,0.2)] z-10 ring-1 ring-[#00f3ff]/50 cursor-pointer' :
                 isToday ? 'bg-[#f800ff]/10 border border-[#f800ff]/40 shadow-[inset_0_0_20px_rgba(248,0,255,0.1),0_0_15px_rgba(248,0,255,0.1)] z-10 ring-1 ring-[#f800ff]/30 cursor-pointer' :
                 'bg-black/40 border border-white/10 z-0 hover:border-[#00f3ff]/20 hover:bg-[#00f3ff]/5 cursor-pointer'
               }`}
             >
                <div className="flex justify-between items-start">
                   {isSelected ? (
                     <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] animate-pulse shadow-[0_0_8px_#00f3ff] mt-2 ml-1" />
                   ) : isToday ? (
                     <div className="w-1.5 h-1.5 rounded-full bg-[#f800ff] animate-pulse shadow-[0_0_5px_#f800ff] mt-2 ml-1" />
                   ) : <div/>}
                   <span className={`text-xl font-black ${
                     isSelected ? 'text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.9)]' :
                     isToday ? 'text-[#f800ff] drop-shadow-[0_0_5px_rgba(248,0,255,0.8)]' : 'text-gray-500'
                   }`}>
                     {dayNum}
                   </span>
                </div>
                {isSelected && (
                   <button
                     onClick={(e) => { e.stopPropagation(); openCreateForDay(cellDate); }}
                     className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-[#00f3ff] text-[#0f172a] font-black text-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,243,255,0.8)] hover:scale-110 transition-transform z-30 leading-none"
                     title="Přidat událost"
                   >+</button>
                )}
             </div>
           );
         })}

         {(() => {
             const calendarCells = Array.from({ length: totalCells }).map((_, i) => {
                 const isCurrentMonth = i >= startingDay && i < startingDay + daysInMonth;
                 const dayNum = isCurrentMonth ? i - startingDay + 1 : (i < startingDay ? new Date(currentYear, currentDate.getMonth(), 0).getDate() - startingDay + i + 1 : i - startingDay - daysInMonth + 1);
                 let m = currentDate.getMonth();
                 let y = currentYear;
                 if (i < startingDay) m -= 1;
                 else if (i >= startingDay + daysInMonth) m += 1;
                 return { timestamp: new Date(y, m, dayNum, 0, 0, 0, 0).getTime() };
             });

             const eventOverlays = [];
             const numWeeks = totalCells / 7;

             for (let w = 0; w < numWeeks; w++) {
                 const weekCells = calendarCells.slice(w * 7, w * 7 + 7);
                 const weekStartT = weekCells[0].timestamp;
                 const weekEndT = weekCells[6].timestamp + 86399999;

                 const eventsThisWeek = events.filter(e => {
                     return e.fullDate.getTime() <= weekEndT && e.endDate.getTime() > weekStartT;
                 });

                 eventsThisWeek.sort((a, b) => {
                     const durA = a.endDate.getTime() - a.fullDate.getTime();
                     const durB = b.endDate.getTime() - b.fullDate.getTime();
                     if (durA !== durB) return durB - durA;
                     return a.fullDate.getTime() - b.fullDate.getTime();
                 });

                 const slots = [];

                 eventsThisWeek.forEach(ev => {
                     const evStartT = ev.fullDate.getTime();
                     const evEndT = ev.endDate.getTime();

                     let startCol = 0;
                     let endCol = 6;
                     
                     const safeEndT = Math.max(evEndT, evStartT + 1);

                     for (let c = 0; c < 7; c++) {
                         if (evStartT <= weekCells[c].timestamp + 86399999 && safeEndT > weekCells[c].timestamp) {
                             startCol = c; break;
                         }
                     }
                     for (let c = 6; c >= 0; c--) {
                         if (evStartT <= weekCells[c].timestamp + 86399999 && safeEndT > weekCells[c].timestamp) {
                             endCol = c; break;
                         }
                     }

                     let slotIdx = 0;
                     while (true) {
                         if (!slots[slotIdx]) slots[slotIdx] = Array(7).fill(false);
                         let conflict = false;
                         for (let c = startCol; c <= endCol; c++) {
                             if (slots[slotIdx][c]) conflict = true;
                         }
                         if (!conflict) break;
                         slotIdx++;
                     }
                     for (let c = startCol; c <= endCol; c++) {
                         slots[slotIdx][c] = true;
                     }

                     const isContinuedFromYesterday = evStartT < weekCells[startCol].timestamp;
                     // Odečtení 1ms zajišťuje, že událost končící přesně o půlnoci (00:00:00) nepřeteče jako vizuální čtverec do dalšího dne
                     const isContinuedToTomorrow = (safeEndT - 1) > weekCells[endCol].timestamp + 86399999;
                     
                     let edgeClasses = "rounded-md px-3";
                     if (isContinuedFromYesterday) edgeClasses = "rounded-r-md px-3 border-l-0 -ml-[8px]"; // 8px je díky gap-2
                     if (isContinuedToTomorrow) edgeClasses = edgeClasses.replace("rounded-r-md", "").replace("rounded-md", "rounded-l-md") + " border-r-0 -mr-[8px]";
                     if (isContinuedFromYesterday && isContinuedToTomorrow) edgeClasses = "rounded-none px-3 border-l-0 border-r-0 -ml-[8px] -mr-[8px]";

                     eventOverlays.push({
                         key: `${ev.id}-w${w}-s${slotIdx}`,
                         colStart: startCol + 1,
                         colSpan: endCol - startCol + 1,
                         rowStart: w + 1,
                         slotIndex: slotIdx,
                         title: ev.title,
                         colorClass: getEventColor(ev.colorId),
                         edgeClasses,
                         isPast: ev.endDate < new Date(),
                         rawEvent: ev
                     });
                 });
             }

             // Tailwind safelist manuálně vložený do kódu, abychom zaručili generování classes
             const colStartMap = ['', 'col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'];
             const colSpanMap = ['', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6', 'col-span-7'];
             const rowStartMap = ['', 'row-start-1', 'row-start-2', 'row-start-3', 'row-start-4', 'row-start-5', 'row-start-6'];

             return eventOverlays.map(ev => {
                 return (
                     <div
                         key={ev.key}
                         onClick={() => setSelectedEvent(ev.rawEvent)}
                         className={`${colStartMap[ev.colStart]} ${colSpanMap[ev.colSpan]} ${rowStartMap[ev.rowStart]} self-start h-6 z-20 flex justify-center items-center shadow-lg border transition-colors overflow-hidden pointer-events-auto cursor-pointer hover:z-30 ${ev.edgeClasses} ${
                           ev.isPast 
                             ? 'bg-gray-800/60 border-gray-600 text-gray-400 opacity-60 grayscale-[80%] hover:brightness-110 hover:opacity-100 hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.5)]' 
                             : `${ev.colorClass} hover:brightness-125 hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.5)]`
                         }`}
                         style={{ marginTop: `${35 + ev.slotIndex * 26}px` }}
                         title={ev.title}
                     >
                         <span className="uppercase tracking-wider font-bold text-[10px] sm:text-xs z-30 truncate drop-shadow-md text-center">
                             {ev.title}
                         </span>
                     </div>
                 );
             });
         })()}
        </div>
      </div>
     </div>
    </div>
  );
}
