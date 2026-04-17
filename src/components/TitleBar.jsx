import React from 'react';
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const handleManualCornerResize = (e) => {
    e.preventDefault();
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    
    const startX = e.clientX;
    const startY = e.clientY;
    let isResizing = false;
    let factor = 1;
    let startPhysicalSize = null;

    const appWindow = getCurrentWindow();
    
    // Získání vlastností okna asynchronně bez zablokování zachycení myši
    Promise.all([appWindow.scaleFactor(), appWindow.innerSize()]).then(([f, size]) => {
        factor = f;
        startPhysicalSize = size;
    });

    const onPointerMove = (moveEvent) => {
      if (!startPhysicalSize || isResizing) return;
      isResizing = true;
      requestAnimationFrame(() => {
        const deltaX = (moveEvent.clientX - startX) * factor;
        const deltaY = (moveEvent.clientY - startY) * factor;
        
        const newWidth = Math.max(400 * factor, startPhysicalSize.width + deltaX);
        const newHeight = Math.max(300 * factor, startPhysicalSize.height + deltaY);
        
        appWindow.setSize(new PhysicalSize(newWidth, newHeight));
        isResizing = false;
      });
    };

    const onPointerUp = (upEvent) => {
      if (upEvent.target.releasePointerCapture) upEvent.target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      {/* Neviditelné resize handles – Tauri startResizeDragging */}
      {[
        { dir: 'North',     cls: 'top-0 left-4 right-4 h-[8px] cursor-n-resize' },
        { dir: 'South',     cls: 'bottom-0 left-4 right-24 h-[8px] cursor-s-resize' },
        { dir: 'East',      cls: 'right-0 top-4 bottom-24 w-[8px] cursor-e-resize' },
        { dir: 'West',      cls: 'left-0 top-4 bottom-4 w-[8px] cursor-w-resize' },
      ].map(({ dir, cls }) => (
        <div
          key={dir}
          className={`absolute z-[9999] ${cls}`}
          onMouseDown={() => getCurrentWindow().startResizeDragging(dir)}
        />
      ))}

      {/* Neviditelný, ale aktivní blok v pravém dolním rohu pro Corner Resize (JS Fallback) */}
      <div 
        className="absolute bottom-0 right-0 w-24 h-24 z-[10000] cursor-se-resize touch-none"
        onPointerDown={handleManualCornerResize}
      />
      
      {/* Vlastní tenký Titlebar (Nativní Rust Tauri handler podpořený backend právy) */}
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
            onClick={() => getCurrentWindow().minimize()} 
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
             <Minus size={14} pointerEvents="none" />
          </button>
          <button 
            onClick={() => getCurrentWindow().toggleMaximize()} 
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
             <Square size={12} pointerEvents="none" />
          </button>
          <button 
            onClick={() => getCurrentWindow().close()} 
            className="p-1 hover:bg-red-500/80 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
             <X size={14} pointerEvents="none" />
          </button>
        </div>
      </div>
    </>
  );
}
