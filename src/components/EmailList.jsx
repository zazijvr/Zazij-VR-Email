import React, { useState, useEffect, useRef } from 'react';
import EmailListItem from './EmailListItem';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Paperclip, ChevronUp, ChevronDown, Loader2, Trash2, Mail, MailOpen, Search, Flag, Star, CheckSquare, Square, RotateCcw, FileEdit } from 'lucide-react';
import { getHeader } from '../utils/emailParser';
import { saveNewContacts } from '../utils/contactManager';
import { useAlert } from './AlertProvider';

// Globální set pro sledování všech ID zpráv, které už aplikace někdy viděla v tomto spuštění,
// abychom absolutně spolehlivě zabránili dvojitým notifikacím (např. při ručním označení "Přečíst")
const globalNotifiedSet = new Set();
const hasAttachment = (payload) => {
  if (!payload) return false;
  if (payload.filename && payload.filename.length > 0) return true;
  if (payload.parts) {
    return payload.parts.some(hasAttachment);
  }
  return false;
};

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const parseDate = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { dateText: '', timeText: '', time: 0 };
  const today = new Date();

  const timeText = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

  if (d.toDateString() === today.toDateString()) {
    return {
      dateText: 'Dnes',
      timeText,
      time: d.getTime()
    };
  }

  return {
    dateText: d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    timeText,
    time: d.getTime()
  };
};

const formatMessage = (m) => {
  const headers = m.payload?.headers || [];
  const fromFull = getHeader(headers, 'From');
  const toFull = getHeader(headers, 'To');
  const ccFull = getHeader(headers, 'Cc');
  const snippet = m.snippet || '';
  const isUnread = m.labelIds?.includes('UNREAD') || false;
  const isStarred = m.labelIds?.includes('STARRED') || false;
  const dateData = parseDate(getHeader(headers, 'Date'));

  const fromParsed = fromFull.split('<')[0].trim() || fromFull;
  const toParsed = toFull.split('<')[0].trim() || toFull;

  return {
    id: m.id,
    threadId: m.threadId || m.id,
    labelIds: m.labelIds || [],
    from: fromParsed,
    to: toParsed,
    originalFrom: fromParsed,
    cc: ccFull ? (ccFull.split('<')[0].trim() || ccFull) : '',
    originalFromRaw: fromFull,
    originalToRaw: toFull,
    originalCcRaw: ccFull,
    subject: getHeader(headers, 'Subject') || '(Bez předmětu)',
    snippet: snippet,
    isUnread,
    isStarred,
    dateText: dateData.dateText,
    timeText: dateData.timeText,
    rawDate: dateData.time,
    sizeText: formatSize(m.sizeEstimate),
    rawSize: m.sizeEstimate || 0,
    hasAttachment: hasAttachment(m.payload)
  };
};

const mergeAndGroupEmails = (oldList, newlyFetchedList, isSilentFetch = false) => {
  const threadMap = new Map();

  const processOld = (email) => {
    const tId = email.threadId || email.id;
    // Opustíme staré _newArrival, aby animace nehrála znovu při dalším fetchi
    const { _newArrival, ...rest } = email;
    if (!rest.messageIds) rest.messageIds = new Set([email.id]);
    threadMap.set(tId, { ...rest });
  };

  const processNew = (email) => {
    const tId = email.threadId || email.id;

    if (!threadMap.has(tId)) {
      threadMap.set(tId, { ...email, messageIds: new Set([email.id]), _newArrival: isSilentFetch });
    } else {
      const existing = threadMap.get(tId);

      // Zabráníme duplikátnímu načítání stejného ID v rámci tichého refreshe
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
    }
  };

  oldList.forEach(processOld);
  newlyFetchedList.forEach(processNew);

  const finalEmails = Array.from(threadMap.values());
  finalEmails.forEach(e => {
    e.messageCount = e.messageIds.size;
    // Nebudeme vizuálně přiznávat, kolik e-mailů dané vlákno obsahuje,
    // na oko se to tváří jako jedna zpráva (ta nejnovější).
    e.from = e.originalFrom;
  });

  return finalEmails;
};

export default function EmailList({ googleToken, activeFolder, selectedEmailId, setSelectedEmailId, onExpand, onDraftClick, trashedEmails = [], spamEmails = [], hiddenEmailIds = [], optimisticMoves = [], onTrash, onRestore, onSpam, setUnreadCounts, unreadCounts, loginWithGoogle, customLabels = [], userEmail, refreshTriggerList }) {
  const getLabelId = (folderName) => {
    if (folderName === 'Doručené') return 'INBOX';
    if (folderName === 'Důležité') return 'STARRED';
    if (folderName === 'Odeslané') return 'SENT';
    if (folderName === 'Rozepsané') return 'DRAFT';
    if (folderName === 'Spam') return 'SPAM';
    if (folderName === 'Koš') return 'TRASH';
    const custom = customLabels?.find(l => l.name === folderName);
    return custom ? custom.id : 'INBOX';
  };

  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('date');
  const [sortAscending, setSortAscending] = useState(false);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { showAlert } = useAlert();

  const [mobileDeletePending, setMobileDeletePending] = useState(null);

  const [selectedMailIds, setSelectedMailIds] = useState(new Set());
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const visibleEmailsRef = useRef([]);
  const lastClickRef = useRef({ id: null, time: 0 });

  useEffect(() => {
    if (userEmail && emails.length > 0) {
       const allContacts = [];
       emails.forEach(e => {
         if (e.originalFromRaw) allContacts.push(e.originalFromRaw);
         if (e.originalToRaw) allContacts.push(e.originalToRaw);
         if (e.originalCcRaw) allContacts.push(e.originalCcRaw);
       });
       saveNewContacts(userEmail, allContacts);
    }
  }, [userEmail, emails]);
  
  const toggleSelectAll = () => {
    if (visibleEmails.length === 0) return;
    if (selectedMailIds.size === visibleEmails.length) {
      setSelectedMailIds(new Set());
    } else {
      setSelectedMailIds(new Set(visibleEmails.map(e => e.id)));
    }
  };

  const toggleSelectEmail = (id, e) => {
    e.stopPropagation();
    setSelectedMailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [draggableEmailId, setDraggableEmailId] = useState(null);
  const dragTimerRef = React.useRef(null);

  const handlePointerDown = (id) => {
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
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleTrashEmail = (email, e) => {
    if (e) e.stopPropagation();
    if (email.isUnread && setUnreadCounts) {
      setUnreadCounts(prev => ({ ...prev, [activeFolder]: Math.max(0, (prev[activeFolder] || 0) - 1) }));
    }
    
    setEmails(prev => prev.filter(p => p.id !== email.id));
    if (onTrash) onTrash(email);
  };

  const handleSpamEmail = (email, e) => {
    if (e) e.stopPropagation();
    if (email.isUnread && setUnreadCounts) {
      setUnreadCounts(prev => ({ ...prev, [activeFolder]: Math.max(0, (prev[activeFolder] || 0) - 1) }));
    }
    
    setEmails(prev => prev.filter(p => p.id !== email.id));
    if (onSpam) onSpam(email);
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Zabráníme smazání e-mailu, pokud uživatel zrovna píše text nebo edituje šablonu
      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement?.isContentEditable) return;

      if (e.key === 'Delete' && selectedEmailId) {
        const emailToDelete = emails.find(em => em.id === selectedEmailId);
        if (emailToDelete) {
          handleTrashEmail(emailToDelete);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEmailId, googleToken, emails]);

  const fetchedFolderRef = React.useRef(null);
  useEffect(() => {
    if (!googleToken) {
      setEmails([]);
      return;
    }

    const fetchEmails = async () => {
      setLoading(true);
      try {
        const labelId = getLabelId(activeFolder);
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${labelId}&maxResults=15`;
        let queryParts = [];
        if (showOnlyUnread) queryParts.push('is:unread');
        if (searchQuery.trim()) queryParts.push(searchQuery.trim());
        if (queryParts.length > 0) url += '&q=' + encodeURIComponent(queryParts.join(' '));

        const listRes = await fetch(url, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const listData = await listRes.json();

        if (!listData.messages) {
          setEmails([]);
          fetchedFolderRef.current = activeFolder;
          setLoading(false);
          return;
        }

        setNextPageToken(listData.nextPageToken || null);

        const messagesPromises = listData.messages.map(async (msg) => {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full&fields=id,threadId,labelIds,snippet,sizeEstimate,internalDate,payload(headers,mimeType,filename,parts(mimeType,filename,parts(mimeType,filename,parts(mimeType,filename))))`, {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          return await msgRes.json();
        });

        const fullMessages = await Promise.all(messagesPromises);

        const formattedEmails = fullMessages.map(formatMessage);
        formattedEmails.forEach(e => globalNotifiedSet.add(e.id));
        setEmails(mergeAndGroupEmails([], formattedEmails));
      } catch (err) {
        console.error("Chyba načítání pošty:", err);
      }
      fetchedFolderRef.current = activeFolder;
      setLoading(false);
    };

    fetchEmails();
  }, [googleToken, activeFolder, showOnlyUnread, searchQuery, refreshTriggerList]);

  const emailsRef = React.useRef(emails);
  useEffect(() => { emailsRef.current = emails; }, [emails]);

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
  const prevUnreadRef = React.useRef(0);
  const prevFolderRef = React.useRef(activeFolder);
  
  useEffect(() => {
    const currentUnread = unreadCounts?.[activeFolder] || 0;
    const isFolderSwitch = prevFolderRef.current !== activeFolder;
    
    // Ignorujeme přepnutí složky a spoléháme jen na inkrementální růst.
    const shouldFetch = !isFolderSwitch && (currentUnread > prevUnreadRef.current);
    
    prevUnreadRef.current = currentUnread;
    prevFolderRef.current = activeFolder;

    if (shouldFetch && googleToken) {
      const silentFetch = async () => {
        try {
          const labelId = getLabelId(activeFolder);
          let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${labelId}&maxResults=15`;
          let queryParts = [];
          if (showOnlyUnread) queryParts.push('is:unread');
          if (searchQuery.trim()) queryParts.push(searchQuery.trim());
          if (queryParts.length > 0) url += '&q=' + encodeURIComponent(queryParts.join(' '));

          const listRes = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
          const listData = await listRes.json();
          if (!listData.messages) return;

          const messagesPromises = listData.messages.map(async (msg) => {
            const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full&fields=id,threadId,labelIds,snippet,sizeEstimate,internalDate,payload(headers,mimeType,filename,parts(mimeType,filename,parts(mimeType,filename,parts(mimeType,filename))))`, {
              headers: { Authorization: `Bearer ${googleToken}` }
            });
            return await msgRes.json();
          });

          const fullMessages = await Promise.all(messagesPromises);

          const formattedEmails = fullMessages.map(formatMessage);
          
          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) {
             const permission = await requestPermission();
             permissionGranted = permission === 'granted';
          }
          
          const trulyNewEmails = formattedEmails.filter(newEm => !globalNotifiedSet.has(newEm.id));

          if (permissionGranted && trulyNewEmails.length > 0) {
             const latest = trulyNewEmails[0];
             sendNotification({ 
                title: 'ZažijVR E-mail', 
                body: `Nová zpráva od: ${latest.from}\n${latest.subject}`,
                actionTypeId: 'new_email',
                sound: 'message-new-instant'
             });
          }
          
          formattedEmails.forEach(e => globalNotifiedSet.add(e.id));

          setEmails(prev => mergeAndGroupEmails(prev, formattedEmails, true));
        } catch (err) {
          console.error("Chyba tichého načítání pošty:", err);
        }
      };
      silentFetch();
    }
  }, [unreadCounts, activeFolder, showOnlyUnread, googleToken, searchQuery]);

  const handleEmailClick = async (email) => {
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
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.id}/modify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
      }).catch(err => console.error("Nepodařilo se označit e-mail jako přečtený:", err));
    }
  };

  const handleToggleRead = async (emailId, currentIsUnread, e) => {
    if (e) e.stopPropagation();

    const isNowUnread = !currentIsUnread;

    // Optimistic Update
    setEmails(prev => prev.map(email =>
      email.id === emailId ? { ...email, isUnread: isNowUnread } : email
    ));
    if (setUnreadCounts) {
      setUnreadCounts(prev => ({
        ...prev,
        [activeFolder]: Math.max(0, (prev[activeFolder] || 0) + (isNowUnread ? 1 : -1))
      }));
    }

    try {
      const endpoint = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`;
      const payload = currentIsUnread
        ? { removeLabelIds: ['UNREAD'] }
        : { addLabelIds: ['UNREAD'] };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(res.status);
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

  const handleToggleStar = async (emailId, currentIsStarred, e) => {
    if (e) e.stopPropagation();

    const isNowStarred = !currentIsStarred;

    // Optimistic Update
    setEmails(prev => prev.map(email =>
      email.id === emailId ? { ...email, isStarred: isNowStarred } : email
    ));

    try {
      const endpoint = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`;
      const payload = currentIsStarred
        ? { removeLabelIds: ['STARRED'] }
        : { addLabelIds: ['STARRED'] };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Chyba při updatu STARRED stavu");
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
    selected.forEach(email => {
      handleTrashEmail(email, null);
    });
    setSelectedMailIds(new Set());
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
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const labelId = getLabelId(activeFolder);
      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${labelId}&maxResults=15&pageToken=${nextPageToken}`;
      let queryParts = [];
      if (showOnlyUnread) queryParts.push('is:unread');
      if (searchQuery.trim()) queryParts.push(searchQuery.trim());
      if (queryParts.length > 0) url += '&q=' + encodeURIComponent(queryParts.join(' '));

      const listRes = await fetch(url, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const listData = await listRes.json();

      if (!listData.messages) {
        setLoadingMore(false);
        return;
      }

      setNextPageToken(listData.nextPageToken || null);

      const messagesPromises = listData.messages.map(async (msg) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full&fields=id,threadId,labelIds,snippet,sizeEstimate,internalDate,payload(headers,mimeType,filename,parts(mimeType,filename,parts(mimeType,filename,parts(mimeType,filename))))`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        return await msgRes.json();
      });

      const fullMessages = await Promise.all(messagesPromises);

      const formattedEmails = fullMessages.map(formatMessage);
      formattedEmails.forEach(e => globalNotifiedSet.add(e.id));
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

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(field === 'sender' || field === 'subject');
    }
  };

  const sortedEmails = [...emails].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') cmp = a.rawDate - b.rawDate;
    else if (sortField === 'sender') cmp = a.from.localeCompare(b.from);
    else if (sortField === 'subject') cmp = a.subject.localeCompare(b.subject);
    else if (sortField === 'size') cmp = a.rawSize - b.rawSize;
    else if (sortField === 'attachment') cmp = (a.hasAttachment === b.hasAttachment) ? 0 : (a.hasAttachment ? 1 : -1);

    return sortAscending ? cmp : -cmp;
  });

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
    visibleEmails = [...finalTrashed, ...visibleEmails];
  } else if (activeFolder === 'Spam') {
    const newlySpammedContent = spamEmails.filter(s => s.spammedFrom !== 'Spam' && !visibleEmails.some(v => v.id === s.id));
    const finalSpammed = showOnlyUnread ? newlySpammedContent.filter(e => e.isUnread) : newlySpammedContent;
    visibleEmails = [...finalSpammed, ...visibleEmails];
  }

  // Přídání zpráv, které byly tažením přesunuty DO této složky
  if (optimisticMoves && optimisticMoves.length > 0) {
    const incoming = optimisticMoves.filter(m => m.targetFolder === activeFolder && !visibleEmails.some(v => v.id === m.id));
    const finalIncoming = showOnlyUnread ? incoming.filter(e => e.isUnread) : incoming;
    if (finalIncoming.length > 0) {
      visibleEmails = [...finalIncoming, ...visibleEmails];
      // Resoring aby příchozí zprávy zapadly na správné datumové místo
      visibleEmails.sort((a, b) => sortAscending ? a.rawDate - b.rawDate : b.rawDate - a.rawDate);
    }
  }

  visibleEmailsRef.current = visibleEmails;

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const activeTag = activeElement.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement.isContentEditable) return;
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
          if (onExpand) onExpand();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardIndex, onExpand, setSelectedEmailId]);

  // Defaultní chování: Autovýběr prvního e-mailu po úspěšném načtení složky
  const lastAutoSelectedFolderRef = React.useRef(null);
  useEffect(() => {
    if (
      !loading && 
      fetchedFolderRef.current === activeFolder && 
      lastAutoSelectedFolderRef.current !== activeFolder &&
      visibleEmails.length > 0
    ) {
      lastAutoSelectedFolderRef.current = activeFolder;
      const isMobile = window.innerWidth < 768; // Zrušíme autovýběr na telefonech
      if (setSelectedEmailId && !isMobile) {
        setSelectedEmailId(visibleEmails[0].id);
      }
    }
  }, [loading, visibleEmails, activeFolder, setSelectedEmailId]);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <div className="w-4" />;
    return sortAscending ? <ChevronUp size={16} className="text-[#00f3ff]" /> : <ChevronDown size={16} className="text-[#00f3ff]" />;
  };

  const HeaderItem = ({ label, field, className = "" }) => (
    <div
      className={`flex items-center gap-1 cursor-pointer hover:text-[#00f3ff] transition-colors select-none ${className} ${sortField === field ? 'text-[#00f3ff] font-bold' : 'text-gray-400'}`}
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
      <div className="flex-1 relative bg-[#0f172a]/80 backdrop-blur-md flex flex-col items-center justify-center h-full p-8 text-center shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col items-center max-w-md gap-6 z-10">
          <div className="w-24 h-24 rounded-full bg-[#00f3ff]/10 flex items-center justify-center shadow-[0_0_40px_rgba(0,243,255,0.2)] border-2 border-[#00f3ff]/40 mb-2 group animate-pulse-slow">
            <Mail className="w-10 h-10 text-[#00f3ff]" />
          </div>
          <h2 className="text-3xl text-white font-black tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]">Systém uzamčen</h2>
          <p className="text-gray-400 text-sm tracking-widest font-mono uppercase opacity-70">Zabezpečená zóna: Vyžaduje se autentizace operátora</p>
          
          <button 
            onClick={(e) => { e.stopPropagation(); loginWithGoogle && loginWithGoogle(); }}
            className="mt-8 px-10 py-4 relative group overflow-hidden bg-transparent border-2 border-[#00f3ff] text-[#00f3ff] font-black uppercase tracking-widest rounded-sm hover:text-black transition-all duration-300 cursor-pointer"
          >
            <div className="absolute inset-0 w-full h-full bg-[#00f3ff] translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out z-0 pointer-events-none"></div>
            <span className="relative z-10 flex items-center gap-3 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-[#f800ff] group-hover:bg-black shadow-[0_0_8px_#f800ff] transition-colors duration-300"></span>
              Přihlásit se
            </span>
          </button>
        </div>
        {/* Dekorativní pozadí pro odlogovaný stav */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00f3ff] rounded-full blur-[120px] opacity-10 pointer-events-none"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-[#0f172a]/80 backdrop-blur-sm flex flex-col h-full shadow-[10px_0_30px_-5px_rgba(0,0,0,0.5)]">

      {/* Sub-toolbar */}
      <div className="flex items-center pl-7 py-2 pr-[38px] bg-black/40 border-b border-[#00f3ff]/10 z-20 shrink-0">
        
        {/* Placeholder šířky pro sloupec s Checkboxy */}
        <div className="w-[40px] pr-2" />

        {/* Šířka pro sloupec Odesílatel */}
        <div className="w-[20%] pr-4 flex items-center">
          <span className="text-gray-400 text-[10px] sm:text-xs tracking-widest uppercase truncate" title={`Zobrazeno ${visibleEmails.length} konverzací`}>
            Výpis {visibleEmails.length} konverzací
          </span>
        </div>

        {/* Šířka pro sloupec Předmět (Zarovná Search Bar a prodlouží se až k nápisu Datum) */}
        <div className="flex-1 relative group pr-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f3ff]/50 group-focus-within:text-[#00f3ff] transition-colors pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Hledat zprávy..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="pl-9 pr-9 py-1.5 w-full bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded-md text-xs text-white placeholder-[#00f3ff]/40 outline-none focus:border-[#00f3ff] transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,243,255,0.05)] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)]"
          />
          {searchInputValue && (
            <button
              onClick={() => {
                setSearchInputValue('');
                setSearchQuery('');
                setSortField('date');
                setSortAscending(false);
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-[#00f3ff]/60 hover:text-[#f800ff] transition-colors cursor-pointer text-sm font-black drop-shadow-[0_0_5px_rgba(248,0,255,0.5)] z-10 hover:scale-125"
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
                ? 'bg-[#00f3ff] text-black border border-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.6)] scale-105'
                : 'bg-[#00f3ff]/5 text-[#00f3ff] border border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.15)] hover:bg-[#00f3ff]/20 hover:shadow-[0_0_20px_rgba(0,243,255,0.4)]'
              }`}
          >
            {showOnlyUnread && <span className="font-black text-black">✖</span>}
            NEPŘEČTENÉ
          </button>
        </div>
      </div>

      <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col relative">
        {/* Sticky Header uvnitř kontejneru pro zachování scrollbar šířky a pixel-perfect zarovnání */}
        <div className="sticky top-0 flex items-center px-7 py-4 bg-[#0f172a]/95 backdrop-blur-md border-b border-[#00f3ff]/20 text-sm font-semibold tracking-wider uppercase shadow-[0_5px_15px_-5px_rgba(0,0,0,0.5)] shrink-0 z-30 w-full rounded-t-xl mt-3">
          <div 
            className="w-[40px] pr-2 flex justify-center cursor-pointer text-[#00f3ff] hover:text-white transition-colors"
            onClick={toggleSelectAll}
            title="Zvolit vše"
          >
             {selectedMailIds.size > 0 && selectedMailIds.size === visibleEmails.length && visibleEmails.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
          </div>
          
          {selectedMailIds.size > 0 ? (
            <div className="flex-1 flex items-center gap-6 text-[#00f3ff] animate-in fade-in slide-in-from-left-4 duration-300">
              <span className="font-bold tracking-widest bg-[#00f3ff]/20 px-3 py-1 rounded-md text-xs">
                VYBRÁNO: {selectedMailIds.size}
              </span>
              
              <div className="flex items-center gap-3 ml-4">
                <button 
                  onClick={handleBulkToggleRead}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[#00f3ff]/20 border border-transparent hover:border-[#00f3ff]/50 transition-all font-bold uppercase tracking-wider text-xs"
                  title="Změnit stav přečtení"
                >
                  {isFirstUnread ? <MailOpen size={16} /> : <Mail size={16} />} 
                  {isFirstUnread ? 'Přečteno' : 'Nepřečteno'}
                </button>

                <button 
                  onClick={handleBulkToggleStar}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[#f800ff]/20 text-[#00f3ff] hover:text-[#f800ff] border border-transparent hover:border-[#f800ff]/50 transition-all font-bold uppercase tracking-wider text-xs"
                  title="Označit jako důležité"
                >
                  <Star size={16} className={isFirstStarred ? "" : "fill-current text-[#f800ff] drop-shadow-[0_0_5px_rgba(248,0,255,0.8)]"} />
                  {isFirstStarred ? 'Odebrat Hvězdu' : 'Důležité'}
                </button>

                {activeFolder === 'Koš' && (
                  <button 
                    onClick={handleBulkRestore}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-green-500/20 text-[#00f3ff] hover:text-green-400 border border-transparent hover:border-green-500/50 transition-all font-bold uppercase tracking-wider text-xs"
                    title="Obnovit vybrané e-maily z koše"
                  >
                    <RotateCcw size={16} /> Obnovit
                  </button>
                )}

                <button 
                  onClick={handleBulkTrash}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-red-500/20 text-[#00f3ff] hover:text-red-400 border border-transparent hover:border-red-500/50 transition-all font-bold uppercase tracking-wider text-xs"
                  title={activeFolder === 'Koš' ? "Trvale smazat vybrané e-maily" : "Smazat vybrané e-maily"}
                >
                  <Trash2 size={16} /> Smazat
                </button>
              </div>
            </div>
          ) : (
            <>
              <HeaderItem label={activeFolder === 'Odeslané' ? "Příjemce" : "Odesílatel"} field="sender" className="w-[20%] pr-4" />
              <HeaderItem label="Předmět" field="subject" className="flex-1 pr-4" />
              <HeaderItem label="Datum" field="date" className="w-[150px] pr-4 justify-end text-right" />
              <HeaderItem label="Velikost" field="size" className="w-[120px] pr-4 justify-end text-right" />
              <div className="w-[60px] flex justify-center cursor-pointer hover:text-[#00f3ff] transition-colors select-none text-gray-400" onClick={() => handleSort('attachment')}>
                <Paperclip size={16} className={sortField === 'attachment' ? 'text-[#00f3ff]' : ''} />
              </div>
              <div className="w-[110px]" /> {/* Spacer for Actions */}
            </>
          )}
        </div>

        {(loading || activeFolder !== fetchedFolderRef.current) ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#00f3ff]/60 min-h-64">
            <span className="w-8 h-8 rounded-full border-4 border-[#00f3ff]/20 border-t-[#00f3ff] animate-spin"></span>
            <span className="font-semibold tracking-wide">Stahování pošty...</span>
          </div>
        ) : visibleEmails.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 font-medium min-h-64">
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
                selectedEmailId={selectedEmailId}
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
            {nextPageToken && (
              <div className="flex justify-center mt-6 mb-4">
                <button
                  onClick={loadMoreEmails}
                  disabled={loadingMore}
                  className="px-6 py-3 rounded-full bg-[#00f3ff]/10 text-[#00f3ff] font-bold tracking-widest border border-[#00f3ff]/30 hover:bg-[#00f3ff]/20 shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all flex items-center justify-center min-w-[200px]"
                >
                  {loadingMore ? <Loader2 size={20} className="animate-spin" /> : 'NAČÍST STARŠÍ E-MAILY'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Delete Confirmation Modal */}
      {mobileDeletePending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border-2 border-[#ff3366]/50 rounded-2xl p-6 w-full max-w-sm shadow-[0_0_40px_rgba(255,51,102,0.3)]">
            <h3 className="text-xl font-black text-[#ff3366] tracking-widest uppercase mb-2">Potvrdit smazání</h3>
            <p className="text-gray-300 mb-6 font-semibold">Opravdu chcete tento e-mail přesunout do koše?</p>
            <div className="flex gap-4">
              <button
                onClick={() => setMobileDeletePending(null)}
                className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-300 font-bold tracking-widest uppercase transition-colors hover:bg-gray-800"
              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  handleTrashEmail(mobileDeletePending, null);
                  setMobileDeletePending(null);
                }}
                className="flex-1 py-3 rounded-xl bg-[#ff3366]/10 border border-[#ff3366] text-[#ff3366] font-bold tracking-widest uppercase transition-colors hover:bg-[#ff3366]/30 shadow-[inset_0_0_15px_rgba(255,51,102,0.2)]"
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
