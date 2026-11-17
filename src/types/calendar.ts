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
  isAllDay: boolean;
  /** Připomenutí v minutách předem; 'default' = výchozí z Google Kalendáře, null = bez připomenutí */
  alertMinutes: number | 'default' | null;
  attendees: EventAttendee[];
}
