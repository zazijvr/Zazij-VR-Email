// Přihlášený Google účet

export interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
  messagesTotal?: number;
}

/** Počty nepřečtených podle názvu složky („Doručené“, „Spam“…) */
export type UnreadCounts = Record<string, number>;
