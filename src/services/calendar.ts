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
