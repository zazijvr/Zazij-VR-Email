import type { CSSProperties } from 'react';
import type { CalendarEvent } from '../../../types/calendar';
import { createPortal } from 'react-dom';
import { ArrowLeft, Edit2, Trash2, Loader2, X, Clock, Bell, Repeat } from 'lucide-react';

interface EventDetailViewProps {
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  handleEditSelectedEvent: () => void;
  handleDeleteSelectedEvent: () => void;
  isDeleting: boolean;
  previewRecurrenceText?: string | null;
}

export default function EventDetailView({
  selectedEvent,
  setSelectedEvent,
  handleEditSelectedEvent,
  handleDeleteSelectedEvent,
  isDeleting,
  previewRecurrenceText,
}: EventDetailViewProps) {
  if (!selectedEvent) return null;

  return (
    <>
      {/* --- MOBILE TOP BAR MORPHING FROM APP HEADER (PORTALLED) --- */}
      {createPortal(
        <div className="md:hidden fixed top-0 left-0 w-full flex items-center justify-between px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,2rem))] bg-transparent border-b border-[#00f3ff]/20 z-[60] shrink-0 pointer-events-auto">
           <button
             onClick={() => setSelectedEvent(null)}
             className="w-10 h-10 flex items-center justify-center rounded-full bg-[#020817]/90 backdrop-blur-md border-[1.5px] border-[#00f3ff]/60 text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] shadow-[inset_0_0_15px_rgba(0,243,255,0.3)] transition-all active:scale-95 anim-spin-in-arrow -ml-2"
           >
             <ArrowLeft size={22} strokeWidth={2.5} />
           </button>
           <div className="flex items-center gap-3 pr-0 anim-slide-in-right-overlay" style={{ '--delay': '150ms' } as CSSProperties}>
             <button onClick={handleEditSelectedEvent} className="w-10 h-10 flex items-center justify-center rounded-full bg-[#020817]/90 backdrop-blur-md border-[1.5px] border-[#00f3ff]/40 text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.6)] shadow-[inset_0_0_15px_rgba(0,243,255,0.2)] transition-all active:scale-95 hover:bg-[#00f3ff]/20"><Edit2 size={18} /></button>
             <button onClick={handleDeleteSelectedEvent} className="w-10 h-10 flex items-center justify-center rounded-full bg-[#020817]/90 backdrop-blur-md border-[1.5px] border-[#fb7185]/60 text-[#fb7185] drop-shadow-[0_0_10px_rgba(251,113,133,0.8)] shadow-[inset_0_0_15px_rgba(251,113,133,0.3)] transition-all active:scale-95 hover:bg-rose-400/20">{isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}</button>
           </div>
        </div>,
        document.body
      )}

      <div className="fixed pt-[calc(4rem+env(safe-area-inset-top,2rem))] md:pt-0 inset-0 z-[200] flex items-start md:items-center justify-center p-0 md:p-4 max-md:animate-in max-md:slide-in-from-right max-md:duration-300 md:animate-in md:fade-in md:duration-150 bg-[#061026] md:bg-transparent shadow-[0_-5px_20px_rgba(0,0,0,0.5)] md:shadow-none pointer-events-auto">
        <div className="hidden md:block absolute inset-0 bg-[#020817]/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}></div>
        
        <div className="md:animate-in md:zoom-in-95 md:duration-200 relative bg-[#061026] md:border border-[#00f3ff]/40 md:shadow-[0_0_50px_rgba(0,243,255,0.2)] md:rounded-3xl rounded-none w-full h-full md:h-auto max-w-3xl md:max-h-[90vh] flex flex-col p-0 md:p-8 shrink-0 overflow-hidden md:z-10 box-border pointer-events-auto">
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-0 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00f3ff]/10 blur-[50px] pointer-events-none rounded-full" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#ff7ab8]/10 blur-[50px] pointer-events-none rounded-full" />
            
            <div className="hidden md:flex absolute top-0 right-0 items-center gap-1 z-20">
               <button onClick={handleEditSelectedEvent} className="p-2 text-[#00f3ff] hover:bg-[#00f3ff]/20 hover:shadow-[0_0_10px_rgba(0,243,255,0.3)] rounded-full transition-all" title="Upravit">
                 <Edit2 size={18} />
               </button>
               <button onClick={handleDeleteSelectedEvent} disabled={isDeleting} className="p-2 text-rose-400 hover:bg-rose-400/20 hover:shadow-[0_0_10px_rgba(251,113,133,0.3)] rounded-full transition-all" title="Smazat">
                 {isDeleting ? <Loader2 size={18} className="animate-spin text-rose-400" /> : <Trash2 size={18} />}
               </button>
               <div className="w-px h-5 bg-white/10 mx-1"></div>
               <button onClick={() => setSelectedEvent(null)} className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-all" title="Zavřít">
                 <X size={20} />
               </button>
            </div>

            <span className="hidden md:flex text-[#00f3ff] text-[10px] uppercase font-bold tracking-[0.2em] mb-3 items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]"></span>
              Detail události
            </span>
            
            <h2 className="text-xl md:text-2xl font-black text-white mt-1 mb-4 md:mb-8 uppercase tracking-wider pr-4 md:pr-[120px] drop-shadow-md leading-tight">
              {selectedEvent.title}
            </h2>
        
        <div className="flex flex-col gap-4 text-slate-300 mt-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
           <div className="flex flex-col gap-1.5 shrink-0 mt-2">
             <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Kdy</span>
             <div className="flex items-center gap-3 bg-[#0a1630] border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
               <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                 <Clock className="text-[#00f3ff]" size={20} />
               </div>
               <span className="font-mono text-lg font-black tracking-wider text-white block truncate drop-shadow-sm" title="Časové rozpětí">
                 {(() => {
                    const start = selectedEvent.fullDate;
                    const end = selectedEvent.endDate;
                    if (selectedEvent.isAllDay) {
                       const s = start.toLocaleDateString('cs-CZ');
                       const e = end.toLocaleDateString('cs-CZ');
                       return s === e ? `${s}, Celý den` : `${s} – ${e}`;
                    }
                    const sD = start.toLocaleDateString('cs-CZ');
                    const sT = start.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'});
                    const eD = end.toLocaleDateString('cs-CZ');
                    const eT = end.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'});
                    
                    if (sD === eD) return `${sD}, ${sT} – ${eT}`;
                    return `${sD}, ${sT} – ${eD}, ${eT}`;
                 })()}
               </span>
             </div>
           </div>

           <div className="flex flex-col gap-1.5 shrink-0 mt-2">
             <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Upozornění</span>
             <div className="flex items-center gap-3 bg-[#0a1630] border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
               <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                 <Bell className="text-[#00f3ff]" size={20} />
               </div>
               <span className="font-mono text-[15px] font-bold tracking-wider text-white block truncate drop-shadow-sm">
                 {(() => {
                    const mins = selectedEvent.alertMinutes;
                    if (mins === 'default') return 'Výchozí z Google Kalendáře';
                    if (mins === null || mins === undefined) return 'Žádné připomenutí';
                    if (mins === 0) return 'Ve chvíli zahájení události';
                    
                    if (mins >= 1440 && mins % 1440 === 0) {
                       const d = mins / 1440;
                       return `${d} ${d === 1 ? 'den' : d > 1 && d < 5 ? 'dny' : 'dní'} předem`;
                    }
                    if (mins >= 60 && mins % 60 === 0) {
                       const h = mins / 60;
                       return `${h} ${h === 1 ? 'hodinu' : h > 1 && h < 5 ? 'hodiny' : 'hodin'} předem`;
                    }
                    return `${mins} ${mins === 1 ? 'minutu' : mins > 1 && mins < 5 ? 'minuty' : 'minut'} předem`;
                 })()}
               </span>
             </div>
           </div>

           {selectedEvent.recurringEventId && (
             <div className="flex flex-col gap-1.5 shrink-0 mt-2">
               <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Opakování</span>
               <div className="flex items-center gap-3 bg-[#0a1630] border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
                 <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                   <Repeat className="text-[#00f3ff]" size={20} />
                 </div>
                 <span className="font-mono text-[15px] font-bold tracking-wider text-white block truncate drop-shadow-sm">
                   {previewRecurrenceText || 'Aktivní (součást série)'}
                 </span>
               </div>
             </div>
           )}
           
           {selectedEvent.description && (
             <div className="flex flex-col gap-1.5 mt-2 shrink-0">
              <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Popis</span>
              <div className="bg-[#0a1630] border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                <div 
                  className="text-slate-200 text-base leading-relaxed rich-text-content break-words"
                  dangerouslySetInnerHTML={{ __html: selectedEvent.description }} 
                />
              </div>
             </div>
           )}
         </div>
        </div>
      </div>
    </div>
    </>
  );
}
