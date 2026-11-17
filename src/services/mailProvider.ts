// Společné rozhraní pro poštu – Gmail (Gmail API) nebo jiný účet (IMAP/SMTP).
// Komponenty pracují jen s tímto rozhraním; který „poskytovatel“ to je, určuje aktivní účet.

import DOMPurify from 'dompurify';
import { createContext, useContext } from 'react';
import {
  deleteThread, getAttachmentBytes, getThreadsMeta, listThreads, modifyMessage, modifyThread,
  saveDraft as gmailSaveDraft, sendMessage, trashThread, untrashThread,
} from './gmail';
import { loadEmailDetail, type EmailDetailData } from './emailDetail';
import { formatSize, formatThreads, mergeAndGroupEmails, parseDate } from './threads';
import {
  imapAppend, imapDelete, imapGetAttachment, imapGetMessage, imapListMessages, imapMove, imapSetFlag, smtpSend,
  type ImapFolder, type ImapMessageSummary,
} from './imap';
import { encodeBase64Url, type AttachmentInfo } from '../utils/emailParser';
import type { EmailRef, ListEmail } from '../types/email';
import type { GmailLabel } from '../types/gmail';
import type { UnreadCounts } from '../types/account';

export interface FolderPage {
  emails: ListEmail[];
  nextPageToken: string | null;
}

export interface ListOptions {
  pageToken?: string;
  unreadOnly: boolean;
  query: string;
}

export interface AttachmentFile {
  bytes: Uint8Array;
  /** standardní base64 (pro data URL) */
  base64: string;
  /** „binární“ řetězec (pro ICS) */
  binary: string;
}

export interface MailProvider {
  kind: 'gmail' | 'imap';
  /** Adresa účtu – součást klíčů mezipaměti */
  account: string;
  /** Lze z této pošty přidávat pozvánky do Google Kalendáře */
  canUseGoogleCalendar: boolean;
  /** Koncepty se v Gmailu dají otevřít a pokračovat v nich (IMAP: jen nový e-mail z obsahu) */
  supportsDraftResume: boolean;
  listPage(folder: string, opts: ListOptions): Promise<FolderPage>;
  loadDetail(id: string): Promise<EmailDetailData>;
  attachment(detail: EmailDetailData, att: AttachmentInfo): Promise<AttachmentFile | null>;
  /** thread: celé vlákno (detail) / jen zpráva (seznam) – u IMAPu je to totéž */
  setRead(ref: EmailRef, read: boolean, scope?: 'message' | 'thread'): Promise<void>;
  setStarred(ref: EmailRef, starred: boolean): Promise<void>;
  trash(ref: EmailRef, fromFolder: string): Promise<void>;
  deleteForever(ref: EmailRef, fromFolder: string): Promise<void>;
  /** Z koše zpět do Doručených */
  restore(ref: EmailRef): Promise<void>;
  markSpam(ref: EmailRef, fromFolder: string): Promise<void>;
  move(ref: EmailRef, fromFolder: string, toFolder: string): Promise<void>;
  /** Odeslání hotové MIME zprávy (bez hlavičky From – doplní ji server / Rust) */
  send(mime: string, opts: { recipients: string[]; threadId?: string }): Promise<{ id?: string; threadId?: string; unread?: boolean }>;
  /** Uloží koncept; vrací id konceptu (Gmail) */
  saveDraft?(mime: string, opts: { draftId?: string | null; threadId?: string }): Promise<string | undefined>;
}

const MailProviderContext = createContext<MailProvider | null>(null);
export const MailProviderProvider = MailProviderContext.Provider;
export const useMailProvider = () => useContext(MailProviderContext);

// ───────────── Gmail ─────────────

const GMAIL_SYSTEM: Record<string, string> = {
  'Doručené': 'INBOX', 'Důležité': 'STARRED', 'Odeslané': 'SENT', 'Rozepsané': 'DRAFT', 'Spam': 'SPAM', 'Koš': 'TRASH',
};

export function createGmailProvider(token: string, account: string, customLabels: GmailLabel[]): MailProvider {
  const labelId = (folder: string) => GMAIL_SYSTEM[folder] ?? customLabels.find((l) => l.name === folder)?.id ?? 'INBOX';
  const thread = (ref: EmailRef) => ref.threadId || ref.id;
  return {
    kind: 'gmail',
    account,
    canUseGoogleCalendar: true,
    supportsDraftResume: true,
    async listPage(folder, { pageToken, unreadOnly, query }) {
      const q = [unreadOnly ? 'is:unread' : '', query.trim()].filter(Boolean).join(' ') || undefined;
      const list = await listThreads(token, { labelId: labelId(folder), q, maxResults: 40, pageToken });
      if (!list.threads) return { emails: [], nextPageToken: null };
      const emails = formatThreads(await getThreadsMeta(token, list.threads.map((t) => t.id)));
      return { emails: mergeAndGroupEmails([], emails), nextPageToken: list.nextPageToken || null };
    },
    loadDetail: (id) => loadEmailDetail(token, id),
    attachment: (detail, att) => getAttachmentBytes(token, att.messageId || detail.messageId, att.attachmentId),
    async setRead(ref, read, scope = 'message') {
      const [add, remove] = read ? [[], ['UNREAD']] : [['UNREAD'], []];
      if (scope === 'thread') await modifyThread(token, thread(ref), add, remove);
      else await modifyMessage(token, ref.id, add, remove);
    },
    async setStarred(ref, starred) {
      await modifyThread(token, thread(ref), starred ? ['STARRED'] : [], starred ? [] : ['STARRED']);
    },
    async trash(ref) { await trashThread(token, thread(ref)); },
    async deleteForever(ref) { await deleteThread(token, thread(ref)); },
    async restore(ref) {
      await untrashThread(token, thread(ref));
      await modifyThread(token, thread(ref), ['INBOX']);
    },
    async markSpam(ref) { await modifyThread(token, thread(ref), ['SPAM'], ['INBOX']); },
    async move(ref, fromFolder, toFolder) {
      const from = labelId(fromFolder);
      const to = labelId(toFolder);
      if (from === 'TRASH') { await untrashThread(token, thread(ref)); return; }
      if (to === 'TRASH') { await trashThread(token, thread(ref)); return; }
      await modifyThread(token, thread(ref), [to], [from]);
    },
    async send(mime, { threadId }) {
      const sent = await sendMessage(token, encodeBase64Url(mime), threadId);
      // Zpráva poslaná sobě dostane UNREAD – odeslaná pošta se nemá tvářit jako nová
      if (sent.labelIds?.includes('UNREAD')) await modifyMessage(token, sent.id, [], ['UNREAD']).catch(() => {});
      return { id: sent.id, threadId: sent.threadId };
    },
    async saveDraft(mime, { draftId, threadId }) {
      const d = await gmailSaveDraft(token, encodeBase64Url(mime), { draftId, threadId });
      return d.id;
    },
  };
}

// ───────────── IMAP (Seznam, vlastní doména…) ─────────────

/** id zprávy v seznamu: „uid:cesta-složky“ */
export const imapId = (uid: number, folderPath: string) => `${uid}:${folderPath}`;
const parseImapId = (id: string) => {
  const i = id.indexOf(':');
  return { uid: Number(id.slice(0, i)), folder: id.slice(i + 1) };
};

const firstName = (list: string) => {
  const first = list.split(',')[0]?.trim() || '';
  return first.split('<')[0].trim().replace(/^["']+|["']+$/g, '') || first.replace(/[<>]/g, '');
};

/** Složky IMAP účtu → vlastní složky v postranním panelu (bez speciálních) */
export const imapCustomFolders = (folders: ImapFolder[]): GmailLabel[] =>
  folders
    .filter((f) => !f.special && f.path.toUpperCase() !== 'INBOX')
    .map((f) => ({
      id: f.path,
      // Postranní panel skládá stromy podle „/“
      name: f.delimiter && f.delimiter !== '/' ? f.name.split(f.delimiter).join('/') : f.name,
      type: 'user' as const,
    }));

const SPECIAL_BY_FOLDER: Record<string, ImapFolder['special']> = {
  'Doručené': 'inbox', 'Odeslané': 'sent', 'Rozepsané': 'drafts', 'Spam': 'junk', 'Koš': 'trash',
};

/** Počty nepřečtených podle názvů složek v postranním panelu */
export const imapUnreadCounts = (folders: ImapFolder[]): UnreadCounts => {
  const counts: UnreadCounts = {};
  for (const f of folders) {
    const system = Object.entries(SPECIAL_BY_FOLDER).find(([, sp]) => sp === f.special)?.[0]
      ?? (f.path.toUpperCase() === 'INBOX' ? 'Doručené' : null);
    const name = system ?? imapCustomFolders([f])[0]?.name;
    if (name && f.unseen > 0) counts[name] = f.unseen;
  }
  return counts;
};

export function createImapProvider(account: string, folders: ImapFolder[]): MailProvider {
  const special = (kind: ImapFolder['special']) => folders.find((f) => f.special === kind)?.path ?? null;
  const inbox = folders.find((f) => f.path.toUpperCase() === 'INBOX')?.path ?? 'INBOX';
  /** Název složky z postranního panelu → cesta na serveru */
  const pathOf = (folder: string): string | null => {
    if (folder === 'Doručené' || folder === 'Důležité') return inbox;
    const sp = SPECIAL_BY_FOLDER[folder];
    if (sp) return special(sp);
    return imapCustomFolders(folders).find((f) => f.name === folder)?.id ?? null;
  };

  const toListEmail = (m: ImapMessageSummary, folderPath: string): ListEmail => {
    const id = imapId(m.uid, folderPath);
    const d = parseDate(m.date ? new Date(m.date).toISOString() : '');
    return {
      id,
      threadId: id,
      messageIds: new Set([id]),
      messageCount: 1,
      labelIds: [],
      from: m.from || m.fromRaw,
      to: firstName(m.to),
      originalFrom: m.from || m.fromRaw,
      cc: m.cc ? firstName(m.cc) : '',
      originalFromRaw: m.fromRaw,
      originalToRaw: m.to,
      originalCcRaw: m.cc,
      subject: m.subject || '(Bez předmětu)',
      snippet: m.answered ? '↩️ ' : '',
      isUnread: !m.seen,
      isStarred: m.flagged,
      dateText: d.dateText,
      timeText: d.timeText,
      rawDate: m.date,
      sizeText: formatSize(m.size),
      rawSize: m.size,
      hasAttachment: m.hasAttachment,
      html: '',
      text: '',
      attachments: [],
    };
  };

  const ref = (r: EmailRef) => parseImapId(r.id);

  return {
    kind: 'imap',
    account,
    canUseGoogleCalendar: false,
    supportsDraftResume: false,
    async listPage(folder, { pageToken, unreadOnly, query }) {
      const path = pathOf(folder);
      if (!path) return { emails: [], nextPageToken: null };
      const page = pageToken ? Number(pageToken) : 0;
      const filter = folder === 'Důležité' ? 'flagged' : unreadOnly ? 'unseen' : undefined;
      const res = await imapListMessages(account, path, page, 40, { filter, query });
      const loaded = (page + 1) * 40;
      return {
        emails: res.messages.map((m) => toListEmail(m, path)),
        nextPageToken: loaded < res.total ? String(page + 1) : null,
      };
    },
    async loadDetail(id) {
      const { uid, folder } = parseImapId(id);
      const m = await imapGetMessage(account, folder, uid);
      const date = m.date ? new Date(m.date) : null;
      const today = new Date().toDateString();
      return {
        subject: m.subject || '(Bez předmětu)',
        from: m.from || m.fromRaw,
        rawFrom: m.fromRaw,
        replyTo: m.replyTo || undefined,
        to: m.to,
        cc: m.cc,
        date: date ? (date.toDateString() === today ? date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('cs-CZ')) : '',
        htmlBody: DOMPurify.sanitize(m.html, { ADD_DATA_URI_TAGS: ['img'] }),
        textBody: m.text,
        rawTextBody: (m.text || m.html.replace(/<[^>]*>?/gm, '')).substring(0, 3000),
        attachments: m.attachments.map((a) => ({
          filename: a.filename, mimeType: a.mimeType, attachmentId: String(a.index), size: a.size, messageId: id,
        })),
        messageId: id,
        threadId: id,
        rfcMessageId: m.messageId || undefined,
        isStarred: m.flagged,
        isUnread: !m.seen,
        isDraft: folder === special('drafts'),
        // Koš kvůli potvrzení trvalého smazání
        labelIds: folder === special('trash') ? ['TRASH'] : [],
      };
    },
    async attachment(detail, att) {
      const { uid, folder } = parseImapId(detail.messageId);
      const base64 = await imapGetAttachment(account, folder, uid, Number(att.attachmentId));
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, base64, binary };
    },
    async setRead(r, read) {
      const { uid, folder } = ref(r);
      await imapSetFlag(account, folder, [uid], 'seen', read);
    },
    async setStarred(r, starred) {
      const { uid, folder } = ref(r);
      await imapSetFlag(account, folder, [uid], 'flagged', starred);
    },
    async trash(r) {
      const { uid, folder } = ref(r);
      await imapDelete(account, folder, [uid], special('trash'));
    },
    async deleteForever(r) {
      const { uid, folder } = ref(r);
      await imapDelete(account, folder, [uid], null);
    },
    async restore(r) {
      const { uid, folder } = ref(r);
      await imapMove(account, folder, [uid], inbox);
    },
    async markSpam(r) {
      const { uid, folder } = ref(r);
      const junk = special('junk');
      if (!junk) throw new Error('Účet nemá složku Spam.');
      await imapMove(account, folder, [uid], junk);
    },
    async move(r, _from, toFolder) {
      const { uid, folder } = ref(r);
      const target = pathOf(toFolder);
      if (!target) throw new Error(`Složka ${toFolder} na serveru neexistuje.`);
      await imapMove(account, folder, [uid], target);
    },
    async send(mime, { recipients }) {
      await smtpSend(account, mime, recipients, special('sent'));
      return {};
    },
    async saveDraft(mime) {
      const drafts = special('drafts');
      if (!drafts) throw new Error('Účet nemá složku Koncepty.');
      await imapAppend(account, drafts, mime, true);
      return undefined;
    },
  };
}
