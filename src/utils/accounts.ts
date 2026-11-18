import type { SwitcherAccount } from '../components/AccountSwitcher';

/** Součet nepřečtených v ostatních účtech než v otevřeném */
export const othersUnread = (accounts: SwitcherAccount[], activeEmail?: string | null) =>
  accounts.reduce((sum, a) => (a.email === activeEmail ? sum : sum + (a.unread ?? 0)), 0);
