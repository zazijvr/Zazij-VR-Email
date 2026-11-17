// Data schránky přes TanStack Query: profil, vlastní složky a počty nepřečtených.
// Dřív se to všechno stahovalo znovu při každém přepnutí složky.

import { useQuery } from '@tanstack/react-query';
import { getLabel, getProfile, gmailRequest, listLabels } from '../services/gmail';
import type { GmailLabel } from '../types/gmail';
import type { UnreadCounts } from '../types/account';

/** Skrytý štítek, kterým se v Gmailu označují vlákna, na která jsem odpověděl (značka ↩️ v seznamu) */
const REPLIED_LABEL = 'VR-Replied';

const SYSTEM_FOLDERS: [string, string][] = [
  ['Doručené', 'INBOX'],
  ['Odeslané', 'SENT'],
  ['Důležité', 'STARRED'],
  ['Rozepsané', 'DRAFT'],
  ['Spam', 'SPAM'],
  ['Koš', 'TRASH'],
];

export const useProfile = (token: string | null) =>
  useQuery({
    queryKey: ['profile', token],
    queryFn: () => getProfile(token as string),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

/** Vlastní složky uživatele (bez skrytého štítku VR-Replied, který se v případě potřeby založí) */
export const useCustomLabels = (token: string | null) =>
  useQuery({
    queryKey: ['customLabels', token],
    enabled: !!token,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GmailLabel[]> => {
      const userLabels = (await listLabels(token as string)).filter((l) => l.type === 'user');
      let replied = userLabels.find((l) => l.name === REPLIED_LABEL);
      if (!replied) {
        try {
          replied = await gmailRequest<GmailLabel>(token as string, '/labels', {
            method: 'POST',
            body: JSON.stringify({ name: REPLIED_LABEL, labelListVisibility: 'labelHide', messageListVisibility: 'hide' }),
          });
        } catch (e) {
          console.error('Nelze založit štítek VR-Replied', e);
        }
      }
      // Id si čte okno pro psaní a seznam (označení odpovědí)
      if (replied) localStorage.setItem('vr-replied-label-id', replied.id);
      return userLabels.filter((l) => l.name !== REPLIED_LABEL);
    },
  });

/** Počty nepřečtených podle názvu složky; obnovuje se každých 10 s, jen když je okno vidět */
export const useUnreadCounts = (token: string | null, customLabels: GmailLabel[] | undefined) =>
  useQuery({
    queryKey: ['unreadCounts', token, (customLabels ?? []).map((l) => l.id).join(',')],
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<UnreadCounts> => {
      const targets = [...SYSTEM_FOLDERS, ...(customLabels ?? []).map((l): [string, string] => [l.name, l.id])];
      const counts: UnreadCounts = {};
      await Promise.all(
        targets.map(async ([name, id]) => {
          try {
            const label = await getLabel(token as string, id);
            if ((label.messagesUnread ?? 0) > 0) counts[name] = label.messagesUnread as number;
          } catch {
            /* složka mohla být mezitím smazána */
          }
        }),
      );
      return counts;
    },
  });
