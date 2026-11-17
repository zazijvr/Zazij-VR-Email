// Načtení e-mailu pro detail: celé vlákno, tělo, přílohy a vložené obrázky.
// Čistá funkce „id zprávy → data pro zobrazení“ – volá ji TanStack Query (mezipaměť, souběh, opakování).

import DOMPurify from 'dompurify';
import { getAttachment, getMessage, getThread } from './gmail';
import { db } from '../db/db';
import {
  decodeBase64Url, decodeMojibake, extractAttachments, extractInlineImages, getHeader, getMessageBody,
  type AttachmentInfo, type InlineImage,
} from '../utils/emailParser';
import type { GmailMessage, GmailThread } from '../types/gmail';
import type { ListEmail } from '../types/email';

/** Načtený e-mail (poslední zpráva vlákna) pro zobrazení v detailu */
export interface EmailDetailData {
  subject: string;
  /** Zobrazované jméno odesílatele */
  from: string;
  /** Celá hlavička From „Jméno <adresa>“ */
  rawFrom: string;
  replyTo?: string;
  to: string;
  cc: string;
  date: string;
  htmlBody: string;
  textBody: string;
  rawTextBody: string;
  attachments: AttachmentInfo[];
  messageId: string;
  threadId?: string;
  rfcMessageId?: string;
  isStarred: boolean;
  isUnread: boolean;
  isDraft: boolean;
  labelIds: string[];
}

/** Offline: z lokální keše je jen hlavička a úryvek (tělo se ukládá až online) */
const offlineDetail = (cached: ListEmail): EmailDetailData => {
  const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (str: string | undefined) => String(str || '').replace(/[&<>"]/g, (c) => ESC[c]);
  return {
    subject: cached.subject || '(Bez předmětu)',
    from: cached.from,
    rawFrom: cached.originalFromRaw || cached.from,
    to: cached.originalToRaw || cached.to || '',
    cc: cached.originalCcRaw || '',
    date: [cached.dateText, cached.timeText].filter(Boolean).join(' '),
    htmlBody: `<p>${esc(cached.snippet)}…</p><p style="opacity:.6"><i>Jste offline – celý obsah zprávy se načte po připojení k internetu.</i></p>`,
    textBody: cached.snippet || '',
    rawTextBody: cached.snippet || '',
    attachments: [],
    messageId: cached.id,
    threadId: cached.threadId,
    isStarred: !!cached.isStarred,
    isUnread: !!cached.isUnread,
    isDraft: (cached.labelIds || []).includes('DRAFT'),
    labelIds: cached.labelIds || []
  };
};

export async function loadEmailDetail(token: string, messageId: string): Promise<EmailDetailData> {
  if (!navigator.onLine) {
    const cached = await db.emails.get(messageId);
    if (cached) return offlineDetail(cached);
  }

  let data: GmailMessage | null = null;
  const fetchThread = (threadId: string) => getThread(token, threadId).catch(() => null);

  // Id vlákna známe ze seznamu (lokální keš) – vlákno se stáhne hned, bez mezikroku přes zprávu
  let threadData: GmailThread | null = null;
  const knownThreadId = (await db.emails.get(messageId).catch(() => null))?.threadId;
  if (knownThreadId) {
    try { threadData = await fetchThread(knownThreadId); } catch (te) { console.warn('Vlákno z keše nešlo načíst', te); }
  }
  if (!threadData?.messages?.length) {
    data = await getMessage(token, messageId, 'full');
    if (data.threadId) {
      try { threadData = await fetchThread(data.threadId); } catch (te) { console.error("Vlákno se nepodařilo nalistovat, padám na base zprávu", te); }
    }
  }

  // ------------------ ZPRACOVÁNÍ THREADŮ ------------------
  let allAttachments: AttachmentInfo[] = [];
  let allInlineTokens: InlineImage[] = [];

  if (threadData?.messages?.length) {
    // Zobrazuje se poslední zpráva vlákna
    data = threadData.messages[threadData.messages.length - 1];

    // Přílohy a vložené obrázky z celé historie vlákna
    for (const msg of threadData.messages) {
      const msgAtts = extractAttachments(msg.payload);
      msgAtts.forEach(a => Object.assign(a, { messageId: msg.id }));
      allAttachments = allAttachments.concat(msgAtts);

      const msgInlines = extractInlineImages(msg.payload);
      msgInlines.forEach(a => Object.assign(a, { messageId: msg.id }));
      allInlineTokens = allInlineTokens.concat(msgInlines);
    }
  }

  if (!data) throw new Error('Zprávu se nepodařilo načíst');
  const msg: GmailMessage = data;

  // Pokud jsmee neměli thready, zkusíme najít normálně přílohy
  if (allAttachments.length === 0) allAttachments = extractAttachments(msg.payload);
  if (allInlineTokens.length === 0) allInlineTokens = extractInlineImages(msg.payload);
  
  const headers = msg.payload?.headers || [];
  const subject = getHeader(headers, 'Subject') || '(Bez předmětu)';
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const replyToHeader = getHeader(headers, 'Reply-To') || '';
  const dateRaw = getHeader(headers, 'Date');
  const rfcMessageId = getHeader(headers, 'Message-ID');

  // Pěkné naformátování data
  const dateObj = new Date(dateRaw);
  let niceDate = dateRaw;
  if (!isNaN(dateObj.getTime())) {
    const today = new Date();
    const isToday = dateObj.getDate() === today.getDate() && dateObj.getMonth() === today.getMonth() && dateObj.getFullYear() === today.getFullYear();
    niceDate = isToday
      ? dateObj.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
      : dateObj.toLocaleDateString('cs-CZ');
  }

  // Zkrácení odesílatele na jméno (odříznutí <email>)
  let displayFrom = from;
  if (from) {
    const fromMatch = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
    if (fromMatch && fromMatch[1].trim() !== '') {
      displayFrom = fromMatch[1].trim();
    } else {
      displayFrom = from.replace(/[<>]/g, '');
    }
  }

  const bodyExtract = getMessageBody(msg.payload || {});

  // Zpracování extrémně velkých emailových těl z attachmentId
  if (bodyExtract.attachmentId) {
    try {
      const attachData = await getAttachment(token, msg.id || messageId, bodyExtract.attachmentId);
      if (attachData.data) {
        bodyExtract.html = decodeMojibake(decodeBase64Url(attachData.data));
      } else {
        bodyExtract.html = '<div class="text-red-500 p-4">Nelze stáhnout velké tělo zprávy.</div>';
      }
    } catch (e) {
      console.error("Vážná chyba stahování těla zprávy přes attachmentId:", e);
      bodyExtract.html = '<div class="text-red-500 p-4">Chyba při stahování obsahu.</div>';
    }
  }

  const htmlBody = bodyExtract.html;
  // Clean HTML to rough plain text for quoting in replies
  const rawTextBody = htmlBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>?/gm, '').substring(0, 3000); // limit to 3000 chars

  const isStarred = msg.labelIds?.includes('STARRED') || false;
  // Nepřečtené = kterákoli zpráva vlákna má UNREAD
  const isUnread = (threadData?.messages || [msg]).some(m => m.labelIds?.includes('UNREAD'));
  const cc = getHeader(headers, 'Cc') || '';
  const attachments = allAttachments;
  const inlineImagesTokens = allInlineTokens;

  let processedHtmlBody = htmlBody;

  // Vložené obrázky: jen ty, na které zobrazená zpráva opravdu odkazuje, a všechny najednou
  const escRe = (str: string) => str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const lowerHtml = htmlBody.toLowerCase();
  const neededInlines = inlineImagesTokens.filter(t => t.cid && lowerHtml.includes(`cid:${t.cid.toLowerCase()}`));
  const inlineResults = await Promise.all(neededInlines.map(async (inline) => {
    try {
      let raw = inline.data;
      if (!raw && inline.attachmentId) {
        const sourceMsgId = inline.messageId || msg.id;
        raw = (await getAttachment(token, sourceMsgId, inline.attachmentId)).data;
      }
      if (!raw) return null;
      return [inline.cid, `data:${inline.mimeType || 'image/png'};base64,${raw.replace(/-/g, '+').replace(/_/g, '/')}`];
    } catch (e) {
      console.error("Failed to fetch inline image", e);
      return null;
    }
  }));
  for (const r of inlineResults) {
    if (r) processedHtmlBody = processedHtmlBody.replace(new RegExp(`cid:${escRe(r[0])}`, 'gi'), r[1]);
  }

  // Auto-linkifikace emailů v surovém textu nebo v historii (aby se dalo kliknout i na plain-text emaily)
  processedHtmlBody = processedHtmlBody.replace(
    /(<a\b[^>]*>[\s\S]*?<\/a>)|([a-zA-Z0-9-]+=["'][^"'>]*@[^"'>]+["'])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    (match, aTag, attrMatch, email) => {
      if (aTag) return aTag;
      if (attrMatch) return attrMatch;
      if (email) return `<a href="mailto:${email}">${email}</a>`;
      return match;
    }
  );

  return {
    subject,
    from: displayFrom,
    rawFrom: from,
    replyTo: replyToHeader,
    to,
    date: niceDate,
    cc,
    htmlBody: DOMPurify.sanitize(processedHtmlBody, { ADD_DATA_URI_TAGS: ['img'] }),
    textBody: bodyExtract.text,
    rawTextBody,
    attachments,
    messageId: msg.id,
    threadId: msg.threadId,
    rfcMessageId,
    isStarred,
    isUnread,
    isDraft: msg.labelIds?.includes('DRAFT') || false,
    labelIds: msg.labelIds || []
  };
}
