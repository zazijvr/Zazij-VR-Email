import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, XCircle, Info, X } from 'lucide-react';

export type AlertType = 'info' | 'success' | 'error' | 'warning';

interface CustomAlertProps {
  isOpen: boolean;
  title?: string | null;
  message: ReactNode;
  type?: AlertType;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function CustomAlert({ isOpen, title, message, type = 'info', onClose, onConfirm, confirmText, cancelText }: CustomAlertProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && (e.key === 'Escape' || e.key === 'Enter')) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Determine styles and icon based on type
  let Icon = Info;
  let colorClass = 'text-neon-blue';
  let borderClass = 'border-neon-blue/40';
  let bgClass = 'bg-neon-blue/10';
  let shadowClass = 'shadow-[0_0_30px_rgba(0,243,255,0.2)]';

  if (type === 'success') {
    Icon = CheckCircle;
    colorClass = 'text-neon-blue';
    borderClass = 'border-neon-blue/40';
    bgClass = 'bg-neon-blue/10';
    shadowClass = 'shadow-[0_0_30px_rgba(0,243,255,0.2)]';
  } else if (type === 'error') {
    Icon = XCircle;
    colorClass = 'text-danger';
    borderClass = 'border-danger/40';
    bgClass = 'bg-danger/10';
    shadowClass = 'shadow-[0_0_30px_rgba(239,68,68,0.3)]';
  } else if (type === 'warning') {
    Icon = AlertTriangle;
    colorClass = 'text-neon-amber';
    borderClass = 'border-neon-amber/40';
    bgClass = 'bg-neon-amber/10';
    shadowClass = 'shadow-[0_0_30px_rgba(245,158,11,0.2)]';
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-navy-deep/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        tabIndex={-1}
        className={`relative w-[92%] sm:w-full max-w-md p-5 sm:p-6 rounded-2xl border-2 ${borderClass} bg-[#02050e] ${shadowClass} flex flex-col gap-4 animate-in zoom-in-95 duration-200 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-white/5 hover:bg-danger/20 text-slate-400 hover:text-danger rounded-full transition-all border border-transparent hover:border-danger/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center z-10"
        >
          <X size={20} className="sm:w-[22px] sm:h-[22px]" strokeWidth={2} />
        </button>

        <div className="flex items-start gap-3 sm:gap-4">
          <div className={`p-2 sm:p-3 rounded-full ${bgClass} ${colorClass} shrink-0`}>
            <Icon size={24} className="sm:w-8 sm:h-8" strokeWidth={2} />
          </div>
          <div className="flex-1 pt-0.5 sm:pt-1 pr-6 sm:pr-8">
            <h3 className={`text-base sm:text-lg lg:text-xl font-black uppercase tracking-wider sm:tracking-widest ${colorClass} mb-2 break-words`}>
              {title || (type === 'error' ? 'Chyba' : type === 'success' ? 'Hotovo' : 'Informace')}
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-3 justify-end">
          {onConfirm ? (
             <>
               <button onClick={onClose} className="px-6 py-2.5 rounded-lg border border-slate-600/50 font-bold tracking-widest uppercase transition-all text-slate-400 hover:text-white hover:bg-white/10 hover:border-slate-500">
                 {cancelText || 'Zrušit'}
               </button>
               <button
                 onClick={() => { onConfirm(); onClose(); }}
                 className={`shadow-[0_0_15px_rgba(0,0,0,0.5)] px-6 py-2.5 rounded-lg border font-bold tracking-widest uppercase transition-all ${colorClass} ${borderClass} hover:bg-[currentColor]/10 hover:scale-105`}
               >
                 {confirmText || 'Potvrdit'}
               </button>
             </>
          ) : (
            <button
              onClick={onClose}
              className={`px-6 py-2.5 rounded-lg border font-bold tracking-widest uppercase transition-all ${colorClass} ${borderClass} hover:bg-[currentColor]/10 hover:scale-105`}
            >
              ROZUMÍM
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
