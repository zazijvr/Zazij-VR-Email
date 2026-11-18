import { useState, useEffect, useRef, useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { openExternal } from '../utils/openExternal';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Maximize2, Trash2, Paperclip, Eye, Download, Reply, ReplyAll, Forward, AlertOctagon, Inbox, X, CalendarPlus, Copy, Check, MoreVertical, ArrowLeft, Mail, MailOpen, FileText } from 'lucide-react';
// ical.js je velká knihovna – načte se až u e-mailu s pozvánkou (.ics), ne při startu aplikace
import type ICAL from 'ical.js';
const loadIcal = async () => (await import('ical.js')).default;
import { listDrafts } from '../services/gmail';
import type { EmailDetailData } from '../services/emailDetail';
import { useMailProvider } from '../services/mailProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { createEvent, type GoogleEventTime } from '../services/calendar';

import type { AttachmentInfo } from '../utils/emailParser';
import type { ComposerAttachment, ComposerConfig } from '../types/composer';

const IS_MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent);

interface PreviewBlob {
  url: string;
  type: string;
  filename: string;
  /** Obsah pro otevření v aplikaci systému (počítač) */
  base64: string;
}

/**
 * Android: WebView PDF zobrazit neumí – příloha se předá aplikaci v telefonu (prohlížeč PDF…)
 * přes most MainActivity.kt. Vrací důvod neúspěchu, nebo null při úspěchu.
 */
const openOnAndroid = (base64: string, name: string, mime: string): Promise<string | null> =>
  new Promise((resolve) => {
    const bridge = window.VrAndroid;
    if (!bridge?.addEventListener) { resolve('bridge'); return; }
    const timer = setTimeout(() => { bridge.removeEventListener?.('message', onReply); resolve('timeout'); }, 15000);
    function onReply(e: { data: string }) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'openFileResult') return;
        clearTimeout(timer);
        bridge?.removeEventListener?.('message', onReply);
        resolve(msg.ok ? null : msg.reason || 'error');
      } catch { /* jiná zpráva */ }
    }
    bridge.addEventListener('message', onReply);
    bridge.postMessage(JSON.stringify({ type: 'openFile', name, mime, data: base64 }));
  });

/** Počítač: příloha se otevře výchozí aplikací systému (PDF v Okularu…) – rychlejší než náhled v okně */
const canOpenExternally = () => !!window.__TAURI_INTERNALS__ && !IS_MOBILE;
const openExternally = (p: PreviewBlob) =>
  invoke('open_attachment_externally', { filename: p.filename, dataBase64: p.base64 });

export interface EmailDetailProps {
  googleToken: string | null;
  selectedEmailId: string | null;
  onExpand?: () => void;
  onTrash?: () => void;
  onSpam?: () => void;
  /** Ve složce Spam: vrátit do Doručených */
  onNotSpam?: () => void;
  onActionReply?: (config: ComposerConfig) => void;
  /** Jen u okna přes celou obrazovku */
  onClose?: () => void;
  onMobileBack?: () => void;
  autoResumeDraftId?: string | null;
  onDraftResumed?: () => void;
  userEmail?: string;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

import { themeInfo, useTheme } from '../theme';
import { useAlert } from './AlertProvider';

/** Velikost písma předmětu podle délky – co nejvíc textu se vejde do dvou řádků bez zkracování */
const subjectSizeClass = (subject?: string) => {
  const len = subject?.length ?? 0;
  if (len <= 60) return 'text-xl md:text-2xl';
  return 'text-lg md:text-xl';
};

export default function EmailDetail({ googleToken, selectedEmailId, onExpand, onTrash, onSpam, onNotSpam, onActionReply, onClose, onMobileBack, autoResumeDraftId, onDraftResumed, userEmail }: EmailDetailProps) {
  // Obsah e-mailu je v iframe bez proměnných aplikace – barvy textu a odkazů podle motivu
  const frameColors = themeInfo(useTheme()).preview;
  const queryClient = useQueryClient();
  const provider = useMailProvider();
  const detailKey = ['emailDetail', userEmail ?? '', selectedEmailId ?? ''] as const;
  const [emailData, setEmailDataState] = useState<EmailDetailData | null>(null);
  /** Změna zobrazeného e-mailu – propíše se i do mezipaměti, aby po návratu platila */
  const setEmailData = useCallback((update: EmailDetailData | null | ((prev: EmailDetailData | null) => EmailDetailData | null)) => {
    setEmailDataState((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      if (next && selectedEmailId) queryClient.setQueryData(['emailDetail', userEmail ?? '', selectedEmailId], next);
      return next;
    });
  }, [queryClient, userEmail, selectedEmailId]);
  const [downloadingAttachId, setDownloadingAttachId] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<PreviewBlob | null>(null);
  const [isPreparingForward, setIsPreparingForward] = useState(false);
  /** Datum/čas události z přiložené pozvánky .ics podle id přílohy */
  const [icsDetails, setIcsDetails] = useState<Record<string, string>>({});
  const { showAlert, showConfirm } = useAlert();
  const handleTrashClick = (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    if (emailData?.labelIds?.includes('TRASH')) {
      showConfirm(
        'Tímto trvale odstraníš konverzaci z koše. Tuto akci nelze vzít zpět. Opravdu chceš pokračovat?',
        'Trvalé smazání',
        () => {
          if (onMobileBack) onMobileBack();
          if (onTrash) onTrash();
        },
        { confirmText: 'Smazat navždy', type: 'error' }
      );
    } else {
      if (onMobileBack) onMobileBack();
      if (onTrash) onTrash();
    }
  };
  const [iframeHeight, setIframeHeight] = useState('100%');
  const emailFrameRef = useRef<HTMLIFrameElement>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyToClipboard = (text: string, id: string) => {
    const match = text.match(/<([^>]+)>/);
    const textToCopy = match ? match[1] : text;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const modalRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    if (previewBlob) {
      setTimeout(() => { if (modalRef.current) modalRef.current.focus() }, 50);
    }
  }, [previewBlob]);

  const bottomSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if the click was outside the dropdown/bottom-sheet container
      // If we clicked the MoreMenu toggle button, let its own onClick handle it
      if (moreMenuRef.current && moreMenuRef.current.contains(target)) {
        return;
      }

      let isOutside = false;
      if (bottomSheetRef.current) {
        // We are using Portaled Bottom Sheet
        isOutside = !bottomSheetRef.current.contains(target);
      } else if (moreMenuRef.current) {
        // Fallback for non-portaled
        isOutside = !moreMenuRef.current.contains(target);
      }

      if (isOutside) {
        event.stopPropagation();
        event.preventDefault();
        setIsMoreMenuOpen(false);
      }
    };

    if (isMoreMenuOpen) {
      // Pouze 'click', jinak touchstart zabije DOM node a odstraní tento listener PŘEDTÍM,
      // než prohlížeč vygeneruje finální click, což pak vede přesně ke ghost clickům na popelnici
      document.addEventListener('click', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isMoreMenuOpen]);

  // Odstraněn globální viewport toggle (nesmí se tak ovlivnit UI)

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      // Jen zprávy z okna s obsahem tohoto e-mailu
      if (!emailFrameRef.current || e.source !== emailFrameRef.current.contentWindow) return;
      if (e.data && e.data.type === 'open-link' && typeof e.data.url === 'string') {
        if (e.data.url.toLowerCase().startsWith('mailto:')) {
          let toAddr = e.data.url.replace(/^mailto:/i, '');
          let subject = '';
          let body = '';
          if (toAddr.includes('?')) {
            const parts = toAddr.split('?');
            toAddr = parts[0];
            try {
              const params = new URLSearchParams(parts[1]);
              subject = params.get('subject') || '';
              body = params.get('body') || '';
            } catch {
              console.warn("Invalid mailto URI query");
            }
          }
          if (onActionReply) {
            onActionReply({
              type: 'new',
              initialTo: decodeURIComponent(toAddr),
              initialSubject: decodeURIComponent(subject),
              initialBody: decodeURIComponent(body)
            });
          }
          return;
        }

        try {
          if (window.__TAURI_INTERNALS__) {
            await openExternal(e.data.url);
          } else {
            window.open(e.data.url, '_blank', 'noopener,noreferrer');
          }
        } catch (err) {
          console.error("Failed to open link via Tauri shell:", err);
          window.open(e.data.url, '_blank', 'noopener,noreferrer');
        }
      }
      if (e.data && e.data.type === 'content-height') {
        const height = Math.max(100, e.data.height);
        setIframeHeight(`${height}px`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posluchač zpráv z iframe se registruje jednou; onActionReply jen předává konfiguraci okna
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewBlob) {
        URL.revokeObjectURL(previewBlob.url);
        setPreviewBlob(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewBlob]);

  useEffect(() => {
    if (!emailData?.attachments || !emailData?.messageId || !provider) return;

    const fetchIcsData = async () => {
      const newDetails: Record<string, string> = {};

      for (const att of emailData.attachments) {
        const mType = att.mimeType?.toLowerCase() || '';
        const fName = att.filename?.toLowerCase() || '';
        if (fName.endsWith('.ics') || mType === 'text/calendar') {
          if (!icsDetails[att.attachmentId]) {
            try {
              const file = await provider.attachment(emailData, att);
              if (file) {
                const binaryString = file.binary;
                let utf8String = binaryString;
                try { utf8String = decodeURIComponent(escape(binaryString)); } catch { /* není UTF-8 – použije se jak je */ }
                const ical = await loadIcal();
                const jcalData = ical.parse(utf8String);
                const comp = new ical.Component(jcalData);
                const eventComp = comp.getFirstSubcomponent('vevent');
                if (eventComp) {
                  const ev = new ical.Event(eventComp);
                  let dateStr = '';
                  if (ev.startDate) {
                    const formatTime = (icalTime: ICAL.Time) => icalTime.toJSDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                    const formatDate = (icalTime: ICAL.Time) => icalTime.toJSDate().toLocaleDateString('cs-CZ');

                    if (ev.startDate.isDate) {
                      // Celodenní událost
                      dateStr = formatDate(ev.startDate);
                      if (ev.endDate && ev.endDate.isDate) {
                        const startMs = ev.startDate.toJSDate().getTime();
                        const endMs = ev.endDate.toJSDate().getTime();
                        // ICS endDate pro celodenní je často +1 den
                        if (endMs - startMs > 86400000) {
                          // Ubereme 1 den z konce pro správné vizuální zobrazení
                          const realEnd = new Date(endMs - 86400000);
                          dateStr += ` - ${realEnd.toLocaleDateString('cs-CZ')}`;
                        }
                      }
                    } else {
                      // Časová událost
                      dateStr = `${formatDate(ev.startDate)} ${formatTime(ev.startDate)}`;
                      if (ev.endDate && !ev.endDate.isDate) {
                        if (formatDate(ev.startDate) === formatDate(ev.endDate)) {
                          // Stejný den
                          dateStr += ` - ${formatTime(ev.endDate)}`;
                        } else {
                          // Rozdílný den
                          dateStr += ` - ${formatDate(ev.endDate)} ${formatTime(ev.endDate)}`;
                        }
                      }
                    }
                  }
                  newDetails[att.attachmentId] = dateStr || '?';
                }
              }
            } catch (e) {
              console.error("Auto-fetch ICS failed:", e);
            }
          }
        }
      }

      if (Object.keys(newDetails).length > 0) {
        setIcsDetails(prev => ({ ...prev, ...newDetails }));
      }
    };
    fetchIcsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailData, provider]);

  const handleActionAttachment = async (attach: AttachmentInfo, action: 'open' | 'download') => {
    if (downloadingAttachId || !provider || !emailData) return;
    setDownloadingAttachId(attach.attachmentId);

    try {
      const file = await provider.attachment(emailData, attach);

      if (file) {
        const bytes = file.bytes;
        let safeMimeType = (attach.mimeType || 'application/octet-stream').toLowerCase();
        const lowerName = attach.filename.toLowerCase();

        // Vynutit správný mimeType u špatně kódovaných emailů (jako Alza faktury - octet-stream)
        if (lowerName.endsWith('.pdf')) safeMimeType = 'application/pdf';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) safeMimeType = 'image/jpeg';
        else if (lowerName.endsWith('.png')) safeMimeType = 'image/png';
        else if (lowerName.endsWith('.txt')) safeMimeType = 'text/plain';

        const blob = new Blob([bytes], { type: safeMimeType });
        const url = URL.createObjectURL(blob);

        if (action === 'open' && IS_MOBILE && window.VrAndroid && !safeMimeType.startsWith('image/')) {
          // Android: obrázky v aplikaci, ostatní (PDF…) v aplikaci telefonu
          URL.revokeObjectURL(url);
          const failure = await openOnAndroid(file.base64, attach.filename, safeMimeType);
          if (failure === 'noapp') showAlert('V telefonu není aplikace, která tento typ souboru otevře (např. prohlížeč PDF).', 'Otevření přílohy', 'info');
          else if (failure === 'type') showAlert('Tento typ souboru se z bezpečnostních důvodů neotevírá.', 'Otevření přílohy', 'info');
          else if (failure) showAlert('Přílohu se nepodařilo otevřít.', 'Otevření přílohy', 'error');
        } else if (action === 'open') {
          setPreviewBlob({ url, type: safeMimeType, filename: attach.filename, base64: file.base64 });
        } else {
          let suggestedPath = attach.filename;
          try {
            const dlDir = await downloadDir();
            suggestedPath = await join(dlDir, attach.filename);
          } catch (e) {
            console.warn("Nedaří se zjistit složku stahování", e);
          }
          const filePath = await save({ defaultPath: suggestedPath });
          if (filePath) {
            await writeFile(filePath, bytes);
          }
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error("Failed to process attachment:", err);
      showAlert(`Přílohu se nepodařilo zpracovat: ${errorText(err)}`, 'Chyba', 'error');
    }

    setDownloadingAttachId(null);
  };

  const handleAddToCalendar = async (attach: AttachmentInfo) => {
    if (downloadingAttachId || !provider || !emailData) return;
    if (!googleToken) {
      showAlert('Přidání do kalendáře vyžaduje připojený Google účet.', 'Kalendář', 'info');
      return;
    }
    setDownloadingAttachId(attach.attachmentId);

    try {
      const file = await provider.attachment(emailData, attach);

      if (file) {
        let utf8String = file.binary;
        try {
          utf8String = decodeURIComponent(escape(file.binary));
        } catch { /* není UTF-8 – použije se jak je */ }

        const ical = await loadIcal();
        let jcalData;
        try {
          jcalData = ical.parse(utf8String);
        } catch {
          showAlert('Nepodařilo se rozšifrovat událost z této pozvánky.', 'Chyba parsování', 'error');
          setDownloadingAttachId(null);
          return;
        }

        const comp = new ical.Component(jcalData);
        // Find first vevent
        const eventComp = comp.getFirstSubcomponent('vevent');
        if (!eventComp) {
          showAlert('Soubor neobsahuje žádnou použitelnou událost.', 'Prázdný soubor', 'warning');
          setDownloadingAttachId(null);
          return;
        }

        const ev = new ical.Event(eventComp);

        const buildGoogleTime = (icalTime: ICAL.Time | null | undefined): GoogleEventTime | null => {
          if (!icalTime) return null;
          if (icalTime.isDate) {
            return { date: icalTime.toString().split('T')[0] };
          }
          return { dateTime: icalTime.toJSDate().toISOString() };
        };

        const googleEvent = {
          summary: ev.summary || 'Nová událost z e-mailu',
          description: (ev.description ? ev.description + '\n\n' : '') + `[Přidáno z e-mailu: ${emailData.subject}]\n\nText zprávy:\n${emailData.rawTextBody ? emailData.rawTextBody.substring(0, 800) + (emailData.rawTextBody.length > 800 ? '...' : '') : ''}`,
          location: ev.location || '',
        };

        const start = buildGoogleTime(ev.startDate);
        if (!start) {
          showAlert('Pozvánka neobsahuje začátek události.', 'Neúplná událost', 'warning');
          setDownloadingAttachId(null);
          return;
        }
        try {
          await createEvent(googleToken, { ...googleEvent, start, end: buildGoogleTime(ev.endDate) || start });
          showAlert('Událost z e-mailu byla přidána do Kalendáře!', 'Událost Přidána', 'success');
        } catch (calErr) {
          showAlert('Došlo k chybě při zápisu do kalendáře:\n' + errorText(calErr), 'Chyba synchronizace', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      showAlert('Vyskytla se chyba při zpracování: ' + errorText(err), 'Chyba zpracování', 'error');
    }
    setDownloadingAttachId(null);
  };

  /** Stáhne přílohy jako data URL pro okno pro psaní (koncept, přeposlání) */
  const fetchAttachmentsForComposer = async (data: EmailDetailData): Promise<ComposerAttachment[]> => {
    if (!provider) return [];
    const out: ComposerAttachment[] = [];
    for (const att of data.attachments) {
      try {
        const file = await provider.attachment(data, att);
        if (!file) continue;
        const type = att.mimeType || 'application/octet-stream';
        out.push({ name: att.filename, type, content: `data:${type};base64,${file.base64}` });
      } catch (e) {
        console.error('Přílohu se nepodařilo stáhnout', e);
      }
    }
    return out;
  };

  const handleResumeDraft = async (data: EmailDetailData) => {
    if (!provider) return;
    try {
      // Gmail: navázat na existující koncept; IMAP: nový e-mail s obsahem konceptu
      const drafts = provider.supportsDraftResume && googleToken ? await listDrafts(googleToken) : [];
      const draftObj = drafts.find(d => d.message?.id === data.messageId);
      const fetchedAttachments = await fetchAttachmentsForComposer(data);

      onActionReply?.({
        type: 'draft',
        draftId: draftObj?.id,
        draftMessageId: data.messageId,
        initialTo: data.to || '',
        initialCc: data.cc || '',
        initialSubject: data.subject || '',
        initialBody: data.htmlBody || data.textBody || '',
        initialAttachments: fetchedAttachments,
        htmlBody: ''
      });
    } catch (e) {
      console.error(e);
      showAlert('Koncept se nepodařilo otevřít.', 'Chyba sítě', 'error');
    }
  };

  useEffect(() => {
    if (emailData && emailData.isDraft && emailData.messageId === autoResumeDraftId) {
      handleResumeDraft(emailData);
      if (onDraftResumed) onDraftResumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailData, autoResumeDraftId]);

  const getHistoryHeader = (typeStr: 'reply' | 'forward') => {
    if (!emailData) return '';
    const fromEscaped = (emailData.from || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const toEscaped = (emailData.to || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ccEscaped = (emailData.cc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ccLine = ccEscaped ? `Kopie: ${ccEscaped}<br>` : '';
    const formattedDate = emailData.date ? new Date(emailData.date).toLocaleString('cs-CZ') : '';

    let titleStr = '';
    if (typeStr === 'forward') titleStr = '---------- Přeposlaná zpráva ---------';
    if (typeStr === 'reply') titleStr = '---------- Původní zpráva ---------';

    return `
<div dir="ltr" class="gmail_attr" style="color: #cbd5e1;">
<br>${titleStr}<br>
Od: <strong>${fromEscaped}</strong><br>
Datum: ${formattedDate}<br>
Předmět: ${emailData.subject || ''}<br>
Komu: ${toEscaped}<br>
${ccLine}
</div><br>
`;
  };

  const handleReply = () => {
    const quotedBody = `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid #00f3ff;padding-left:1ex">${emailData?.htmlBody || ''}</blockquote>`;
    
    // Check if the latest message was sent by the user themselves
    // Celá adresa „Jméno <email>“ (from je jen zobrazované jméno), přednost má hlavička Reply-To
    let replyTo = emailData?.replyTo || emailData?.rawFrom || emailData?.from;
    const isFromMe = userEmail && emailData?.rawFrom && emailData.rawFrom.toLowerCase().includes(userEmail.toLowerCase());
    if (isFromMe && emailData?.to) replyTo = emailData.to;

    onActionReply?.({
      type: 'reply',
      initialTo: replyTo,
      initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`,
      messageId: emailData?.messageId,
      threadId: emailData?.threadId,
      rfcMessageId: emailData?.rfcMessageId,
      htmlBody: getHistoryHeader('reply') + quotedBody,
      initialBody: '',
      originalFrom: emailData?.replyTo || emailData?.rawFrom || emailData?.from,
      originalTo: emailData?.to,
      originalCc: emailData?.cc
    });
  };

  const handleReplyAll = () => {
    const quotedBody = `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid #00f3ff;padding-left:1ex">${emailData?.htmlBody || ''}</blockquote>`;
    
    const isFromMe = userEmail && emailData?.rawFrom && emailData.rawFrom.toLowerCase().includes(userEmail.toLowerCase());
    const baseTo = (isFromMe && emailData?.to) ? emailData.to : (emailData?.replyTo || emailData?.rawFrom || emailData?.from);
    const allTo = `${baseTo}${emailData?.cc ? `, ${emailData.cc}` : ''}`;
    
    onActionReply?.({ type: 'replyAll', initialTo: allTo, initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`, messageId: emailData?.messageId, threadId: emailData?.threadId, rfcMessageId: emailData?.rfcMessageId, htmlBody: getHistoryHeader('reply') + quotedBody, initialBody: '' });
  };

  const handleForward = async () => {
    if (!emailData) return;
    setIsPreparingForward(true);
    const fetchedAttachments = await fetchAttachmentsForComposer(emailData);
    setIsPreparingForward(false);

    onActionReply?.({
      type: 'forward',
      initialTo: '',
      initialSubject: emailData?.subject?.match(/^Fwd:/i) ? emailData.subject : `Fwd: ${emailData?.subject}`,
      htmlBody: getHistoryHeader('forward') + `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid #00f3ff;padding-left:1ex">${emailData?.htmlBody || ''}</blockquote>`,
      initialBody: '',
      initialAttachments: fetchedAttachments
    });
  };

  const toggleReadStatus = async () => {
    setIsMoreMenuOpen(false);
    if (!emailData || !provider) return;
    const isUnread = emailData.isUnread;
    setEmailData(prev => prev && ({ ...prev, isUnread: !isUnread }));
    window.dispatchEvent(new CustomEvent('vr-email-read-toggle', { detail: { id: selectedEmailId || emailData.messageId, isUnread: !isUnread } }));
    try {
      await provider.setRead({ id: emailData.messageId, threadId: emailData.threadId }, isUnread, 'thread');
      if (onMobileBack && isUnread) setTimeout(onMobileBack, 150);
    } catch (err) {
      console.error(err);
      setEmailData(prev => prev && ({ ...prev, isUnread }));
    }
  };

  useEffect(() => {
    const handleStarToggle = (e: Event) => {
      const { id, isStarred } = (e as CustomEvent<{ id: string; isStarred: boolean }>).detail;
      if (emailData && (emailData.messageId === id || selectedEmailId === id)) {
        setEmailData(prev => prev ? { ...prev, isStarred } : prev);
      }
    };
    const handleReadToggle = (e: Event) => {
      const { id, isUnread } = (e as CustomEvent<{ id: string; isUnread: boolean }>).detail;
      if (emailData && (emailData.messageId === id || selectedEmailId === id)) {
        setEmailData(prev => prev ? { ...prev, isUnread } : prev);
      }
    };
    window.addEventListener('vr-email-star-toggle', handleStarToggle);
    window.addEventListener('vr-email-read-toggle', handleReadToggle);
    return () => {
      window.removeEventListener('vr-email-star-toggle', handleStarToggle);
      window.removeEventListener('vr-email-read-toggle', handleReadToggle);
    };
  }, [emailData, selectedEmailId, setEmailData]);

  useEffect(() => {
    if (selectedEmailId) {
      document.body.classList.add('email-detail-active');
    } else {
      document.body.classList.remove('email-detail-active');
    }
    return () => document.body.classList.remove('email-detail-active');
  }, [selectedEmailId]);

  useEffect(() => {
    const handleSentReply = (e: Event) => {
      const { threadId } = (e as CustomEvent<{ threadId: string }>).detail;
      // Pokud odpovíme a jsme zrovna na stejném vlákně, vynutíme refetch
      if (emailData && (emailData.threadId === threadId || emailData.messageId === threadId)) {
        // Počkáme půl vteřiny, než se Gmail API spamatuje na síti
        setTimeout(() => { queryClient.invalidateQueries({ queryKey: ['emailDetail'] }); }, 600);
      }
    };
    window.addEventListener('vr-email-sent-reply', handleSentReply);
    return () => window.removeEventListener('vr-email-sent-reply', handleSentReply);
  }, [emailData, queryClient]);

  // Načtení e-mailu přes TanStack Query: mezipaměť (návrat na e-mail je okamžitý),
  // při rychlém proklikávání se starší výsledek nezobrazí, chyba a opakování řeší knihovna
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => provider!.loadDetail(selectedEmailId as string),
    enabled: !!selectedEmailId && !!provider,
    // Detail (HTML s vloženými obrázky) umí být velký – na telefonu ho v paměti nedržet dlouho,
    // jinak Android aplikaci na pozadí kvůli paměti ukončí a po návratu se načítá znovu
    gcTime: IS_MOBILE ? 60_000 : 10 * 60_000,
  });
  const loading = detailQuery.isLoading;

  // Místní kopie kvůli okamžitým změnám (hvězdička, přečteno) – synchronizuje se s mezipamětí
  useEffect(() => {
    setEmailDataState(detailQuery.data ?? null);
  }, [detailQuery.data]);

  // Žádný email není navolen v listu
  if (!selectedEmailId) {
    return (
      <div className="flex-1 relative flex flex-col items-center justify-center p-10 h-full overflow-hidden bg-transparent">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-purple rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
        <div className="absolute top-1/4 left-3/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-neon-blue rounded-full blur-[120px] opacity-10 pointer-events-none"></div>

        <div className="z-10 flex flex-col items-center opacity-20 hover:opacity-40 transition-opacity">
          <img
            src="/cropped-logo-neon-pruhledna-150x50.png"
            alt="ZažijVR Watermark"
            className="h-28 object-contain grayscale brightness-200"
          />
        </div>
      </div>
    );
  }

  // Průběh The Fetchování
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neon-blue/60 h-full relative overflow-hidden bg-navy">
        <div className="w-16 h-16 rounded-full border-[6px] border-neon-blue/10 border-t-neon-blue animate-spin mb-6 drop-shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.4)]"></div>
        <p className="font-bold tracking-widest uppercase animate-pulse">Dešifruji data z matrixu...</p>
      </div>
    );
  }

  if (!emailData) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 h-full bg-navy">
        E-mail se nepodařilo načíst.
      </div>
    );
  }

  /** Hvězdička / důležité – optimisticky, při chybě se vrátí */
  const toggleStarred = async () => {
    if (!provider) return;
    const currentIsStarred = emailData.isStarred;
    setEmailData(prev => prev && ({ ...prev, isStarred: !currentIsStarred }));
    window.dispatchEvent(new CustomEvent('vr-email-star-toggle', { detail: { id: selectedEmailId || emailData.messageId, isStarred: !currentIsStarred } }));
    try {
      await provider.setStarred({ id: emailData.messageId, threadId: emailData.threadId }, !currentIsStarred);
    } catch (err) {
      console.error(err);
      setEmailData(prev => prev && ({ ...prev, isStarred: currentIsStarred }));
    }
  };

  // V okně přes celou obrazovku (má onClose) prolnutí s oknem; v panelu krátké prolnutí (mobil: vysunutí)
  const slideAnimationClass = onClose ? 'anim-ui-fade-in' : 'anim-detail-in';

  // Samotný E-mail čtecí panel
  return (
    <>
      {/* --- MOBILE TOP BAR MORPHING FROM APP HEADER (PORTALLED) --- */}
      {createPortal(
        <div className="md:hidden fixed top-0 left-0 w-full flex items-center justify-between px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,2rem))] bg-navy/95 backdrop-blur-md border-b border-neon-blue/20 z-[60] shrink-0 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
          {onMobileBack && (
            <button
              onClick={onMobileBack}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-navy-deep/90 backdrop-blur-md border-[1.5px] border-neon-blue/60 text-neon-blue drop-shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.8)] shadow-[inset_0_0_15px_rgb(var(--c-neon-blue)/0.3)] transition-all active:scale-95 anim-spin-in-arrow"
            >
              <ArrowLeft size={22} strokeWidth={2.5} />
            </button>
          )}
          <div className="flex items-center gap-3 pr-0 anim-slide-in-right-overlay" style={{ '--delay': '150ms' } as CSSProperties}>
            {emailData && (
              <button
                onClick={toggleReadStatus}
                className={`w-10 h-10 flex items-center justify-center rounded-full bg-navy-deep/90 backdrop-blur-md border-[1.5px] transition-all active:scale-95 text-[20px] ${emailData.isUnread ? 'text-neon-blue border-neon-blue/60 drop-shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.8)] shadow-[inset_0_0_15px_rgb(var(--c-neon-blue)/0.3)]' : 'text-white/80 border-white/50 drop-shadow-[0_0_10px_rgba(255,255,255,0.6)] shadow-[inset_0_0_12px_rgba(255,255,255,0.2)] hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] hover:border-white hover:text-white'}`}
                title={emailData.isUnread ? "Označit jako přečtené" : "Označit jako nepřečtené"}
              >
                {emailData.isUnread ? <Mail size={20} /> : <MailOpen size={20} />}
              </button>
            )}
            {onNotSpam && (
              <button
                onClick={onNotSpam}
                title="Není spam – vrátit do Doručených"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-navy-deep/90 backdrop-blur-md border-[1.5px] border-green-500/70 text-green-400 transition-all active:scale-95"
              >
                <Inbox size={20} />
              </button>
            )}
            {onTrash && (
              <button
                onClick={handleTrashClick}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-navy-deep/90 backdrop-blur-md border-[1.5px] border-danger/80 text-danger drop-shadow-[0_0_15px_rgba(239,68,68,1)] shadow-[inset_0_0_20px_rgba(239,68,68,0.4)] transition-all active:scale-95 hover:bg-danger/20"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Hlavní Tělo Detailu */}
      <div
        key={emailData?.messageId || "loading"}
        className={`flex-1 flex flex-col pt-[calc(3.5rem+env(safe-area-inset-top,2rem))] md:pt-0 bg-navy overflow-hidden fixed inset-0 z-50 md:relative md:inset-auto md:z-auto pointer-events-auto shadow-[0_-5px_20px_rgba(0,0,0,0.5)] md:shadow-none ${slideAnimationClass}`}
        onDoubleClick={() => {
          if (emailData?.isDraft) handleResumeDraft(emailData);
        }}
      >

        {/* Detail Hlaviček - Floating Frame na Desktopu s dynamickou výškou pro dlouhé texty */}
        <div className="shrink-0 px-4 py-5 md:py-4 md:px-6 md:m-6 md:mb-0 md:min-h-[100px] border-t-0 md:border md:rounded-2xl border-transparent md:border-neon-blue/20 bg-navy md:bg-navy shadow-[0_15px_40px_rgba(0,0,0,0.6)] md:shadow-[0_5px_20px_rgba(0,0,0,0.5)] z-[70] flex flex-col gap-4 relative w-full md:w-auto overflow-hidden">

          {/* Horní neonová linka ze Seznamu Emailů (Pouze mobil) */}
          <div className="md:hidden absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.5)] pointer-events-none z-20"></div>

          {/* Dekorační levé zakončení (Pouze mobil) */}
          <div className="md:hidden absolute top-0 left-0 w-1 h-full bg-neon-purple/20"></div>

          {/* Velmi jemný radialní odlesk v pozadí (Pouze mobil) */}
          <div className="md:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(var(--c-neon-blue)/0.06)_0%,transparent_60%)] pointer-events-none"></div>

          {/* Laserová linka dole (Z návrhu 1, žádané uživatelem, pouze mobil) */}
          <div className="md:hidden absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue via-neon-blue/50 to-neon-blue/10 drop-shadow-[0_0_10px_rgb(var(--c-neon-blue))] pointer-events-none z-20"></div>

          <div className="relative z-10 w-full pl-2 md:pl-0">
            <div className="min-w-0 w-full">
              {emailData?.isDraft && (
                <div className="mb-4">
                  <button
                    onClick={() => handleResumeDraft(emailData)}
                    className="w-full relative overflow-hidden group rounded-2xl flex items-center justify-center p-1 cursor-pointer bg-neon-purple/10 border border-neon-purple/40 shadow-[0_0_20px_rgb(var(--c-neon-purple)/0.2)] hover:shadow-[0_0_40px_rgb(var(--c-neon-purple)/0.5)] transition-all animate-pulse hover:animate-none"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-purple/20 to-transparent group-hover:translate-x-[200%] transition-transform duration-1000 -translate-x-full"></div>
                    <div className="relative z-10 py-3 mx-4 flex items-center justify-center gap-3">
                      <span className="font-black tracking-[0.3em] text-neon-purple text-xl drop-shadow-[0_0_10px_rgb(var(--c-neon-purple))]">POKRAČOVAT V PSANÍ (UPRAVIT KONCEPT)</span>
                    </div>
                  </button>
                </div>
              )}

              {/* Horní řádek: štítky vlevo, akce vpravo – předmět pod ním má celou šířku */}
              <div className="flex items-center justify-between gap-3 mb-3 md:mb-2.5">
              {/* STATUS BOARD BADGES */}
              <div className="flex flex-wrap items-center gap-2 min-w-0">

                {/* Odesilatel / Star status */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await toggleStarred();
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border cursor-pointer hover:brightness-125 active:scale-95 transition-all ${emailData?.isStarred ? 'bg-neon-purple/10 border-neon-purple/30 text-neon-purple drop-shadow-[0_0_5px_rgb(var(--c-neon-purple)/0.4)]' : 'bg-neon-blue/10 border-neon-blue/30 text-neon-blue'}`}
                  title={emailData?.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
                >
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${emailData?.isStarred ? 'bg-neon-purple shadow-[0_0_8px_rgb(var(--c-neon-purple))]' : 'bg-neon-blue shadow-[0_0_5px_rgb(var(--c-neon-blue))]'}`}></div>
                  <span className="text-[9px] md:text-[10px] uppercase font-mono font-bold tracking-widest text-current">Link_Active</span>
                </button>

                {/* Attachments status */}
                {emailData?.attachments?.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-neon-purple/10 border border-neon-purple/30">
                    <Paperclip size={12} strokeWidth={3} className="text-neon-purple" />
                    <span className="text-[9px] md:text-[10px] uppercase font-mono font-bold tracking-widest text-neon-purple">Datacore_{emailData.attachments.length}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">

                {/* ---------------- DESKTOP ACTIONS ---------------- */}
                <div className="hidden md:flex items-center gap-2">

                  {onActionReply && !emailData?.isDraft && (
                    <>
                      <button
                        onClick={handleReply}
                        className="p-2 rounded-xl text-neon-blue/70 bg-neon-blue/5 border border-neon-blue/20 hover:text-neon-blue hover:bg-neon-blue/15 hover:border-neon-blue/50 transition-all shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.4)]"
                        title="Odpovědět (Reply)"
                      >
                        <Reply size={22} />
                      </button>
                      <button
                        onClick={handleReplyAll}
                        className="p-2 rounded-xl text-neon-blue/70 bg-neon-blue/5 border border-neon-blue/20 hover:text-neon-blue hover:bg-neon-blue/15 hover:border-neon-blue/50 transition-all shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.4)]"
                        title="Odpovědět všem (Reply All)"
                      >
                        <ReplyAll size={22} />
                      </button>
                      <button
                        onClick={handleForward}
                        disabled={isPreparingForward}
                        className="p-2 rounded-xl text-neon-blue/70 bg-neon-blue/5 border border-neon-blue/20 hover:text-neon-purple hover:bg-neon-purple/15 hover:border-neon-purple/50 transition-all shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_15px_rgb(var(--c-neon-purple)/0.4)] disabled:opacity-50"
                        title="Přeposlat (Forward)"
                      >
                        {isPreparingForward ? (
                          <div className="w-[22px] h-[22px] rounded-full border-[2px] border-neon-purple/20 border-t-neon-purple animate-spin m-[0.5px]"></div>
                        ) : (
                          <Forward size={22} />
                        )}
                      </button>
                      <div className="w-px h-6 bg-neon-blue/20 mx-1"></div>
                    </>
                  )}

                  {onNotSpam && (
                    <button
                      onClick={onNotSpam}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-green-400/90 bg-green-500/5 border border-green-500/30 hover:text-green-300 hover:bg-green-500/15 hover:border-green-500/60 transition-all text-sm font-bold whitespace-nowrap shadow-[0_0_5px_rgba(74,222,128,0.1)] hover:shadow-[0_0_15px_rgba(74,222,128,0.35)]"
                      title="Není spam – vrátit do Doručených"
                    >
                      <Inbox size={20} /> Není spam
                    </button>
                  )}

                  {onSpam && (
                    <button
                      onClick={onSpam}
                      className="p-2 rounded-xl text-danger/70 bg-danger/5 border border-danger/20 hover:text-danger hover:bg-danger/15 hover:border-danger/50 transition-all shadow-[0_0_5px_rgba(239,68,68,0.1)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                      title="Označit jako Spam"
                    >
                      <AlertOctagon size={22} />
                    </button>
                  )}

                  {onTrash && (
                    <button
                      onClick={handleTrashClick}
                      className="p-2 rounded-xl text-danger/70 bg-danger/5 border border-danger/20 hover:text-danger hover:bg-danger/15 hover:border-danger/50 transition-all shadow-[0_0_5px_rgba(239,68,68,0.1)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                      title="Smazat (Delete)"
                    >
                      <Trash2 size={22} />
                    </button>
                  )}
                  {onExpand && (
                    <button
                      onClick={onExpand}
                      className="hidden md:block p-2 rounded-xl text-neon-blue/70 bg-neon-blue/5 border border-neon-blue/20 hover:text-neon-blue hover:bg-neon-blue/15 hover:border-neon-blue/50 transition-all shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.4)]"
                      title="Otevřít v plné velikosti"
                    >
                      <Maximize2 size={22} />
                    </button>
                  )}
                  {onClose && (
                    <>
                      <div className="hidden md:block w-px h-6 bg-white/20 mx-1"></div>
                      <button
                        onClick={onClose}
                        className="hidden md:flex p-2 bg-white/5 hover:bg-danger/20 text-slate-400 hover:text-danger rounded-full transition-all border border-transparent hover:border-danger/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center"
                        title="Zavřít"
                      >
                        <X size={22} strokeWidth={2} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              </div>

              {/* Předmět: celá šířka hlavičky pod akcemi, delší menším písmem; na desktopu max. 2 řádky
                  (tělo zprávy začíná na pevné pozici) – celý je v bublině a jde zkopírovat */}
              <div className="flex items-start gap-2 group w-full min-w-0">
                <h1
                  className={`flex-1 min-w-0 font-black md:font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] md:drop-shadow-md tracking-wide leading-snug break-words md:line-clamp-2 ${subjectSizeClass(emailData?.subject)}`}
                  title={emailData?.subject}
                >
                  {emailData?.subject}
                </h1>
                {emailData?.subject && (
                  <button
                    onClick={() => handleCopyToClipboard(emailData.subject, 'subject')}
                    className="opacity-20 hover:opacity-100 hover:bg-white/10 transition-all p-1 md:p-1.5 mt-0.5 rounded-lg text-white shrink-0"
                    title="Kopírovat předmět"
                  >
                    {copiedId === 'subject' ? <Check size={14} className="md:w-5 md:h-5 text-green-400" /> : <Copy size={14} className="md:w-5 md:h-5" />}
                  </button>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Dělící čára napevno ustavená na Y=192px (přesně navazující na horizont levé tabulky nezávisle na výšce hlavičky výše) */}
        <div className="hidden md:block absolute left-0 w-full h-[1px] top-[192px] bg-gradient-to-r from-neon-blue/20 to-transparent opacity-80 shadow-[0_1px_5px_rgb(var(--c-neon-blue)/0.2)] pointer-events-none z-10"></div>

        {/* Samotné Iframe Tělo zprávy s neonovým okrajem */}
        <div className="flex-1 md:flex-none flex flex-col min-w-0 p-0 m-0 md:absolute md:top-[213px] md:bottom-8 md:inset-x-6 rounded-none md:rounded-2xl border-t md:border border-neon-blue/20 md:border-neon-blue/40 shadow-[0_5px_20px_rgba(0,0,0,0.5)] md:shadow-[0_0_20px_rgb(var(--c-neon-blue)/0.2)] overflow-y-auto overflow-x-hidden custom-scrollbar bg-navy relative z-20">
          {/* Sender Info Block */}
          <div className="shrink-0 w-full px-4 py-3 md:px-6 md:py-4 border-b border-neon-blue/10 bg-navy z-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between text-sm gap-3 w-full">
              <div className="flex items-center justify-between w-full md:w-auto min-w-0">
                <div className="flex items-start gap-3 w-full md:w-auto min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-neon-blue/20 text-neon-blue font-bold text-lg flex items-center justify-center border border-neon-blue/50 shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.2)]">
                    {emailData?.from?.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || emailData?.from?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex flex-col overflow-hidden pr-0 w-full">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-neon-blue text-lg md:text-xl tracking-wide leading-tight truncate max-w-[150px] md:max-w-xl">{emailData?.from}</span>
                      {emailData?.rawFrom && (
                        <button onClick={() => handleCopyToClipboard(emailData.rawFrom, 'from')} className="opacity-60 hover:opacity-100 hover:bg-neon-blue/20 transition-all p-1 rounded-lg text-neon-blue" title="Kopírovat plnou adresu odesílatele">
                          {copiedId === 'from' ? <Check size={14} className="md:w-4 md:h-4 text-green-400" /> : <Copy size={14} className="md:w-4 md:h-4" />}
                        </button>
                      )}
                      <span className="text-slate-400 font-semibold md:hidden ml-1">{emailData?.date}</span>
                    </div>
                    <div className="flex flex-col text-slate-400 text-xs tracking-wider mt-0.5 max-w-full gap-1">
                      {emailData?.to && (
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xl" title={emailData.to}>Komu: <span className="opacity-70">{emailData.to}</span></span>
                          <button onClick={() => handleCopyToClipboard(emailData.to, 'to')} className="opacity-50 hover:opacity-100 hover:bg-white/10 transition-all p-1 rounded-md text-white/80" title="Kopírovat adresu">
                            {copiedId === 'to' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                      {emailData?.cc && (
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xl" title={emailData.cc}>Kopie: <span className="opacity-70">{emailData.cc}</span></span>
                          <button onClick={() => handleCopyToClipboard(emailData.cc, 'cc')} className="opacity-50 hover:opacity-100 hover:bg-white/10 transition-all p-1 rounded-md text-white/80" title="Kopírovat adresu">
                            {copiedId === 'cc' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="md:hidden flex items-center gap-1 shrink-0">
                  {onActionReply && !emailData?.isDraft && (
                    <button onClick={handleReply} className="p-2 rounded-xl text-neon-blue/70 hover:text-neon-blue hover:bg-neon-blue/10 hover:shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.2)] transition-all">
                      <Reply size={22} />
                    </button>
                  )}
                  <div className="relative" ref={moreMenuRef}>
                    <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className={`p-2 rounded-xl transition-all ${isMoreMenuOpen ? 'text-neon-blue bg-neon-blue/20 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.3)]' : 'text-neon-blue/70 hover:bg-neon-blue/10 hover:shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.2)]'}`}>
                      <MoreVertical size={22} />
                    </button>
                    {isMoreMenuOpen && createPortal(
                      <div className="fixed inset-0 z-[999999] flex justify-center items-end" style={{ isolation: 'isolate' }}>
                        <style>{`
                          @keyframes mobileSheetSlideUp {
                            from { transform: translateY(100%); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                          }
                          @keyframes mobileSheetFadeIn {
                            from { opacity: 0; backdrop-filter: blur(0px); }
                            to { opacity: 1; backdrop-filter: blur(8px); }
                          }
                        `}</style>

                        {/* Celostránkový neviditelný štít pro odchytnutí kliku (nyní řešen globálním click trapem v capture fázi viz useEffect) */}
                        <div
                          className="absolute inset-0 bg-navy-card"
                          style={{ animation: 'mobileSheetFadeIn 0.3s ease-out forwards' }}
                        ></div>

                        {/* Moderní Mobile Bottom Sheet místo plovoucího okna */}
                        <div
                          ref={bottomSheetRef}
                          className="relative w-full max-w-lg bg-navy border-t border-neon-blue/40 rounded-t-[30px] shadow-[0_-15px_50px_rgba(0,0,0,0.9),0_0_30px_rgb(var(--c-neon-blue)/0.15)] flex flex-col p-6 pb-12 gap-1 z-10"
                          style={{ animation: 'mobileSheetSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
                        >
                          {/* Designové držátko/čárka typická pro Bottom sheets */}
                          <div className="w-12 h-1.5 bg-neon-blue/30 rounded-full mx-auto mb-6 shrink-0"></div>

                          {onActionReply && !emailData?.isDraft && (
                            <button onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(false); handleReplyAll(); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-neon-blue/10 text-neon-blue/80 hover:text-neon-blue transition-all w-full text-left font-bold tracking-wide active:bg-neon-blue/20">
                              <div className="w-10 h-10 rounded-full bg-neon-blue/10 flex items-center justify-center shrink-0"><ReplyAll size={20} /></div> Odpovědět všem
                            </button>
                          )}
                          {onActionReply && !emailData?.isDraft && (
                            <button onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(false); handleForward(); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-neon-blue/10 text-neon-blue/80 hover:text-neon-blue transition-all w-full text-left font-bold tracking-wide active:bg-neon-blue/20">
                              <div className="w-10 h-10 rounded-full bg-neon-blue/10 flex items-center justify-center shrink-0"><Forward size={20} /></div> Přeposlat
                            </button>
                          )}

                          <div className="w-full h-px bg-gradient-to-r from-transparent via-neon-blue/20 to-transparent my-2 opacity-50 shrink-0"></div>

                          <button onClick={async (e) => {
                            e.stopPropagation();
                            setIsMoreMenuOpen(false);
                            await toggleStarred();
                          }} className={`flex items-center gap-4 p-4 rounded-2xl transition-all w-full text-left font-bold tracking-wide active:scale-[0.98] ${emailData.isStarred ? 'hover:bg-neon-purple/10 text-neon-purple/90 active:bg-neon-purple/20' : 'hover:bg-neon-purple/10 text-neon-purple/50 active:bg-neon-purple/20'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${emailData.isStarred ? 'bg-transparent border-2 border-neon-purple/30' : 'bg-neon-purple/10'}`}>
                              <div className={`w-4 h-4 rounded-full transition-all ${emailData.isStarred ? 'border-2 border-neon-purple/50' : 'bg-neon-purple shadow-[0_0_8px_rgb(var(--c-neon-purple))]'}`}></div>
                            </div>
                            {emailData.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
                          </button>

                          <button onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(false); toggleReadStatus(); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/10 text-white/80 hover:text-white transition-all w-full text-left font-bold tracking-wide active:bg-white/20">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">{emailData.isUnread ? <Mail size={20} /> : <MailOpen size={20} />}</div> {emailData.isUnread ? "Značit jako přečtené" : "Značit jako nepřečtené"}
                          </button>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              </div>
              <span className="hidden md:block shrink-0 text-slate-400 font-semibold bg-white/5 py-1 px-3 rounded-lg border border-neon-blue/[0.15] md:self-auto">{emailData?.date}</span>
            </div>

            {/* Přílohy PŘESUNUTÉ DO HLAVIČKY (Zůstanou zakotvené při scrollování a sdílí px s odesílatelem) */}
            {emailData?.attachments?.length > 0 && (
              <div className="flex flex-row md:flex-wrap gap-3 mt-4 pt-4 border-t border-neon-blue/10 pb-1 w-full overflow-x-auto md:overflow-visible overflow-y-hidden md:overflow-y-auto max-h-[90px] md:max-h-[180px] custom-scrollbar snap-x snap-mandatory">
                {emailData.attachments.map(att => {
                  const mType = (att.mimeType || '').toLowerCase();
                  const fName = att.filename.toLowerCase();
                  const isPreviewable = mType === 'application/pdf' || mType.startsWith('image/') || mType.startsWith('text/') || fName.endsWith('.pdf') || fName.endsWith('.jpg') || fName.endsWith('.png') || fName.endsWith('.jpeg') || fName.endsWith('.txt');
                  const isIcs = fName.endsWith('.ics') || mType === 'text/calendar';

                  return (
                    <div key={att.attachmentId} className="flex w-[85%] md:w-auto shrink-0 items-center justify-between p-1 pl-1.5 rounded-xl border border-neon-blue/30 bg-navy-card shadow-[0_4px_10px_rgba(0,0,0,0.3)] group hover:border-neon-blue/70 transition-all relative snap-start">

                      <button
                        onClick={() => handleActionAttachment(att, isPreviewable ? 'open' : 'download')}
                        disabled={downloadingAttachId === att.attachmentId}
                        className="flex-1 min-w-0 flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-lg hover:bg-neon-blue/10 transition-colors disabled:opacity-50 text-left"
                        title={isPreviewable ? "Otevřít zobrazení" : "Stáhnout soubor na disk"}
                      >
                        {downloadingAttachId === att.attachmentId ? (
                          <div className="w-4 h-4 rounded-full border-[2px] border-neon-blue/20 border-t-neon-blue animate-spin shrink-0"></div>
                        ) : isPreviewable ? (
                          <Eye size={16} className="text-neon-blue shrink-0" />
                        ) : (
                          <Paperclip size={16} className="text-neon-blue shrink-0" />
                        )}
                        <div className="flex flex-col text-left pl-1 flex-1 min-w-0">
                          <span className="truncate text-neon-blue text-sm font-semibold tracking-wide drop-shadow-[0_0_5px_rgb(var(--c-neon-blue)/0.1)]">{att.filename}</span>
                          {isIcs && icsDetails[att.attachmentId] && (
                            <span className="text-[10px] text-neon-purple font-bold tracking-[0.15em] uppercase animate-pulse">📅 {icsDetails[att.attachmentId]}</span>
                          )}
                          {!isIcs && <span className="text-[10px] text-neon-blue/50 font-bold uppercase tracking-wider">{Math.round(att.size / 1024)} KB</span>}
                        </div>

                      </button>

                      <div className="flex items-center px-1 border-l border-neon-blue/20">
                        {isIcs && (
                          <button
                            onClick={() => handleAddToCalendar(att)}
                            disabled={downloadingAttachId === att.attachmentId}
                            className="p-2 mx-1 text-green-400/80 hover:text-green-300 hover:bg-green-400/10 rounded-lg transition-all disabled:opacity-50"
                            title="Přidat událost přímo do primárního Google Kalendáře"
                          >
                            <CalendarPlus size={16} />
                          </button>
                        )}

                        <button
                          onClick={() => handleActionAttachment(att, 'download')}
                          disabled={downloadingAttachId === att.attachmentId}
                          className="p-2 mx-1 text-neon-blue/60 hover:text-neon-purple hover:bg-neon-purple/20 rounded-lg transition-all disabled:opacity-50"
                          title="Vynutit klasické stažení do počítače"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar relative">

          <div className="shrink-0 relative w-full bg-transparent flex flex-col pt-4 pb-12">
            {emailData?.htmlBody ? (
              <iframe
                title="Email Content"
                className="w-full shrink-0 border-none rounded-none md:rounded-2xl bg-transparent"
                style={{ height: iframeHeight }}
                scrolling="no"
                ref={emailFrameRef}
                // Bez allow-same-origin: skript e-mailu (kdyby prošel čištěním) se k aplikaci nedostane
                sandbox="allow-scripts"
                srcDoc={`
                <base target="_blank">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
                <style>
                  /* Umožníme pinch-zoom a zajistíme touch gesta skrz Iframe */
                  html, body {
                    touch-action: pan-x pan-y pinch-zoom !important;
                    max-width: 100%;
                    overflow-x: auto;
                  }
                  
                  /* Naprosté zprůhlednění všech pozadí, ať sklem prosvítá ZažijVR modř */
                  body, html, table, tr, td, div, span, font, center, tbody, thead { 
                    background-color: transparent !important; 
                    background: transparent !important;
                  }
                  
                  /* Přebijeme generátory faktur: všechno co není aktivní odkaz obarvíme na bílo! */
                  *:not(a):not(a *) {
                    color: ${frameColors.text} !important;
                  }
                  
                  /* Odstřelovač neviditelných prvků co rozbíjí layout (Sledovací pixely, dlouhé URL) */
                  img, video { max-width: 100% !important; height: auto !important; }
                  * { overflow-wrap: break-word !important; }
                  pre, code { white-space: pre-wrap !important; }

                  body, html {
                    box-sizing: border-box !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }

                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                    line-height: 1.6;
                    padding: 1rem !important; /* Mírnější padding úhledný pro desktop */
                  }

                  @media (max-width: 600px) {
                    body {
                      padding: 0 12px 12px 12px !important; /* Dýchání ze stran zachováno pro rozumnou čitelnost! */
                    }
                  }
                  
                  @media (min-width: 768px) {
                    body {
                      font-size: 16px !important;
                    }
                  }
                  
                  /* Linky držíme svítivě modré */
                  a, a * { color: ${frameColors.link} !important; text-decoration: none !important; }
                  a:hover, a:hover * { text-decoration: underline !important; color: ${frameColors.linkHover} !important; }
                  
                  /* Stylování iFrame posuvníku do neonu */
                  ::-webkit-scrollbar { width: 8px; height: 8px; }
                  ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
                  ::-webkit-scrollbar-thumb { background: ${frameColors.accent}33; border-radius: 4px; }
                  ::-webkit-scrollbar-thumb:hover { background: ${frameColors.accent}80; }
                </style>
                ${emailData.htmlBody}
                <script src="/email-frame.js"></script>
             `}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 font-medium">
                Zpráva neobsahuje žádný textový, ani HTML obsah ke čtení.
              </div>
            )}
          </div>
          </div>
        </div>
        {/* Velká akční tlačítka pod mailem jen pro mobily byla dočasně skryta na žádost */}
      </div>

      {/* Zobrazovač příloh In-App (pomocí Portal vytrženo z CSS kontextu) */}
      {previewBlob && createPortal(
        <div
          id="attachment-preview-modal"
          ref={modalRef}
          tabIndex={0}
          className="fixed inset-0 z-[999999] bg-navy-deep/95 flex flex-col p-4 sm:p-10 backdrop-blur-md outline-none"
          onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(previewBlob.url); setPreviewBlob(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); URL.revokeObjectURL(previewBlob.url); setPreviewBlob(null); } }}
        >
          <div className="flex justify-between items-center mb-4 text-neon-blue" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 bg-navy-card px-6 py-3 rounded-xl border border-neon-blue/20">
              <Eye size={24} />
              <h2 className="text-xl font-bold tracking-wide truncate max-w-md">{previewBlob.filename}</h2>
            </div>
            <div className="flex items-center gap-2">
            {canOpenExternally() && (
              <button
                onClick={() => {
                  openExternally(previewBlob)
                    .then(() => { URL.revokeObjectURL(previewBlob.url); setPreviewBlob(null); })
                    .catch((err) => showAlert(String(err), 'Otevření souboru', 'error'));
                }}
                className="flex items-center gap-2 px-4 py-2 bg-navy-card hover:bg-neon-blue/15 text-neon-blue rounded-xl border border-neon-blue/30 hover:border-neon-blue/60 font-bold text-sm transition-colors"
                title="Otevřít ve výchozí aplikaci systému (rychlejší, s tiskem a vyhledáváním)"
              >
                <FileText size={18} /> Otevřít v aplikaci
              </button>
            )}
            <button
              onClick={() => {
                URL.revokeObjectURL(previewBlob.url);
                setPreviewBlob(null);
              }}
              className="pointer-events-auto p-2 bg-navy-card hover:bg-danger/20 text-slate-300 hover:text-danger rounded-full transition-all border border-neon-blue/[0.15] hover:border-danger/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center backdrop-blur-md"
              title="Zavřít zobrazení"
            >
              <X size={24} strokeWidth={2.5} />
            </button>
            </div>
          </div>
          <div className="flex-1 rounded-2xl overflow-hidden bg-black border border-neon-blue/20 flex items-center justify-center preview-checkered" onClick={(e) => e.stopPropagation()}>
            {previewBlob.type.startsWith('image/') ? (
              <img src={previewBlob.url} className="max-w-full max-h-full object-contain p-2 drop-shadow-2xl" alt="Preview" />
            ) : previewBlob.type === 'application/pdf' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full w-full bg-navy/95">
                 <FileText size={64} className="text-neon-blue mb-6 drop-shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.5)]" />
                 <h3 className="text-2xl font-black tracking-widest text-white mb-4 uppercase drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">Náhled na mobilu</h3>
                 <p className="text-neon-blue/70 max-w-md mb-8 text-sm leading-relaxed">Mobilní systémy (iOS/Android) z bezpečnostních a technických důvodů blokují přímé zobrazení PDF souborů uvnitř okna webových aplikací.</p>
                 <a href={previewBlob.url} target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-neon-blue/10 border-2 border-neon-blue/50 hover:bg-neon-blue/30 text-neon-blue hover:text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgb(var(--c-neon-blue)/0.2)] hover:shadow-[0_0_40px_rgb(var(--c-neon-blue)/0.6)] tracking-wide">OTEVŘÍT PDF SOUBOR</a>
              </div>
            ) : (
              <iframe src={previewBlob.url} className="w-full h-full bg-white" title="Preview" />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
