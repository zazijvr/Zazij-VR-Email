import type { CalendarEvent, EventAttendee } from '../types/calendar';

// Google Calendar API (primární kalendář)

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  [key: string]: unknown;
}

async function calendarRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Kalendář ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const createEvent = (token: string, event: GoogleEventInput) =>
  calendarRequest<{ id: string }>(token, '/events', { method: 'POST', body: JSON.stringify(event) });

// ───────────── Události ─────────────


export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: GoogleEventTime;
  end?: GoogleEventTime;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  attendees?: EventAttendee[];
  organizer?: { email?: string };
}

const calendarBase = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

/** Události v rozmezí (opakované rozbalené na jednotlivé výskyty) */
export const listEvents = async (
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  maxResults = 250,
): Promise<GoogleCalendarEvent[]> => {
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: String(maxResults) });
  const res = await fetch(`${calendarBase(calendarId)}/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Kalendář ${res.status}`);
  return ((await res.json()).items as GoogleCalendarEvent[]) || [];
};

export const getEvent = (token: string, id: string) => calendarRequest<GoogleCalendarEvent>(token, `/events/${id}`);

/** Nová událost, nebo přepsání existující (pozvaní dostanou e-mail o změně) */
export const saveEvent = (token: string, event: Omit<GoogleEventInput, 'id'>, id?: string | null) =>
  id
    ? calendarRequest<GoogleCalendarEvent>(token, `/events/${id}?sendUpdates=all`, { method: 'PUT', body: JSON.stringify(event) })
    : calendarRequest<GoogleCalendarEvent>(token, '/events?sendUpdates=all', { method: 'POST', body: JSON.stringify(event) });

export const deleteEvent = (token: string, id: string) =>
  calendarRequest<void>(token, `/events/${id}`, { method: 'DELETE' });

/** Událost z Googlu → událost aplikace (celodenní události se počítají v místním čase) */
export const toCalendarEvent = (item: GoogleCalendarEvent): CalendarEvent => {
  const isAllDay = !!item.start.date;
  const startStr = (item.start.dateTime || item.start.date) as string;
  const endStr = item.end?.dateTime || item.end?.date || startStr;

  let startDateObj: Date;
  let endDateObj: Date;
  if (isAllDay) {
    const [sY, sM, sD] = startStr.split('T')[0].split('-').map(Number);
    startDateObj = new Date(sY, sM - 1, sD, 0, 0, 0);
    if (item.end?.date) {
      // Google vrací „exkluzivní“ konec (následující den) – o milisekundu zpět = 23:59:59 posledního dne
      const [eY, eM, eD] = item.end.date.split('-').map(Number);
      endDateObj = new Date(new Date(eY, eM - 1, eD, 0, 0, 0).getTime() - 1);
    } else {
      endDateObj = new Date(startDateObj.getTime() + 86399999);
    }
  } else {
    startDateObj = new Date(startStr);
    endDateObj = new Date(endStr);
  }

  let alertMinutes: CalendarEvent['alertMinutes'] = 'default';
  if (item.reminders && item.reminders.useDefault === false) {
    alertMinutes = item.reminders.overrides?.find((r) => r.method === 'popup')?.minutes ?? null;
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
    isAllDay,
    alertMinutes,
    attendees: item.attendees || [],
  };
};

/** „RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=…“ → { FREQ: 'WEEKLY', INTERVAL: '2', UNTIL: '…' } */
export const parseRRule = (rrule: string): Record<string, string> => {
  const map: Record<string, string> = {};
  rrule.replace('RRULE:', '').split(';').forEach((p) => {
    const [k, v] = p.split('=');
    if (k) map[k] = v;
  });
  return map;
};

/** Lidský popis opakování („Každé 2 týdny (Konec: 25. 4. 2026)“) */
export const describeRecurrence = (rrule: string): string => {
  const p = parseRRule(rrule);
  const intv = p.INTERVAL ? parseInt(p.INTERVAL) : 1;
  const byFreq: Record<string, string> = {
    DAILY: intv > 1 ? `Každých ${intv} dní` : 'Denně',
    WEEKLY: intv > 1 ? `Každé ${intv} týdny` : 'Týdně',
    MONTHLY: intv > 1 ? `Každé ${intv} měsíce` : 'Měsíčně',
    YEARLY: intv > 1 ? `Každé ${intv} roky` : 'Ročně',
  };
  let text = (p.FREQ && byFreq[p.FREQ]) || 'Vlastní opakování';
  if (p.UNTIL) {
    const u = p.UNTIL;
    text += ` (Konec: ${parseInt(u.substring(6, 8))}. ${parseInt(u.substring(4, 6))}. ${u.substring(0, 4)})`;
  }
  return text;
};
