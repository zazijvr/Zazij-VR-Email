import Dexie from 'dexie';

export const db = new Dexie('ZazijVrEmailDB');

// Verze 1
db.version(1).stores({
  // Emaily: id je unikátní klíč z Googlu. Indexujeme ho podle složky (folderLabel) pro filtrování.
  emails: 'id, folderLabel, date, isUnread, from, to, subject',
  // Lokální štítky
  tags: 'id, emailId, tagName, color'
});
