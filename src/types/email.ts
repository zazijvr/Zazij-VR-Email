// E-mail (vlákno) tak, jak ho aplikace zobrazuje v seznamu a ukládá do lokální keše

export interface ListEmail {
  /** id poslední zprávy ve vlákně */
  id: string;
  threadId: string;
  messageIds: Set<string>;
  messageCount: number;
  labelIds: string[];
  /** Zobrazované jméno (bez adresy a uvozovek) */
  from: string;
  to: string;
  originalFrom: string;
  cc: string;
  /** Celé hlavičky „Jméno <adresa>“ */
  originalFromRaw: string;
  originalToRaw: string;
  originalCcRaw: string;
  subject: string;
  snippet: string;
  isUnread: boolean;
  isStarred: boolean;
  /** „Dnes“ nebo datum v češtině */
  dateText: string;
  timeText: string;
  /** ms od 1970 */
  rawDate: number;
  sizeText: string;
  rawSize: number;
  hasAttachment: boolean;
  html: string;
  text: string;
  attachments: unknown[];
  /** Jen v lokální keši: složka a účet, ke kterým záznam patří */
  folderLabel?: string;
  account?: string;
  /** Jen v paměti: nově příchozí zpráva (animace) */
  _newArrival?: boolean;
}

/** E-mail, se kterým se pracuje (z UI může přijít celý, nebo jen jeho id) */
export type EmailRef = Partial<ListEmail> & { id: string };

/** Přesun e-mailu do jiné složky (přetažením na složku v postranním panelu) */
export interface MoveRequest {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  fullObj?: EmailRef;
}

/** Data přenášená při přetahování (dataTransfer 'application/json') */
export type DragPayload =
  | { type: 'FOLDER'; index: number }
  | { type: 'CUSTOM_FOLDER'; id: string; name: string }
  | { type: 'EMAIL'; id: string; sourceLabel: string; emailData?: EmailRef }
  | { type: 'EMAIL_MULTI'; items: { id: string; sourceLabel: string; emailData?: EmailRef }[] };
