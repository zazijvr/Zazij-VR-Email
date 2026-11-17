// Jediné místo pro komunikaci s Gmail API.
// Řeší přihlášení (Bearer token), opakování při přetížení (429/503) a převod chyb.

import type {
  GmailAttachment,
  GmailLabel,
  GmailMessage,
  GmailProfile,
  GmailThread,
  GmailThreadListResponse,
} from '../types/gmail';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  readonly status: number;
  readonly reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
    this.reason = reason;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Požadavek na Gmail API. Při 429 (moc dotazů) a 503 (přetížení) počká a zkusí to znovu.
 * Gmail povolí na účet zhruba 250 „jednotek“ za sekundu (vlákno ≈ 10, zpráva ≈ 5).
 */
export async function gmailRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  retries = 4,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      await sleep(300 * 2 ** attempt + Math.random() * 200);
      continue;
    }
    if (!res.ok) {
      let message = `Gmail API ${res.status}`;
      let reason: string | undefined;
      try {
        const body = await res.json();
        message = body?.error?.message || message;
        reason = body?.error?.errors?.[0]?.reason || body?.error?.status;
      } catch {
        /* tělo není JSON */
      }
      throw new GmailError(res.status, message, reason);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Spustí úlohy s omezeným počtem souběžných požadavků; výsledky drží pořadí vstupu */
export async function mapLimited<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const results = new Array<O>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ───────────── Vlákna ─────────────

export interface ListThreadsOptions {
  labelId: string;
  /** Gmail vyhledávací dotaz, např. „is:unread faktura“ */
  q?: string;
  maxResults?: number;
  pageToken?: string;
}

export const listThreads = (token: string, { labelId, q, maxResults = 40, pageToken }: ListThreadsOptions) => {
  const params = new URLSearchParams({ labelIds: labelId, maxResults: String(maxResults) });
  if (q) params.set('q', q);
  if (pageToken) params.set('pageToken', pageToken);
  return gmailRequest<GmailThreadListResponse>(token, `/threads?${params}`);
};

/** Hlavičky pro seznam – celé tělo e-mailu se stahuje až v detailu */
const LIST_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

export const getThreadMeta = (token: string, id: string) => {
  const params = new URLSearchParams({ format: 'metadata' });
  LIST_HEADERS.forEach((h) => params.append('metadataHeaders', h));
  return gmailRequest<GmailThread>(token, `/threads/${id}?${params}`);
};

export const getThread = (token: string, id: string) =>
  gmailRequest<GmailThread>(token, `/threads/${id}?format=full`);

/** Hlavičky více vláken najednou (max. 10 souběžně); vlákna, která nejdou načíst, vynechá */
export const getThreadsMeta = async (token: string, ids: string[]): Promise<GmailThread[]> => {
  const threads = await mapLimited(ids, 10, (id) => getThreadMeta(token, id).catch(() => null));
  return threads.filter((t): t is GmailThread => !!t?.messages?.length);
};

export const modifyThread = (token: string, id: string, addLabelIds: string[] = [], removeLabelIds: string[] = []) =>
  gmailRequest<GmailThread>(token, `/threads/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });

export const trashThread = (token: string, id: string) =>
  gmailRequest<GmailThread>(token, `/threads/${id}/trash`, { method: 'POST' });

export const untrashThread = (token: string, id: string) =>
  gmailRequest<GmailThread>(token, `/threads/${id}/untrash`, { method: 'POST' });

/** Trvalé smazání (jen z koše) */
export const deleteThread = (token: string, id: string) =>
  gmailRequest<void>(token, `/threads/${id}`, { method: 'DELETE' });

// ───────────── Zprávy a přílohy ─────────────

export const getMessage = (token: string, id: string, format: 'full' | 'metadata' | 'minimal' = 'full') =>
  gmailRequest<GmailMessage>(token, `/messages/${id}?format=${format}`);

export const modifyMessage = (token: string, id: string, addLabelIds: string[] = [], removeLabelIds: string[] = []) =>
  gmailRequest<GmailMessage>(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });

export const getAttachment = (token: string, messageId: string, attachmentId: string) =>
  gmailRequest<GmailAttachment>(token, `/messages/${messageId}/attachments/${attachmentId}`);

/** Odeslání hotové MIME zprávy (base64url) */
export const sendMessage = (token: string, raw: string, threadId?: string) =>
  gmailRequest<GmailMessage>(token, '/messages/send', {
    method: 'POST',
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });

// ───────────── Účet a štítky ─────────────

export const getProfile = (token: string) => gmailRequest<GmailProfile>(token, '/profile');

export const listLabels = async (token: string) =>
  (await gmailRequest<{ labels?: GmailLabel[] }>(token, '/labels')).labels ?? [];

export const getLabel = (token: string, id: string) => gmailRequest<GmailLabel>(token, `/labels/${id}`);

const VISIBLE_LABEL = { labelListVisibility: 'labelShow', messageListVisibility: 'show' } as const;

/** Nová složka (štítek) */
export const createLabel = (token: string, name: string) =>
  gmailRequest<GmailLabel>(token, '/labels', { method: 'POST', body: JSON.stringify({ name, ...VISIBLE_LABEL }) });

export const renameLabel = (token: string, id: string, name: string) =>
  gmailRequest<GmailLabel>(token, `/labels/${id}`, { method: 'PUT', body: JSON.stringify({ id, name, ...VISIBLE_LABEL }) });

export const deleteLabel = (token: string, id: string) =>
  gmailRequest<void>(token, `/labels/${id}`, { method: 'DELETE' });

// ───────────── Koncepty ─────────────

export interface GmailDraft {
  id: string;
  message?: GmailMessage;
}

/** Uloží koncept – nový (bez draftId), nebo přepíše existující */
export const saveDraft = (token: string, raw: string, opts: { draftId?: string | null; threadId?: string } = {}) => {
  const body = JSON.stringify({ message: opts.threadId ? { raw, threadId: opts.threadId } : { raw } });
  return opts.draftId
    ? gmailRequest<GmailDraft>(token, `/drafts/${opts.draftId}`, { method: 'PUT', body })
    : gmailRequest<GmailDraft>(token, '/drafts', { method: 'POST', body });
};

export const deleteDraft = (token: string, draftId: string) =>
  gmailRequest<void>(token, `/drafts/${draftId}`, { method: 'DELETE' });

export const listDrafts = async (token: string) =>
  (await gmailRequest<{ drafts?: GmailDraft[] }>(token, '/drafts')).drafts ?? [];
