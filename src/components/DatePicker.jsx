import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export default function DatePicker({ value, onChange, label, className = "", align = "left" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentViewDate, setCurrentViewDate] = useState(new Date(value || new Date()));
  
  // Local input value formatted to locale when not editing, but acts as raw string when editing
  const formatDateToLocal = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  };

  const [inputValue, setInputValue] = useState(formatDateToLocal(value));
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setInputValue(formatDateToLocal(value));
  }, [value]);

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
  };

  const toggleOpen = (e) => {
    e.preventDefault();
    setIsOpen(!isOpen);
    setCurrentViewDate(new Date(value || new Date()));
  };

  const currentYear = currentViewDate.getFullYear();
  const currentMonth = currentViewDate.getMonth();
  
  const handlePrevMonth = (e) => { 
      e.stopPropagation(); 
      setCurrentViewDate(new Date(currentYear, currentMonth - 1, 1)); 
  };
  
  const handleNextMonth = (e) => { 
      e.stopPropagation(); 
      setCurrentViewDate(new Date(currentYear, currentMonth + 1, 1)); 
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const startingDay = (firstDayOfMonth + 6) % 7; 
  
  const monthNames = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

  const handleDayClick = (e, dayNum) => {
    e.stopPropagation();
    const selectedDate = new Date(currentYear, currentMonth, dayNum);
    const y = selectedDate.getFullYear();
    const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
    const d = selectedDate.getDate().toString().padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    onChange(isoDate);
    setInputValue(formatDateToLocal(isoDate));
    triggerFlash();
    setIsOpen(false);
  };

  const handleBlur = () => {
    let norm = inputValue.replace(/[\/\-]/g, '.').trim();
    
    // Převod pro ucelená čísla jako 27122026 nebo 020526
    if (/^\d{8}$/.test(norm)) {
       norm = `${norm.substring(0,2)}.${norm.substring(2,4)}.${norm.substring(4,8)}`;
    } else if (/^\d{6}$/.test(norm)) {
       norm = `${norm.substring(0,2)}.${norm.substring(2,4)}.${norm.substring(4,6)}`;
    }

    const parts = norm.split('.').map(p => p.trim()).filter(Boolean);
    
    if (parts.length === 0) {
      setInputValue(formatDateToLocal(value));
      return;
    }
    
    let d, m, y;
    const today = new Date();
    
    if (parts.length === 1) {
      d = parseInt(parts[0], 10);
      m = today.getMonth() + 1;
      y = today.getFullYear();
    } else if (parts.length === 2) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = today.getFullYear();
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
    }

    if (isNaN(d) || isNaN(m) || isNaN(y)) {
      setInputValue(formatDateToLocal(value));
      return;
    }
    
    if (m < 1) m = 1;
    if (m > 12) m = 12;
    
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1) d = 1;
    if (d > daysInMonth) d = daysInMonth;

    const isoDate = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    onChange(isoDate);
    setInputValue(formatDateToLocal(isoDate));
    triggerFlash();
  };

  return (
    <div className={`relative ${className}`}>
      {label && <label className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest mb-1.5 block select-none">{label}</label>}
      
      <div className="w-full bg-[#020817]/50 border border-[#00f3ff]/40 rounded-xl px-4 py-3 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all flex items-center justify-between focus-within:border-[#00f3ff] focus-within:shadow-[0_0_15px_rgba(0,243,255,0.2)_inset]">
        <input  
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
          onMouseDown={(e) => {
             if (document.activeElement !== e.target) {
                e.preventDefault();
                e.target.focus();
             }
          }}
          onKeyDown={(e) => {
             if (e.key === 'Enter') e.target.blur();
          }}
          placeholder="DD.MM.RRRR"
          className={`bg-transparent font-mono text-sm font-bold focus:outline-none w-full transition-all duration-300 ${flash ? 'text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] scale-105' : 'text-white'}`}
        />
        <button 
           type="button"
           onClick={toggleOpen}
           className="pl-2 border-l border-[#00f3ff]/[0.15] ml-2 text-[#00f3ff]/70 hover:text-[#00f3ff] transition-colors"
        >
          <CalendarIcon size={16} />
        </button>
      </div>

      {isOpen && (
        <>
          <div 
             className="fixed inset-0 z-[650]" 
             onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
             onMouseDown={(e) => e.stopPropagation()}
          />
          <div className={`absolute top-full mt-2 p-4 bg-[#061026] border border-[#00f3ff]/40 shadow-[0_0_40px_rgba(0,243,255,0.2)] rounded-2xl z-[700] w-72 select-none animate-in fade-in-0 zoom-in-95 pointer-events-auto ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {/* Dekorativní záře */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#00f3ff]/20 blur-[30px] rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4 relative z-10">
              <button 
                type="button"
                onClick={handlePrevMonth} 
                className="p-1 rounded-md text-[#00f3ff]/70 hover:text-[#00f3ff] hover:bg-[#00f3ff]/10 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex flex-col items-center">
                <div className="font-black text-[#00f3ff] uppercase tracking-wider text-sm drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]">
                   {monthNames[currentMonth]} {currentYear}
                </div>
                {/* Přidáno magické tlačítko DNES */}
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCurrentViewDate(new Date()); }}
                  className="text-[9px] text-[#f72585]/70 hover:text-[#f72585] hover:drop-shadow-[0_0_5px_#f72585] uppercase tracking-[0.2em] font-bold mt-0.5 transition-all w-full text-center"
                >
                  • Dnes •
                </button>
              </div>
              <button 
                type="button"
                onClick={handleNextMonth} 
                className="p-1 rounded-md text-[#00f3ff]/70 hover:text-[#00f3ff] hover:bg-[#00f3ff]/10 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center relative z-10">
              {['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'].map(day => (
                <div key={day} className="text-[10px] font-bold text-slate-500 mb-2">{day}</div>
              ))}
              
              {Array.from({ length: 42 }).map((_, i) => {
                const isCurrentMonth = i >= startingDay && i < startingDay + daysInMonth;
                const dayNum = i - startingDay + 1;
                
                if (!isCurrentMonth) {
                  return <div key={`empty-${i}`} className="h-8" />;
                }

                // Check if this day is the actually selected date
                let isSelected = false;
                if (value) {
                   const valDate = new Date(value);
                   isSelected = valDate.getDate() === dayNum && valDate.getMonth() === currentMonth && valDate.getFullYear() === currentYear;
                }
                
                const today = new Date();
                const isToday = isCurrentMonth && dayNum === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

                return (
                  <div
                    key={`day-${i}`}
                    onClick={(e) => handleDayClick(e, dayNum)}
                    className={`h-8 w-8 mx-auto flex items-center justify-center rounded-lg cursor-pointer transition-all text-sm font-bold ${
                      isSelected && isToday
                        ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#f72585] shadow-[0_0_15px_rgba(247,37,133,0.4)] scale-110'
                        : isSelected 
                        ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_10px_rgba(0,243,255,0.3)] scale-110' 
                        : isToday
                        ? 'text-[#f72585] border border-[#f72585]/50 bg-[#f72585]/10 shadow-[0_0_8px_rgba(247,37,133,0.3)]'
                        : 'text-slate-300 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
