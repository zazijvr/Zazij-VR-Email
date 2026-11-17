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
