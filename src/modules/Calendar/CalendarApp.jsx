import React, { useState, useEffect } from 'react';
import EventModal from './components/EventModal';
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, Loader2, Search, X, Edit2, Trash2, Bell, AlertTriangle, Repeat } from 'lucide-react';
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
  const [displayedAgendaCount, setDisplayedAgendaCount] = useState(5);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [appError, setAppError] = useState(null);
  const [specialCalsTrigger, setSpecialCalsTrigger] = useState(0);
  const [selectedCalDay, setSelectedCalDay] = useState(null); // Date object

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
    if (newEventForm.title || newEventForm.description || editEventId) {
       setShowEventCloseWarning(true);
    } else {
       setIsCreateModalOpen(false);
    }
  };

  const openCreateForDay = (dateObj) => {
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
    setEditEventId(null);
    setNewEventForm({
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
    });
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
           setAppError("API error: " + res.status);
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
      setNewEventForm({
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
      });
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

     setNewEventForm({
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
     });
     
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

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentDate.getMonth() + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const getEventColor = (colorId) => {
    const colors = {
      '1': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
      '2': 'bg-teal-500/20 text-teal-400 border-teal-500/50',
      '3': 'bg-[#f800ff]/20 text-[#f800ff] border-[#f800ff]/50', // purple
      '4': 'bg-pink-500/20 text-pink-400 border-pink-500/50',
      '5': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      '6': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      '7': 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50', // blue/cyan
      '8': 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      '9': 'bg-blue-600/20 text-blue-400 border-blue-600/50',
      '10': 'bg-green-500/20 text-green-400 border-green-500/50',
      '11': 'bg-red-500/20 text-red-400 border-red-500/50'
    };
    return colors[colorId] || 'bg-[#00f3ff]/10 text-white border-[#00f3ff]/30'; 
  };

  const getEventSolidColor = (colorId) => {
    const colors = {
      '1': 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]',
      '2': 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]',
      '3': 'bg-[#f800ff] shadow-[0_0_10px_rgba(248,0,255,0.5)]',
      '4': 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]',
      '5': 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]',
      '6': 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]',
      '7': 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]',
      '8': 'bg-gray-500 shadow-[0_0_10px_rgba(107,114,128,0.5)]',
      '9': 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]',
      '10': 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]',
      '11': 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
    };
    return colors[colorId] || 'bg-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]'; 
  };

  let currentMainView = null;

  // Navigace na obrazovce vývoje
  if (activeCalendarView !== 'Měsíční přehled' && activeCalendarView !== 'Co mě čeká?') {
    currentMainView = (
       <div className="flex-1 flex items-center justify-center p-10 relative h-full">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#f800ff] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
         <p className="text-[#f800ff]/60 uppercase tracking-[0.2em] font-bold z-10 text-xl border border-[#f800ff]/20 bg-[#f800ff]/5 px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(248,0,255,0.1)] backdrop-blur-md">
           [ {activeCalendarView.toUpperCase()} VE VÝVOJI ]
         </p>
         <img src="/vr_calendar_trans.png" alt="VR Mascot" className="absolute bottom-10 right-10 w-64 h-auto opacity-70 object-contain drop-shadow-[0_0_20px_rgba(248,0,255,0.4)] pointer-events-none animate-pulse-slow" />
       </div>
    );
  } else if (activeCalendarView === 'Co mě čeká?') {
    // AGENDA POHLED: Co mě čeká?
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const agendaEvents = events
        .filter(ev => ev.endDate >= today)
        .filter(ev => {
          if (!agendaSearch.trim()) return true;
          const q = agendaSearch.toLowerCase();
          return (
            ev.title?.toLowerCase().includes(q) ||
            ev.description?.replace(/<[^>]*>?/gm,'').toLowerCase().includes(q) ||
            ev.location?.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => a.fullDate - b.fullDate);

    currentMainView = (
      <div className="flex-1 flex flex-col h-full relative overflow-hidden animate-in fade-in duration-300">
         
         <div className="flex flex-shrink-0 items-center justify-between gap-2 md:gap-4 p-4 md:p-8 border-b border-[#f800ff]/20 bg-[#050B14]/75 relative overflow-visible shadow-[0_4px_20px_rgba(5,11,20,0.6)]">
           {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
           <div className="absolute right-0 top-0 h-[114px] w-[400px] overflow-hidden pointer-events-none opacity-50 z-[5]">
                <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id="agendaRightGlowSVGC" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur1" />
                      <feGaussianBlur stdDeviation="6" result="blur2" />
                      <feMerge>
                          <feMergeNode in="blur2" />
                          <feMergeNode in="blur1" />
                          <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#f800ff" strokeWidth="2" filter="url(#agendaRightGlowSVGC)" />
                  <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#agendaRightGlowSVGC)" />
                  <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#00f3ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#agendaRightGlowSVGC)" />
                  <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#f800ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#agendaRightGlowSVGC)" />
                  <circle cx="80" cy="40" r="4" fill="#050B14" stroke="#f800ff" strokeWidth="1.5" filter="url(#agendaRightGlowSVGC)" />
                  <circle cx="200" cy="80" r="3" fill="#f800ff" filter="url(#agendaRightGlowSVGC)" />
                  <circle cx="35" cy="15" r="3" fill="#00f3ff" filter="url(#agendaRightGlowSVGC)" />
                  <circle cx="220" cy="50" r="5" fill="#050B14" stroke="#00f3ff" strokeWidth="1.5" filter="url(#agendaRightGlowSVGC)" />
                  <circle cx="130" cy="100" r="2" fill="#f800ff" filter="url(#agendaRightGlowSVGC)" />
                </svg>
           </div>
           
           <div className="flex items-center gap-6 relative w-full justify-between">
             <div className="flex items-center gap-2 md:gap-6">
               <div className="p-1 md:p-3 rounded-2xl bg-[#f800ff]/10 border-2 border-[#f800ff]/40 shadow-[0_0_25px_rgba(248,0,255,0.4)] transition-all flex items-center justify-center min-w-[48px] md:min-w-[72px] min-h-[48px] md:min-h-[72px]">
                 <img src="/vr_calendar_trans.png" className="w-8 h-8 md:w-16 md:h-16 object-contain filter drop-shadow-[0_0_15px_rgba(248,0,255,0.8)]" alt="Kalendář" draggable="false" />
               </div>
               
               <div className="flex flex-col justify-center relative mt-1 select-none">
                 <div className="flex items-center gap-3 ml-2 mb-3">
                   <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_rgba(0,243,255,0.8)]"></div>
                   <span className="text-[#f800ff] text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                     System // Timeline // {activeCalendarView}
                   </span>
                 </div>
                 <div className="flex flex-row items-baseline">
                   <span className="text-[#00f3ff] text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                   <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal flex items-center gap-2 md:gap-4">
                     CO MĚ ČEKÁ
                   </h1>
                   <span className="text-[#00f3ff] text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
                 </div>
               </div>
             </div>
           </div>
         </div>

         {/* Toolbar - stejný styl jako měsíční přehled */}
         <div className="flex items-center pl-2 md:pl-7 py-2 pr-2 md:pr-6 bg-black/30 border-b border-[#00f3ff]/10 shrink-0 gap-2 md:gap-4">
           <span className="hidden sm:block text-gray-500 text-[10px] tracking-widest uppercase shrink-0">
             {agendaSearch ? `${agendaEvents.length} výsledků` : `${agendaEvents.length} nadcházejících`}
           </span>
           <div className="flex-1 relative group">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/50 group-focus-within:text-[#00f3ff] transition-colors pointer-events-none z-10" />
             <input
               type="text"
               placeholder="Hledat události..."
               value={agendaSearch}
               onChange={e => { setAgendaSearch(e.target.value); setDisplayedAgendaCount(5); }}
               className="pl-9 pr-9 py-1.5 w-full bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded-md text-xs text-white placeholder-[#00f3ff]/40 outline-none focus:border-[#00f3ff] transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
             />
             {agendaSearch && (
               <button
                 onClick={() => { setAgendaSearch(''); setDisplayedAgendaCount(5); }}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/60 hover:text-[#00f3ff] transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(0,243,255,0.5)] z-10 hover:scale-125"
               >✕</button>
             )}
           </div>
         </div>

         <div className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-6 sm:px-10 mt-4 pb-6">
            {agendaEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50 relative top-[-40px]">
                    <Clock size={64} className="text-[#00f3ff] mb-6 drop-shadow-[0_0_15px_#00f3ff] opacity-80" />
                    <p className="text-[#00f3ff] uppercase tracking-[0.3em] font-bold text-lg mb-2 text-center drop-shadow-[0_0_10px_#00f3ff]">Databáze prázdná</p>
                    <p className="text-gray-500 font-mono text-sm tracking-tight text-center">V dohledné době se na obzoru nic neděje.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3 pb-8" >
                  {agendaEvents.slice(0, displayedAgendaCount).map((ev, index, slicedArray) => {
                     const isFirstOfDay = index === 0 || ev.fullDate.toDateString() !== slicedArray[index-1].fullDate.toDateString();
                     
                     const dayNames = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
                     const dateKey = `${dayNames[ev.fullDate.getDay()]} ${ev.fullDate.getDate()}. ${monthNames[ev.fullDate.getMonth()].toLowerCase()} ${ev.fullDate.getFullYear()}`;
                     const currentObj = ev.fullDate;
                     const isToday = currentObj.toDateString() === new Date().toDateString();

                     return (
                        <React.Fragment key={ev.id}>
                          {isFirstOfDay && (
                             <div className="mt-8 mb-3 first:mt-0 pt-3 pb-2 border-b border-white/5">
                               <h3 className={`text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 ${isToday ? 'text-[#f800ff]' : 'text-[#00f3ff]'}`}>
                                 {isToday && <span className="w-2 h-2 rounded-full bg-[#f800ff] shadow-[0_0_10px_#f800ff] animate-pulse" />}
                                 {isToday ? "Dnes" : dateKey}
                               </h3>
                               <div className={`h-px w-full mt-2 ${isToday ? 'bg-gradient-to-r from-[#f800ff]/60 to-transparent' : 'bg-gradient-to-r from-[#00f3ff]/30 to-transparent'}`} />
                             </div>
                          )}

                          <div 
                             onClick={() => setSelectedEvent(ev)}
                             className="cursor-pointer bg-[#0d1520] border border-[#1a2535] hover:border-[#00f3ff]/30 rounded-2xl p-4 flex gap-5 items-center justify-between group hover:bg-[#0f1f35] hover:shadow-[inset_4px_0_0_#00f3ff]"
                          >
                             <div className="flex gap-5 items-center w-full min-w-0">
                                {/* Color strip */}
                                <div className={`w-1.5 h-12 rounded-full shrink-0 transition-transform group-hover:scale-y-110 ${getEventSolidColor(ev.colorId)}`} />

                                <div className="flex flex-col min-w-[50px] md:min-w-[70px] shrink-0 items-start justify-center pl-1">
                                    {ev.isAllDay ? (
                                        <div className="text-[9px] md:text-[10px] font-black tracking-[0.2em] uppercase text-[#00f3ff] bg-[#00f3ff]/10 py-1.5 px-1 md:px-2 rounded-md border border-[#00f3ff]/20">CELÝ DEN</div>
                                    ) : (
                                        <div className="text-sm md:text-xl font-bold text-gray-300 font-mono tracking-tight group-hover:text-[#00f3ff] transition-colors">{ev.fullDate.toTimeString().substring(0, 5)}</div>
                                    )}
                                </div>

                                <div className="flex flex-col flex-1 min-w-0 pl-1 md:pl-2">
                                   <div className="text-base md:text-lg font-bold text-white truncate group-hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] transition-all">{ev.title}</div>
                                   {ev.description && (
                                     <div className="text-xs text-gray-500 font-mono tracking-tight truncate group-hover:text-gray-400 mt-1">
                                       {ev.description.replace(/<[^>]*>?/gm, '')}
                                     </div>
                                   )}
                                </div>
                             </div>
                             
                             <div className="shrink-0 text-white/10 group-hover:text-[#00f3ff] transition-colors pr-2">
                                <ChevronRight size={20} />
                             </div>
                          </div>
                        </React.Fragment>
                     )
                  })}
                  
                  {agendaEvents.length > displayedAgendaCount && (
                     <button 
                        onClick={() => setDisplayedAgendaCount(prev => prev + 5)}
                        className="mt-6 w-full py-4 rounded-xl border border-[#00f3ff]/30 bg-[#00f3ff]/5 hover:bg-[#00f3ff]/10 text-[#00f3ff] text-xs font-bold uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(0,243,255,0.2)] active:scale-[0.98]"
                     >
                        Načíst dalších 5 událostí ↓
                     </button>
                  )}
                </div>
            )}
         </div>
      </div>
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
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between gap-4 p-8 border-b border-[#f800ff]/20 bg-black/30 backdrop-blur-md relative z-[100] overflow-visible">
        
        {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
        <div className="absolute right-0 top-0 h-[114px] w-[400px] overflow-hidden pointer-events-none opacity-50 z-[5]">
             <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
               <defs>
                 <filter id="headerRightGlowSVGC" x="-20%" y="-20%" width="140%" height="140%">
                   <feGaussianBlur stdDeviation="3" result="blur1" />
                   <feGaussianBlur stdDeviation="6" result="blur2" />
                   <feMerge>
                       <feMergeNode in="blur2" />
                       <feMergeNode in="blur1" />
                       <feMergeNode in="SourceGraphic" />
                   </feMerge>
                 </filter>
               </defs>
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#f800ff" strokeWidth="2" filter="url(#headerRightGlowSVGC)" />
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVGC)" />
               <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#00f3ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#headerRightGlowSVGC)" />
               <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#f800ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="80" cy="40" r="4" fill="#0f172a" stroke="#f800ff" strokeWidth="1.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="200" cy="80" r="3" fill="#f800ff" filter="url(#headerRightGlowSVGC)" />
               <circle cx="35" cy="15" r="3" fill="#00f3ff" filter="url(#headerRightGlowSVGC)" />
               <circle cx="220" cy="50" r="5" fill="#0f172a" stroke="#00f3ff" strokeWidth="1.5" filter="url(#headerRightGlowSVGC)" />
               <circle cx="130" cy="100" r="2" fill="#f800ff" filter="url(#headerRightGlowSVGC)" />
             </svg>
        </div>

        <div className="flex items-center gap-6 relative z-10 w-full">
          <div className="flex items-center gap-6">
            <div className="p-2 md:p-3 rounded-2xl bg-[#f800ff]/10 border-2 border-[#f800ff]/40 shadow-[0_0_25px_rgba(248,0,255,0.4)] transition-all flex items-center justify-center min-w-[72px] min-h-[72px]">
              <img src="/vr_calendar_trans.png" className="w-14 h-14 md:w-16 md:h-16 object-contain filter drop-shadow-[0_0_15px_rgba(248,0,255,0.8)]" alt="Kalendář" draggable="false" />
            </div>
            
            <div className="flex flex-col justify-center relative mt-1 select-none">
              <div className="flex items-center gap-3 ml-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] shadow-[0_0_8px_rgba(0,243,255,0.8)]"></div>
                <span className="text-[#f800ff] text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                  System // Timeline // {activeCalendarView}
                </span>
              </div>
              <div className="flex flex-row items-baseline">
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                <h1 className="text-4xl md:text-5xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal flex items-center gap-4">
                  {currentMonthName} {currentYear}
                  {isLoading && <Loader2 size={32} className="text-[#00f3ff] animate-spin" />}
                </h1>
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zde přidáváme backdrop wrapper ala EmailList */}
      <div className="flex-1 relative bg-[#0f172a]/80 backdrop-blur-sm flex flex-col h-full shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Kontrolní panel: Výpis, Hledání, Navigace DNES - vytaženo VEN z grid wrapperu aby lícoval z EmailListem */}
        <div className="flex items-center pl-7 py-2 pr-[38px] bg-black/40 border-b border-[#00f3ff]/10 z-20 shrink-0 w-full">
          
          {/* Placeholder šířky pro sloupec s Checkboxy (odpovídá EmailListu) */}
          <div className="w-[40px] pr-2" />


        {/* Šířka pro sloupec Odesílatel */}
        <div className="w-[20%] pr-4 flex items-center">
          <span className="text-gray-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Zobrazeno ${filteredEventsForGrid.length} událostí v API poolu`}>
            Výpis {filteredEventsForGrid.length} záznamů
          </span>
        </div>

        {/* Šířka pro sloupec Předmět (Zarovná Search Bar) */}
        <div className="flex-1 relative group pr-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/50 group-focus-within:text-[#00f3ff] transition-colors pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Hledat události..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 py-1.5 w-full bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded-md text-xs text-white placeholder-[#00f3ff]/40 outline-none focus:border-[#00f3ff] transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-[#00f3ff]/60 hover:text-[#00f3ff] transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(0,243,255,0.5)] z-10 hover:scale-125"
              title="Vymazat hledání"
            >
              ✕
            </button>
          )}
        </div>

        {/* Pravý blok s tlačítky - flex rozvržení upraveno pro čistotu */}
        <div className="shrink-0 z-20 pl-4 flex items-center gap-2">
          <button onClick={handleToday} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all rounded-md flex items-center gap-2 bg-[#f800ff]/5 text-[#f800ff] border border-[#f800ff]/40 shadow-[0_0_10px_rgba(248,0,255,0.15)] hover:bg-[#f800ff]/20 hover:shadow-[0_0_20px_rgba(248,0,255,0.4)]">
            DNES
          </button>
          <div className="flex items-center gap-1">
             <button onClick={handlePrevMonth} className="px-2 py-1.5 rounded-md border border-[#00f3ff]/20 hover:border-[#00f3ff]/40 text-[#00f3ff]/70 hover:text-[#00f3ff] transition-all bg-black/50 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:bg-[#00f3ff]/10">
               <ChevronLeft size={16} />
             </button>
             <button onClick={handleNextMonth} className="px-2 py-1.5 rounded-md border border-[#00f3ff]/20 hover:border-[#00f3ff]/40 text-[#00f3ff]/70 hover:text-[#00f3ff] transition-all bg-black/50 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:bg-[#00f3ff]/10">
               <ChevronRight size={16} />
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col pt-4 px-8 pb-4 relative z-10 w-full overflow-hidden">
       <div className="absolute top-[-20%] left-[20%] w-[50%] h-[50%] bg-[#f800ff]/5 rounded-[100%] blur-[120px] pointer-events-none z-[-1]" />

       <div className="grid grid-cols-7 mb-2">
         {['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'].map(day => (
           <div key={day} className="text-center font-black tracking-widest text-sm text-gray-400 bg-white/5 mx-1 py-1 rounded-md border border-white/5">{day}</div>
         ))}
       </div>

       <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-2">
         {Array.from({ length: totalCells }).map((_, i) => {
           const isCurrentMonth = i >= startingDay && i < startingDay + daysInMonth;
           const dayNum = isCurrentMonth ? i - startingDay + 1 : (i < startingDay ? new Date(currentYear, currentDate.getMonth(), 0).getDate() - startingDay + i + 1 : i - startingDay - daysInMonth + 1);

           let cellMonth = currentDate.getMonth();
           let cellYear = currentYear;
           if (i < startingDay) { cellMonth -= 1; if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; } }
           else if (i >= startingDay + daysInMonth) { cellMonth += 1; if (cellMonth > 11) { cellMonth = 0; cellYear += 1; } }
           const cellDate = new Date(cellYear, cellMonth, dayNum);
           const isSelected = isCurrentMonth && selectedCalDay && cellDate.toDateString() === selectedCalDay.toDateString();

           const today = new Date();
           const isToday = isCurrentMonth && dayNum === today.getDate() && currentDate.getMonth() === today.getMonth() && currentYear === today.getFullYear();
           
           return (
             <div 
               key={`bg-${i}`}
               onClick={() => isCurrentMonth && setSelectedCalDay(isSelected ? null : cellDate)}
               className={`col-start-${(i % 7) + 1} row-start-${Math.floor(i / 7) + 1} relative p-2.5 rounded-xl flex flex-col transition-all duration-200 overflow-visible ${
                 !isCurrentMonth ? 'bg-black/10 border border-white/5 opacity-40 z-0 cursor-default' :
                 isSelected ? 'bg-[#00f3ff]/10 border border-[#00f3ff]/60 shadow-[inset_0_0_20px_rgba(0,243,255,0.1),0_0_20px_rgba(0,243,255,0.2)] z-10 ring-1 ring-[#00f3ff]/50 cursor-pointer' :
                 isToday ? 'bg-[#f800ff]/10 border border-[#f800ff]/40 shadow-[inset_0_0_20px_rgba(248,0,255,0.1),0_0_15px_rgba(248,0,255,0.1)] z-10 ring-1 ring-[#f800ff]/30 cursor-pointer' :
                 'bg-black/40 border border-white/10 z-0 hover:border-[#00f3ff]/20 hover:bg-[#00f3ff]/5 cursor-pointer'
               }`}
             >
                <div className="flex justify-between items-start">
                   {isSelected ? (
                     <div className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] animate-pulse shadow-[0_0_8px_#00f3ff] mt-2 ml-1" />
                   ) : isToday ? (
                     <div className="w-1.5 h-1.5 rounded-full bg-[#f800ff] animate-pulse shadow-[0_0_5px_#f800ff] mt-2 ml-1" />
                   ) : <div/>}
                   <span className={`text-xl font-black ${
                     isSelected ? 'text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.9)]' :
                     isToday ? 'text-[#f800ff] drop-shadow-[0_0_5px_rgba(248,0,255,0.8)]' : 'text-gray-500'
                   }`}>
                     {dayNum}
                   </span>
                </div>
                {isSelected && (
                   <button
                     onClick={(e) => { e.stopPropagation(); openCreateForDay(cellDate); }}
                     className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-[#00f3ff] text-[#0f172a] font-black text-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,243,255,0.8)] hover:scale-110 transition-transform z-30 leading-none"
                     title="Přidat událost"
                   >+</button>
                )}
             </div>
           );
         })}

         {(() => {
             const calendarCells = Array.from({ length: totalCells }).map((_, i) => {
                 const isCurrentMonth = i >= startingDay && i < startingDay + daysInMonth;
                 const dayNum = isCurrentMonth ? i - startingDay + 1 : (i < startingDay ? new Date(currentYear, currentDate.getMonth(), 0).getDate() - startingDay + i + 1 : i - startingDay - daysInMonth + 1);
                 let m = currentDate.getMonth();
                 let y = currentYear;
                 if (i < startingDay) m -= 1;
                 else if (i >= startingDay + daysInMonth) m += 1;
                 return { timestamp: new Date(y, m, dayNum, 0, 0, 0, 0).getTime() };
             });

             const eventOverlays = [];
             const numWeeks = totalCells / 7;

             for (let w = 0; w < numWeeks; w++) {
                 const weekCells = calendarCells.slice(w * 7, w * 7 + 7);
                 const weekStartT = weekCells[0].timestamp;
                 const weekEndT = weekCells[6].timestamp + 86399999;

                 const eventsThisWeek = filteredEventsForGrid.filter(e => {
                     return e.fullDate.getTime() <= weekEndT && e.endDate.getTime() > weekStartT;
                 });

                 eventsThisWeek.sort((a, b) => {
                     const durA = a.endDate.getTime() - a.fullDate.getTime();
                     const durB = b.endDate.getTime() - b.fullDate.getTime();
                     if (durA !== durB) return durB - durA;
                     return a.fullDate.getTime() - b.fullDate.getTime();
                 });

                 const slots = [];

                 eventsThisWeek.forEach(ev => {
                     const evStartT = ev.fullDate.getTime();
                     const evEndT = ev.endDate.getTime();

                     let startCol = 0;
                     let endCol = 6;
                     
                     const safeEndT = Math.max(evEndT, evStartT + 1);

                     for (let c = 0; c < 7; c++) {
                         if (evStartT <= weekCells[c].timestamp + 86399999 && safeEndT > weekCells[c].timestamp) {
                             startCol = c; break;
                         }
                     }
                     for (let c = 6; c >= 0; c--) {
                         if (evStartT <= weekCells[c].timestamp + 86399999 && safeEndT > weekCells[c].timestamp) {
                             endCol = c; break;
                         }
                     }

                     let slotIdx = 0;
                     while (true) {
                         if (!slots[slotIdx]) slots[slotIdx] = Array(7).fill(false);
                         let conflict = false;
                         for (let c = startCol; c <= endCol; c++) {
                             if (slots[slotIdx][c]) conflict = true;
                         }
                         if (!conflict) break;
                         slotIdx++;
                     }
                     for (let c = startCol; c <= endCol; c++) {
                         slots[slotIdx][c] = true;
                     }

                     const isContinuedFromYesterday = evStartT < weekCells[startCol].timestamp;
                     // Odečtení 1ms zajišťuje, že událost končící přesně o půlnoci (00:00:00) nepřeteče jako vizuální čtverec do dalšího dne
                     const isContinuedToTomorrow = (safeEndT - 1) > weekCells[endCol].timestamp + 86399999;
                     
                     let edgeClasses = "rounded-md px-3";
                     if (isContinuedFromYesterday) edgeClasses = "rounded-r-md px-3 border-l-0 -ml-[8px]"; // 8px je díky gap-2
                     if (isContinuedToTomorrow) edgeClasses = edgeClasses.replace("rounded-r-md", "").replace("rounded-md", "rounded-l-md") + " border-r-0 -mr-[8px]";
                     if (isContinuedFromYesterday && isContinuedToTomorrow) edgeClasses = "rounded-none px-3 border-l-0 border-r-0 -ml-[8px] -mr-[8px]";

                     eventOverlays.push({
                         key: `${ev.id}-w${w}-s${slotIdx}`,
                         colStart: startCol + 1,
                         colSpan: endCol - startCol + 1,
                         rowStart: w + 1,
                         slotIndex: slotIdx,
                         title: ev.title,
                         colorClass: getEventColor(ev.colorId),
                         edgeClasses,
                         isPast: ev.endDate < new Date(),
                         rawEvent: ev
                     });
                 });
             }

             // Tailwind safelist manuálně vložený do kódu, abychom zaručili generování classes
             const colStartMap = ['', 'col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'];
             const colSpanMap = ['', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6', 'col-span-7'];
             const rowStartMap = ['', 'row-start-1', 'row-start-2', 'row-start-3', 'row-start-4', 'row-start-5', 'row-start-6'];

             return eventOverlays.map(ev => {
                 return (
                     <div
                         key={ev.key}
                         onClick={() => setSelectedEvent(ev.rawEvent)}
                         className={`${colStartMap[ev.colStart]} ${colSpanMap[ev.colSpan]} ${rowStartMap[ev.rowStart]} self-start h-6 z-20 flex justify-center items-center shadow-lg border transition-colors overflow-hidden pointer-events-auto cursor-pointer hover:z-30 ${ev.edgeClasses} ${
                           ev.isPast 
                             ? 'bg-gray-800/60 border-gray-600 text-gray-400 opacity-60 grayscale-[80%] hover:brightness-110 hover:opacity-100 hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.5)]' 
                             : `${ev.colorClass} hover:brightness-125 hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.5)]`
                         }`}
                         style={{ marginTop: `${35 + ev.slotIndex * 26}px` }}
                         title={ev.title}
                     >
                         <span className="uppercase tracking-wider font-bold text-[10px] sm:text-xs z-30 truncate drop-shadow-md text-center">
                             {ev.title}
                         </span>
                     </div>
                 );
             });
         })()}
        </div>
      </div>
     </div>
    </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      {currentMainView}

      {selectedEvent && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}></div>
          
          <div className="relative bg-[#0f172a] border border-[#00f3ff]/40 shadow-[0_0_50px_rgba(0,243,255,0.2)] rounded-3xl w-full max-w-3xl overflow-hidden flex flex-col p-8 animate-in fade-in zoom-in duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00f3ff]/10 blur-[50px] pointer-events-none rounded-full" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#f800ff]/10 blur-[50px] pointer-events-none rounded-full" />
            
            <div className="absolute top-4 right-4 flex items-center gap-1 z-20">
               <button 
                 onClick={handleEditSelectedEvent}
                 className="p-2 text-[#00f3ff] hover:bg-[#00f3ff]/20 hover:shadow-[0_0_10px_rgba(0,243,255,0.3)] rounded-full transition-all"
                 title="Upravit"
               >
                 <Edit2 size={18} />
               </button>
               <button 
                 onClick={handleDeleteSelectedEvent}
                 disabled={isDeleting}
                 className="p-2 text-red-500 hover:bg-red-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.3)] rounded-full transition-all"
                 title="Smazat"
               >
                 {isDeleting ? <Loader2 size={18} className="animate-spin text-red-500" /> : <Trash2 size={18} />}
               </button>
               <div className="w-px h-5 bg-white/10 mx-1"></div>
               <button 
                 onClick={() => setSelectedEvent(null)}
                 className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-all"
                 title="Zavřít"
               >
                 <X size={20} />
               </button>
            </div>

            <span className="text-[#00f3ff] text-[10px] uppercase font-bold tracking-[0.2em] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]"></span>
              Detail události
            </span>
            
            <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-wider pr-6 drop-shadow-md leading-tight">
              {selectedEvent.title}
            </h2>
            
            <div className="flex flex-col gap-4 text-gray-300 mt-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
               <div className="flex flex-col gap-1.5 shrink-0 mt-2">
                 <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Kdy</span>
                 <div className="flex items-center gap-3 bg-black/40 border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
                   <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                     <Clock className="text-[#00f3ff]" size={20} />
                   </div>
                   <span className="font-mono text-lg font-black tracking-wider text-white block truncate drop-shadow-sm" title="Časové rozpětí">
                     {(() => {
                        const start = selectedEvent.fullDate;
                        const end = selectedEvent.endDate;
                        if (selectedEvent.isAllDay) {
                           const s = start.toLocaleDateString('cs-CZ');
                           const e = end.toLocaleDateString('cs-CZ');
                           return s === e ? `${s}, Celý den` : `${s} – ${e}`;
                        }
                        const sD = start.toLocaleDateString('cs-CZ');
                        const sT = start.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'});
                        const eD = end.toLocaleDateString('cs-CZ');
                        const eT = end.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'});
                        
                        if (sD === eD) return `${sD}, ${sT} – ${eT}`;
                        return `${sD}, ${sT} – ${eD}, ${eT}`;
                     })()}
                   </span>
                 </div>
               </div>

               <div className="flex flex-col gap-1.5 shrink-0 mt-2">
                 <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Upozornění</span>
                 <div className="flex items-center gap-3 bg-black/40 border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
                   <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                     <Bell className="text-[#00f3ff]" size={20} />
                   </div>
                   <span className="font-mono text-[15px] font-bold tracking-wider text-white block truncate drop-shadow-sm">
                     {(() => {
                        const mins = selectedEvent.alertMinutes;
                        if (mins === 'default') return 'Výchozí z Google Kalendáře';
                        if (mins === null || mins === undefined) return 'Žádné připomenutí';
                        if (mins === 0) return 'Ve chvíli zahájení události';
                        
                        if (mins >= 1440 && mins % 1440 === 0) {
                           const d = mins / 1440;
                           return `${d} ${d === 1 ? 'den' : d > 1 && d < 5 ? 'dny' : 'dní'} předem`;
                        }
                        if (mins >= 60 && mins % 60 === 0) {
                           const h = mins / 60;
                           return `${h} ${h === 1 ? 'hodinu' : h > 1 && h < 5 ? 'hodiny' : 'hodin'} předem`;
                        }
                        return `${mins} ${mins === 1 ? 'minutu' : mins > 1 && mins < 5 ? 'minuty' : 'minut'} předem`;
                     })()}
                   </span>
                 </div>
               </div>

               {selectedEvent.recurringEventId && (
                 <div className="flex flex-col gap-1.5 shrink-0 mt-2">
                   <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Opakování</span>
                   <div className="flex items-center gap-3 bg-black/40 border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] overflow-hidden">
                     <div className="bg-[#00f3ff]/10 p-2 rounded-lg shrink-0">
                       <Repeat className="text-[#00f3ff]" size={20} />
                     </div>
                     <span className="font-mono text-[15px] font-bold tracking-wider text-white block truncate drop-shadow-sm">
                       {previewRecurrenceText || 'Aktivní (součást série)'}
                     </span>
                   </div>
                 </div>
               )}
               
               {selectedEvent.description && (
                 <div className="flex flex-col gap-1.5 mt-2 shrink-0">
                  <span className="text-[#00f3ff] text-[10px] font-bold uppercase tracking-widest block ml-1 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">Popis</span>
                  <div className="bg-black/40 border border-[#00f3ff]/10 p-4 rounded-xl shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                    <div 
                      className="text-gray-200 text-base leading-relaxed rich-text-content break-words"
                      dangerouslySetInnerHTML={{ __html: selectedEvent.description }} 
                    />
                  </div>
                 </div>
               )}
             </div>
          </div>
        </div>
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
      {showEventCloseWarning && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-6 rounded-3xl animate-in fade-in zoom-in duration-200">
          <div className="bg-[#0f172a] border border-[#ef4444]/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] rounded-2xl p-8 max-w-sm flex flex-col items-center gap-6 text-center relative overflow-hidden pointer-events-auto">
             <div className="w-16 h-16 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
               <AlertTriangle size={32} className="text-[#ef4444]" />
             </div>
             <h3 className="text-xl font-bold text-white tracking-wide">Zahodit událost?</h3>
             <p className="text-sm text-gray-400 font-mono tracking-tight leading-relaxed">Máte rozpracovanou událost. Opravdu ji chcete zavřít bez uložení? Všechna nezuložená data budou ztracena.</p>
             <div className="flex w-full gap-3 mt-2">
               <button onClick={() => setShowEventCloseWarning(false)} className="flex-1 py-3 text-xs font-bold text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10 tracking-widest uppercase">Zpět</button>
               <button onClick={() => { setShowEventCloseWarning(false); setIsCreateModalOpen(false); }} className="flex-1 py-3 text-xs font-bold text-[#ef4444] bg-[#ef4444]/10 hover:bg-[#ef4444]/20 rounded-xl transition-all border border-[#ef4444]/30 hover:border-[#ef4444] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] tracking-widest uppercase">Zahodit</button>
             </div>
          </div>
        </div>
      )}

      {/* App Error Overlay */}
      {appError && (
        <div className="absolute inset-0 bg-black/90 z-[1100] flex items-center justify-center p-6 rounded-3xl animate-in fade-in zoom-in duration-200">
          <div className="bg-[#0f172a] border border-[#00f3ff]/50 shadow-[0_0_40px_rgba(0,243,255,0.2)] rounded-3xl p-10 max-w-[420px] flex flex-col items-center gap-7 text-center relative overflow-hidden pointer-events-auto">
             
             <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#00f3ff]/20 to-[#f800ff]/20 border-2 border-[#00f3ff]/50 flex items-center justify-center shadow-[0_0_25px_rgba(0,243,255,0.4)] z-10 shrink-0">
               <AlertTriangle size={36} className="text-[#00f3ff] drop-shadow-[0_0_10px_#00f3ff]" />
             </div>
             
             <div className="z-10 flex flex-col gap-2 relative">
                 <h3 className="text-2xl font-black text-white tracking-widest uppercase drop-shadow-md">Chyba API</h3>
                 <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-[#f800ff] to-transparent mx-auto opacity-50 relative mt-1 mb-2"></div>
                 <p className="text-sm font-mono text-gray-300 leading-relaxed drop-shadow-sm tracking-tight">{appError}</p>
             </div>
             
             <div className="w-full mt-4 z-10">
               <button 
                 onClick={() => setAppError(null)} 
                 className="w-full py-4 bg-black/50 hover:bg-[#00f3ff]/10 rounded-2xl transition-all border border-[#00f3ff]/30 text-[#00f3ff] font-bold text-xs uppercase tracking-[0.25em] hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:border-[#00f3ff] active:scale-95"
               >
                 OK
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
