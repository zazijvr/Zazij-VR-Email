import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, XCircle, Info, X } from 'lucide-react';

export default function CustomAlert({ isOpen, title, message, type = 'info', onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
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
  let colorClass = 'text-[#00f3ff]';
  let borderClass = 'border-[#00f3ff]/40';
  let bgClass = 'bg-[#00f3ff]/10';
  let shadowClass = 'shadow-[0_0_30px_rgba(0,243,255,0.2)]';

  if (type === 'success') {
    Icon = CheckCircle;
    colorClass = 'text-[#00f3ff]';
    borderClass = 'border-[#00f3ff]/40';
    bgClass = 'bg-[#00f3ff]/10';
    shadowClass = 'shadow-[0_0_30px_rgba(0,243,255,0.2)]';
  } else if (type === 'error') {
    Icon = XCircle;
    colorClass = 'text-[#ef4444]';
    borderClass = 'border-[#ef4444]/40';
    bgClass = 'bg-[#ef4444]/10';
    shadowClass = 'shadow-[0_0_30px_rgba(239,68,68,0.3)]';
  } else if (type === 'warning') {
    Icon = AlertTriangle;
    colorClass = 'text-[#f59e0b]';
    borderClass = 'border-[#f59e0b]/40';
    bgClass = 'bg-[#f59e0b]/10';
    shadowClass = 'shadow-[0_0_30px_rgba(245,158,11,0.2)]';
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        tabIndex={-1}
        className={`relative w-full max-w-md p-6 rounded-2xl border-2 ${borderClass} bg-[#02050e] ${shadowClass} flex flex-col gap-4 animate-in zoom-in-95 duration-200 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-[#ef4444]/20 text-gray-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center"
        >
          <X size={22} strokeWidth={2} />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${bgClass} ${colorClass} shrink-0`}>
            <Icon size={32} strokeWidth={2} />
          </div>
          <div className="flex-1 pt-1">
            <h3 className={`text-xl font-black uppercase tracking-widest ${colorClass} mb-2`}>
              {title || (type === 'error' ? 'Chyba' : type === 'success' ? 'Hotovo' : 'Informace')}
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className={`px-6 py-2.5 rounded-lg border font-bold tracking-widest uppercase transition-all ${colorClass} ${borderClass} hover:bg-white/5 hover:scale-105`}
          >
            ROZUMÍM
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
