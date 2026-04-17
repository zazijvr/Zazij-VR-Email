import React, { useState, useEffect } from 'react';
import { Mail, Calendar, Settings } from 'lucide-react';

export default function Sidebar({
  activeFolder,
  setActiveFolder,
  activeCalendarView,
  setActiveCalendarView,
  appMode,
  setAppMode,
  setIsSettingsOpen,
  unreadCounts = {},
  onComposeNew,
  onCreateNewEvent,
  onMoveEmail,
  customLabels = []
}) {
  const [folders, setFolders] = useState([
    { id: 'inbox', label: 'Doručené' },
    { id: 'important', label: 'Důležité' },
    { id: 'sent', label: 'Odeslané' },
    { id: 'drafts', label: 'Rozepsané' },
    { id: 'spam', label: 'Spam' },
    { id: 'trash', label: 'Koš' }
  ]);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const [draggableFolderId, setDraggableFolderId] = useState(null);
  const dragTimerRef = React.useRef(null);
  
  const [specialCals, setSpecialCals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zazijvr_special_calendars')) || { cz_holidays: false }; }
    catch(e) { return { cz_holidays: false }; }
  });

  const handlePointerDown = (id) => {
    dragTimerRef.current = setTimeout(() => {
      setDraggableFolderId(id);
    }, 500);
  };

  const clearDragTimer = () => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    setDraggableFolderId(null);
  };

  const handleDragEnd = () => {
    setDraggableFolderId(null);
  };

  useEffect(() => {
    const saved = localStorage.getItem('zazijvr_folders');
    if (saved) {
      try { setFolders(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const handleDragStartFolder = (e, index) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'FOLDER', index }));
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e, dropIndex, targetLabel) => {
    e.preventDefault();
    setDragOverIdx(null);
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      
      if (data.type === 'FOLDER') {
        const sourceIndex = data.index;
        if (sourceIndex === dropIndex) return;
        const newFolders = [...folders];
        const [removed] = newFolders.splice(sourceIndex, 1);
        newFolders.splice(dropIndex, 0, removed);
        setFolders(newFolders);
        localStorage.setItem('zazijvr_folders', JSON.stringify(newFolders));
      } else if (data.type === 'EMAIL') {
        if (data.sourceLabel !== targetLabel && onMoveEmail) {
           onMoveEmail([{ id: data.id, sourceLabel: data.sourceLabel, targetLabel, fullObj: data.emailData }]);
        }
      } else if (data.type === 'EMAIL_MULTI') {
        if (onMoveEmail) {
          const moves = data.items
            .filter(item => item.sourceLabel !== targetLabel)
            .map(item => ({ id: item.id, sourceLabel: item.sourceLabel, targetLabel, fullObj: item.emailData }));
          if (moves.length > 0) onMoveEmail(moves);
        }
      }
    } catch(e) {}
  };  return (
    <div className="w-64 bg-black/40 backdrop-blur-md border-r border-[#00f3ff]/20 flex flex-col py-8 z-20 select-none">
      <div className="flex justify-center w-full px-4 mb-8">
        <img
          src="/cropped-logo-neon-pruhledna-150x50.png"
          alt="ZažijVR"
          className="w-[85%] object-contain drop-shadow-[0_0_10px_rgba(0,243,255,0.3)] hover:scale-105 transition-transform cursor-pointer"
          draggable="false"
        />
      </div>

      {/* Global App Switcher */}
      <div className="flex justify-center gap-4 mb-10 px-4">
        <div
          onClick={() => setAppMode('email')}
          className={`p-3 rounded-[18px] cursor-pointer transition-all duration-300 ${appMode === 'email'
              ? 'bg-[#00f3ff]/10 border border-[#00f3ff]/30 text-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.25)] scale-110'
              : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
        >
          <Mail size={22} strokeWidth={2.5} />
        </div>
        <div
          onClick={() => setAppMode('calendar')}
          className={`p-3 rounded-[18px] cursor-pointer transition-all duration-300 ${appMode === 'calendar'
              ? 'bg-[#00f3ff]/10 border border-[#00f3ff]/30 text-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.25)] scale-110'
              : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
        >
          <Calendar size={22} strokeWidth={2.5} />
        </div>
        <div
          onClick={() => setIsSettingsOpen(true)}
          className="p-3 rounded-[18px] cursor-pointer transition-all duration-300 text-gray-500 hover:text-white hover:bg-white/5 border border-transparent"
        >
          <Settings size={22} strokeWidth={2.5} />
        </div>
      </div>

      <div className="px-4 mb-8">
        {appMode === 'email' ? (
          <button 
            onClick={onComposeNew}
            className="w-full relative group overflow-hidden rounded-xl border-2 border-[#00f3ff]/50 bg-[#00f3ff]/10 py-3.5 flex justify-center items-center transition-all hover:bg-[#00f3ff]/20 hover:border-[#00f3ff] hover:shadow-[0_0_25px_rgba(0,243,255,0.6)]"
          >
            <span className="font-bold text-base tracking-widest text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.9)] flex items-center gap-2">
              <Mail size={18} strokeWidth={2.5} />
              Napsat e-mail
            </span>
          </button>
        ) : (
          <button 
            onClick={onCreateNewEvent}
            className="w-full relative group overflow-hidden rounded-xl border-2 border-[#00f3ff]/50 bg-[#00f3ff]/10 py-3.5 flex justify-center items-center transition-all hover:bg-[#00f3ff]/20 hover:border-[#00f3ff] hover:shadow-[0_0_25px_rgba(0,243,255,0.6)]"
          >
            <span className="font-bold text-base tracking-widest text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.9)] flex items-center gap-2">
              <Calendar size={18} strokeWidth={2.5} />
              Nová událost
            </span>
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar pb-6 pt-2">
        {appMode === 'email' && folders.map((folder, index) => {
          const isActive = activeFolder === folder.label;
          const isDragOver = dragOverIdx === index;
          return (
            <div
              key={folder.id}
              draggable={draggableFolderId === folder.id}
              onPointerDown={() => handlePointerDown(folder.id)}
              onPointerUp={clearDragTimer}
              onPointerLeave={clearDragTimer}
              onPointerCancel={clearDragTimer}
              onDragEnd={handleDragEnd}
              onDragStart={(e) => {
                 clearDragTimer();
                 handleDragStartFolder(e, index);
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index, folder.label)}
              onClick={() => setActiveFolder(folder.label)}
              className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                isDragOver ? 'bg-[#00f3ff]/30 border border-[#00f3ff] scale-[1.05] shadow-[0_0_20px_rgba(0,243,255,0.4)] z-20' :
                isActive
                  ? 'bg-gradient-to-r from-[#00f3ff]/20 to-transparent border border-[#00f3ff]/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                  : 'hover:bg-[#00f3ff]/5 border border-[#00f3ff]/10 text-[#00f3ff]/60 hover:text-[#00f3ff]'
                } group`}
            >
              {isActive && !isDragOver && (
                <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-[#00f3ff]/10 to-transparent pointer-events-none" />
              )}
              <div className="flex items-center gap-3 relative z-10">
                {isActive && (
                   <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff] animate-pulse" />
                )}
                <span className={`font-semibold tracking-wide ${isActive ? 'text-[#00f3ff] font-bold' : 'text-[#00f3ff]/60'}`}>
                  {folder.label}
                </span>
              </div>
              
              {unreadCounts[folder.label] > 0 && (
                <span className={`relative z-10 px-2.5 py-0.5 rounded text-xs font-extrabold transition-all duration-300 ${isActive ? 'bg-[#00f3ff] text-black shadow-[0_0_10px_rgba(0,243,255,0.8)]' : 'bg-[#00f3ff]/10 text-[#00f3ff] border border-[#00f3ff]/20'}`}>
                   {unreadCounts[folder.label]}
                </span>
              )}
            </div>
          );
        })}

        {appMode === 'email' && customLabels && customLabels.length > 0 && (
           <>
              <div className="h-px bg-[#00f3ff]/20 mx-4 !mt-7 !mb-7 relative shrink-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0f172a] px-2 text-[10px] text-[#00f3ff]/50 font-bold tracking-widest uppercase whitespace-nowrap">
                  Vlastní složky
                </div>
              </div>
              {customLabels.map((folder, index) => {
                const isActive = activeFolder === folder.name;
                const isDragOver = dragOverIdx === `custom_${folder.id}`;
                return (
                  <div
                    key={folder.id}
                    onDragOver={(e) => {
                       e.preventDefault();
                       e.dataTransfer.dropEffect = 'move';
                       setDragOverIdx(`custom_${folder.id}`);
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, -1, folder.name)}
                    onClick={() => setActiveFolder(folder.name)}
                    className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                      isDragOver ? 'bg-[#00f3ff]/30 border border-[#00f3ff] scale-[1.05] shadow-[0_0_20px_rgba(0,243,255,0.4)] z-20' :
                      isActive
                        ? 'bg-gradient-to-r from-[#00f3ff]/20 to-transparent border border-[#00f3ff]/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                        : 'hover:bg-[#00f3ff]/5 border border-[#00f3ff]/10 text-[#00f3ff]/60 hover:text-[#00f3ff]'
                      } group`}
                  >
                    {isActive && !isDragOver && (
                      <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-[#00f3ff]/10 to-transparent pointer-events-none" />
                    )}
                    <div className="flex items-center gap-3 relative z-10 w-full overflow-hidden pr-2">
                      {isActive && (
                         <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff] animate-pulse shrink-0" />
                      )}
                      <span className={`font-semibold tracking-wide truncate ${isActive ? 'text-[#00f3ff] font-bold' : 'text-[#00f3ff]/60'}`}>
                        {folder.name}
                      </span>
                    </div>
                    {unreadCounts[folder.name] > 0 && (
                      <span className={`shrink-0 relative z-10 px-2.5 py-0.5 rounded text-xs font-extrabold transition-all duration-300 ${isActive ? 'bg-[#00f3ff] text-black shadow-[0_0_10px_rgba(0,243,255,0.8)]' : 'bg-[#00f3ff]/10 text-[#00f3ff] border border-[#00f3ff]/20'}`}>
                         {unreadCounts[folder.name]}
                      </span>
                    )}
                  </div>
                );
              })}
           </>
        )}

        {appMode === 'calendar' && [
          { id: 'agenda', label: 'Co mě čeká?' },
          { id: 'month', label: 'Měsíční přehled' }
        ].map((view) => {
          if (view.id === 'divider') {
             return <div key={view.id} className="h-px bg-white/10 my-4 mx-2" />;
          }

          const isActive = activeCalendarView === view.label;
          return (
            <div
              key={view.id}
              onClick={() => setActiveCalendarView(view.label)}
              className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                isActive
                  ? 'bg-gradient-to-r from-[#00f3ff]/20 to-transparent border border-[#00f3ff]/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                  : 'hover:bg-[#00f3ff]/5 border border-[#00f3ff]/10 text-[#00f3ff]/60 hover:text-[#00f3ff]'
                } group`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-[#00f3ff]/10 to-transparent pointer-events-none" />
              )}
              <div className="flex items-center gap-3 relative z-10">
                {isActive && (
                   <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff] animate-pulse" />
                )}
                <span className={`font-semibold tracking-wide ${isActive ? 'text-[#00f3ff] font-bold' : 'text-[#00f3ff]/60'}`}>
                  {view.label}
                </span>
              </div>
            </div>
          );
        })}

        {appMode === 'calendar' && (
           <>
              <div className="h-px bg-[#00f3ff]/20 mx-4 !mt-7 !mb-7 relative shrink-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0f172a] px-3 text-[10px] text-[#00f3ff]/50 font-bold tracking-[0.1em] uppercase whitespace-nowrap">
                  Speciální kalendáře
                </div>
              </div>

              {(() => {
                 const isActive = specialCals?.cz_holidays || false;
                 return (
                    <div 
                      onClick={() => {
                        const nextSettings = { ...specialCals, cz_holidays: !isActive };
                        setSpecialCals(nextSettings);
                        localStorage.setItem('zazijvr_special_calendars', JSON.stringify(nextSettings));
                        window.dispatchEvent(new Event('zazijvr_special_cals_changed'));
                      }}
                      className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                        isActive
                          ? 'bg-gradient-to-r from-[#00f3ff]/15 to-transparent border border-[#00f3ff]/30 shadow-[inset_4px_0_0_#f800ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                          : 'hover:bg-[#00f3ff]/5 border border-[#00f3ff]/10 text-[#00f3ff]/60 hover:text-[#00f3ff]'
                        } group`}
                    >
                      {isActive && (
                        <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-[#00f3ff]/10 to-transparent pointer-events-none" />
                      )}
                      <div className="flex items-center gap-3 relative z-10 w-full overflow-hidden">
                         <div className={`w-1.5 h-1.5 rounded-full bg-[#00f3ff] shrink-0 transition-all ${isActive ? 'shadow-[0_0_8px_#00f3ff] animate-pulse' : 'opacity-40'}`} />
                         <span className={`font-semibold tracking-wide truncate transition-colors ${isActive ? 'text-[#00f3ff] font-bold' : 'text-[#00f3ff]/60 group-hover:text-[#00f3ff]'}`}>
                           CZ Státní svátky
                         </span>
                      </div>
                    </div>
                 );
              })()}
           </>
        )}
      </nav>
    </div>
  );
}
