// Převod vláken z Gmail API na položky seznamu a jejich slučování.
// Čisté funkce bez síťových volání.

import type { GmailMessagePart, GmailThread } from '../types/gmail';
import type { ListEmail } from '../types/email';
import { getHeader } from '../utils/emailParser';

export const hasAttachment = (payload: GmailMessagePart | undefined): boolean => {
  if (!payload) return false;
  // Seznam se stahuje jen s hlavičkami (bez částí) – příloha se pozná podle multipart/mixed
  if (!payload.parts && payload.mimeType === 'multipart/mixed') return true;
  if (payload.filename && payload.filename.length > 0) return true;
  return payload.parts ? payload.parts.some(hasAttachment) : false;
};

export const formatSize = (bytes: number | null | undefined): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export interface ParsedDate {
  dateText: string;
  timeText: string;
  time: number;
}

export const parseDate = (dateStr: string): ParsedDate => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { dateText: '', timeText: '', time: 0 };
  const timeText = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) {
    return { dateText: 'Dnes', timeText, time: d.getTime() };
  }
  return {
    dateText: d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    timeText,
    time: d.getTime(),
  };
};

/** Jméno bez e-mailu a bez uvozovek („"Alza.cz" <info@alza.cz>“ → Alza.cz) */
export const displayName = (full: string): string =>
  full.split('<')[0].trim().replace(/^["']+|["']+$/g, '').replace(/\\"/g, '').trim() || full;

const REPLIED_MARK = '↩️ ';

/** Vlákno z Gmailu → položka seznamu (null, když vlákno nemá zprávy) */
export const formatThreadMessage = (thread: GmailThread): ListEmail | null => {
  const messages = thread.messages || [];
  if (messages.length === 0) return null;

  const hasLabel = (labelIds: string[] | undefined, label: string) => (labelIds || []).includes(label);

  const firstMsg = messages[0];
  const firstHeaders = firstMsg.payload?.headers || [];
  const hasCloudRepliedFlag = messages.some((m, i) => i > 0 && hasLabel(m.labelIds, 'SENT'));

  // Odesílatel z poslední přijaté zprávy (ne z mé odpovědi), datum z úplně poslední
  const lastReceivedMsg = messages.slice().reverse().find((m) => !hasLabel(m.labelIds, 'SENT')) || firstMsg;
  const receivedHeaders = lastReceivedMsg.payload?.headers || [];
  const latestMsg = messages[messages.length - 1];

  const fromFull = getHeader(receivedHeaders, 'From');
  const toFull = getHeader(receivedHeaders, 'To');
  const ccFull = getHeader(receivedHeaders, 'Cc');
  const dateData = parseDate(getHeader(latestMsg.payload?.headers, 'Date'));
  const fromParsed = displayName(fromFull);

  let snippet = thread.snippet || latestMsg.snippet || '';
  try {
    const repliedLocal: string[] = JSON.parse(localStorage.getItem('vr-replied-threads') || '[]');
    const repliedLabelId = localStorage.getItem('vr-replied-label-id');
    const hasCustomRepliedFlag = !!repliedLabelId && messages.some((m) => hasLabel(m.labelIds, repliedLabelId));
    if ((repliedLocal.includes(thread.id) || hasCustomRepliedFlag || hasCloudRepliedFlag) && !snippet.startsWith(REPLIED_MARK)) {
      snippet = REPLIED_MARK + snippet;
    }
  } catch {
    /* poškozený záznam v localStorage – značka odpovědi se jen nezobrazí */
  }

  return {
    id: latestMsg.id,
    threadId: thread.id,
    messageIds: new Set(messages.map((m) => m.id)),
    messageCount: messages.length,
    labelIds: latestMsg.labelIds || [],
    from: fromParsed,
    to: displayName(toFull),
    originalFrom: fromParsed,
    cc: ccFull ? displayName(ccFull) : '',
    originalFromRaw: fromFull,
    originalToRaw: toFull,
    originalCcRaw: ccFull,
    subject: getHeader(firstHeaders, 'Subject') || '(Bez předmětu)',
    snippet,
    isUnread: messages.some((m) => hasLabel(m.labelIds, 'UNREAD')),
    isStarred: messages.some((m) => hasLabel(m.labelIds, 'STARRED')),
    dateText: dateData.dateText,
    timeText: dateData.timeText,
    rawDate: dateData.time,
    sizeText: formatSize(latestMsg.sizeEstimate),
    rawSize: latestMsg.sizeEstimate || 0,
    hasAttachment: messages.some((m) => hasAttachment(m.payload)),
    html: '',
    text: '',
    attachments: [],
  };
};

/** Převede vlákna na položky seznamu (prázdná vlákna vynechá) */
export const formatThreads = (threads: GmailThread[]): ListEmail[] =>
  threads.map(formatThreadMessage).filter((e): e is ListEmail => e !== null);

/**
 * Sloučí dosavadní seznam s nově staženými položkami podle vlákna.
 * isSilentFetch = položky z tichého dotahování nové pošty (dostanou animaci příchodu).
 */
export const mergeAndGroupEmails = (
  oldList: ListEmail[],
  newlyFetchedList: ListEmail[],
  isSilentFetch = false,
): ListEmail[] => {
  const threadMap = new Map<string, ListEmail>();

  oldList.forEach((email) => {
    // Staré _newArrival se zahodí, aby animace nehrála znovu při dalším stažení
    const { _newArrival: _ignored, ...rest } = email;
    threadMap.set(email.threadId || email.id, {
      ...rest,
      messageIds: rest.messageIds instanceof Set ? rest.messageIds : new Set([email.id]),
    });
  });

  newlyFetchedList.forEach((email) => {
    const tId = email.threadId || email.id;
    const existing = threadMap.get(tId);
    if (!existing) {
      threadMap.set(tId, {
        ...email,
        messageIds: email.messageIds instanceof Set ? new Set(email.messageIds) : new Set([email.id]),
        _newArrival: isSilentFetch,
      });
      return;
    }

    if (!existing.messageIds.has(email.id)) {
      existing.messageIds.add(email.id);
      existing.rawSize += email.rawSize;
      existing.sizeText = formatSize(existing.rawSize);
      if (isSilentFetch) existing._newArrival = true;
    }
    existing.isUnread = existing.isUnread || email.isUnread;
    existing.isStarred = existing.isStarred || email.isStarred;
    existing.hasAttachment = existing.hasAttachment || email.hasAttachment;

    if (email.rawDate > existing.rawDate) {
      existing.rawDate = email.rawDate;
      existing.dateText = email.dateText;
      existing.timeText = email.timeText;
      existing.snippet = email.snippet;
      existing.id = email.id;
      existing.originalFrom = email.originalFrom || email.from;
    }
  });

  const finalEmails = Array.from(threadMap.values());
  finalEmails.forEach((e) => {
    e.messageCount = e.messageIds.size;
    // Vlákno se tváří jako jedna zpráva (ta nejnovější)
    e.from = e.originalFrom;
  });
  return finalEmails;
};
