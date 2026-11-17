import Dexie, { type EntityTable } from 'dexie';
import type { ListEmail } from '../types/email';

export interface LocalTag {
  id: string;
  emailId: string;
  tagName: string;
  color: string;
}

export const db = new Dexie('ZazijVrEmailDB') as Dexie & {
  emails: EntityTable<ListEmail, 'id'>;
  tags: EntityTable<LocalTag, 'id'>;
};

// Verze 1
db.version(1).stores({
  // Emaily: id je unikátní klíč z Googlu. Indexujeme ho podle složky (folderLabel) pro filtrování.
  emails: 'id, folderLabel, date, isUnread, from, to, subject',
  // Lokální štítky
  tags: 'id, emailId, tagName, color'
});
