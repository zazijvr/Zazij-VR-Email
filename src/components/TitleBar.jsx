import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

const appWindow = getCurrentWindow();

export default function TitleBar() {
  return (
    // Vlastní titlebar – drag region. Resize řeší WM nativně přes GTK.
    <div 
      data-tauri-drag-region="true"
      className="h-8 shrink-0 w-full bg-black/40 flex items-center justify-between px-3 border-b border-white/5 z-[200] cursor-move"
    >
      <div data-tauri-drag-region="true" className="text-[#00f3ff]/70 text-[10px] font-black tracking-widest uppercase pointer-events-none flex items-center gap-2">
         <div className="w-1.5 h-1.5 rounded-full bg-[#f800ff] animate-pulse pointer-events-none"></div>
         ZAŽIJ VR E-mail & Kalendář
      </div>
      <div className="flex items-center gap-1">
        <button 
          onClick={() => appWindow.minimize()} 
          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
           <Minus size={14} pointerEvents="none" />
        </button>
        <button 
          onClick={() => appWindow.toggleMaximize()} 
          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
           <Square size={12} pointerEvents="none" />
        </button>
        <button 
          onClick={() => appWindow.close()} 
          className="p-1 hover:bg-red-500/80 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
           <X size={14} pointerEvents="none" />
        </button>
      </div>
    </div>
  );
}
