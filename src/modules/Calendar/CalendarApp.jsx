import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EventModal from './components/EventModal';
import AgendaView from './components/AgendaView';
import MonthView from './components/MonthView';
import EventDetailView from './components/EventDetailView';
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, Loader2, Search, X, Edit2, Trash2, Bell, AlertTriangle, Repeat, ArrowLeft } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import RichTextEditor from '../../components/RichTextEditor';
import DatePicker from '../../components/DatePicker';
import TimePicker from '../../components/TimePicker';

export default function CalendarApp({
  activeCalendarView,
  googleToken,
  triggerCreateEvent,
  userEmail
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [previewRecurrenceText, setPreviewRecurrenceText] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [displayedAgendaCount, setDisplayedAgendaCount] = useState(7);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [appError, setAppError] = useState(null);
  const [specialCalsTrigger, setSpecialCalsTrigger] = useState(0);
  const [selectedCalDay, setSelectedCalDay] = useState(null); // Date object

  useEffect(() => {
    const handleMobileSearch = (e) => {
       setSearchQuery(e.detail);
       setAgendaSearch(e.detail);
    };
    window.addEventListener('vr-mobile-search-query-change', handleMobileSearch);
    return () => window.removeEventListener('vr-mobile-search-query-change', handleMobileSearch);
  }, []);

  useEffect(() => {
    const handler = () => setSpecialCalsTrigger(prev => prev + 1);
    window.addEventListener('zazijvr_special_cals_changed', handler);
    return () => window.removeEventListener('zazijvr_special_cals_changed', handler);
  }, []);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editEventId, setEditEventId] = useState(null);
  const [showEventCloseWarning, setShowEventCloseWarning] = useState(false);
  const [initialEventFormStr, setInitialEventFormStr] = useState(null);
  const [newEventForm, setNewEventForm] = useState({
    title: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '11:00',
    allDay: false,
    description: '',
    alertMinutes: 'default',
    recurrenceRule: 'NONE', // NONE, DAILY, WEEKLY, MONTHLY, YEARLY, CUSTOM
    recurrenceInterval: 1,
    customFreq: 'WEEKLY',
    recurrenceUntil: '', // YYYY-MM-DD
    attendees: ''
  });

  const monthNames = ["LEDEN", "ÚNOR", "BŘEZEN", "DUBEN", "KVĚTEN", "ČERVEN", "ČERVENEC", "SRPEN", "ZÁŘÍ", "ŘÍJEN", "LISTOPAD", "PROSINEC"];
  const currentMonthName = monthNames[currentDate.getMonth()];
  const currentYear = currentDate.getFullYear();

  const handleAttemptCloseCreateModal = () => {
    let isDirty = false;
    
    // Pomocná funkce s normováním textu z RichTextEditoru
    const normalizeDesc = (html) => {
        if (!html) return '';
        const stripped = html.replace(/<[^>]*>?/gm, '').trim();
        return stripped === '' ? '' : html;
    };

    if (initialEventFormStr) {
       const initForm = JSON.parse(initialEventFormStr);
       const currentNorm = { ...newEventForm, description: normalizeDesc(newEventForm.description) };
       const initNorm = { ...initForm, description: normalizeDesc(initForm.description) };
       
       if (JSON.stringify(currentNorm) !== JSON.stringify(initNorm)) {
           isDirty = true;
       }
    }

    if (isDirty) {
       setShowEventCloseWarning(true);
    } else {
       setIsCreateModalOpen(false);
    }
  };

  const openCreateForDay = (dateObj) => {
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
    setEditEventId(null);
    const baseForm = {
      title: '',
      startDate: dateStr,
      endDate: dateStr,
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      description: '',
      alertMinutes: 'default',
      recurrenceRule: 'NONE',
      recurrenceInterval: 1,
      customFreq: 'WEEKLY',
      recurrenceUntil: '',
      attendees: ''
    };
    setNewEventForm(baseForm);
    setInitialEventFormStr(JSON.stringify(baseForm));
    setSelectedCalDay(null);
    setIsCreateModalOpen(true);
  };

  // Uzavírání modálů přes klávesu Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showEventCloseWarning) {
           setShowEventCloseWarning(false);
        } else if (isCreateModalOpen) {
           handleAttemptCloseCreateModal();
        } else if (selectedEvent) {
           setSelectedEvent(null);
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isCreateModalOpen, selectedEvent, showEventCloseWarning, newEventForm, editEventId]);

  // API Synchronizace událostí
  useEffect(() => {
    if (!googleToken) {
      setEvents([]);
      return;
    }
    
    // Ohraničení pro dotaz dle aktivního okna
    let timeMin, timeMax;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (activeCalendarView === 'Co mě čeká?') {
       // Pro agendu stahujeme od dnešní půlnoci až rok dopředu (max 250 záznamů)
       const today = new Date();
       today.setHours(0,0,0,0);
       timeMin = today.toISOString();
       
       const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
       timeMax = nextYear.toISOString();
    } else {
       // Pro měsíční pohled: +14 dní před a po, aby přetékající dny z min/příštího měsíce měly eventy
       const firstDay = new Date(year, month, 1);
       firstDay.setDate(firstDay.getDate() - 14);
       timeMin = firstDay.toISOString();
       
       const lastDay = new Date(year, month + 1, 0, 23, 59, 59);
       lastDay.setDate(lastDay.getDate() + 14);
       timeMax = lastDay.toISOString();
    }

    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        const primaryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
        const fetches = [
           fetch(primaryUrl, { headers: { Authorization: `Bearer ${googleToken}` } })
        ];

        let specialCals = { cz_holidays: false };
        try { specialCals = JSON.parse(localStorage.getItem('zazijvr_special_calendars')) || {}; } catch(e) {}
        
        if (specialCals.cz_holidays) {
           const holidayUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent('cs.czech#holiday@group.v.calendar.google.com')}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=50`;
           fetches.push(fetch(holidayUrl, { headers: { Authorization: `Bearer ${googleToken}` } }));
        }

        const responses = await Promise.all(fetches);
        
        let allItems = [];
        let hasError = false;
        let lastErrorStatus = 200;

        for (const res of responses) {
           if (res.ok) {
              const data = await res.json();
              if (data.items) {
                 data.items.forEach(item => {
                    if (item.organizer && item.organizer.email.includes('holiday')) {
                       item.colorId = '10'; // Basil (Dovolenkové zelené)
                       item.isHoliday = true;
                    }
                    allItems.push(item);
                 });
              }
           } else {
              hasError = true;
              lastErrorStatus = res.status;
           }
        }
        
        if (!hasError || allItems.length > 0) {
          let parsed = allItems.map(item => {
             const isAllDay = !!item.start.date;
             const startStr = item.start.dateTime || item.start.date;
             const endStr = item.end?.dateTime || item.end?.date || startStr;
             
             let startDateObj;
             let endDateObj;

             if (isAllDay) {
                // Fix pro celodenní události: parsovat lokalně, nikoliv UTC!
                const [sY, sM, sD] = startStr.split('T')[0].split('-');
                startDateObj = new Date(parseInt(sY), parseInt(sM) - 1, parseInt(sD), 0, 0, 0);
                
                if (item.end?.date) {
                   const [eY, eM, eD] = item.end.date.split('-');
                   // Google API vrací "exkluzivní" další den, např konec na 16. pokud je to 15.
                   endDateObj = new Date(parseInt(eY), parseInt(eM) - 1, parseInt(eD), 0, 0, 0);
                   endDateObj = new Date(endDateObj.getTime() - 1); // ustřihne milisekundu, vrátí ho do 23:59:59 dne předtím
                } else {
                   endDateObj = new Date(startDateObj.getTime() + 86399999);
                }
             } else {
                startDateObj = new Date(startStr);
                endDateObj = new Date(endStr);
             }
             let alertMins = 'default';
             if (item.reminders && typeof item.reminders.useDefault !== 'undefined') {
                if (item.reminders.useDefault === false) {
                   if (item.reminders.overrides && item.reminders.overrides.length > 0) {
                      const popup = item.reminders.overrides.find(r => r.method === 'popup');
                      if (popup) alertMins = popup.minutes;
                      else alertMins = null;
                   } else {
                      alertMins = null;
                   }
                }
             }

             return {
                id: item.id,
                recurringEventId: item.recurringEventId || null,
                title: item.summary || 'Bez názvu',
                fullDate: startDateObj,
                endDate: endDateObj,
                colorId: item.colorId,
                description: item.description || '',
                location: item.location || '',
                isAllDay: isAllDay,
                alertMinutes: alertMins,
                attendees: item.attendees || []
             };
          });

          // Deduplikace: odstraň eventy se stejným jménem a naprosto steným start časem (bug v API fetch, nebo duplikátní kontakty v Google)
          const seen = new Set();
          parsed = parsed.filter(ev => {
             const key = `${ev.title}_${ev.fullDate.getTime()}`;
             if (seen.has(key)) return false;
             seen.add(key);
             return true;
          });

          setEvents(parsed);
        } else {
           setAppError("API error: " + lastErrorStatus);
        }
      } catch (err) {
        setAppError("Calendar fetch error: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [currentDate, googleToken, refreshTrigger, activeCalendarView, specialCalsTrigger]);

  const lastTriggerRef = React.useRef(triggerCreateEvent);

  useEffect(() => {
    if (triggerCreateEvent > lastTriggerRef.current) {
      setEditEventId(null);
      const todayStr = new Date().toISOString().split('T')[0];
      const baseForm = {
         title: '',
         startDate: todayStr,
         endDate: todayStr,
         startTime: '10:00',
         endTime: '11:00',
         allDay: false,
         description: '',
         alertMinutes: 'default',
         recurrenceRule: 'NONE',
         recurrenceInterval: 1,
         customFreq: 'WEEKLY',
         recurrenceUntil: '',
         attendees: ''
      };
      setNewEventForm(baseForm);
      setInitialEventFormStr(JSON.stringify(baseForm));
      setIsCreateModalOpen(true);
      lastTriggerRef.current = triggerCreateEvent;
    }
  }, [triggerCreateEvent]);

  // Sledování notifikací na pozadí
  const notifiedEventsRef = React.useRef(new Set());
  const startedEventsRef = React.useRef(new Set());
  
  useEffect(() => {
     if (!events || events.length === 0) return;
     
     const checkReminders = async () => {
        const nowMs = Date.now();
        
        let permissionGranted = await isPermissionGranted();
        const ensurePermission = async () => {
           if (!permissionGranted) {
               const permission = await requestPermission();
               permissionGranted = permission === 'granted';
           }
           return permissionGranted;
        };

        for (const ev of events) {
           const startMs = ev.fullDate.getTime();

           // 1. UPOZORNĚNÍ PŘED ZAČÁTKEM
           let effectiveMinutes = ev.alertMinutes;
           if (effectiveMinutes === 'default') effectiveMinutes = 10; 
           
           if (effectiveMinutes !== null && !notifiedEventsRef.current.has(ev.id)) {
               const alertTimeMs = startMs - (effectiveMinutes * 60 * 1000);
               const diff = nowMs - alertTimeMs;
               
               if (diff >= 0 && diff < 5 * 60 * 1000) {
                  notifiedEventsRef.current.add(ev.id);
                  if (await ensurePermission()) {
                     sendNotification({
                        title: 'ZažijVR Kalendář',
                        body: `Událost začíná za ${effectiveMinutes} min:\n${ev.title}`,
                        actionTypeId: 'event_alert',
                        sound: 'message-new-instant' 
                     });
                  }
               }
           }

           // 2. UPOZORNĚNÍ NA ZAČÁTEK UDÁLOSTI (Automatické)
           if (!startedEventsRef.current.has(ev.id)) {
               const startDiff = nowMs - startMs;
               if (startDiff >= 0 && startDiff < 5 * 60 * 1000) {
                  startedEventsRef.current.add(ev.id);
                  if (await ensurePermission()) {
                     sendNotification({
                        title: 'ZažijVR Kalendář',
                        body: `Nyní začíná:\n${ev.title}`,
                        actionTypeId: 'event_start',
                        sound: 'message-new-instant' 
                     });
                  }
               }
           }
        }
     };

     checkReminders();
     const intervalId = setInterval(checkReminders, 60000); // Kontrola každou minutu
     
     return () => clearInterval(intervalId);
  }, [events]);

  useEffect(() => {
    if (!selectedEvent || !selectedEvent.recurringEventId || !googleToken) {
      setPreviewRecurrenceText(null);
      return;
    }
    
    setPreviewRecurrenceText('Načítání...');
    
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${selectedEvent.recurringEventId}`, {
       headers: { Authorization: `Bearer ${googleToken}` }
    })
    .then(res => res.json())
    .then(data => {
       if (data.recurrence && data.recurrence.length > 0) {
          const rruleStr = data.recurrence[0];
          const paramMap = {};
          rruleStr.replace('RRULE:', '').split(';').forEach(p => {
              const [k, v] = p.split('=');
              paramMap[k] = v;
          });
          
          let text = '';
          const intv = paramMap['INTERVAL'] ? parseInt(paramMap['INTERVAL']) : 1;
          const mapFreq = {
             'DAILY': intv > 1 ? `Každých ${intv} dní` : 'Denně',
             'WEEKLY': intv > 1 ? `Každé ${intv} týdny` : 'Týdně',
             'MONTHLY': intv > 1 ? `Každé ${intv} měsíce` : 'Měsíčně',
             'YEARLY': intv > 1 ? `Každé ${intv} roky` : 'Ročně'
          };
          if (paramMap['FREQ'] && mapFreq[paramMap['FREQ']]) {
             text = mapFreq[paramMap['FREQ']];
          } else {
             text = 'Vlastní opakování';
          }
          if (paramMap['UNTIL']) {
             const u = paramMap['UNTIL'];
             const edTxt = `${parseInt(u.substring(6,8))}. ${parseInt(u.substring(4,6))}. ${u.substring(0,4)}`;
             text += ` (Konec: ${edTxt})`;
          }
          setPreviewRecurrenceText(text);
       } else {
          setPreviewRecurrenceText('Neznámé cyklování');
       }
    })
    .catch(() => setPreviewRecurrenceText('Aktivní (součást série)'));
    
  }, [selectedEvent, googleToken]);

  const handleCreateEvent = async () => {
    if (!googleToken) {
       setAppError("Bez spojení s Googlem nelze ukládat události.");
       return;
    }
    if (!newEventForm.title.trim()) {
       setAppError("Prosím, vyplňte alespoň název události.");
       return;
    }
    
    setIsCreatingEvent(true);
    const eventBody = { 
       summary: newEventForm.title,
       description: newEventForm.description
    };
    
    if (newEventForm.attendees && newEventForm.attendees.trim() !== '') {
       eventBody.attendees = newEventForm.attendees.split(',').map(email => ({ email: email.trim() })).filter(obj => obj.email !== '');
    }

    if (newEventForm.alertMinutes === 'default') {
       eventBody.reminders = { useDefault: true };
    } else if (newEventForm.alertMinutes === null) {
       eventBody.reminders = { useDefault: false, overrides: [] };
    } else {
       eventBody.reminders = { 
          useDefault: false, 
          overrides: [{ method: 'popup', minutes: newEventForm.alertMinutes }] 
       };
    }
    
    if (newEventForm.allDay) {
      eventBody.start = { date: newEventForm.startDate };
      const y = parseInt(newEventForm.endDate.split('-')[0]);
      const m = parseInt(newEventForm.endDate.split('-')[1]) - 1;
      const d = parseInt(newEventForm.endDate.split('-')[2]);
      const endD = new Date(y, m, d);
      endD.setDate(endD.getDate() + 1);
      const pad = (n) => n.toString().padStart(2, '0');
      eventBody.end = { date: `${endD.getFullYear()}-${pad(endD.getMonth()+1)}-${pad(endD.getDate())}` };
    } else {
      const startDateTime = new Date(`${newEventForm.startDate}T${newEventForm.startTime}:00`).toISOString();
      const endDateTime = new Date(`${newEventForm.endDate}T${newEventForm.endTime}:00`).toISOString();
      eventBody.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      eventBody.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    
    if (newEventForm.recurrenceRule && newEventForm.recurrenceRule !== 'NONE') {
      let freq = newEventForm.recurrenceRule;
      let interval = 1;

      if (freq === 'CUSTOM') {
         freq = newEventForm.customFreq || 'WEEKLY';
         interval = newEventForm.recurrenceInterval || 1;
      }
      
      let rrule = `RRULE:FREQ=${freq}`;
      if (interval > 1) {
         rrule += `;INTERVAL=${interval}`;
      }
      if (newEventForm.recurrenceUntil) {
         const uDate = new Date(newEventForm.recurrenceUntil);
         uDate.setUTCHours(23, 59, 59);
         const pad = (n) => n.toString().padStart(2, '0');
         const dateString = `${uDate.getUTCFullYear()}${pad(uDate.getUTCMonth()+1)}${pad(uDate.getUTCDate())}T${pad(uDate.getUTCHours())}${pad(uDate.getUTCMinutes())}${pad(uDate.getUTCSeconds())}Z`;
         rrule += `;UNTIL=${dateString}`;
      }
      eventBody.recurrence = [rrule];
    }

    try {
      const url = editEventId 
        ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${editEventId}?sendUpdates=all`
        : "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all";
      const method = editEventId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: {
          "Authorization": `Bearer ${googleToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(eventBody)
      });
      
      if (res.ok) {
        setRefreshTrigger(prev => prev + 1);
        setIsCreateModalOpen(false);
        setEditEventId(null);
        const todayStr = new Date().toISOString().split('T')[0];
        setNewEventForm({
           title: '',
           startDate: todayStr,
           endDate: todayStr,
           startTime: '10:00',
           endTime: '11:00',
           allDay: false,
           description: '',
           alertMinutes: 'default',
           attendees: ''
        });
      } else {
        setAppError("Něco se pokazilo při komunikaci s Google API.");
      }
    } catch (err) {
      setAppError("Naše komunikace narazila na technickou chybu sítě.");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleEditSelectedEvent = async () => {
     let rootEventId = selectedEvent.id;
     let rr = 'NONE';
     let freq = 'WEEKLY';
     let inv = 1;
     let untilVal = '';

     if (selectedEvent.recurringEventId) {
       rootEventId = selectedEvent.recurringEventId;
       try {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${rootEventId}`, {
             headers: { Authorization: `Bearer ${googleToken}` }
          });
          if (res.ok) {
             const data = await res.json();
             if (data.recurrence && data.recurrence.length > 0) {
                const rruleStr = data.recurrence[0];
                const parts = rruleStr.replace('RRULE:', '').split(';');
                const paramMap = {};
                parts.forEach(p => {
                    const [k, v] = p.split('=');
                    paramMap[k] = v;
                });
                
                if (paramMap['FREQ']) {
                    const f = paramMap['FREQ'];
                    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(f) && (!paramMap['INTERVAL'] || paramMap['INTERVAL'] === '1')) {
                       rr = f;
                    } else {
                       rr = 'CUSTOM';
                       freq = f;
                       inv = paramMap['INTERVAL'] ? parseInt(paramMap['INTERVAL']) : 1;
                    }
                }
                if (paramMap['UNTIL']) {
                    const u = paramMap['UNTIL'];
                    // 20260425T100000Z -> 2026-04-25
                    untilVal = `${u.substring(0,4)}-${u.substring(4,6)}-${u.substring(6,8)}`;
                }
             }
          }
       } catch (err) {
          console.error("Failed to parse ROOT RRULE", err);
       }
     }

     setEditEventId(rootEventId);
     
     const sy = selectedEvent.fullDate.getFullYear();
     const sm = (selectedEvent.fullDate.getMonth() + 1).toString().padStart(2, '0');
     const sd = selectedEvent.fullDate.getDate().toString().padStart(2, '0');
     const st = selectedEvent.fullDate.toTimeString().substring(0, 5);

     const ey = selectedEvent.endDate.getFullYear();
     const em = (selectedEvent.endDate.getMonth() + 1).toString().padStart(2, '0');
     const ed = selectedEvent.endDate.getDate().toString().padStart(2, '0');
     const et = selectedEvent.endDate.toTimeString().substring(0, 5);

     const baseForm = {
        title: selectedEvent.title,
        startDate: `${sy}-${sm}-${sd}`,
        endDate: `${ey}-${em}-${ed}`,
        startTime: st,
        endTime: et,
        allDay: selectedEvent.isAllDay,
        description: selectedEvent.description,
        alertMinutes: selectedEvent.alertMinutes,
        recurrenceRule: rr,
        customFreq: freq,
        recurrenceInterval: inv,
        recurrenceUntil: untilVal,
        attendees: selectedEvent.attendees ? selectedEvent.attendees.map(a => a.email).join(', ') : ''
     };
     setNewEventForm(baseForm);
     setInitialEventFormStr(JSON.stringify(baseForm));
     
     setSelectedEvent(null);
     setIsCreateModalOpen(true);
  };

  const handleDeleteSelectedEvent = async () => {
    if (!window.confirm("Opravdu chcete tuto událost smazat?")) return;
    setIsDeleting(true);
    try {
      const targetId = selectedEvent.recurringEventId || selectedEvent.id;
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${googleToken}` }
      });
      if (res.ok) {
        setRefreshTrigger(p => p+1);
        setSelectedEvent(null);
      } else {
        setAppError("Došlo k chybě při mazání záznamu z platformy Google.");
      }
    } catch (err) {
      setAppError("Nepodařilo se připojit k internetové komunikaci při mazání.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDateChange = (action) => {
    if (action === 'prev') setCurrentDate(new Date(currentYear, currentDate.getMonth() - 1, 1));
    else if (action === 'next') setCurrentDate(new Date(currentYear, currentDate.getMonth() + 1, 1));
    else if (action === 'today') setCurrentDate(new Date());
  };

  let currentMainView = null;

  // Navigace na obrazovce vývoje
  if (activeCalendarView !== 'Měsíční přehled' && activeCalendarView !== 'Co mě čeká?') {
    currentMainView = (
       <div className="flex-1 flex items-center justify-center p-10 relative h-full">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#ff7ab8] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
         <p className="text-[#ff7ab8]/60 uppercase tracking-[0.2em] font-bold z-10 text-xl border border-[#ff7ab8]/20 bg-[#ff7ab8]/5 px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(255,122,184,0.1)] backdrop-blur-md">
           [ {activeCalendarView.toUpperCase()} VE VÝVOJI ]
         </p>
         <img src="/vr_calendar.svg" alt="VR Mascot" className="absolute bottom-10 right-10 w-64 h-auto opacity-70 object-contain pointer-events-none" />
       </div>
    );
  } else if (activeCalendarView === 'Co mě čeká?') {
    currentMainView = (
      <AgendaView 
        events={events}
        agendaSearch={agendaSearch}
        setAgendaSearch={setAgendaSearch}
        displayedAgendaCount={displayedAgendaCount}
        setDisplayedAgendaCount={setDisplayedAgendaCount}
        setSelectedEvent={setSelectedEvent}
        activeCalendarView={activeCalendarView}
      />
    );
  } else {

  // Příprava logiky Mřížky
  const daysInMonth = new Date(currentYear, currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentDate.getMonth(), 1).getDay(); 
  const startingDay = (firstDayOfMonth + 6) % 7; 
  const totalCells = 42; // Máme 6 řádků po 7 dnech

  // Filtr událostí podle fulltextového search okna
  const filteredEventsForGrid = events.filter(e => {
    if (!searchQuery) return true;
    return e.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  currentMainView = (
    <MonthView
      currentYear={currentYear}
      currentMonthName={currentMonthName}
      currentDate={currentDate}
      handleDateChange={handleDateChange}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      firstDayOfMonth={firstDayOfMonth}
      daysInMonth={daysInMonth}
      startingDay={startingDay}
      totalCells={totalCells}
      events={events}
      specialDays={{}}
      specialCalsLoading={false}
      openCreateForDay={openCreateForDay}
      selectedCalDay={selectedCalDay}
      setSelectedCalDay={setSelectedCalDay}
      setSelectedEvent={setSelectedEvent}
      activeCalendarView={activeCalendarView}
    />
  );
  }

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      <div className={`w-full h-full ${selectedEvent ? 'hidden md:flex flex-col' : 'flex flex-col'} relative`}>
        {currentMainView}
      </div>

      {selectedEvent && (
        <EventDetailView 
          selectedEvent={selectedEvent}
          setSelectedEvent={setSelectedEvent}
          handleEditSelectedEvent={handleEditSelectedEvent}
          handleDeleteSelectedEvent={handleDeleteSelectedEvent}
          isDeleting={isDeleting}
          previewRecurrenceText={previewRecurrenceText}
        />
      )}

      {/* Modal pro tvorbu události */}
      <EventModal 
        isCreateModalOpen={isCreateModalOpen}
        handleAttemptCloseCreateModal={handleAttemptCloseCreateModal}
        editEventId={editEventId}
        newEventForm={newEventForm}
        setNewEventForm={setNewEventForm}
        handleCreateEvent={handleCreateEvent}
        isCreatingEvent={isCreatingEvent}
        userEmail={userEmail}
      />

      {/* Warning Overlay */}
      {showEventCloseWarning && createPortal(
        <div className="fixed inset-0 bg-[#020817]/80 backdrop-blur-md z-[2000] flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#061026] border border-[#fb7185]/50 shadow-[0_0_30px_rgba(251,113,133,0.3)] rounded-2xl p-8 max-w-sm flex flex-col items-center gap-6 text-center relative overflow-hidden pointer-events-auto">
             <div className="w-16 h-16 rounded-full bg-[#fb7185]/10 border border-[#fb7185]/30 flex items-center justify-center shadow-[0_0_20px_rgba(251,113,133,0.2)]">
               <AlertTriangle size={32} className="text-[#fb7185]" />
             </div>
             <h3 className="text-xl font-bold text-white tracking-wide">Zahodit událost?</h3>
             <p className="text-sm text-slate-400 font-mono tracking-tight leading-relaxed">Máte rozpracovanou událost. Opravdu ji chcete zavřít bez uložení? Všechna nezuložená data budou ztracena.</p>
             <div className="flex w-full gap-3 mt-2">
               <button onClick={() => setShowEventCloseWarning(false)} className="flex-1 py-3 text-xs font-bold text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-[#00f3ff]/[0.15] tracking-widest uppercase">Zpět</button>
               <button onClick={() => { setShowEventCloseWarning(false); setIsCreateModalOpen(false); }} className="flex-1 py-3 text-xs font-bold text-[#fb7185] bg-[#fb7185]/10 hover:bg-[#fb7185]/20 rounded-xl transition-all border border-[#fb7185]/30 hover:border-[#fb7185] hover:shadow-[0_0_15px_rgba(251,113,133,0.4)] tracking-widest uppercase">Zahodit</button>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* App Error Overlay */}
      {appError && createPortal(
        <div className="fixed inset-0 bg-[#020817]/90 z-[2000] flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#061026] border border-[#00f3ff]/50 shadow-[0_0_40px_rgba(0,243,255,0.2)] rounded-3xl p-10 max-w-[420px] flex flex-col items-center gap-7 text-center relative overflow-hidden pointer-events-auto">
             
             <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#00f3ff]/20 to-[#ff7ab8]/20 border-2 border-[#00f3ff]/50 flex items-center justify-center shadow-[0_0_25px_rgba(0,243,255,0.4)] z-10 shrink-0">
               <AlertTriangle size={36} className="text-[#00f3ff] drop-shadow-[0_0_10px_#00f3ff]" />
             </div>
             
             <div className="z-10 flex flex-col gap-2 relative">
                 <h3 className="text-2xl font-black text-white tracking-widest uppercase drop-shadow-md">Chyba API</h3>
                 <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-[#ff7ab8] to-transparent mx-auto opacity-50 relative mt-1 mb-2"></div>
                 <p className="text-sm font-mono text-slate-300 leading-relaxed drop-shadow-sm tracking-tight">{appError}</p>
             </div>
             
             <div className="w-full mt-4 z-10">
               <button 
                 onClick={() => setAppError(null)} 
                 className="w-full py-4 bg-[#020817]/50 hover:bg-[#00f3ff]/10 rounded-2xl transition-all border border-[#00f3ff]/30 text-[#00f3ff] font-bold text-xs uppercase tracking-[0.25em] hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:border-[#00f3ff] active:scale-95"
               >
                 OK
               </button>
             </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
