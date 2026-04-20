import React, { useState, useRef } from 'react';
import { CheckSquare, Square, Mail, MailOpen, FileEdit, Star, Trash2, Paperclip, Check, Reply } from 'lucide-react';
import { getAvatarInitial } from '../utils/emailParser';

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
        className={`relative flex flex-col md:flex-row md:items-center px-4 py-4 md:py-3 rounded-xl cursor-pointer select-none border overflow-hidden ${email._newArrival ? 'animate-new-email ' : ''}${isKeyboardFocus && !isActiveRow ? 'md:bg-white/[0.08] md:border-white/20 md:shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10 ' : ''}${isActiveRow
            ? 'bg-gradient-to-r from-[#00f3ff]/20 to-[#00f3ff]/5 border-[#00f3ff] md:shadow-[0_0_20px_rgba(0,243,255,0.2)]'
            : email.isUnread
              ? 'bg-black/30 md:bg-transparent md:bg-gradient-to-r md:from-[#00f3ff]/10 md:to-transparent border-[#00f3ff]/30 md:hover:border-[#00f3ff]/60 shadow-[inset_3px_0_0_#00f3ff]'
              : 'bg-black/30 md:bg-white/[0.02] border-white/5 md:hover:bg-white/[0.08] md:hover:border-white/20 shadow-[0_4px_15px_rgba(0,0,0,0.5)] md:shadow-none'
          }`}
      >
        {/* Checkbox (Desktop only) */}
        <div 
          className="hidden md:flex w-[40px] pr-2 justify-center items-center text-[#00f3ff] opacity-80 hover:opacity-100 transition-opacity z-10" 
          onClick={(e) => toggleSelectEmail(email.id, e)}
        >
          {selectedMailIds.has(email.id) ? <CheckSquare size={18} /> : <Square size={18} className="opacity-40 group-hover:opacity-100" />}
        </div>

        {/* Sender / Initial */}
        <div className="flex w-full md:w-[20%] items-center mb-1 md:mb-0 shrink-0">
          <div 
            onClick={(e) => { e.stopPropagation(); toggleSelectEmail(email.id, e); }}
            className={`md:hidden relative flex-shrink-0 w-10 h-10 mr-3 transition-transform duration-500 [transform-style:preserve-3d] ${isMultiSelected ? '[transform:rotateY(180deg)]' : ''}`}
          >
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#00f3ff]/20 to-[#f800ff]/20 border border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.2)] [backface-visibility:hidden]">
              <span className="font-black text-lg text-[#00f3ff]">
                 {getAvatarInitial(activeFolder === 'Odeslané' ? email.to : email.from)}
              </span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#00f3ff] shadow-[0_0_15px_rgba(0,243,255,0.6)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <Check className="text-black" size={20} strokeWidth={4} />
            </div>
          </div>
          <div className={`font-bold truncate w-full md:pr-4 flex items-center gap-2 ${email.isUnread || isActiveRow ? 'text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.4)]' : 'text-gray-200'}`}>
            <div className="flex items-center gap-1.5 shrink-0">
              {email.isUnread && (
                <span className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]" title="Nepřečteno"></span>
              )}
              {email.isStarred && (
                <span className="md:hidden w-2 h-2 rounded-full bg-[#f800ff] shadow-[0_0_8px_#f800ff]" title="Důležité"></span>
              )}
            </div>
            <span className="truncate">{activeFolder === 'Odeslané' ? email.to : email.from}</span>
            <span className="md:hidden ml-auto flex-shrink-0 text-xs text-[#00f3ff]/60 font-normal">
              {email.dateText && email.dateText !== 'Dnes' ? email.dateText : email.timeText}
            </span>
          </div>
        </div>

        {/* Subject and Snippet */}
        <div className="flex-1 md:pr-4 flex flex-col overflow-hidden w-full pl-[52px] md:pl-0 mt-0.5 md:mt-0">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm ${email.isUnread || isActiveRow ? 'text-white font-bold' : 'text-gray-300 font-semibold'}`}>
              {email.subject}
            </span>
          </div>
          {email.snippet?.startsWith('↩️ ') ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate mt-[1px]">
               <Reply size={14} className="text-[#00f3ff] shrink-0 drop-shadow-[0_0_5px_rgba(0,243,255,0.6)]" />
               <span className="text-xs text-gray-500 truncate group-hover:text-gray-400 transition-colors">
                 {email.snippet.replace('↩️ ', '')}
               </span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 truncate group-hover:text-gray-400 transition-colors mt-[1px]">
              {email.snippet}
            </span>
          )}
        </div>

        {/* Desktop Specific */}
        <div className={`hidden md:flex w-[150px] text-right pr-4 whitespace-nowrap flex-col justify-center items-end leading-tight ${email.isUnread || isActiveRow ? 'text-[#00f3ff]' : 'text-gray-400'}`}>
          {email.dateText && <span className="text-[10px] opacity-60 tracking-wider mb-0.5">{email.dateText}</span>}
          <span className={`font-bold tracking-widest ${email.dateText ? 'text-xs' : 'text-sm'}`}>{email.timeText}</span>
        </div>

        <div className="hidden md:block w-[120px] pr-4 text-right text-xs text-gray-400 whitespace-nowrap">
          {email.sizeText}
        </div>

        <div className="hidden md:flex w-[60px] justify-center text-gray-400">
          {email.hasAttachment && <Paperclip size={16} className={email.isUnread || isSelected ? 'text-[#00f3ff]/80' : 'text-gray-500'} />}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex w-[110px] justify-end gap-1 pr-2 shrink-0">
          <button
            onClick={(e) => handleToggleRead(email.id, email.isUnread, e)}
            className={`p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 ${email.isUnread ? 'hover:bg-[#00f3ff]/20 text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]' : 'hover:bg-white/10 text-gray-500 hover:text-white'}`}
            title={email.isUnread ? "Označit jako přečtené" : "Označit jako nepřečtené"}
          >
            {email.isUnread ? <Mail size={16} /> : <MailOpen size={16} />}
          </button>

          {email.labelIds?.includes('DRAFT') ? (
            <button
              onClick={(e) => { e.stopPropagation(); if (typeof onDraftClick === 'function') onDraftClick(email.id); }}
              className="p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-[#00f3ff]/20 text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]"
              title="Ihned upravit koncept"
            >
              <FileEdit size={16} />
            </button>
          ) : (
            <button
              onClick={(e) => handleToggleStar(email.id, email.isStarred, e)}
              className={`flex items-center justify-center p-1.5 rounded-md transition-all ${email.isStarred ? 'opacity-100 hover:bg-[#f800ff]/20' : 'opacity-0 group-hover:opacity-100 hover:bg-[#f800ff]/10'}`}
              title={email.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
            >
              <div className={`w-3.5 h-3.5 rounded-full transition-all ${email.isStarred ? 'bg-[#f800ff] shadow-[0_0_8px_#f800ff] animate-pulse' : 'border-2 border-gray-500 group-hover:border-[#f800ff]/50'}`}></div>
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); if (onSwipeDelete) onSwipeDelete(email); else handleTrashEmail(email, e); }}
            className="p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-[#ef4444]/20 text-gray-500 hover:text-[#ef4444]"
            title="Smazat (Delete)"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
