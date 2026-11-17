// Událost kalendáře tak, jak ji aplikace zobrazuje (převedená z Google Calendar API)

export interface EventAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  self?: boolean;
  organizer?: boolean;
}

export interface CalendarEvent {
  id: string;
  /** U opakované události id celé série */
  recurringEventId: string | null;
  title: string;
  fullDate: Date;
  endDate: Date;
  /** Barva Google Kalendáře „1“–„11“ */
  colorId?: string;
  description: string;
  /** Místo konání (volný text z Google Kalendáře) */
  location: string;
  isAllDay: boolean;
  /** Připomenutí v minutách předem; 'default' = výchozí z Google Kalendáře, null = bez připomenutí */
  alertMinutes: number | 'default' | null;
  attendees: EventAttendee[];
}

export type RecurrenceRule = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** Formulář nové / upravované události */
export interface EventForm {
  title: string;
  /** RRRR-MM-DD */
  startDate: string;
  endDate: string;
  /** HH:MM */
  startTime: string;
  endTime: string;
  allDay: boolean;
  description: string;
  /** Minuty předem; 'default' = výchozí z Google Kalendáře; záporné číslo = rozpracované vlastní zadání */
  alertMinutes: number | 'default' | null;
  recurrenceRule: RecurrenceRule;
  /** Prázdný řetězec jen během psaní do pole */
  recurrenceInterval: number | '';
  customFreq: RecurrenceFreq;
  /** RRRR-MM-DD, prázdné = bez konce */
  recurrenceUntil: string;
  /** Adresy oddělené čárkou */
  attendees: string;
}
