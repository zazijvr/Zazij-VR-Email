import { useState, useEffect, type ReactNode, type MouseEvent } from 'react';
import { Clock, Check, X } from 'lucide-react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export default function TimePicker({ value, onChange, label, className = "", align = "left" }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const [flash, setFlash] = useState(false);
  
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
  };

  const valHour = value ? parseInt(value.split(':')[0], 10) : 10;
  const valMinute = value ? parseInt(value.split(':')[1], 10) : 0;
  
  const [internalHour, setInternalHour] = useState(valHour);
  const [internalMinute, setInternalMinute] = useState(valMinute);

  const toggleOpen = (e: MouseEvent) => {
    e.preventDefault();
    if (!isOpen) {
       setInternalHour(value ? parseInt(value.split(':')[0], 10) : 10);
       setInternalMinute(value ? parseInt(value.split(':')[1], 10) : 0);
    }
    setIsOpen(!isOpen);
  };

  const handleHourClick = (e: MouseEvent, h: number) => {
    e.stopPropagation();
    setInternalHour(h);
  };

  const handleMinuteClick = (e: MouseEvent, m: number) => {
    e.stopPropagation();
    setInternalMinute(m);
  };
  
  const handleConfirm = (e: MouseEvent) => {
    if (e) e.stopPropagation();
    const hh = internalHour.toString().padStart(2, '0');
    const mm = internalMinute.toString().padStart(2, '0');
    const finalTime = `${hh}:${mm}`;
    setInputValue(finalTime);
    onChange(finalTime);
    triggerFlash();
    setIsOpen(false);
  };
  
  const handleCancel = (e: MouseEvent) => {
    if (e) e.stopPropagation();
    setIsOpen(false);
  };

  const handleBlur = () => {
    const digits = inputValue.replace(/\D/g, '');
    if (!digits) {
      setInputValue(value || '');
      return;
    }
    
    let h = 0, m = 0;
    if (digits.length <= 2) {
      h = parseInt(digits, 10);
    } else if (digits.length === 3) {
      h = parseInt(digits.substring(0, 1), 10);
      m = parseInt(digits.substring(1, 3), 10);
    } else if (digits.length >= 4) {
      h = parseInt(digits.substring(0, 2), 10);
      m = parseInt(digits.substring(2, 4), 10);
    }
    
    if (h > 23) h = 23;
    if (m > 59) m = 59;
    
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const finalTime = `${hh}:${mm}`;
    
    setInputValue(finalTime);
    onChange(finalTime);
    triggerFlash();
  };

  return (
    <div className={`relative ${className}`}>
      {label && <label className="text-neon-blue text-[10px] font-bold uppercase tracking-widest mb-1.5 block select-none">{label}</label>}
      
      <div className="w-full bg-navy-deep/50 border border-neon-blue/40 rounded-xl px-4 py-3 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all flex items-center justify-between focus-within:border-neon-blue focus-within:shadow-[0_0_15px_rgba(0,243,255,0.2)_inset]">
        <input  
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
          onMouseDown={(e) => {
             if (document.activeElement !== e.target) {
                e.preventDefault();
                e.currentTarget.focus();
             }
          }}
          onKeyDown={(e) => {
             if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder="--:--"
          className={`bg-transparent font-mono text-sm font-bold focus:outline-none w-full transition-all duration-300 ${flash ? 'text-neon-blue drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] scale-105' : 'text-white'}`}
        />
        <button 
           type="button" 
           onClick={toggleOpen}
           className="pl-2 border-l border-neon-blue/[0.15] ml-2 text-neon-blue/70 hover:text-neon-blue transition-colors"
        >
          <Clock size={16} />
        </button>
      </div>

      {isOpen && (
        <>
          <div 
             className="fixed inset-0 z-[650]" 
             onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
             onMouseDown={(e) => e.stopPropagation()}
          />
          <div className={`absolute top-full mt-2 p-4 bg-navy border border-neon-blue/40 shadow-[0_0_40px_rgba(0,243,255,0.2)] rounded-2xl z-[700] w-[340px] select-none animate-in fade-in-0 zoom-in-95 pointer-events-auto flex flex-col gap-3 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}>
            
            {/* Dekorativní záře */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-neon-blue/20 blur-[40px] rounded-full pointer-events-none" />

            <div className="flex gap-4 relative z-10 w-full">
              {/* SEkce Hodin */}
              <div className="flex-[3]">
                 <div className="text-[10px] font-bold text-neon-blue mb-2 tracking-widest uppercase">Hodiny</div>
                 <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({length: 24}).map((_, i) => (
                    <div 
                      key={`h-${i}`}
                      onClick={(e) => handleHourClick(e, i)}
                      className={`py-1.5 text-center rounded-md cursor-pointer text-sm font-mono transition-all font-bold ${
                         internalHour === i 
                           ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_8px_rgba(0,243,255,0.3)]' 
                           : 'text-slate-400 hover:bg-white/10 border border-transparent hover:text-white'
                      }`}
                    >
                       {i.toString().padStart(2, '0')}
                    </div>
                  ))}
               </div>
            </div>
            
            <div className="w-px bg-white/10 shrink-0"></div>
            
            {/* Sekce Minut */}
            <div className="flex-[2]">
               <div className="text-[10px] font-bold text-neon-blue mb-2 tracking-widest uppercase cursor-help" title="Kliknutím na minutu potvrdíte čas">Minuty</div>
               <div className="grid grid-cols-2 gap-1.5">
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <div 
                      key={`m-${m}`}
                      onClick={(e) => handleMinuteClick(e, m)}
                      className={`py-1.5 text-center rounded-md cursor-pointer text-sm font-mono transition-all font-bold ${
                         internalMinute === m 
                           ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_8px_rgba(0,243,255,0.3)]' 
                           : 'text-slate-400 hover:bg-white/10 border border-transparent hover:text-white'
                      }`}
                    >
                       {m.toString().padStart(2, '0')}
                    </div>
                  ))}
               </div>
            </div>
            </div>

            <div className="flex justify-between items-center pt-3 mt-1 border-t border-neon-blue/[0.15] w-full gap-3 relative z-10">
               <button 
                 type="button" 
                 onClick={handleCancel} 
                 className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-400 hover:text-neon-purple hover:bg-neon-purple/10 hover:border-neon-purple/50 border border-transparent transition-all font-bold text-xs tracking-widest uppercase"
               >
                 <X size={14} /> Zrušit
               </button>
               <button 
                 type="button" 
                 onClick={handleConfirm} 
                 className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neon-blue/20 text-neon-blue border border-neon-blue/50 hover:bg-neon-blue/40 shadow-[0_0_10px_rgba(0,243,255,0.2)] hover:shadow-[0_0_15px_rgba(0,243,255,0.4)] transition-all font-bold text-xs tracking-widest uppercase"
               >
                 <Check size={14} /> Potvrdit
               </button>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
