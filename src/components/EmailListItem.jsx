import React from 'react';
import { CheckSquare, Square, Mail, MailOpen, FileEdit, Star, Trash2, Paperclip } from 'lucide-react';

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
  handleTrashEmail
}) {
  const isSelected = selectedEmailId === email.id;
  const isMultiSelected = selectedMailIds.has(email.id);
  const isActiveRow = isSelected || isMultiSelected;
  const isKeyboardFocus = keyboardIndex === index;

  return (
                <div
                  id={`email-row-${email.id}`}
                  key={email.id}
                  draggable={draggableEmailId === email.id}
                  onPointerDown={() => { handlePointerDown(email.id); setKeyboardIndex(index); }}
                  onPointerUp={clearDragTimer}
                  onPointerLeave={clearDragTimer}
                  onPointerCancel={clearDragTimer}
                  onDragEnd={(e) => {
                    handleDragEnd();
                    if (e.dataTransfer.dropEffect !== 'none') {
                      if (selectedMailIds.has(email.id)) {
                        setSelectedMailIds(new Set());
                      }
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
                      
                      const dragVisual = document.createElement('div');
                      dragVisual.className = 'bg-[#0f172a] border border-[#00f3ff] rounded-xl p-3 text-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.4)] flex items-center font-black tracking-widest absolute -left-[9999px]';
                      dragVisual.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-3"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>PŘESOUVÁTE ${selectedMailIds.size} ZPRÁV`;
                      document.body.appendChild(dragVisual);
                      e.dataTransfer.setDragImage(dragVisual, 20, 20);
                      setTimeout(() => {
                        if (document.body.contains(dragVisual)) {
                           document.body.removeChild(dragVisual);
                        }
                      }, 0);
                    } else {
                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'EMAIL', id: email.id, sourceLabel: activeFolder, emailData: email }));
                    }
                  }}
                  onClick={() => { handleEmailClick(email); setKeyboardIndex(index); }}
                  className={`flex items-center px-4 py-3 rounded-xl cursor-pointer select-none transition-all border group relative overflow-hidden ${email._newArrival ? 'animate-new-email ' : ''}${isKeyboardFocus && !isActiveRow ? 'bg-white/[0.08] border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10 ' : ''}${isActiveRow
                      ? 'bg-gradient-to-r from-[#00f3ff]/20 to-[#00f3ff]/5 border-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.2)]'
                      : email.isUnread
                        ? 'bg-gradient-to-r from-[#00f3ff]/10 to-transparent border-[#00f3ff]/30 hover:border-[#00f3ff]/60 shadow-[inset_3px_0_0_#00f3ff]'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                >
                  <div 
                    className="w-[40px] pr-2 flex justify-center items-center text-[#00f3ff] opacity-80 hover:opacity-100 transition-opacity z-10" 
                    onClick={(e) => toggleSelectEmail(email.id, e)}
                  >
                    {selectedMailIds.has(email.id) ? <CheckSquare size={18} /> : <Square size={18} className="opacity-40 group-hover:opacity-100" />}
                  </div>

                  {/* Sender OR Recipient (if Sent folder) */}
                  <div className={`w-[20%] pr-4 font-bold truncate shrink-0 ${email.isUnread || isActiveRow ? 'text-[#00f3ff] drop-shadow-[0_0_5px_rgba(0,243,255,0.4)]' : 'text-gray-200'}`}>
                    {activeFolder === 'Odeslané' ? (
                      email.to
                    ) : (
                      email.from
                    )}
                  </div>

                  {/* Subject and Snippet */}
                  <div className="flex-1 pr-4 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm ${email.isUnread || isActiveRow ? 'text-white font-bold' : 'text-gray-300 font-semibold'}`}>
                        {email.subject}
                      </span>
                      {email.isUnread && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]"></span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 truncate group-hover:text-gray-400 transition-colors">
                      {email.snippet}
                    </span>
                  </div>

                  {/* Date / Time */}
                  <div className={`w-[150px] text-right pr-4 whitespace-nowrap flex flex-col justify-center items-end leading-tight ${email.isUnread || isActiveRow ? 'text-[#00f3ff]' : 'text-gray-400'}`}>
                    {email.dateText && <span className="text-[10px] opacity-60 tracking-wider mb-0.5">{email.dateText}</span>}
                    <span className={`font-bold tracking-widest ${email.dateText ? 'text-xs' : 'text-sm'}`}>{email.timeText}</span>
                  </div>

                  {/* Size */}
                  <div className="w-[120px] pr-4 text-right text-xs text-gray-400 whitespace-nowrap">
                    {email.sizeText}
                  </div>

                  {/* Attachment */}
                  <div className="w-[60px] flex justify-center text-gray-400">
                    {email.hasAttachment && <Paperclip size={16} className={email.isUnread || isSelected ? 'text-[#00f3ff]/80' : 'text-gray-500'} />}
                  </div>

                  {/* Actions (Toggle Read + Trash) */}
                  <div className="w-[110px] flex justify-end gap-1 pr-2 shrink-0">
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
                        className={`p-1.5 rounded-md transition-all ${email.isStarred ? 'opacity-100 text-[#f800ff] hover:text-[#f800ff] hover:bg-[#f800ff]/20 drop-shadow-[0_0_8px_rgba(248,0,255,0.8)]' : 'opacity-0 group-hover:opacity-100 hover:bg-[#f800ff]/10 text-gray-500 hover:text-[#f800ff]'}`}
                        title={email.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
                      >
                        <Star size={16} fill={email.isStarred ? "currentColor" : "none"} />
                      </button>
                    )}

                    <button
                      onClick={(e) => handleTrashEmail(email, e)}
                      className="p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-[#ef4444]/20 text-gray-500 hover:text-[#ef4444]"
                      title="Smazat (Delete)"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
  );
}
