import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHistoryBack } from '../../hooks/useHistoryBack';
import EventModal from './components/EventModal';
import AgendaView from './components/AgendaView';
import MonthView from './components/MonthView';
import EventDetailView from './components/EventDetailView';
import { AlertTriangle } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { useAlert } from '../../components/AlertProvider';
import {
  deleteEvent, describeRecurrence, getEvent, listEvents, parseRRule, saveEvent, toCalendarEvent,
  type GoogleCalendarEvent, type GoogleEventInput,
} from '../../services/calendar';
import type { CalendarEvent, EventForm, RecurrenceFreq, RecurrenceRule } from '../../types/calendar';

const HOLIDAY_CALENDAR = 'cs.czech#holiday@group.v.calendar.google.com';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Datum v místním čase jako RRRR-MM-DD (toISOString by po půlnoci vrátil včerejšek) */
const localDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const emptyEventForm = (dateStr: string = localDateStr(new Date())): EventForm => ({
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
  attendees: '',
});

interface CalendarAppProps {
  activeCalendarView: string;
  googleToken: string | null;
  triggerCreateEvent: number;
  userEmail?: string;
}

export default function CalendarApp({
  activeCalendarView,
  googleToken,
  triggerCreateEvent,
  userEmail,
}: CalendarAppProps) {
  const { showConfirm } = useAlert();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  // Android – Zpět zavře detail události
  useHistoryBack(!!selectedEvent, () => setSelectedEvent(null));
  const [previewRecurrenceText, setPreviewRecurrenceText] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [displayedAgendaCount, setDisplayedAgendaCount] = useState(7);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [appError, setAppError] = useState<string | null>(null);
  const [specialCalsTrigger, setSpecialCalsTrigger] = useState(0);
  /** Vybraný den „RRRR-MM-DD“ (mobil) */
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);

  useEffect(() => {
    const handleMobileSearch = (e: Event) => {
       const q = (e as CustomEvent<string>).detail;
       setSearchQuery(q);
       setAgendaSearch(q);
    };
    window.addEventListener('vr-mobile-search-query-change', handleMobileSearch);
    return () => window.removeEventListener('vr-mobile-search-query-change', handleMobileSearch);
  }, []);

  // F5 – obnovit události ze serveru
  useEffect(() => {
    const onRefresh = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('vr-refresh-folder', onRefresh);
    return () => window.removeEventListener('vr-refresh-folder', onRefresh);
  }, []);

  useEffect(() => {
    const handler = () => setSpecialCalsTrigger(prev => prev + 1);
    window.addEventListener('zazijvr_special_cals_changed', handler);
    return () => window.removeEventListener('zazijvr_special_cals_changed', handler);
  }, []);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [showEventCloseWarning, setShowEventCloseWarning] = useState(false);
  const [initialEventFormStr, setInitialEventFormStr] = useState<string | null>(null);
  const [newEventForm, setNewEventForm] = useState<EventForm>(() => emptyEventForm());

  const monthNames = ["LEDEN", "ÚNOR", "BŘEZEN", "DUBEN", "KVĚTEN", "ČERVEN", "ČERVENEC", "SRPEN", "ZÁŘÍ", "ŘÍJEN", "LISTOPAD", "PROSINEC"];
  const currentMonthName = monthNames[currentDate.getMonth()];
  const currentYear = currentDate.getFullYear();

  const handleAttemptCloseCreateModal = () => {
    let isDirty = false;
    
    // Pomocná funkce s normováním textu z RichTextEditoru
    const normalizeDesc = (html: string) => {
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

  const openCreateForDay = (dateObj: Date) => {
    setEditEventId(null);
    const baseForm = emptyEventForm(localDateStr(dateObj));
    setNewEventForm(baseForm);
    setInitialEventFormStr(JSON.stringify(baseForm));
    setSelectedCalDay(null);
    setIsCreateModalOpen(true);
  };

  // Uzavírání modálů přes klávesu Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obsluha Esc používá aktuální stav – závislosti jsou vyjmenované ručně
  }, [isCreateModalOpen, selectedEvent, showEventCloseWarning, newEventForm, editEventId]);

  // API Synchronizace událostí
  useEffect(() => {
    if (!googleToken) {
      setEvents([]);
      return;
    }
    
    // Ohraničení pro dotaz dle aktivního okna
    let timeMin: string, timeMax: string;
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
        let specialCals = { cz_holidays: false };
        try { specialCals = JSON.parse(localStorage.getItem('zazijvr_special_calendars') || 'null') || specialCals; } catch { /* výchozí bez svátků */ }

        const requests: Promise<GoogleCalendarEvent[]>[] = [listEvents(googleToken, 'primary', timeMin, timeMax, 250)];
        if (specialCals.cz_holidays) requests.push(listEvents(googleToken, HOLIDAY_CALENDAR, timeMin, timeMax, 50));

        const results = await Promise.allSettled(requests);
        const allItems: GoogleCalendarEvent[] = [];
        let lastError: unknown = null;
        for (const r of results) {
          if (r.status === 'fulfilled') {
            r.value.forEach((item) => {
              // Svátky zeleně
              if (item.organizer?.email?.includes('holiday')) item.colorId = '10';
              allItems.push(item);
            });
          } else {
            lastError = r.reason;
          }
        }

        if (!lastError || allItems.length > 0) {
          // Deduplikace: stejné jméno a začátek (duplicitní pozvánky v Googlu)
          const seen = new Set<string>();
          setEvents(allItems.map(toCalendarEvent).filter((ev) => {
            const key = `${ev.title}_${ev.fullDate.getTime()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }));
        } else {
          setAppError('Chyba kalendáře: ' + (lastError instanceof Error ? lastError.message : String(lastError)));
        }
      } catch (err) {
        setAppError('Calendar fetch error: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [currentDate, googleToken, refreshTrigger, activeCalendarView, specialCalsTrigger]);

  const lastTriggerRef = useRef(triggerCreateEvent);

  useEffect(() => {
    if (triggerCreateEvent > lastTriggerRef.current) {
      setEditEventId(null);
      const baseForm = emptyEventForm();
      setNewEventForm(baseForm);
      setInitialEventFormStr(JSON.stringify(baseForm));
      setIsCreateModalOpen(true);
      lastTriggerRef.current = triggerCreateEvent;      setNewEventForm(baseForm);
      setInitialEventFormStr(JSON.stringify(baseForm));
      setIsCreateModalOpen(true);
      lastTriggerRef.current = triggerCreateEvent;
    }
  }, [triggerCreateEvent]);

  // Sledování notifikací na pozadí
  const notifiedEventsRef = useRef(new Set<string>());
  const startedEventsRef = useRef(new Set<string>());
  
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
    getEvent(googleToken, selectedEvent.recurringEventId)
      .then((data) => setPreviewRecurrenceText(data.recurrence?.length ? describeRecurrence(data.recurrence[0]) : 'Neznámé cyklování'))
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
    const eventBody: Omit<GoogleEventInput, 'start' | 'end'> & Partial<Pick<GoogleEventInput, 'start' | 'end'>> = {
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
      const pad = pad2;
      eventBody.end = { date: `${endD.getFullYear()}-${pad(endD.getMonth()+1)}-${pad(endD.getDate())}` };
    } else {
      const startDateTime = new Date(`${newEventForm.startDate}T${newEventForm.startTime}:00`).toISOString();
      const endDateTime = new Date(`${newEventForm.endDate}T${newEventForm.endTime}:00`).toISOString();
      eventBody.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      eventBody.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    
    if (newEventForm.recurrenceRule && newEventForm.recurrenceRule !== 'NONE') {
      let freq: RecurrenceRule | RecurrenceFreq = newEventForm.recurrenceRule;
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
         const pad = pad2;
         const dateString = `${uDate.getUTCFullYear()}${pad(uDate.getUTCMonth()+1)}${pad(uDate.getUTCDate())}T${pad(uDate.getUTCHours())}${pad(uDate.getUTCMinutes())}${pad(uDate.getUTCSeconds())}Z`;
         rrule += `;UNTIL=${dateString}`;
      }
      eventBody.recurrence = [rrule];
    }

    try {
      if (!eventBody.start || !eventBody.end) throw new Error('Chybí začátek nebo konec události');
      await saveEvent(googleToken, { ...eventBody, start: eventBody.start, end: eventBody.end }, editEventId);
      setRefreshTrigger(prev => prev + 1);
      setIsCreateModalOpen(false);
      setEditEventId(null);
      setNewEventForm(emptyEventForm());
    } catch {
      setAppError("Naše komunikace narazila na technickou chybu sítě.");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleEditSelectedEvent = async () => {
     if (!selectedEvent || !googleToken) return;
     let rootEventId = selectedEvent.id;
     let rr: RecurrenceRule = 'NONE';
     let freq: RecurrenceFreq = 'WEEKLY';
     let inv = 1;
     let untilVal = '';

     if (selectedEvent.recurringEventId) {
       rootEventId = selectedEvent.recurringEventId;
       try {
          const data = await getEvent(googleToken, rootEventId);
          if (data.recurrence && data.recurrence.length > 0) {
             const paramMap = parseRRule(data.recurrence[0]);
             const f = paramMap['FREQ'] as RecurrenceFreq | undefined;
             if (f) {
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

     const baseForm: EventForm = {
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
        attendees: selectedEvent.attendees ? selectedEvent.attendees.map(a => a.email).filter(Boolean).join(', ') : ''
     };
     setNewEventForm(baseForm);
     setInitialEventFormStr(JSON.stringify(baseForm));
     
     setSelectedEvent(null);
     setIsCreateModalOpen(true);
  };

  const handleDeleteSelectedEvent = () => {
    if (!selectedEvent || !googleToken) return;
    const target = selectedEvent;
    showConfirm(
      target.recurringEventId ? 'Opravdu chcete smazat celou opakovanou událost (všechny výskyty)?' : 'Opravdu chcete tuto událost smazat?',
      'Smazání události',
      async () => {
        setIsDeleting(true);
        try {
          await deleteEvent(googleToken, target.recurringEventId || target.id);
          setRefreshTrigger(p => p + 1);
          setSelectedEvent(null);
        } catch {
          setAppError('Došlo k chybě při mazání záznamu z platformy Google.');
        } finally {
          setIsDeleting(false);
        }
      },
      { confirmText: 'Smazat', type: 'error' }
    );
  };

  const handleDateChange = (action: 'prev' | 'next' | 'today') => {
    if (action === 'prev') setCurrentDate(new Date(currentYear, currentDate.getMonth() - 1, 1));
    else if (action === 'next') setCurrentDate(new Date(currentYear, currentDate.getMonth() + 1, 1));
    else if (action === 'today') setCurrentDate(new Date());
  };

  let currentMainView = null;

  // Navigace na obrazovce vývoje
  if (activeCalendarView !== 'Měsíční přehled' && activeCalendarView !== 'Co mě čeká?') {
    currentMainView = (
       <div className="flex-1 flex items-center justify-center p-10 relative h-full">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-rose rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
         <p className="text-neon-rose/60 uppercase tracking-[0.2em] font-bold z-10 text-xl border border-neon-rose/20 bg-neon-rose/5 px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(217,37,123,0.1)] backdrop-blur-md">
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


  currentMainView = (
    <MonthView
      currentYear={currentYear}
      currentMonthName={currentMonthName}
      currentDate={currentDate}
      handleDateChange={handleDateChange}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
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
        <div className="fixed inset-0 bg-navy-deep/80 backdrop-blur-md z-[2000] flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-navy border border-danger-soft/50 shadow-[0_0_30px_rgba(251,113,133,0.3)] rounded-2xl p-8 max-w-sm flex flex-col items-center gap-6 text-center relative overflow-hidden pointer-events-auto">
             <div className="w-16 h-16 rounded-full bg-danger-soft/10 border border-danger-soft/30 flex items-center justify-center shadow-[0_0_20px_rgba(251,113,133,0.2)]">
               <AlertTriangle size={32} className="text-danger-soft" />
             </div>
             <h3 className="text-xl font-bold text-white tracking-wide">Zahodit událost?</h3>
             <p className="text-sm text-slate-400 font-mono tracking-tight leading-relaxed">Máte rozpracovanou událost. Opravdu ji chcete zavřít bez uložení? Všechna nezuložená data budou ztracena.</p>
             <div className="flex w-full gap-3 mt-2">
               <button onClick={() => setShowEventCloseWarning(false)} className="flex-1 py-3 text-xs font-bold text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-neon-blue/[0.15] tracking-widest uppercase">Zpět</button>
               <button onClick={() => { setShowEventCloseWarning(false); setIsCreateModalOpen(false); }} className="flex-1 py-3 text-xs font-bold text-danger-soft bg-danger-soft/10 hover:bg-danger-soft/20 rounded-xl transition-all border border-danger-soft/30 hover:border-danger-soft hover:shadow-[0_0_15px_rgba(251,113,133,0.4)] tracking-widest uppercase">Zahodit</button>
             </div>
          </div>
        </div>,
        document.body
      )}

      {/* App Error Overlay */}
      {appError && createPortal(
        <div className="fixed inset-0 bg-navy-deep/90 z-[2000] flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-navy border border-neon-blue/50 shadow-[0_0_40px_rgba(0,243,255,0.2)] rounded-3xl p-10 max-w-[420px] flex flex-col items-center gap-7 text-center relative overflow-hidden pointer-events-auto">
             
             <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-neon-blue/20 to-neon-rose/20 border-2 border-neon-blue/50 flex items-center justify-center shadow-[0_0_25px_rgba(0,243,255,0.4)] z-10 shrink-0">
               <AlertTriangle size={36} className="text-neon-blue drop-shadow-[0_0_10px_#00f3ff]" />
             </div>
             
             <div className="z-10 flex flex-col gap-2 relative">
                 <h3 className="text-2xl font-black text-white tracking-widest uppercase drop-shadow-md">Chyba API</h3>
                 <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-neon-rose to-transparent mx-auto opacity-50 relative mt-1 mb-2"></div>
                 <p className="text-sm font-mono text-slate-300 leading-relaxed drop-shadow-sm tracking-tight">{appError}</p>
             </div>
             
             <div className="w-full mt-4 z-10">
               <button 
                 onClick={() => setAppError(null)} 
                 className="w-full py-4 bg-navy-deep/50 hover:bg-neon-blue/10 rounded-2xl transition-all border border-neon-blue/30 text-neon-blue font-bold text-xs uppercase tracking-[0.25em] hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:border-neon-blue active:scale-95"
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
