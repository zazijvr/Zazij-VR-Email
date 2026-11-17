// Účty přes IMAP/SMTP (Seznam.cz, vlastní doména…) – volání Rustové části aplikace

import { invoke } from '@tauri-apps/api/core';

export type Security = 'tls' | 'starttls';

export interface ImapAccount {
  email: string;
  displayName: string;
  username: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: Security;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: Security;
}

export interface ImapFolder {
  /** Název pro server */
  path: string;
  /** Čitelný název */
  name: string;
  delimiter: string | null;
  special: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | null;
  unseen: number;
}

export interface ImapMessageSummary {
  uid: number;
  from: string;
  fromRaw: string;
  to: string;
  cc: string;
  subject: string;
  date: number;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  size: number;
  hasAttachment: boolean;
  snippet: string;
}

export interface ImapAttachment {
  index: number;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ImapMessageDetail {
  uid: number;
  subject: string;
  from: string;
  fromRaw: string;
  replyTo: string;
  to: string;
  cc: string;
  date: number;
  messageId: string;
  html: string;
  text: string;
  attachments: ImapAttachment[];
  seen: boolean;
  flagged: boolean;
}

export const imapAddAccount = (account: ImapAccount, password: string) =>
  invoke<ImapAccount>('imap_add_account', { input: { account, password } });
export const imapListAccounts = () => invoke<ImapAccount[]>('imap_list_accounts');
export const imapRemoveAccount = (email: string) => invoke<void>('imap_remove_account', { email });
export const imapListFolders = (email: string) => invoke<ImapFolder[]>('imap_list_folders', { email });
export const imapListMessages = (
  email: string, folder: string, page: number, pageSize = 40,
  opts: { filter?: 'unseen' | 'flagged'; query?: string } = {},
) =>
  invoke<{ total: number; messages: ImapMessageSummary[] }>('imap_list_messages', {
    email, folder, page, pageSize, filter: opts.filter ?? null, query: opts.query || null,
  });
export const imapAppend = (email: string, folder: string, mime: string, draft: boolean) =>
  invoke<void>('imap_append', { email, folder, mime, draft });
export const imapGetMessage = (email: string, folder: string, uid: number) =>
  invoke<ImapMessageDetail>('imap_get_message', { email, folder, uid });
export const imapGetAttachment = (email: string, folder: string, uid: number, index: number) =>
  invoke<string>('imap_get_attachment', { email, folder, uid, index });
export const imapSetFlag = (email: string, folder: string, uids: number[], flag: 'seen' | 'flagged' | 'answered', value: boolean) =>
  invoke<void>('imap_set_flag', { email, folder, uids, flag, value });
export const imapMove = (email: string, folder: string, uids: number[], target: string) =>
  invoke<void>('imap_move', { email, folder, uids, target });
export const imapDelete = (email: string, folder: string, uids: number[], trash: string | null) =>
  invoke<void>('imap_delete', { email, folder, uids, trash });
export const smtpSend = (email: string, mime: string, recipients: string[], sentFolder: string | null) =>
  invoke<void>('smtp_send', { input: { email, mime, recipients, sentFolder } });

// ───────────── Přednastavení serverů ─────────────

const SEZNAM_DOMAINS = ['seznam.cz', 'email.cz', 'post.cz', 'spoluzaci.cz', 'stream.cz', 'firmy.cz'];
const OUTLOOK_DOMAINS = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.cz', 'hotmail.cz'];

export type ProviderKind = 'seznam' | 'outlook' | 'custom';

export const providerOf = (email: string): ProviderKind => {
  const domain = email.split('@')[1]?.trim().toLowerCase() || '';
  if (SEZNAM_DOMAINS.includes(domain)) return 'seznam';
  if (OUTLOOK_DOMAINS.includes(domain)) return 'outlook';
  return 'custom';
};

/**
 * Číslo serveru Wedos z toho, co uživatel zadal: „3“, „wes3“ i celá adresa
 * „wes3-imap.wedos.net“ z administrace. Vrací null, když v tom číslo není.
 */
export const parseWedosServer = (input: string): number | null => {
  const m = input.trim().toLowerCase().match(/^(?:wes)?(\d{1,3})(?:[-.](?:imap|smtp)\.wedos\.net)?$/);
  return m ? Number(m[1]) : null;
};

/**
 * Wedos: každá služba má svůj server wesX-imap / wesX-smtp.wedos.net,
 * přihlašovací jméno je vždy celá adresa (kb.wedos.com – Emails: SMTP, POP3, IMAP).
 */
export const wedosPreset = (email: string, server: number): Omit<ImapAccount, 'displayName'> => ({
  email,
  username: email,
  imapHost: `wes${server}-imap.wedos.net`,
  imapPort: 993,
  imapSecurity: 'tls',
  smtpHost: `wes${server}-smtp.wedos.net`,
  smtpPort: 465,
  smtpSecurity: 'tls',
});

/** Výchozí nastavení serverů podle adresy (u vlastní domény odhad imap./smtp. + doména) */
export const presetFor = (email: string): Omit<ImapAccount, 'displayName'> => {
  const domain = email.split('@')[1]?.trim().toLowerCase() || '';
  const base = { email, username: email };
  if (providerOf(email) === 'seznam') {
    return { ...base, imapHost: 'imap.seznam.cz', imapPort: 993, imapSecurity: 'tls', smtpHost: 'smtp.seznam.cz', smtpPort: 465, smtpSecurity: 'tls' };
  }
  return {
    ...base,
    imapHost: domain ? `imap.${domain}` : '',
    imapPort: 993,
    imapSecurity: 'tls',
    smtpHost: domain ? `smtp.${domain}` : '',
    smtpPort: 465,
    smtpSecurity: 'tls',
  };
};
