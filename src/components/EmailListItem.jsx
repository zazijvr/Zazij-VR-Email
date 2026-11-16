import React, { useState, useRef } from 'react';
import { CheckSquare, Square, Mail, MailOpen, FileEdit, Star, Trash2, Paperclip, Check, Reply } from 'lucide-react';
import { getAvatarInitial } from '../utils/emailParser';

/** „15. 11. 2026“ → „15. 11.“ (letos), jinak „15. 11. 25“ */
const shortDate = (text) => {
  const m = text.match(/^(.*?)\s*(\d{4})$/);
  if (!m) return text;
  return Number(m[2]) === new Date().getFullYear() ? m[1] : `${m[1]} ${m[2].slice(2)}`;
};

export default function EmailListItem({
  email,
  index,
  activeFolder,
  selectedEmailId,
  selectedMailIds,
  keyboardIndex,
  draggableEmailId,
  emails,
  handlePointerDown,
  setKeyboardIndex,
  clearDragTimer,
  handleDragEnd,
  setSelectedMailIds,
  handleEmailClick,
  toggleSelectEmail,
  handleToggleRead,
  onDraftClick,
  handleToggleStar,
  handleTrashEmail,
  onSwipeDelete // nový handler z listu
}) {
  const isSelected = selectedEmailId === email.id;
  const isMultiSelected = selectedMailIds.has(email.id);
  const isActiveRow = isSelected || isMultiSelected;
  const isKeyboardFocus = keyboardIndex === index;

  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStartRef = useRef(null);
  const longPressTimerRef = useRef(null);

  const SWIPE_THRESHOLD = 80;

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
       clearTimeout(longPressTimerRef.current);
       longPressTimerRef.current = null;
    }
  };

  const onTouchStart = (e) => {
    if (e.touches.length > 1) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTimerRef.current = setTimeout(() => {
       if (window.navigator.vibrate) window.navigator.vibrate(50);
       toggleSelectEmail(email.id, { stopPropagation: () => {} });
    }, 500);
  };

  const onTouchMove = (e) => {
    if (!swipeStartRef.current) return;
    if (e.touches.length > 1) {
      swipeStartRef.current = null;
      setSwipeOffset(0);
      clearLongPress();
      return;
    }
    const dx = e.touches[0].clientX - swipeStartRef.current.x;
    const dy = e.touches[0].clientY - swipeStartRef.current.y;
    
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearLongPress();
    }

    // Povolit scrollování (y) versus swipe (x)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      if(e.cancelable) e.preventDefault();
      setSwipeOffset(dx);
    }
  };

  const onTouchEnd = () => {
    clearLongPress();
    if (swipeStartRef.current) {
      if (swipeOffset > SWIPE_THRESHOLD) {
        // Swipe vpravo -> Read / Unread
        handleToggleRead(email.id, email.isUnread, null);
      } else if (swipeOffset < -SWIPE_THRESHOLD) {
        // Swipe vlevo -> Delete
        if (onSwipeDelete) {
           onSwipeDelete(email);
        } else {
           handleTrashEmail(email, null);
        }
      }
    }
    swipeStartRef.current = null;
    setSwipeOffset(0);
  };

  return (
    <div className="relative group mb-1 md:mb-0">
      {/* Background Layers pro Swipe akce na mobilu */}
      <div className="absolute inset-0 flex justify-between items-center px-6 md:hidden rounded-xl overflow-hidden pointer-events-none">
        <div className={`flex items-center gap-2 text-green-400 font-bold ${swipeOffset > 20 ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
          {email.isUnread ? <MailOpen size={24}/> : <Mail size={24} />}
          <span className="tracking-widest uppercase text-[10px]">{email.isUnread ? 'Přečíst' : 'Nepřečteno'}</span>
        </div>
        <div className={`flex items-center gap-2 text-[#ff3366] font-bold ${swipeOffset < -20 ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
          <span className="tracking-widest uppercase text-[10px]">Smazat</span>
          <Trash2 size={24} />
        </div>
      </div>

      <div
        id={`email-row-${email.id}`}
        style={swipeOffset !== 0 ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' } : { transform: 'translateX(0)', transition: 'transform 0.3s ease-out' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        draggable={draggableEmailId === email.id}
        onPointerDown={(e) => { 
           if (e.pointerType === 'mouse') { 
              handlePointerDown(email.id); 
              setKeyboardIndex(index); 
           } 
        }}
        onPointerUp={(e) => {
           if (e.pointerType === 'mouse') clearDragTimer();
           clearLongPress();
        }}
        onPointerLeave={(e) => {
           if (e.pointerType === 'mouse') clearDragTimer();
           clearLongPress();
        }}
        onPointerCancel={(e) => {
           if (e.pointerType === 'mouse') clearDragTimer();
           clearLongPress();
        }}
        onDragEnd={(e) => {
          handleDragEnd();
          if (e.dataTransfer.dropEffect !== 'none') {
            if (selectedMailIds.has(email.id)) setSelectedMailIds(new Set());
          }
        }}
        onDragStart={(e) => {
          clearDragTimer();
          e.dataTransfer.effectAllowed = 'move';
          if (selectedMailIds.has(email.id) && selectedMailIds.size > 1) {
            const itemsToMove = emails
              .filter(em => selectedMailIds.has(em.id))
              .map(em => ({ id: em.id, sourceLabel: activeFolder, emailData: em }));
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'EMAIL_MULTI', items: itemsToMove }));
          } else {
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'EMAIL', id: email.id, sourceLabel: activeFolder, emailData: email }));
          }
        }}
        onClick={(e) => { 
          if (Math.abs(swipeOffset) < 10) { 
            if (selectedMailIds.size > 0) {
              toggleSelectEmail(email.id, { stopPropagation: () => {} });
            } else {
              handleEmailClick(email); 
              setKeyboardIndex(index); 
            }
          } 
        }}
        className={`relative flex flex-col md:flex-row md:items-center px-4 py-4 md:py-3 rounded-xl cursor-pointer select-none border overflow-hidden ${email._newArrival ? 'animate-new-email ' : ''}${isKeyboardFocus && !isActiveRow ? 'md:bg-white/[0.08] md:border-[#00f3ff]/25 md:shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10 ' : ''}${isActiveRow
            ? 'bg-gradient-to-r from-[#00f3ff]/20 to-[#00f3ff]/5 border-[#00f3ff] md:shadow-[0_0_20px_rgba(0,243,255,0.2)]'
            : email.isUnread
              ? 'bg-[#0a1630] md:bg-transparent md:bg-gradient-to-r md:from-[#00f3ff]/10 md:to-transparent border-[#00f3ff]/30 md:hover:border-[#00f3ff]/60 shadow-[inset_3px_0_0_#00f3ff]'
              : 'bg-[#0a1630] md:bg-white/[0.02] border-[#00f3ff]/10 md:hover:bg-white/[0.08] md:hover:border-[#00f3ff]/25 shadow-[0_4px_15px_rgba(0,0,0,0.5)] md:shadow-none'
          }`}
      >
        {/* Checkbox (Desktop only) */}
        <div 
          className="hidden md:flex w-[40px] pr-2 justify-center items-center text-[#00f3ff] opacity-80 hover:opacity-100 transition-opacity z-10" 
          onClick={(e) => toggleSelectEmail(email.id, e)}
        >
          {selectedMailIds.has(email.id) ? <CheckSquare size={18} /> : <Square size={18} className="opacity-40 group-hover:opacity-100" />}
        </div>

        {/* Odesílatel Mobilní Badge (Nyní absolutně vycentrovaný a zvětšený) */}
        <div 
          onClick={(e) => { e.stopPropagation(); toggleSelectEmail(email.id, e); }}
          className="md:hidden absolute left-2 top-1/2 flex-shrink-0 w-[46px] h-[46px] transition-transform duration-500 [transform-style:preserve-3d] z-10"
          style={{ transform: isMultiSelected ? 'translateY(-50%) rotateY(180deg)' : 'translateY(-50%) rotateY(0deg)' }}
        >
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#00f3ff]/20 to-[#f72585]/20 border border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.2)] [backface-visibility:hidden]">
            <span className="font-black text-xl text-[#00f3ff]">
               {getAvatarInitial(activeFolder === 'Odeslané' ? email.to : email.from)}
            </span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#00f3ff] shadow-[0_0_15px_rgba(0,243,255,0.6)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <Check className="text-black" size={24} strokeWidth={4} />
          </div>
        </div>

        {/* Sender / Initial */}
        <div className="flex w-full md:w-[var(--col-from)] items-center mb-1 md:mb-0 shrink-0">
          <div className={`font-bold truncate w-full md:pr-4 flex items-center gap-2 pl-[58px] md:pl-0 ${email.isUnread || isActiveRow ? 'text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.4)]' : 'text-slate-200'}`}>
            <div className="flex items-center gap-1.5 shrink-0">
              {email.isUnread && (
                <span className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" title="Nepřečteno"></span>
              )}
              {email.isStarred && (
                <span className="w-2 h-2 rounded-full bg-[#f72585] shadow-[0_0_8px_#f72585]" title="Důležité"></span>
              )}
            </div>
            <span className="truncate">{activeFolder === 'Odeslané' ? email.to : email.from}</span>
            <span className="md:hidden ml-auto flex-shrink-0 text-xs text-[#00f3ff]/60 font-normal flex items-center gap-1">
              {email.hasAttachment && <Paperclip size={12} className={email.isUnread || isActiveRow ? 'text-[#00f3ff]' : 'text-[#00f3ff]/50'} />}
              {email.dateText && email.dateText !== 'Dnes' ? email.dateText : email.timeText}
            </span>
          </div>
        </div>

        {/* Subject and Snippet */}
        <div className="flex-1 min-w-0 md:pr-4 md:pl-3 flex flex-col overflow-hidden w-full pl-[58px] mt-0.5 md:mt-0">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm ${email.isUnread || isActiveRow ? 'text-white font-bold' : 'text-slate-300 font-semibold'}`}>
              {email.subject}
            </span>
          </div>
          {email.snippet?.startsWith('↩️ ') ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate mt-[1px]">
               <Reply size={14} className="text-[#00f3ff] shrink-0 drop-shadow-[0_0_5px_rgba(0,243,255,0.6)]" />
               <span className="text-xs text-slate-500 truncate group-hover:text-slate-400 transition-colors">
                 {email.snippet.replace('↩️ ', '')}
               </span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 truncate group-hover:text-slate-400 transition-colors mt-[1px]">
              {email.snippet}
            </span>
          )}
        </div>

        {/* Desktop: velikost (jen v širokém panelu), příloha + datum */}
        <div className="mcol-size shrink-0 w-[70px] pr-3 text-right text-xs text-slate-500 whitespace-nowrap">
          {email.sizeText}
        </div>
        <div
          className={`hidden md:flex shrink-0 w-[var(--col-date)] items-center justify-end gap-1.5 whitespace-nowrap text-xs ${email.isUnread || isActiveRow ? 'text-[#00f3ff] font-bold' : 'text-slate-400'}`}
          title={[email.dateText, email.timeText].filter(Boolean).join(' ')}
        >
          {email.hasAttachment && <Paperclip size={13} className="shrink-0 opacity-70" />}
          <span>{!email.dateText || email.dateText === 'Dnes' ? email.timeText : shortDate(email.dateText)}</span>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 items-center gap-0.5 px-1 py-0.5 rounded-lg bg-[#0d1b38] border border-[#00f3ff]/25 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          <button
            onClick={(e) => handleToggleRead(email.id, email.isUnread, e)}
            className={`p-1.5 rounded-md transition-all ${email.isUnread ? 'hover:bg-[#00f3ff]/20 text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]' : 'hover:bg-white/10 text-slate-500 hover:text-white'}`}
            title={email.isUnread ? "Označit jako přečtené" : "Označit jako nepřečtené"}
          >
            {email.isUnread ? <Mail size={16} /> : <MailOpen size={16} />}
          </button>

          {email.labelIds?.includes('DRAFT') ? (
            <button
              onClick={(e) => { e.stopPropagation(); if (typeof onDraftClick === 'function') onDraftClick(email.id); }}
              className="p-1.5 rounded-md transition-all hover:bg-[#00f3ff]/20 text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]"
              title="Ihned upravit koncept"
            >
              <FileEdit size={16} />
            </button>
          ) : (
            <button
              onClick={(e) => handleToggleStar(email.id, email.isStarred, e)}
              className={`flex items-center justify-center p-1.5 rounded-md transition-all ${email.isStarred ? 'hover:bg-[#f72585]/20' : 'hover:bg-[#f72585]/10'}`}
              title={email.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
            >
              <div className={`w-3.5 h-3.5 rounded-full transition-all ${email.isStarred ? 'bg-[#f72585] shadow-[0_0_8px_#f72585]' : 'border-2 border-slate-500 group-hover:border-[#f72585]/50'}`}></div>
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); if (onSwipeDelete) onSwipeDelete(email); else handleTrashEmail(email, e); }}
            className="p-1.5 rounded-md transition-all hover:bg-[#ef4444]/20 text-slate-500 hover:text-[#ef4444]"
            title="Smazat (Delete)"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
