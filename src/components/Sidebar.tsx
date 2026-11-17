import { Fragment, useRef, useState, useEffect, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { Mail, Calendar, Settings, ChevronRight, ChevronDown } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import type { GmailLabel } from '../types/gmail';
import { openZazijvrWeb } from '../utils/zazijvrWeb';
import type { UnreadCounts } from '../types/account';
import type { DragPayload, MoveRequest } from '../types/email';

export type AppMode = 'email' | 'calendar';

interface SidebarFolder {
  id: string;
  label: string;
}

interface SidebarProps {
  activeFolder: string;
  setActiveFolder: (folder: string) => void;
  activeCalendarView: string;
  setActiveCalendarView: (view: string) => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  setIsSettingsOpen: (open: boolean) => void;
  unreadCounts?: UnreadCounts;
  onComposeNew: () => void;
  onCreateNewEvent: () => void;
  onMoveEmail?: (moves: MoveRequest[]) => void;
  /** Přesun vlastní složky pod jinou (null = na nejvyšší úroveň) */
  onMoveCustomFolder?: (id: string, name: string, targetParent: string | null) => void;
  customLabels?: GmailLabel[];
  onMobileClose?: () => void;
  /** Přepínač e-mailových účtů (zobrazí se v režimu pošty) */
  accountSwitcher?: ReactNode;
}

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
  onMoveCustomFolder,
  customLabels = [],
  onMobileClose,
  accountSwitcher,
}: SidebarProps) {
  const [folders, setFolders] = useState<SidebarFolder[]>([
    { id: 'inbox', label: 'Doručené' },
    { id: 'important', label: 'Důležité' },
    { id: 'sent', label: 'Odeslané' },
    { id: 'drafts', label: 'Rozepsané' },
    { id: 'spam', label: 'Spam' },
    { id: 'trash', label: 'Koš' }
  ]);
  /** Index systémové složky, nebo klíč „custom_into_…“ / „custom_before_…“ / „root_custom“ */
  const [dragOverIdx, setDragOverIdx] = useState<number | string | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem('zazijvr_collapsed_folders') || '[]')); }
    catch { return new Set<string>(); }
  });

  const toggleCollapse = (e: MouseEvent, folderName: string) => {
    e.stopPropagation();
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName);
      else next.add(folderName);
      localStorage.setItem('zazijvr_collapsed_folders', JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    const handleAutoExpand = (e: Event) => {
      const targetPath = (e as CustomEvent<string>).detail;
      setCollapsedFolders(prev => {
        if (!prev.has(targetPath)) return prev;
        const next = new Set(prev);
        next.delete(targetPath);
        localStorage.setItem('zazijvr_collapsed_folders', JSON.stringify([...next]));
        return next;
      });
    };
    window.addEventListener('zazijvr_expand_folder', handleAutoExpand);
    return () => window.removeEventListener('zazijvr_expand_folder', handleAutoExpand);
  }, []);

  const navScrollRef = useRef<HTMLElement>(null);
  const handleNavDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!navScrollRef.current) return;
    const { top, bottom } = navScrollRef.current.getBoundingClientRect();
    const threshold = 60; // posuv pri priblizeni k okraji
    if (e.clientY - top < threshold) {
      navScrollRef.current.scrollTop -= 10;
    } else if (bottom - e.clientY < threshold) {
      navScrollRef.current.scrollTop += 10;
    }
  };
  
  const [specialCals, setSpecialCals] = useState<{ cz_holidays: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('zazijvr_special_calendars') || 'null') || { cz_holidays: false }; }
    catch { return { cz_holidays: false }; }
  });

  useEffect(() => {
    const saved = localStorage.getItem('zazijvr_folders');
    if (saved) {
      try { setFolders(JSON.parse(saved)); } catch { /* poškozené pořadí složek – zůstane výchozí */ }
    }
  }, []);

  const handleDragStartFolder = (e: DragEvent, index: number) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'FOLDER', index }));
  };

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e: DragEvent, dropIndex: number, targetLabel: string | null) => {
    e.preventDefault();
    setDragOverIdx(null);
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr) as DragPayload;
      
      if (data.type === 'FOLDER') {
        const sourceIndex = data.index;
        if (sourceIndex === dropIndex) return;
        const newFolders = [...folders];
        const [removed] = newFolders.splice(sourceIndex, 1);
        newFolders.splice(dropIndex, 0, removed);
        setFolders(newFolders);
        localStorage.setItem('zazijvr_folders', JSON.stringify(newFolders));
      } else if (data.type === 'CUSTOM_FOLDER') {
        if (data.name !== targetLabel && onMoveCustomFolder) {
           onMoveCustomFolder(data.id, data.name, targetLabel);
        }
      } else if (data.type === 'EMAIL') {
        if (targetLabel && data.sourceLabel !== targetLabel && onMoveEmail) {
           onMoveEmail([{ id: data.id, sourceLabel: data.sourceLabel, targetLabel, fullObj: data.emailData }]);
        }
      } else if (data.type === 'EMAIL_MULTI') {
        if (targetLabel && onMoveEmail) {
          const moves = data.items
            .filter(item => item.sourceLabel !== targetLabel)
            .map(item => ({ id: item.id, sourceLabel: item.sourceLabel, targetLabel, fullObj: item.emailData }));
          if (moves.length > 0) onMoveEmail(moves);
        }
      }
    } catch { /* přetažené něco, co není z aplikace */ }
  };  return (
    <div className="relative min-w-[16rem] w-max max-w-[26rem] bg-navy md:bg-navy-card backdrop-blur-3xl md:backdrop-blur-md border-r border-neon-blue/20 flex flex-col pb-4 pt-[calc(1rem+env(safe-area-inset-top,2rem))] md:py-8 z-20 select-none shrink-0 transition-all duration-300 h-full shadow-[5px_0_30px_rgba(0,0,0,0.8)]">
      <div className="flex justify-center w-full px-4 mb-4 md:mb-8">
        {/* Logo – probliká jako neon, klik otevře zazijvr.cz */}
        <button type="button" onClick={openZazijvrWeb} title="zazijvr.cz" aria-label="Otevřít web ZažijVR"
          className="w-[85%] hover:scale-105 active:scale-95 transition-transform">
          <img
            src="/cropped-logo-neon-pruhledna-150x50.png"
            alt="ZažijVR"
            className="vr-neon-logo w-full object-contain"
            draggable="false"
          />
        </button>
      </div>

      <div className="flex justify-center gap-4 mb-4 md:mb-10 px-4">
        <div
          onClick={() => {
            setAppMode('email');
            setActiveFolder('Doručené');
            if (onMobileClose) onMobileClose();
          }}
          className={`p-3 rounded-[18px] cursor-pointer transition-all duration-300 ${appMode === 'email'
              ? 'bg-neon-blue/10 border border-neon-blue/30 text-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.25)] scale-110'
              : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
        >
          <Mail size={22} strokeWidth={2.5} />
        </div>
        <div
          onClick={() => {
            setAppMode('calendar');
            setActiveCalendarView('Co mě čeká?');
            if (onMobileClose) onMobileClose();
          }}
          className={`p-3 rounded-[18px] cursor-pointer transition-all duration-300 ${appMode === 'calendar'
              ? 'bg-neon-blue/10 border border-neon-blue/30 text-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.25)] scale-110'
              : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
        >
          <Calendar size={22} strokeWidth={2.5} />
        </div>
        <div
          onClick={() => setIsSettingsOpen(true)}
          className="p-3 rounded-[18px] cursor-pointer transition-all duration-300 text-slate-500 hover:text-white hover:bg-white/5 border border-transparent"
        >
          <Settings size={22} strokeWidth={2.5} />
        </div>
      </div>

      {/* Na mobilu se účty přepínají v horní hlavičce (MobileHeader) */}
      {appMode === 'email' && <div className="hidden md:block">{accountSwitcher}</div>}

      <div className="px-4 mb-4 md:mb-8">
        {appMode === 'email' ? (
            <button 
              onClick={onComposeNew}
              className="w-full relative group overflow-hidden rounded-xl border-2 border-neon-blue/50 bg-neon-blue/10 py-2.5 md:py-3.5 flex justify-center items-center transition-all hover:bg-neon-blue/20 hover:border-neon-blue hover:shadow-[0_0_25px_rgba(0,243,255,0.6)]"
            >
            <span className="font-bold text-base tracking-widest text-neon-blue drop-shadow-[0_0_8px_rgba(0,243,255,0.9)] flex items-center gap-2">
              <Mail size={18} strokeWidth={2.5} />
              Napsat e-mail
            </span>
          </button>
        ) : (
            <button 
              onClick={() => {
                 onCreateNewEvent();
                 if (onMobileClose) onMobileClose();
              }}
              className="w-full relative group overflow-hidden rounded-xl border-2 border-neon-blue/50 bg-neon-blue/10 py-2.5 md:py-3.5 flex justify-center items-center transition-all hover:bg-neon-blue/20 hover:border-neon-blue hover:shadow-[0_0_25px_rgba(0,243,255,0.6)]"
            >
            <span className="font-bold text-base tracking-widest text-neon-blue drop-shadow-[0_0_8px_rgba(0,243,255,0.9)] flex items-center gap-2">
              <Calendar size={18} strokeWidth={2.5} />
              Nová událost
            </span>
          </button>
        )}
      </div>

      {/* Cyberpunk Neon Divider za akčním tlačítkem */}
      <div className="w-full h-[1px] mb-4 mt-2 bg-gradient-to-r from-neon-blue/0 via-neon-blue/60 to-neon-blue/0 shadow-[0_0_10px_rgba(0,243,255,0.6)] pointer-events-none"></div>

      {/* Neonové čáry dole – hotový obrázek (bez živých filtrů, nic nestojí) */}
      <img src="/neon_sidebar.png" alt="" draggable="false" className="absolute left-0 bottom-0 w-full h-auto opacity-60 pointer-events-none select-none z-0" />

      <nav ref={navScrollRef} onDragOver={handleNavDragOver} className="relative z-10 flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar pb-6 pt-2">
        {appMode === 'email' && folders.map((folder, index) => {
          const isActive = activeFolder === folder.label;
          const isDragOver = dragOverIdx === index;
          return (
            <div
              key={folder.id}
              draggable={true}
              onDragStart={(e) => {
                 handleDragStartFolder(e, index);
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index, folder.label)}
              onClick={() => {
                 setActiveFolder(folder.label);
                 if (onMobileClose) onMobileClose();
              }}
              className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                isDragOver ? 'bg-neon-blue/30 border border-neon-blue scale-[1.05] shadow-[0_0_20px_rgba(0,243,255,0.4)] z-20' :
                isActive
                  ? 'bg-gradient-to-r from-neon-blue/20 to-transparent border border-neon-blue/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                  : 'hover:bg-neon-blue/5 border border-neon-blue/10 text-neon-blue/60 hover:text-neon-blue'
                } group`}
            >
              {isActive && !isDragOver && (
                <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-neon-blue/10 to-transparent pointer-events-none" />
              )}
              <div className="flex items-center gap-3 relative z-10">
                {isActive && (
                   <div className="w-1.5 h-1.5 rounded-full bg-neon-blue shadow-[0_0_8px_#00f3ff] animate-pulse" />
                )}
                <span className={`font-semibold tracking-wide ${isActive ? 'text-neon-blue font-bold' : 'text-neon-blue/60'}`}>
                  {folder.label}
                </span>
              </div>
              
              {unreadCounts[folder.label] > 0 && (
                <span className={`relative z-10 px-2.5 py-0.5 rounded text-xs font-extrabold transition-all duration-300 ${isActive ? 'bg-neon-blue text-black shadow-[0_0_10px_rgba(0,243,255,0.8)]' : 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20'}`}>
                   {unreadCounts[folder.label]}
                </span>
              )}
            </div>
          );
        })}

         {appMode === 'email' && customLabels && customLabels.length > 0 && (
           <>
              <div 
                className={`h-px bg-neon-blue/20 mx-4 !mt-7 !mb-7 relative shrink-0 transition-all ${dragOverIdx === 'root_custom' ? 'shadow-[0_0_15px_#00f3ff] scale-105' : ''}`}
                onDragOver={(e) => {
                   e.preventDefault();
                   e.dataTransfer.dropEffect = 'move';
                   setDragOverIdx('root_custom');
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, -1, null)}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-navy px-2 text-[10px] text-neon-blue/50 font-bold tracking-widest uppercase whitespace-nowrap">
                  Vlastní složky
                </div>
              </div>
              {(() => {
                const sortedCustomLabels = [...customLabels].sort((a, b) => a.name.localeCompare(b.name));
                return sortedCustomLabels.map((folder, index) => {
                  const isActive = activeFolder === folder.name;
                  const isDragOverInto = dragOverIdx === `custom_into_${folder.id}`;
                  const isDragOverBefore = dragOverIdx === `custom_before_${folder.id}`;
                  const parts = folder.name.split('/');
                  const depth = parts.length - 1;
                  const rawName = parts[parts.length - 1];
                  const displayName = rawName.length > 25 ? rawName.substring(0, 25) + '…' : rawName;
                  
                  let isHidden = false;
                  for (let i = 1; i <= depth; i++) {
                     const ancestorPath = parts.slice(0, i).join('/');
                     if (collapsedFolders.has(ancestorPath)) {
                        isHidden = true;
                        break;
                     }
                  }
                  if (isHidden) return null;

                  const hasChildren = index + 1 < sortedCustomLabels.length && sortedCustomLabels[index + 1].name.startsWith(folder.name + '/');
                  const isCollapsed = collapsedFolders.has(folder.name);
                  
                  return (
                    <Fragment key={folder.id}>
                      {isDragOverBefore && (
                        <div 
                           className="h-1 bg-navy border border-neon-blue rounded-full my-1 z-30 transition-all relative overflow-hidden"
                           style={{ marginLeft: `${1 + (depth > 0 ? depth - 1 : 0) * 1.2}rem`, marginRight: '1rem' }}
                        >
                           <div className="absolute inset-0 w-full h-full bg-neon-blue shadow-[0_0_15px_#00f3ff] animate-pulse opacity-70" />
                        </div>
                      )}
                      <div
                      key={`item_${folder.id}`}
                    draggable={true}
                    onDragStart={(e) => {
                       e.dataTransfer.setData('application/json', JSON.stringify({ type: 'CUSTOM_FOLDER', id: folder.id, name: folder.name }));
                    }}
                    onDragOver={(e) => {
                       e.preventDefault();
                       e.dataTransfer.dropEffect = 'move';
                       const rect = e.currentTarget.getBoundingClientRect();
                       const isTopEdge = (e.clientY - rect.top) < 16;
                       if (isTopEdge) {
                           setDragOverIdx(`custom_before_${folder.id}`);
                       } else {
                           setDragOverIdx(`custom_into_${folder.id}`);
                       }
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       const isTopEdge = (e.clientY - rect.top) < 16;
                       const targetPath = isTopEdge ? 
                          (folder.name.includes('/') ? folder.name.substring(0, folder.name.lastIndexOf('/')) : null) 
                          : folder.name;
                       handleDrop(e, -1, targetPath);
                    }}
                    onClick={() => {
                       setActiveFolder(folder.name);
                       if (onMobileClose) onMobileClose();
                    }}
                    className={`relative flex items-center justify-between py-3 cursor-pointer transition-all duration-300 overflow-hidden ${
                      isDragOverInto ? 'bg-neon-blue/30 border border-neon-blue scale-[1.05] shadow-[0_0_20px_rgba(0,243,255,0.4)] z-20 rounded-xl' :
                      isActive
                        ? 'bg-gradient-to-r from-neon-blue/20 to-transparent border border-neon-blue/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02] rounded-xl'
                        : 'hover:bg-neon-blue/5 border border-transparent hover:border-neon-blue/10 text-neon-blue/60 hover:text-neon-blue rounded-xl'
                      } group`}
                    style={{ paddingLeft: `${1 + depth * 1.2}rem`, paddingRight: '1rem' }}
                  >
                    {isActive && (!isDragOverInto && !isDragOverBefore) && (
                      <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-neon-blue/10 to-transparent pointer-events-none" />
                    )}
                    <div className="flex items-center gap-2 relative z-10 w-full overflow-hidden">
                      {hasChildren ? (
                         <div 
                           onClick={(e) => toggleCollapse(e, folder.name)}
                           className="p-1 -ml-1 rounded-md hover:bg-white/10 shrink-0 text-neon-blue/70 hover:text-neon-blue transition-colors"
                         >
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                         </div>
                      ) : (
                         <div className="w-[22px] shrink-0 flex justify-center items-center">
                            {isActive ? (
                               <div className="w-1.5 h-1.5 rounded-full bg-neon-blue shadow-[0_0_8px_#00f3ff] animate-pulse shrink-0" />
                            ) : depth > 0 ? (
                               <div className="w-1 h-1 rounded-full bg-neon-blue/30 shrink-0" />
                            ) : null}
                         </div>
                      )}
                      
                      <span className={`font-semibold tracking-wide whitespace-nowrap ${isActive ? 'text-neon-blue font-bold' : 'text-neon-blue/60'}`}>
                        {displayName}
                      </span>
                    </div>
                    {unreadCounts[folder.name] > 0 && (
                      <span className={`shrink-0 relative z-10 px-2.5 py-0.5 rounded text-xs font-extrabold transition-all duration-300 ${isActive ? 'bg-neon-blue text-black shadow-[0_0_10px_rgba(0,243,255,0.8)]' : 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20'}`}>
                         {unreadCounts[folder.name]}
                      </span>
                    )}
                  </div>
                  </Fragment>
                );
              });
            })()}
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
              onClick={() => {
                 setActiveCalendarView(view.label);
                 if (onMobileClose) onMobileClose();
              }}
              className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                isActive
                  ? 'bg-gradient-to-r from-neon-blue/20 to-transparent border border-neon-blue/30 shadow-[inset_4px_0_0_#00f3ff,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                  : 'hover:bg-neon-blue/5 border border-neon-blue/10 text-neon-blue/60 hover:text-neon-blue'
                } group`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-neon-blue/10 to-transparent pointer-events-none" />
              )}
              <div className="flex items-center gap-3 relative z-10">
                {isActive && (
                   <div className="w-1.5 h-1.5 rounded-full bg-neon-blue shadow-[0_0_8px_#00f3ff] animate-pulse" />
                )}
                <span className={`font-semibold tracking-wide ${isActive ? 'text-neon-blue font-bold' : 'text-neon-blue/60'}`}>
                  {view.label}
                </span>
              </div>
            </div>
          );
        })}

        {appMode === 'calendar' && (
           <>
              <div className="h-px bg-neon-blue/20 mx-4 !mt-7 !mb-7 relative shrink-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-navy px-3 text-[10px] text-neon-blue/50 font-bold tracking-[0.1em] uppercase whitespace-nowrap">
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
                        if (onMobileClose) onMobileClose();
                      }}
                      className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 overflow-hidden ${
                        isActive
                          ? 'bg-gradient-to-r from-neon-blue/15 to-transparent border border-neon-blue/30 shadow-[inset_4px_0_0_#f72585,0_0_15px_rgba(0,243,255,0.15)] scale-[1.02]'
                          : 'hover:bg-neon-blue/5 border border-neon-blue/10 text-neon-blue/60 hover:text-neon-blue'
                        } group`}
                    >
                      {isActive && (
                        <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-neon-blue/10 to-transparent pointer-events-none" />
                      )}
                      <div className="flex items-center gap-3 relative z-10 w-full overflow-hidden">
                         <div className={`w-1.5 h-1.5 rounded-full bg-neon-blue shrink-0 transition-all ${isActive ? 'shadow-[0_0_8px_#00f3ff] animate-pulse' : 'opacity-40'}`} />
                         <span className={`font-semibold tracking-wide truncate transition-colors ${isActive ? 'text-neon-blue font-bold' : 'text-neon-blue/60 group-hover:text-neon-blue'}`}>
                           CZ Státní svátky
                         </span>
                      </div>
                    </div>
                 );
              })()}
           </>
        )}
      </nav>
      
      {appVersion && (
        <div className="relative z-10 px-4 pb-0 pt-3 flex justify-center border-t border-neon-blue/20">
          {/* Tmavý podklad, aby se číslo neztrácelo v neonových čarách za ním */}
          <span className="px-3 py-1 rounded-md bg-navy/80 border border-neon-blue/25 text-neon-blue text-[11px] font-semibold tracking-widest uppercase truncate drop-shadow-[0_0_6px_rgba(0,243,255,0.5)]">
            Verze {appVersion}
          </span>
        </div>
      )}
    </div>
  );
}
