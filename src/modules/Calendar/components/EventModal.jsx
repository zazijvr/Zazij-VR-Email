import React from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Bell } from 'lucide-react';
import DatePicker from '../../../components/DatePicker';
import TimePicker from '../../../components/TimePicker';
import RichTextEditor from '../../../components/RichTextEditor';
import AutofillInput from '../../../components/AutofillInput';

export default function EventModal({
  isCreateModalOpen,
  handleAttemptCloseCreateModal,
  editEventId,
  newEventForm,
  setNewEventForm,
  handleCreateEvent,
  isCreatingEvent,
  userEmail
}) {
  if (!isCreateModalOpen) return null;
  return createPortal(
      
        <div className="fixed inset-0 z-[1000] flex items-start md:items-center justify-center p-0 md:p-4 bg-black/100 md:bg-black/80 backdrop-blur-md" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          <div 
             className="relative bg-[#0f172a] md:border border-[#00f3ff]/60 shadow-[0_0_80px_rgba(0,243,255,0.3)] md:rounded-3xl w-full h-full md:h-auto max-w-5xl md:max-h-[90vh] overflow-hidden flex flex-col p-3 pt-6 md:p-8 animate-in fade-in zoom-in duration-200 pointer-events-auto"
             onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Ornamenty */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#00f3ff]/10 blur-[60px] pointer-events-none rounded-full" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#f800ff]/10 blur-[60px] pointer-events-none rounded-full" />
            
            <button 
               onClick={handleAttemptCloseCreateModal}
               className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-20 p-2 hover:bg-white/5 rounded-full"
            >
               <X size={20} />
            </button>
            
            <span className="text-[#00f3ff] text-[10px] uppercase font-bold tracking-[0.2em] mb-4 flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff] animate-pulse"></span>
              Nová synchronizace
            </span>
            
            <h2 className="text-2xl md:text-3xl font-black text-white mb-4 md:mb-6 mt-1 md:mt-0 uppercase tracking-widest drop-shadow-md shrink-0 pr-8 md:pr-0">
              {editEventId ? "Úprava události" : "Nová událost"}
            </h2>

            <div className="flex flex-col gap-5 relative z-10 overflow-y-auto pr-2 custom-scrollbar flex-1 mb-2">
               <div>
                 <label className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest mb-1.5 block">Název</label>
                  <input 
                    type="text" 
                    value={newEventForm.title}
                    onChange={e => setNewEventForm(prev => ({...prev, title: e.target.value}))}
                    className="w-full bg-black/50 border border-[#00f3ff]/40 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00f3ff] shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)_inset] transition-all" 
                    placeholder=""
                    autoFocus
                 />
               </div>

               <div className="flex flex-col md:flex-row gap-4 relative z-50">
                 <div className="flex-1">
                   <DatePicker 
                     label="ZAČÁTEK"
                     value={newEventForm.startDate}
                     onChange={(val) => {
                       const newStart = new Date(val);
                       const currentEnd = new Date(newEventForm.endDate);
                       if (newStart > currentEnd) {
                         setNewEventForm(prev => ({...prev, startDate: val, endDate: val}));
                       } else {
                         setNewEventForm(prev => ({...prev, startDate: val}));
                       }
                     }}
                   />
                 </div>
                 <div className="flex-1">
                   <DatePicker 
                     label="KONEC"
                     align="right"
                     value={newEventForm.endDate}
                     onChange={(val) => {
                       const newEnd = new Date(val);
                       const currentStart = new Date(newEventForm.startDate);
                       if (newEnd < currentStart) {
                         setNewEventForm(prev => ({...prev, startDate: val, endDate: val}));
                       } else {
                         setNewEventForm(prev => ({...prev, endDate: val}));
                       }
                     }}
                   />
                 </div>
               </div>

               <div 
                 className="flex items-center gap-3 cursor-pointer group w-fit select-none"
                 onClick={() => setNewEventForm(prev => ({...prev, allDay: !prev.allDay}))}
               >
                  <div className={`w-5 h-5 flex items-center justify-center border rounded transition-all shadow-[0_0_10px_rgba(0,243,255,0.2)] ${newEventForm.allDay ? 'bg-[#00f3ff]/20 border-[#00f3ff] text-[#00f3ff] shadow-[0_0_15px_rgba(0,243,255,0.4)]' : 'bg-black/50 border-[#00f3ff]/40 text-transparent'}`}>
                     <span className="text-[14px] font-black leading-none pb-[2px]">{newEventForm.allDay ? '✓' : ''}</span>
                  </div>
                  <div className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest group-hover:text-white transition-colors">Celý den</div>
               </div>

               {!newEventForm.allDay && (
                 <div className="flex flex-col md:flex-row gap-4 z-40 relative">
                   <div className="flex-1">
                     <TimePicker 
                       label="OD"
                       value={newEventForm.startTime}
                       onChange={val => setNewEventForm(prev => ({...prev, startTime: val}))}
                     />
                   </div>
                   <div className="flex-1">
                     <TimePicker 
                       label="DO"
                       align="right"
                       value={newEventForm.endTime}
                       onChange={val => setNewEventForm(prev => ({...prev, endTime: val}))}
                     />
                   </div>
                 </div>
               )}

               <div className="flex flex-col relative z-30">
                 <label className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest mb-1.5 block">Upozornění</label>
                 <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Výchozí (Google)', value: 'default' },
                      { label: 'Žádné', value: null },
                      { label: '10 min', value: 10 },
                      { label: '30 min', value: 30 },
                      { label: '1 hod', value: 60 },
                      { label: '1 den', value: 1440 }
                    ].map(opt => (
                       <button 
                         key={opt.label}
                         type="button"
                         onClick={() => setNewEventForm(prev => ({...prev, alertMinutes: opt.value}))}
                         className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border uppercase tracking-wider outline-none ${
                            newEventForm.alertMinutes === opt.value 
                              ? 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.4)]'
                              : 'bg-black/50 text-gray-400 border-[#00f3ff]/20 hover:border-[#00f3ff]/50 hover:text-[#00f3ff]'
                         }`}
                       >
                         {opt.label}
                       </button>
                    ))}
                    <button 
                      type="button"
                      onClick={() => {
                        if (['default', null, 10, 30, 60, 1440].includes(newEventForm.alertMinutes)) {
                           setNewEventForm(prev => ({...prev, alertMinutes: 5}));
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border uppercase tracking-wider outline-none ${
                         !['default', null, 10, 30, 60, 1440].includes(newEventForm.alertMinutes)
                           ? 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.4)]'
                           : 'bg-black/50 text-gray-400 border-[#00f3ff]/20 hover:border-[#00f3ff]/50 hover:text-[#00f3ff]'
                      }`}
                    >
                      Vlastní...
                    </button>
                 </div>
                 
                 {(() => {
                    const isPreset = ['default', null, 10, 30, 60, 1440].includes(newEventForm.alertMinutes);
                    if (isPreset) return null;
                    
                    const absMinutes = typeof newEventForm.alertMinutes === 'number' ? Math.abs(newEventForm.alertMinutes) : 5;
                    const customUnit = absMinutes >= 1440 && absMinutes % 1440 === 0 ? 1440 : 
                                       absMinutes >= 60 && absMinutes % 60 === 0 ? 60 : 1;
                    
                    const customVal = newEventForm.alertMinutes < 0 ? '' : (absMinutes / customUnit);

                    return (
                       <div className="flex flex-col md:flex-row gap-4 md:items-center mt-3 bg-gradient-to-r from-[#00f3ff]/10 to-black/40 border border-[#00f3ff]/20 border-l-[3px] border-l-[#00f3ff] py-3 px-5 rounded-r-xl rounded-l-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] w-fit animate-in fade-in slide-in-from-top-2">
                         <Bell className="text-[#00f3ff]/70" size={18} />
                         
                         <div className="relative">
                           <input 
                             type="number" 
                             min="1" 
                             value={customVal !== '' ? customVal : ''}
                             onChange={(e) => {
                                if (e.target.value === '') {
                                   setNewEventForm(prev => ({...prev, alertMinutes: -1 * customUnit}));
                                   return;
                                }
                                let v = parseInt(e.target.value);
                                if (!isNaN(v)) {
                                   v = Math.max(1, v);
                                   setNewEventForm(prev => ({...prev, alertMinutes: v * customUnit}));
                                }
                             }}
                             onBlur={(e) => {
                                if (e.target.value === '') {
                                   setNewEventForm(prev => ({...prev, alertMinutes: 1 * customUnit}));
                                }
                             }}
                             className="w-[3.5rem] bg-transparent border-b-2 border-white/20 hover:border-[#00f3ff]/50 focus:border-[#00f3ff] text-[#00f3ff] px-1 py-1 focus:outline-none focus:shadow-[0_4px_10px_-4px_rgba(0,243,255,0.5)] transition-all text-xl font-black text-center drop-shadow-[0_0_8px_rgba(0,243,255,0.6)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                           />
                         </div>
                         
                         <div className="flex items-center overflow-hidden rounded-lg border border-[#00f3ff]/40 shadow-[0_0_15px_rgba(0,243,255,0.1)]">
                           {[ {l: 'MIN', v: 1}, {l: 'HOD', v: 60}, {l: 'DNY', v: 1440} ].map((u, i) => (
                             <button
                               key={u.l}
                               type="button"
                               onClick={() => setNewEventForm(prev => ({...prev, alertMinutes: (customVal || 1) * u.v}))}
                               className={`px-4 py-2 text-[10px] font-bold transition-all uppercase tracking-widest ${
                                 customUnit === u.v 
                                   ? 'bg-[#00f3ff]/30 text-white shadow-[inset_0_0_12px_rgba(0,243,255,0.4)]' 
                                   : 'bg-black/60 text-gray-500 hover:bg-black/80 hover:text-[#00f3ff]'
                               } ${i > 0 ? 'border-l border-[#00f3ff]/30' : ''}`}
                             >
                               {u.l}
                             </button>
                           ))}
                         </div>
                       </div>
                    );
                 })()}
               </div>

               {/* Opakování */}
               <div className="flex flex-col relative z-20">
                 <label className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest mb-1.5 block">Opakování</label>
                 <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Neopakovat', value: 'NONE' },
                      { label: 'Denně', value: 'DAILY' },
                      { label: 'Týdně', value: 'WEEKLY' },
                      { label: 'Měsíčně', value: 'MONTHLY' },
                      { label: 'Ročně', value: 'YEARLY' },
                      { label: 'Vlastní', value: 'CUSTOM' }
                    ].map(opt => (
                       <button
                         key={opt.value}
                         type="button"
                         onClick={() => setNewEventForm(prev => ({...prev, recurrenceRule: opt.value}))}
                         className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border uppercase tracking-wider outline-none ${
                            newEventForm.recurrenceRule === opt.value 
                              ? 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.4)]'
                              : 'bg-black/50 text-gray-400 border-[#00f3ff]/20 hover:border-[#00f3ff]/50 hover:text-[#00f3ff]'
                         }`}
                       >
                         {opt.label}
                       </button>
                    ))}
                 </div>

                 {newEventForm.recurrenceRule === 'CUSTOM' && (
                    <div className="flex flex-col mt-3 bg-gradient-to-r from-[#00f3ff]/10 to-black/40 border border-[#00f3ff]/20 border-l-[3px] border-l-[#00f3ff] py-4 px-5 rounded-r-xl rounded-l-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] w-full animate-in fade-in slide-in-from-top-2">
                      <div className="flex gap-4 items-center flex-wrap">
                        <span className="text-[#00f3ff] text-xs font-bold uppercase min-w-[130px]">Opakovat každých:</span>
                        
                        <input 
                          type="number" 
                          min="1" 
                          value={newEventForm.recurrenceInterval}
                          onChange={(e) => {
                             let v = parseInt(e.target.value);
                             if (!isNaN(v) && v > 0) {
                                setNewEventForm(prev => ({...prev, recurrenceInterval: v}));
                             } else if (e.target.value === '') {
                                setNewEventForm(prev => ({...prev, recurrenceInterval: ''}));
                             }
                          }}
                          onBlur={(e) => {
                             if (e.target.value === '' || e.target.value <= 0) {
                                setNewEventForm(prev => ({...prev, recurrenceInterval: 1}));
                             }
                          }}
                          className="w-[3.5rem] bg-transparent border-b-2 border-white/20 hover:border-[#00f3ff]/50 focus:border-[#00f3ff] text-[#00f3ff] px-1 py-1 focus:outline-none focus:shadow-[0_4px_10px_-4px_rgba(0,243,255,0.5)] transition-all text-xl font-black text-center drop-shadow-[0_0_8px_rgba(0,243,255,0.6)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <div className="flex items-center overflow-hidden rounded-lg border border-[#00f3ff]/40 shadow-[0_0_15px_rgba(0,243,255,0.1)]">
                          {[ {l: 'DNY', v: 'DAILY'}, {l: 'TÝDNY', v: 'WEEKLY'}, {l: 'MĚSÍCE', v: 'MONTHLY'}, {l: 'ROKY', v: 'YEARLY'} ].map((u, i) => (
                            <button
                              key={u.v}
                              type="button"
                              onClick={() => setNewEventForm(prev => ({...prev, customFreq: u.v}))}
                              className={`px-4 py-2 text-[10px] font-bold transition-all uppercase tracking-widest ${
                                newEventForm.customFreq === u.v 
                                  ? 'bg-[#00f3ff]/30 text-white shadow-[inset_0_0_12px_rgba(0,243,255,0.4)]' 
                                  : 'bg-black/60 text-gray-500 hover:bg-black/80 hover:text-[#00f3ff]'
                              } ${i > 0 ? 'border-l border-[#00f3ff]/30' : ''}`}
                            >
                              {u.l}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-4 items-center flex-wrap w-full border-t border-[#00f3ff]/10 pt-4 mt-4">
                        <span className="text-[#00f3ff] text-xs font-bold uppercase min-w-[130px]">Zrušit opakování:</span>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center overflow-hidden rounded-lg border border-[#00f3ff]/40 shadow-[0_0_15px_rgba(0,243,255,0.1)]">
                            <button
                               type="button"
                               onClick={() => setNewEventForm(prev => ({...prev, recurrenceUntil: ''}))}
                               className={`px-4 py-2 text-[10px] font-bold transition-all uppercase tracking-widest ${
                                  !newEventForm.recurrenceUntil ? 'bg-[#00f3ff]/30 text-white shadow-[inset_0_0_12px_rgba(0,243,255,0.4)]' : 'bg-black/60 text-gray-500 hover:bg-black/80 hover:text-[#00f3ff]'
                               }`}
                            >
                               NIKDY
                            </button>
                            <button
                               type="button"
                               onClick={() => !newEventForm.recurrenceUntil && setNewEventForm(prev => ({...prev, recurrenceUntil: prev.startDate}))}
                               className={`border-l border-[#00f3ff]/30 px-4 py-2 text-[10px] font-bold transition-all uppercase tracking-widest ${
                                  newEventForm.recurrenceUntil ? 'bg-[#00f3ff]/30 text-white shadow-[inset_0_0_12px_rgba(0,243,255,0.4)]' : 'bg-black/60 text-gray-500 hover:bg-black/80 hover:text-[#00f3ff]'
                               }`}
                            >
                               K DATU
                            </button>
                          </div>

                          {newEventForm.recurrenceUntil && (
                            <input 
                               type="date"
                               value={newEventForm.recurrenceUntil}
                               onChange={(e) => setNewEventForm(prev => ({...prev, recurrenceUntil: e.target.value}))}
                               className="bg-black/50 border border-[#00f3ff]/40 hover:border-[#00f3ff] rounded-lg px-3 py-1.5 text-[#00f3ff] font-bold focus:text-white focus:outline-none focus:shadow-[0_0_10px_rgba(0,243,255,0.3)] transition-all font-mono text-xs w-[130px] [color-scheme:dark] animate-in slide-in-from-left-2 fade-in"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                 )}
               </div>

               <div className="flex flex-col relative z-20 mt-2 mb-2">
                 <AutofillInput 
                   label="Hosté (e-maily oddělené čárkou)"
                   value={newEventForm.attendees || ''}
                   onChange={e => setNewEventForm(prev => ({...prev, attendees: e.target.value}))}
                   className="w-full bg-black/50 border border-[#00f3ff]/40 rounded-xl px-4 py-2 text-sm text-[#00f3ff] font-mono focus:outline-none focus:border-[#00f3ff] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)_inset] transition-all" 
                   placeholder=""
                   userEmail={userEmail}
                 />
               </div>

               <div className="flex flex-col mt-2 flex-1 shrink-0 min-h-[150px] md:min-h-[300px] relative z-10 pb-4">
                 <label className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest mb-1.5 block">Popis</label>
                 <RichTextEditor 
                   value={newEventForm.description} 
                   onChange={(desc) => setNewEventForm(prev => ({...prev, description: desc}))} 
                   className="flex-1 w-full"
                   hideImageUpload={true}
                 />
               </div>
            </div>

            <div className="mt-2 md:mt-4 shrink-0 flex justify-end gap-3 relative z-10 pt-3 md:pt-4 border-t border-white/10 mb-2 md:mb-0">
              <button 
                onClick={handleCreateEvent}
                className="w-full md:w-auto justify-center px-6 py-3.5 md:py-3 rounded-xl bg-[#00f3ff]/20 text-[#00f3ff] font-bold uppercase tracking-widest text-[13px] md:text-xs border border-[#00f3ff]/50 transition-all shadow-[0_0_15px_rgba(0,243,255,0.2)] hover:bg-[#00f3ff]/40 hover:shadow-[0_0_25px_rgba(0,243,255,0.5)] flex items-center gap-2"
                disabled={isCreatingEvent}
              >
                {isCreatingEvent ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                {editEventId ? "ULOŽIT ZMĚNY" : "AKTIVOVAT"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
