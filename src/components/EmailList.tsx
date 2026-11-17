import { useState, useEffect, useRef, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { db } from '../db/db';
import EmailListItem from './EmailListItem';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { ChevronUp, ChevronDown, Loader2, Trash2, Mail, MailOpen, Search, CheckSquare, Square, RotateCcw, X } from 'lucide-react';
import { listThreads, getThreadsMeta, modifyMessage } from '../services/gmail';
import { formatThreads, mergeAndGroupEmails } from '../services/threads';
import { saveNewContacts } from '../utils/contactManager';
import { useAlert } from './AlertProvider';
import type { EmailRef, ListEmail, OptimisticMove, SpammedEmail, TrashedEmail } from '../types/email';
import type { GmailLabel } from '../types/gmail';
import type { UnreadCounts } from '../types/account';

type ShownEmail = ListEmail;
/** Cokoli, co umí zastavit probublání události (React událost i náhradní objekt) */
type Stoppable = { stopPropagation: () => void } | null | undefined;

interface EmailListProps {
  googleToken: string | null;
  activeFolder?: string;
  selectedEmailId?: string | null;
  setSelectedEmailId?: (id: string | null) => void;
  onExpand?: (id: string) => void;
  onDraftClick?: (id: string) => void;
  trashedEmails?: TrashedEmail[];
  spamEmails?: SpammedEmail[];
  hiddenEmailIds?: string[];
  optimisticMoves?: OptimisticMove[];
  onTrash?: (email: EmailRef) => void;
  onRestore?: (email: EmailRef) => void;
  setUnreadCounts?: Dispatch<SetStateAction<UnreadCounts>>;
  unreadCounts?: UnreadCounts;
  loginWithGoogle?: () => void;
  customLabels?: GmailLabel[];
  userEmail?: string;
  refreshTriggerList?: number;
}

interface FolderCacheEntry {
  emails: ListEmail[];
  nextPageToken: string | null;
}

// Globální set pro sledování všech ID zpráv, které už aplikace někdy viděla v tomto spuštění,
// abychom absolutně spolehlivě zabránili dvojitým notifikacím (např. při ručním označení "Přečíst")
const globalNotifiedSet = new Set<string>();
let globalHighestEmailDate = 0;
/** Pevné šířky sloupců seznamu – společné pro hlavičku i řádky */
const COL_STYLE = { '--col-from': 'clamp(130px, 26%, 230px)', '--col-date': '84px' } as CSSProperties;

/** Naposledy zobrazený obsah složek v paměti (klíč: složka + filtr) – návrat do složky je okamžitý,
 *  aktuální stav se pak dotáhne na pozadí */
const folderMemCache = new Map<string, FolderCacheEntry>();

export default function EmailList({ googleToken, activeFolder = 'Doručené', selectedEmailId, setSelectedEmailId, onExpand, onDraftClick, trashedEmails = [], spamEmails = [], hiddenEmailIds = [], optimisticMoves = [], onTrash, onRestore, setUnreadCounts, unreadCounts, loginWithGoogle, customLabels = [], userEmail, refreshTriggerList }: EmailListProps) {
  const getLabelId = (folderName: string) => {
    if (folderName === 'Doručené') return 'INBOX';
    if (folderName === 'Důležité') return 'STARRED';
    if (folderName === 'Odeslané') return 'SENT';
    if (folderName === 'Rozepsané') return 'DRAFT';
    if (folderName === 'Spam') return 'SPAM';
    if (folderName === 'Koš') return 'TRASH';
    const custom = customLabels?.find(l => l.name === folderName);
    return custom ? custom.id : 'INBOX';
  };  // Efekty volají vždy aktuální verzi (vlastní složky se načítají později) bez nového stahování
  const getLabelIdRef = useRef(getLabelId);
  getLabelIdRef.current = getLabelId;


  const [emails, setEmails] = useState<ShownEmail[]>([]);

  const [loading, setLoading] = useState(false);
  const [displayedEmailLimit, setDisplayedEmailLimit] = useState(10);
  const [sortField, setSortField] = useState<'date' | 'from' | 'subject' | 'size' | 'attachment'>('date');
  const [sortAscending, setSortAscending] = useState(false);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { showAlert, showConfirm } = useAlert();

  const [mobileDeletePending, setMobileDeletePending] = useState<ListEmail | null>(null);

  const [selectedMailIds, setSelectedMailIds] = useState<Set<string>>(new Set());
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const visibleEmailsRef = useRef<ShownEmail[]>([]);
  const lastClickRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

  useEffect(() => {
    if (userEmail && emails.length > 0) {
      const allContacts: string[] = [];
      emails.forEach(e => {
        if (e.originalFromRaw) allContacts.push(e.originalFromRaw);
        if (e.originalToRaw) allContacts.push(e.originalToRaw);
        if (e.originalCcRaw) allContacts.push(e.originalCcRaw);
      });
      saveNewContacts(userEmail, allContacts);
    }
  }, [emails, userEmail]);

  useEffect(() => {
    const handleReplySent = (e: Event) => {
      const { threadId, snippet } = (e as CustomEvent<{ threadId: string; snippet: string }>).detail;

      // Uložení stavu do localStorage pro dlouhodobou paměť i po reloadu okna / změně složky
      try {
        const stored = JSON.parse(localStorage.getItem('vr-replied-threads') || '[]');
        if (!stored.includes(threadId)) {
          stored.push(threadId);
          localStorage.setItem('vr-replied-threads', JSON.stringify(stored));
        }
      } catch { /* bez localStorage se značka odpovědi jen nezapamatuje */ }

      setEmails(prev => prev.map(msg => {
        if ((msg.threadId || msg.id) === threadId) {
          return {
            ...msg,
            snippet: "↩️ " + snippet,
            dateText: "Nyní",
            // Keep the same from/to, so it doesn't break the UI
          };
        }
        return msg;
      }));
    };
    window.addEventListener('vr-email-sent-reply', handleReplySent);
    return () => window.removeEventListener('vr-email-sent-reply', handleReplySent);
  }, []);

  useEffect(() => {
    const handleStarToggle = (e: Event) => {
      const { id, isStarred } = (e as CustomEvent<{ id: string; isStarred: boolean }>).detail;
      setEmails(prev => prev.map(m => m.id === id ? { ...m, isStarred } : m));
    };
    const handleReadToggle = (e: Event) => {
      const { id, isUnread } = (e as CustomEvent<{ id: string; isUnread: boolean }>).detail;
      setEmails(prev => prev.map(m => m.id === id ? { ...m, isUnread } : m));
    };
    const handleMobileSearch = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      setSearchQuery(q);
      setSearchInputValue(q);
    };
    window.addEventListener('vr-email-star-toggle', handleStarToggle);
    window.addEventListener('vr-email-read-toggle', handleReadToggle);
    window.addEventListener('vr-mobile-search-query-change', handleMobileSearch);
    return () => {
      window.removeEventListener('vr-email-star-toggle', handleStarToggle);
      window.removeEventListener('vr-email-read-toggle', handleReadToggle);
      window.removeEventListener('vr-mobile-search-query-change', handleMobileSearch);
    };
  }, []);

  const toggleSelectAll = () => {
    if (visibleEmails.length === 0) return;
    if (selectedMailIds.size === visibleEmails.length) {
      setSelectedMailIds(new Set());
    } else {
      setSelectedMailIds(new Set(visibleEmails.map(e => e.id)));
    }
  };

  const toggleSelectEmail = (id: string, e: Stoppable) => {
    e?.stopPropagation();
    setSelectedMailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [draggableEmailId, setDraggableEmailId] = useState<string | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = (id: string) => {
    dragTimerRef.current = setTimeout(() => {
      setDraggableEmailId(id);
    }, 150);
  };

  const clearDragTimer = () => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    setDraggableEmailId(null);
  };

  const handleDragEnd = () => {
    setDraggableEmailId(null);
  };


  // Pagination State
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const performTrash = (email: ListEmail) => {
    if (email.isUnread && setUnreadCounts) {
      setUnreadCounts(prev => ({ ...prev, [activeFolder]: Math.max(0, (prev[activeFolder] || 0) - 1) }));
    }
    setEmails(prev => prev.filter(p => p.id !== email.id));
    if (onTrash) onTrash(email);
  };

  const handleTrashEmail = (email: ListEmail, e?: Stoppable) => {
    e?.stopPropagation();
    if (activeFolder === 'Koš') {
      showConfirm(
        'Tímto trvale odstraníš konverzaci z koše. Tuto akci nelze vzít zpět. Opravdu chceš pokračovat?',
        'Trvalé smazání',
        () => performTrash(email),
        { confirmText: 'Smazat navždy', type: 'error' }
      );
    } else {
      performTrash(email);
    }
  };

  useEffect(() => {
    setShowOnlyUnread(false);
    setSearchInputValue('');
    setSearchQuery('');
  }, [activeFolder]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInputValue);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInputValue]);

  // Klávesa Delete volá vždy aktuální mazání (zná aktuální složku), bez nového registrování při každém vykreslení
  const handleTrashRef = useRef(handleTrashEmail);
  handleTrashRef.current = handleTrashEmail;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Zabráníme smazání e-mailu, pokud uživatel zrovna píše text nebo edituje šablonu
      const activeElement = document.activeElement as HTMLElement | null;
      const activeTag = activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement?.isContentEditable) return;

      if (e.key === 'Delete' && selectedEmailId) {
        const emailToDelete = emails.find(em => em.id === selectedEmailId);
        if (emailToDelete) {
          handleTrashRef.current(emailToDelete);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmailId, emails]);

  const fetchedFolderRef = useRef<string | null>(null);
  const lastAutoSelectedFolderRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  useEffect(() => {
    if (!googleToken) {
      setEmails([]);
      return;
    }

    // Účet se zjistí chvilku po přihlášení/přepnutí – do té doby se nic nestahuje,
    // aby se pošta nemíchala mezi účty (a zbytečně se nestahovalo dvakrát)
    if (!userEmail) {
      setEmails([]);
      setLoading(true);
      return;
    }

    // Každé načtení má pořadové číslo – výsledek staršího požadavku (jiná složka) se zahodí
    const seq = ++fetchSeqRef.current;
    const isCurrent = () => fetchSeqRef.current === seq;
    const account = userEmail;
    const cacheKey = `${account}|${activeFolder}|${showOnlyUnread ? 1 : 0}|${searchQuery.trim()}`;

    const fetchEmails = async () => {
      setDisplayedEmailLimit(10);
      let hasData = false;

      // 0) Paměť – okamžité zobrazení, při čerstvých datech se nic nestahuje
      const mem = folderMemCache.get(cacheKey);
      if (mem) {
        setEmails(mem.emails);
        setNextPageToken(mem.nextPageToken);
        setLoading(false);
        hasData = true;
      } else {
        // 1) Offline keš v databázi
        try {
          const cached = await db.emails.where('folderLabel').equals(activeFolder).filter(e => e.account === account).toArray();
          if (!isCurrent()) return;
          let filteredCache = cached || [];
          if (showOnlyUnread) filteredCache = filteredCache.filter(e => e.isUnread);
          if (searchQuery.trim()) {
            const lowQ = searchQuery.toLowerCase();
            filteredCache = filteredCache.filter(e =>
              (e.subject && e.subject.toLowerCase().includes(lowQ)) ||
              (e.from && e.from.toLowerCase().includes(lowQ)) ||
              (e.snippet && e.snippet.toLowerCase().includes(lowQ))
            );
          }
          if (filteredCache.length > 0) {
            filteredCache.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
            setEmails(mergeAndGroupEmails([], filteredCache));
            setLoading(false);
            hasData = true;
          }
        } catch (cacheErr) {
          console.warn("Nepodařilo se natáhnout offline data:", cacheErr);
        }
        if (!hasData) {
          // Nic v keši – neukazovat obsah předchozí složky
          setEmails([]);
        }
      }

      if (!navigator.onLine) {
         setLoading(false);
         fetchedFolderRef.current = activeFolder;
         return; // Zastavit network request, pokud jsme offline
      }

      // 2) Stažení ze serveru
      if (!hasData) setLoading(true);
      try {
        const listData = await listThreads(googleToken, { labelId: getLabelIdRef.current(activeFolder), q: [showOnlyUnread ? 'is:unread' : '', searchQuery.trim()].filter(Boolean).join(' ') || undefined, maxResults: 40 });
        if (!isCurrent()) return;

        if (!listData.threads) {
          setEmails([]);
          setNextPageToken(null);
          folderMemCache.set(cacheKey, { emails: [], nextPageToken: null });
          fetchedFolderRef.current = activeFolder;
          setLoading(false);
          return;
        }

        const formattedEmails = formatThreads(await getThreadsMeta(googleToken, listData.threads.map(t => t.id)));
        if (!isCurrent()) return;

        formattedEmails.forEach(e => {
          e.folderLabel = activeFolder; // Nutné pro DB Index
          e.account = account;
          globalNotifiedSet.add(e.id);
          globalHighestEmailDate = Math.max(globalHighestEmailDate, e.rawDate || 0);
        });

        // Asynchronní zápis/update do lokální databáze
        db.emails.bulkPut(formattedEmails).catch(e => console.warn('Chyba při cachování:', e));

        const grouped = mergeAndGroupEmails([], formattedEmails);
        setNextPageToken(listData.nextPageToken || null);
        setEmails(grouped);
        folderMemCache.set(cacheKey, { emails: grouped, nextPageToken: listData.nextPageToken || null });
      } catch (err) {
        console.error("Chyba načítání pošty:", err);
      }
      if (!isCurrent()) return;
      fetchedFolderRef.current = activeFolder;
      setLoading(false);
    };

    fetchEmails();
  }, [googleToken, userEmail, activeFolder, showOnlyUnread, searchQuery, refreshTriggerList]);

  // Přepnutí / přidání účtu – paměť složek patří předchozímu účtu
  useEffect(() => {
    const clear = () => {
      folderMemCache.clear();
      fetchedFolderRef.current = null; // tiché dotahování nové pošty počká na první načtení
      lastAutoSelectedFolderRef.current = null; // po načtení se vybere první e-mail nového účtu
      setSelectedEmailId?.(null); // náhled nesmí ukazovat e-mail předchozího účtu
    };
    window.addEventListener('vr-account-switched', clear);
    return () => window.removeEventListener('vr-account-switched', clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- výběr se ruší jen při změně složky
  }, []);

  const emailsRef = useRef(emails);
  useEffect(() => { emailsRef.current = emails; }, [emails]);

  // Změny v seznamu (přečtení, smazání, hvězdička…) se propíšou i do paměti složky
  useEffect(() => {
    if (fetchedFolderRef.current !== activeFolder) return;
    const key = `${userEmail}|${activeFolder}|${showOnlyUnread ? 1 : 0}|${searchQuery.trim()}`;
    const mem = folderMemCache.get(key);
    if (mem && mem.emails !== emails) folderMemCache.set(key, { ...mem, emails, nextPageToken });
  }, [emails, nextPageToken, activeFolder, showOnlyUnread, searchQuery, userEmail]);

  // Auto-refresh vybraného vlákna: pokud přijde novější zpráva do již otevřeného vlákna
  useEffect(() => {
    if (selectedEmailId && setSelectedEmailId) {
      const selectedThread = emails.find(e => e.messageIds && e.messageIds.has(selectedEmailId));
      if (selectedThread && selectedThread.id !== selectedEmailId) {
        setSelectedEmailId(selectedThread.id);
      }
    }
  }, [emails, selectedEmailId, setSelectedEmailId]);

  // Nový useEffect pro sledování změn nepřečtených zpráv a tiché načtení nových
  const prevUnreadRef = useRef(0);
  const prevFolderRef = useRef(activeFolder);

  useEffect(() => {
    const currentUnread = unreadCounts?.[activeFolder] || 0;
    const isFolderSwitch = prevFolderRef.current !== activeFolder;

    // Ignorujeme přepnutí složky a spoléháme jen na inkrementální růst.
    // …a až když je složka načtená (po přepnutí účtu se počty změní, ale není to nová pošta)
    const shouldFetch = !isFolderSwitch && fetchedFolderRef.current === activeFolder && (currentUnread > prevUnreadRef.current);

    prevUnreadRef.current = currentUnread;
    prevFolderRef.current = activeFolder;

    if (shouldFetch && googleToken) {
      const silentFetch = async () => {
        try {
          // nová pošta je vždy nahoře – stačí prvních 15 vláken
          const listData = await listThreads(googleToken, { labelId: getLabelIdRef.current(activeFolder), q: [showOnlyUnread ? 'is:unread' : '', searchQuery.trim()].filter(Boolean).join(' ') || undefined, maxResults: 15 });
          if (!listData.threads) return;

          const formattedEmails = formatThreads(await getThreadsMeta(googleToken, listData.threads.map(t => t.id)));

          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === 'granted';
          }

          const trulyNewEmails = formattedEmails.filter(newEm => {
            if (globalNotifiedSet.has(newEm.id)) return false;
            // Vlastní odeslaná zpráva (i poslaná sám sobě) není nová pošta
            if (newEm.labelIds?.includes('SENT')) return false;
            // The email must actually be newer than the newest email we've seen so far in this session!
            return (newEm.rawDate || 0) > globalHighestEmailDate;
          });

          if (permissionGranted && trulyNewEmails.length > 0) {
            const latest = trulyNewEmails[0];
            sendNotification({
              title: 'ZažijVR E-mail',
              body: `Nová zpráva od: ${latest.from}\n${latest.subject}`,
              actionTypeId: 'new_email',
              sound: 'message-new-instant'
            });
          }

          formattedEmails.forEach(e => {
            globalNotifiedSet.add(e.id);
            globalHighestEmailDate = Math.max(globalHighestEmailDate, e.rawDate || 0);
          });

          setEmails(prev => mergeAndGroupEmails(prev, formattedEmails, true));
        } catch (err) {
          console.error("Chyba tichého načítání pošty:", err);
        }
      };
      silentFetch();
    }
  }, [unreadCounts, activeFolder, showOnlyUnread, googleToken, searchQuery]);

  const handleEmailClick = async (email: ListEmail) => {
    const now = Date.now();
    const isDoubleClick = lastClickRef.current.id === email.id && (now - lastClickRef.current.time) < 600;
    lastClickRef.current = { id: email.id, time: now };

    if (isDoubleClick) {
      if (onExpand) {
        onExpand(email.id);
      }
    }

    if (setSelectedEmailId) setSelectedEmailId(email.id);

    if (email.isUnread) {
      // Optimistický update v lokálním stavu seznamu a bočním menu
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isUnread: false } : e));
      if (setUnreadCounts) {
        setUnreadCounts(prev => ({ ...prev, [activeFolder]: Math.max(0, (prev[activeFolder] || 0) - 1) }));
      }

      // Volání Gmail API pro pro odebrání štítku UNREAD
      if (googleToken) {
        modifyMessage(googleToken, email.id, [], ['UNREAD'])
          .catch(err => console.error("Nepodařilo se označit e-mail jako přečtený:", err));
      }
    }
  };

  const handleToggleRead = async (emailId: string, currentIsUnread: boolean, e?: Stoppable) => {
    e?.stopPropagation();

    const isNowUnread = !currentIsUnread;

    // Optimistic Update
    setEmails(prev => prev.map(email =>
      email.id === emailId ? { ...email, isUnread: isNowUnread } : email
    ));
    window.dispatchEvent(new CustomEvent('vr-email-read-toggle', { detail: { id: emailId, isUnread: isNowUnread } }));
    if (setUnreadCounts) {
      setUnreadCounts(prev => ({
        ...prev,
        [activeFolder]: Math.max(0, (prev[activeFolder] || 0) + (isNowUnread ? 1 : -1))
      }));
    }

    try {
      if (!googleToken) throw new Error('Nejste přihlášeni.');
      if (currentIsUnread) await modifyMessage(googleToken, emailId, [], ['UNREAD']);
      else await modifyMessage(googleToken, emailId, ['UNREAD']);
    } catch (err) {
      console.error(err);
      // Rollback
      setEmails(prev => prev.map(email =>
        email.id === emailId ? { ...email, isUnread: currentIsUnread } : email
      ));
      if (setUnreadCounts) {
        setUnreadCounts(prev => ({
          ...prev,
          [activeFolder]: Math.max(0, (prev[activeFolder] || 0) + (currentIsUnread ? 1 : -1))
        }));
      }
      showAlert('Chyba při změně stavu e-mailu.', 'Chyba serveru', 'error');
    }
  };

  const handleToggleStar = async (emailId: string, currentIsStarred: boolean, e?: Stoppable) => {
    e?.stopPropagation();

    const isNowStarred = !currentIsStarred;

    // Optimistic Update
    setEmails(prev => prev.map(email =>
      email.id === emailId ? { ...email, isStarred: isNowStarred } : email
    ));
    window.dispatchEvent(new CustomEvent('vr-email-star-toggle', { detail: { id: emailId, isStarred: isNowStarred } }));

    try {
      if (!googleToken) throw new Error('Nejste přihlášeni.');
      if (currentIsStarred) await modifyMessage(googleToken, emailId, [], ['STARRED']);
      else await modifyMessage(googleToken, emailId, ['STARRED']);
    } catch (err) {
      console.error(err);
      // Revert in case of failure 
      setEmails(prev => prev.map(email =>
        email.id === emailId ? { ...email, isStarred: currentIsStarred } : email
      ));
    }
  };

  const handleBulkTrash = () => {
    const selected = emails.filter(e => selectedMailIds.has(e.id));
    if (selected.length === 0) return;

    if (activeFolder === 'Koš') {
      showConfirm(
        `Opravdu chceš trvale smazat ${selected.length} konverzací? Tuto akci nelze vzít zpět.`,
        'Trvalé hromadné smazání',
        () => {
          selected.forEach(email => performTrash(email));
          setSelectedMailIds(new Set());
        },
        { confirmText: 'Smazat navždy', type: 'error' }
      );
    } else {
      selected.forEach(email => performTrash(email));
      setSelectedMailIds(new Set());
    }
  };

  const handleBulkRestore = () => {
    const selected = emails.filter(e => selectedMailIds.has(e.id));
    selected.forEach(email => {
      setEmails(prev => prev.filter(p => p.id !== email.id));
      if (onRestore) onRestore(email);
    });
    setSelectedMailIds(new Set());
  };

  const handleBulkToggleRead = () => {
    if (selectedMailIds.size === 0) return;
    const firstSelectedId = [...selectedMailIds][0];
    const firstSelected = emails.find(e => e.id === firstSelectedId);
    if (!firstSelected) return;

    const targetUnread = !firstSelected.isUnread;
    const selected = emails.filter(e => selectedMailIds.has(e.id));
    selected.forEach(email => {
      if (email.isUnread !== targetUnread) {
        handleToggleRead(email.id, email.isUnread, null);
      }
    });
  };

  const handleBulkToggleStar = () => {
    if (selectedMailIds.size === 0) return;
    const firstSelectedId = [...selectedMailIds][0];
    const firstSelected = emails.find(e => e.id === firstSelectedId);
    if (!firstSelected) return;

    const targetStarred = !firstSelected.isStarred;
    const selected = emails.filter(e => selectedMailIds.has(e.id));
    selected.forEach(email => {
      if (email.isStarred !== targetStarred) {
        handleToggleStar(email.id, email.isStarred, null);
      }
    });
  };

  // Load More Functionality
  const loadMoreEmails = async () => {
    if (!nextPageToken || loadingMore || !googleToken) return;
    setLoadingMore(true);
    try {
      const listData = await listThreads(googleToken, { labelId: getLabelId(activeFolder), q: [showOnlyUnread ? 'is:unread' : '', searchQuery.trim()].filter(Boolean).join(' ') || undefined, maxResults: 40, pageToken: nextPageToken });

      if (!listData.threads) {
        setLoadingMore(false);
        return;
      }

      setNextPageToken(listData.nextPageToken || null);

      const formattedEmails = formatThreads(await getThreadsMeta(googleToken, listData.threads.map(t => t.id)));
      formattedEmails.forEach(e => {
        globalNotifiedSet.add(e.id);
        globalHighestEmailDate = Math.max(globalHighestEmailDate, e.rawDate || 0);
      });
      setEmails(prev => mergeAndGroupEmails(prev, formattedEmails));
    } catch (err) {
      console.error("Chyba načítání starší pošty:", err);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    if (setSelectedEmailId) {
      setSelectedEmailId(null);
    }
    // Zrušení hromadného výběru při přechodu do jiné sekce
    setSelectedMailIds(new Set());
  }, [activeFolder, setSelectedEmailId]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(field === 'from' || field === 'subject');
    }
  };

  // V Odeslaných je v prvním sloupci příjemce – řadí se podle toho, co je vidět
  const personOf = (e: ListEmail) => ((activeFolder === 'Odeslané' ? e.to : e.from) || '').replace(/^["'\s]+/, '');
  const compareEmails = (a: ListEmail, b: ListEmail) => {
    let cmp = 0;
    if (sortField === 'date') cmp = a.rawDate - b.rawDate;
    else if (sortField === 'from') cmp = personOf(a).localeCompare(personOf(b), 'cs', { sensitivity: 'base' });
    else if (sortField === 'subject') cmp = (a.subject || '').localeCompare(b.subject || '', 'cs', { sensitivity: 'base' });
    else if (sortField === 'size') cmp = a.rawSize - b.rawSize;
    else if (sortField === 'attachment') cmp = (a.hasAttachment === b.hasAttachment) ? 0 : (a.hasAttachment ? 1 : -1);

    return sortAscending ? cmp : -cmp;
  };
  const sortedEmails = [...emails].sort(compareEmails);

  let visibleEmails = [...sortedEmails];

  // Odstranění zpráv, které byly tažením přesunuty jinam
  visibleEmails = visibleEmails.filter(e => {
    if (hiddenEmailIds.includes(e.id)) return false;

    const trashedContext = trashedEmails.find(t => t.id === e.id);
    const spammedContext = spamEmails.find(s => s.id === e.id);

    if (trashedContext) {
      if (trashedContext.trashedFrom === 'Koš') return false; // Trvalé smazání
      return activeFolder === 'Koš'; // Skryj všude kromě koše
    }

    if (spammedContext) {
      if (spammedContext.spammedFrom === 'Spam') return false; // Ostré odstranění ze spamu? Možná.
      return activeFolder === 'Spam'; // Skryj všude kromě spamu
    }

    return true;
  });

  if (activeFolder === 'Koš') {
    const newlyTrashedContent = trashedEmails.filter(t => t.trashedFrom !== 'Koš' && !visibleEmails.some(v => v.id === t.id));
    const finalTrashed = showOnlyUnread ? newlyTrashedContent.filter(e => e.isUnread) : newlyTrashedContent;
    visibleEmails = [...(finalTrashed as ListEmail[]), ...visibleEmails];
  } else if (activeFolder === 'Spam') {
    const newlySpammedContent = spamEmails.filter(s => s.spammedFrom !== 'Spam' && !visibleEmails.some(v => v.id === s.id));
    const finalSpammed = showOnlyUnread ? newlySpammedContent.filter(e => e.isUnread) : newlySpammedContent;
    visibleEmails = [...(finalSpammed as ListEmail[]), ...visibleEmails];
  }

  // Přídání zpráv, které byly tažením přesunuty DO této složky
  if (optimisticMoves && optimisticMoves.length > 0) {
    const incoming = optimisticMoves.filter(m => m.targetFolder === activeFolder && !visibleEmails.some(v => v.id === m.id));
    const finalIncoming = showOnlyUnread ? incoming.filter(e => e.isUnread) : incoming;
    if (finalIncoming.length > 0) {
      visibleEmails = [...(finalIncoming as ListEmail[]), ...visibleEmails];
    }
  }
  // Optimisticky přidané zprávy (koš, spam, přesuny) zařadit podle zvoleného řazení
  visibleEmails.sort(compareEmails);

  const fullVisibleEmailsLength = visibleEmails.length;
  visibleEmails = visibleEmails.slice(0, displayedEmailLimit);

  visibleEmailsRef.current = visibleEmails;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const activeTag = activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement?.isContentEditable) return;
      if (visibleEmailsRef.current.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setKeyboardIndex(prev => {
          const next = prev + 1;
          const max = visibleEmailsRef.current.length - 1;
          const targetIndex = next <= max ? next : max;
          // Auto scroll view logic
          document.getElementById(`email-row-${visibleEmailsRef.current[targetIndex].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return targetIndex;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardIndex(prev => {
          const next = prev - 1;
          const targetIndex = next >= 0 ? next : 0;
          document.getElementById(`email-row-${visibleEmailsRef.current[targetIndex].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return targetIndex;
        });
      } else if (e.key === 'Enter') {
        if (keyboardIndex >= 0 && keyboardIndex < visibleEmailsRef.current.length) {
          e.preventDefault();
          const target = visibleEmailsRef.current[keyboardIndex];
          if (setSelectedEmailId) setSelectedEmailId(target.id);
          if (onExpand) onExpand(target.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardIndex, onExpand, setSelectedEmailId]);

  // Defaultní chování: Autovýběr prvního e-mailu po úspěšném načtení složky
  const firstVisibleId = visibleEmails.length > 0 ? visibleEmails[0].id : null;
  useEffect(() => {
    if (
      !loading &&
      fetchedFolderRef.current === activeFolder &&
      lastAutoSelectedFolderRef.current !== activeFolder &&
      firstVisibleId !== null
    ) {
      lastAutoSelectedFolderRef.current = activeFolder;
      const isMobile = window.innerWidth < 768; // Zrušíme autovýběr na telefonech
      if (setSelectedEmailId && !isMobile) {
        setSelectedEmailId(firstVisibleId);
      }
    }
  }, [loading, firstVisibleId, activeFolder, setSelectedEmailId]);

  type SortField = typeof sortField;
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-4" />;
    return sortAscending ? <ChevronUp size={16} className="text-neon-blue" /> : <ChevronDown size={16} className="text-neon-blue" />;
  };

  const HeaderItem = ({ label, field, className = "" }: { label: string; field: SortField; className?: string }) => (
    <div
      className={`flex items-center gap-1 cursor-pointer hover:text-neon-blue transition-colors select-none ${className} ${sortField === field ? 'text-neon-blue font-bold' : 'text-slate-400'}`}
      onClick={() => handleSort(field)}
    >
      <span>{label}</span>
      <SortIcon field={field} />
    </div>
  );

  const firstSelectedId = selectedMailIds.size > 0 ? [...selectedMailIds][0] : null;
  const firstSelectedEmail = firstSelectedId ? emails.find(e => e.id === firstSelectedId) : null;
  const isFirstUnread = firstSelectedEmail ? firstSelectedEmail.isUnread : false;
  const isFirstStarred = firstSelectedEmail ? firstSelectedEmail.isStarred : false;

  if (!googleToken) {
    return (
      <div className="flex-1 relative bg-navy/80 backdrop-blur-md flex flex-col items-center justify-center h-full p-8 text-center shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center max-w-md gap-6 z-10">
          <div className="w-24 h-24 rounded-full bg-neon-blue/10 flex items-center justify-center shadow-[0_0_40px_rgba(0,243,255,0.2)] border-2 border-neon-blue/40 mb-2 group animate-pulse-slow">
            <Mail className="w-10 h-10 text-neon-blue" />
          </div>
          <h2 className="text-3xl text-white font-black tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]">Systém uzamčen</h2>
          <p className="text-slate-400 text-sm tracking-widest font-mono uppercase opacity-70">Zabezpečená zóna: Vyžaduje se autentizace operátora</p>

          <button
            onClick={(e) => { e.stopPropagation(); loginWithGoogle?.(); }}
            className="mt-8 px-10 py-4 relative group overflow-hidden bg-transparent border-2 border-neon-blue text-neon-blue font-black uppercase tracking-widest rounded-sm hover:text-black transition-all duration-300 cursor-pointer"
          >
            <div className="absolute inset-0 w-full h-full bg-neon-blue translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out z-0 pointer-events-none"></div>
            <span className="relative z-10 flex items-center gap-3 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-neon-purple group-hover:bg-black shadow-[0_0_8px_#f72585] transition-colors duration-300"></span>
              Přihlásit se
            </span>
          </button>
        </div>
        {/* Dekorativní pozadí pro odlogovaný stav */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-blue rounded-full blur-[120px] opacity-10 pointer-events-none"></div>
      </div>
    );
  }

  return (
    <div
      style={COL_STYLE}
      className="mail-list flex-1 relative bg-navy/20 md:bg-navy/80 md:backdrop-blur-sm flex flex-col h-full shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)]"
    >

      {/* Mobilní Nadpis Složky */}
      {(() => {
        const iconMap: Record<string, string> = {
          'Doručené': '/vr_inbox.svg',
          'Důležité': '/vr_important.svg',
          'Odeslané': '/vr_sent.svg',
          'Rozepsané': '/vr_drafts.svg',
          'Spam': '/vr_spam.svg',
          'Koš': '/vr_trash.svg'
        };
        const mascotImg = iconMap[activeFolder] ? <img src={iconMap[activeFolder]} alt="Mascot" className="h-14 w-auto object-contain" /> : null;

        return (
          <div className="md:hidden px-6 pt-5 pb-3 bg-gradient-to-b from-navy-deep/60 to-transparent shrink-0 flex items-center justify-start gap-4 relative z-10">

            {/* Horní neonová linka (Synchronizovaná) */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>

            {/* Spodní laserová linka do ztracena (Synchronizovaná) */}
            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue via-neon-blue/50 to-neon-blue/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>

            {mascotImg}
            <div className="flex-1 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,243,255,0.8)]">
                  {activeFolder}
                </h1>
                <div className="text-[10px] uppercase tracking-widest text-neon-blue/60 mt-1">Systém // Výpis {visibleEmails.length} konverzací</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('vr-mobile-search-toggle')); }}
                className="group relative p-3.5 rounded-full bg-navy/80 backdrop-blur-md border border-neon-blue/40 text-neon-blue active:scale-90 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)] hover:shadow-[0_0_30px_rgba(0,243,255,0.6)] hover:bg-neon-blue/10 ml-4 overflow-hidden focus:outline-none"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div className="absolute inset-[3px] rounded-full border border-neon-blue/20 group-hover:border-neon-blue/50 pointer-events-none"></div>
                <Search size={20} className="relative z-10 drop-shadow-[0_0_8px_rgba(0,243,255,1)] group-hover:drop-shadow-[0_0_12px_rgba(0,243,255,1)] transition-all" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Sub-toolbar */}
      <div className="hidden md:flex items-center pl-7 py-3 pr-[38px] md:mx-3 md:mt-3 md:rounded-xl bg-navy-card md:bg-navy border-b md:border border-neon-blue/10 md:border-neon-blue/20 md:shadow-[0_5px_20px_rgba(0,0,0,0.5)] z-20 shrink-0">

        {/* Placeholder šířky pro sloupec s Checkboxy */}
        <div className="w-[40px] pr-2" />

        {/* Šířka pro sloupec Odesílatel */}
        <div className="w-[var(--col-from)] shrink-0 pr-4 flex items-center">
          <span className="text-slate-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Zobrazeno ${visibleEmails.length} konverzací`}>
            Výpis {visibleEmails.length} konverzací
          </span>
        </div>

        {/* Šířka pro sloupec Předmět (Zarovná Search Bar a prodlouží se až k nápisu Datum) */}
        <div className="flex-1 relative group pr-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-blue/50 group-focus-within:text-neon-blue transition-colors pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Hledat zprávy..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="pl-9 pr-9 py-1.5 w-full bg-neon-blue/5 border border-neon-blue/30 rounded-md text-xs text-white placeholder-neon-blue/40 outline-none focus:border-neon-blue transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
          />
          {searchInputValue && (
            <button
              onClick={() => {
                setSearchInputValue('');
                setSearchQuery('');
                setSortField('date');
                setSortAscending(false);
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-neon-blue/60 hover:text-neon-purple transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(247,37,133,0.5)] z-10 hover:scale-125"
              title="Vymazat hledání a obnovit řazení"
            >
              ✕
            </button>
          )}
        </div>
        <div className="shrink-0 z-20 pl-4">
          <button
            onClick={() => setShowOnlyUnread(!showOnlyUnread)}
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all rounded-md flex items-center gap-2 ${showOnlyUnread
              ? 'bg-neon-blue text-black border border-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.6)] scale-105'
              : 'bg-neon-blue/5 text-neon-blue border border-neon-blue/40 shadow-[0_0_10px_rgba(0,243,255,0.15)] hover:bg-neon-blue/20 hover:shadow-[0_0_20px_rgba(0,243,255,0.4)]'
              }`}
          >
            {showOnlyUnread && <span className="font-black text-black">✖</span>}
            NEPŘEČTENÉ
          </button>
        </div>
      </div>

      {/* Pevný Header vytažený mimo scrollovací kontejner, aby scrollbar neprotínal jeho pravý okraj */}
      <div className="hidden md:flex items-center pl-7 py-2.5 pr-[38px] bg-navy/40 border-b border-neon-blue/20 text-xs font-semibold tracking-wider uppercase shrink-0 z-30 w-full md:mt-2">
        <div
          className="w-[40px] pr-2 flex justify-center cursor-pointer text-neon-blue hover:text-white transition-colors"
          onClick={toggleSelectAll}
          title="Zvolit vše"
        >
          {selectedMailIds.size > 0 && selectedMailIds.size === visibleEmails.length && visibleEmails.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>

        {selectedMailIds.size > 0 ? (
          <div className="flex-1 flex items-center gap-6 text-neon-blue animate-in fade-in slide-in-from-left-4 duration-300">
            <span className="font-bold tracking-widest bg-neon-blue/20 px-3 py-1 rounded-md text-xs">
              VYBRÁNO: {selectedMailIds.size}
            </span>

            <div className="flex items-center gap-3 ml-4">
              <button
                onClick={handleBulkToggleRead}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neon-blue/20 border border-transparent hover:border-neon-blue/50 transition-all font-bold uppercase tracking-wider text-xs"
                title="Změnit stav přečtení"
              >
                {isFirstUnread ? <MailOpen size={16} /> : <Mail size={16} />}
                {isFirstUnread ? 'Přečteno' : 'Nepřečteno'}
              </button>

              <button
                onClick={handleBulkToggleStar}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neon-purple/20 text-neon-blue hover:text-neon-purple border border-transparent hover:border-neon-purple/50 transition-all font-bold uppercase tracking-wider text-xs"
                title="Označit jako důležité"
              >
                <div className={`w-3 h-3 shrink-0 rounded-full transition-all ${isFirstStarred ? 'bg-transparent border-2 border-neon-purple/50' : 'bg-neon-purple shadow-[0_0_8px_#f72585]'}`}></div>
                {isFirstStarred ? 'Odebrat' : 'Důležité'}
              </button>

              {activeFolder === 'Koš' && (
                <button
                  onClick={handleBulkRestore}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-green-500/20 text-neon-blue hover:text-green-400 border border-transparent hover:border-green-500/50 transition-all font-bold uppercase tracking-wider text-xs"
                  title="Obnovit vybrané e-maily z koše"
                >
                  <RotateCcw size={16} /> Obnovit
                </button>
              )}

              <button
                onClick={handleBulkTrash}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-red-500/20 text-neon-blue hover:text-red-400 border border-transparent hover:border-red-500/50 transition-all font-bold uppercase tracking-wider text-xs"
                title={activeFolder === 'Koš' ? "Trvale smazat vybrané e-maily" : "Smazat vybrané e-maily"}
              >
                <Trash2 size={16} /> Smazat
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 w-[var(--col-from)]">
              <HeaderItem label={activeFolder === 'Odeslané' ? 'Příjemce' : 'Odesílatel'} field="from" className="w-full pr-4 overflow-hidden whitespace-nowrap" />
            </div>
            <div className="flex-1 min-w-0 pl-3">
              <HeaderItem label="Předmět" field="subject" className="w-full pr-4 overflow-hidden whitespace-nowrap" />
            </div>
            <div className="mcol-size shrink-0 w-[70px]">
              <HeaderItem label="Velikost" field="size" className="w-full justify-end pr-3 whitespace-nowrap" />
            </div>
            <div className="shrink-0 w-[var(--col-date)]">
              <HeaderItem label="Datum" field="date" className="w-full justify-end whitespace-nowrap" />
            </div>
          </>
        )}
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col relative pt-2">

        {(loading || activeFolder !== fetchedFolderRef.current) ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neon-blue/60 min-h-64">
            <span className="w-8 h-8 rounded-full border-4 border-neon-blue/20 border-t-neon-blue animate-spin"></span>
            <span className="font-semibold tracking-wide">Stahování pošty...</span>
          </div>
        ) : visibleEmails.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 font-medium min-h-64">
            Složka je prázdná
          </div>
        ) : (
          <div className="flex flex-col p-3 gap-2">
            {visibleEmails.map((email, index) => (
              <EmailListItem
                key={email.id}
                email={email}
                index={index}
                activeFolder={activeFolder}
                selectedEmailId={selectedEmailId ?? null}
                selectedMailIds={selectedMailIds}
                keyboardIndex={keyboardIndex}
                draggableEmailId={draggableEmailId}
                emails={emails}
                handlePointerDown={handlePointerDown}
                setKeyboardIndex={setKeyboardIndex}
                clearDragTimer={clearDragTimer}
                handleDragEnd={handleDragEnd}
                setSelectedMailIds={setSelectedMailIds}
                handleEmailClick={handleEmailClick}
                toggleSelectEmail={toggleSelectEmail}
                handleToggleRead={handleToggleRead}
                onDraftClick={onDraftClick}
                handleToggleStar={handleToggleStar}
                handleTrashEmail={handleTrashEmail}
                onSwipeDelete={(email) => setMobileDeletePending(email)}
              />
            ))}
            {/* Load More Button */}
            {(nextPageToken || fullVisibleEmailsLength > displayedEmailLimit) && (
              <div className="flex justify-center mt-6 mb-4">
                <button
                  onClick={() => {
                    if (fullVisibleEmailsLength > displayedEmailLimit) {
                      setDisplayedEmailLimit(prev => prev + 10);
                    } else {
                      setDisplayedEmailLimit(prev => prev + 10);
                      loadMoreEmails();
                    }
                  }}
                  disabled={loadingMore}
                  className="px-6 py-3 rounded-full bg-neon-blue/10 text-neon-blue font-bold tracking-widest border border-neon-blue/30 hover:bg-neon-blue/20 shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all flex items-center justify-center min-w-[200px]"
                >
                  {loadingMore ? <Loader2 size={20} className="animate-spin" /> : 'NAČÍST STARŠÍ E-MAILY'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Multiselect Floating Bar */}
      {selectedMailIds.size > 0 && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-[90] bg-navy/95 backdrop-blur-xl border border-neon-blue/40 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(0,243,255,0.2)] animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center justify-between mb-4 border-b border-neon-blue/20 pb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedMailIds(new Set())} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                <X size={20} />
              </button>
              <span className="font-bold text-neon-blue text-sm tracking-widest">{selectedMailIds.size} Vybráno</span>
            </div>
            <button
              onClick={toggleSelectAll}
              className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
            >
              {selectedMailIds.size === visibleEmails.length ? 'Odznačit vše' : 'Vybrat vše'}
            </button>
          </div>

          <div className="flex items-center justify-between px-2">
            <button onClick={handleBulkToggleRead} className="flex flex-col items-center gap-1.5 text-neon-blue hover:text-white transition-colors">
              <div className="p-3 rounded-xl bg-neon-blue/10 shadow-[inset_0_0_10px_rgba(0,243,255,0.2)]">{isFirstUnread ? <MailOpen size={20} /> : <Mail size={20} />}</div>
              <span className="text-[10px] font-bold uppercase tracking-wider">{isFirstUnread ? 'Přečtené' : 'Nepřeč.'}</span>
            </button>

            <button onClick={handleBulkToggleStar} className="flex flex-col items-center gap-1.5 text-neon-purple hover:text-white transition-colors">
              <div className="p-3 rounded-xl bg-neon-purple/10 shadow-[inset_0_0_10px_rgba(247,37,133,0.2)]">
                <div className={`w-5 h-5 rounded-full transition-all ${isFirstStarred ? 'border-2 border-neon-purple/50' : 'bg-neon-purple shadow-[0_0_10px_#f72585] animate-pulse'}`}></div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">{isFirstStarred ? 'Odebrat' : 'Důležité'}</span>
            </button>

            {activeFolder === 'Koš' && (
              <button onClick={handleBulkRestore} className="flex flex-col items-center gap-1.5 text-green-400 hover:text-white transition-colors">
                <div className="p-3 rounded-xl bg-green-500/10 shadow-[inset_0_0_10px_rgba(74,222,128,0.2)]"><RotateCcw size={20} /></div>
                <span className="text-[10px] font-bold uppercase tracking-wider">Obnovit</span>
              </button>
            )}

            <button onClick={handleBulkTrash} className="flex flex-col items-center gap-1.5 text-danger hover:text-white transition-colors">
              <div className="p-3 rounded-xl bg-danger/10 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)]"><Trash2 size={20} /></div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Smazat</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Delete Confirmation Modal */}
      {mobileDeletePending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-deep/80 backdrop-blur-sm p-4">
          <div className="bg-navy border-2 border-neon-red/50 rounded-2xl p-6 w-full max-w-sm shadow-[0_0_40px_rgba(255,51,102,0.3)]">
            <h3 className="text-xl font-black text-neon-red tracking-widest uppercase mb-2">Potvrdit smazání</h3>
            <p className="text-slate-300 mb-6 font-semibold">Opravdu chcete tento e-mail přesunout do koše?</p>
            <div className="flex gap-4">
              <button
                onClick={() => setMobileDeletePending(null)}
                className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-bold tracking-widest uppercase transition-colors hover:bg-slate-800"
              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  handleTrashEmail(mobileDeletePending, null);
                  setMobileDeletePending(null);
                }}
                className="flex-1 py-3 rounded-xl bg-neon-red/10 border border-neon-red text-neon-red font-bold tracking-widest uppercase transition-colors hover:bg-neon-red/30 shadow-[inset_0_0_15px_rgba(255,51,102,0.2)]"
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
