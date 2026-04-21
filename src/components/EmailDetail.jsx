import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Maximize2, Trash2, Paperclip, Eye, Download, Reply, ReplyAll, Forward, AlertOctagon, X, Star, CalendarPlus, Copy, Check, MoreVertical, ArrowLeft, Mail, MailOpen, FileText } from 'lucide-react';
import ICAL from 'ical.js';
import DOMPurify from 'dompurify';
import { db } from '../db/db';

import { getHeader, getMessageBody, decodeMojibake, extractAttachments, extractInlineImages, decodeBase64Url } from '../utils/emailParser';

import { useAlert } from './AlertProvider';

export default function EmailDetail({ googleToken, isVerticalLayout, selectedEmailId, onExpand, onTrash, onSpam, onActionReply, onClose, onMobileBack, autoResumeDraftId, onDraftResumed, userEmail }) {
  const [emailData, setEmailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingAttachId, setDownloadingAttachId] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isPreparingForward, setIsPreparingForward] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [icsDetails, setIcsDetails] = useState({});
  const { showAlert, showConfirm } = useAlert();
  const handleTrashClick = (e) => {
    if (e) e.stopPropagation();
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

  const [copiedId, setCopiedId] = useState(null);

  const handleCopyToClipboard = (text, id) => {
    const match = text.match(/<([^>]+)>/);
    const textToCopy = match ? match[1] : text;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const modalRef = useRef(null);
  const moreMenuRef = useRef(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    if (previewBlob) {
      setTimeout(() => { if (modalRef.current) modalRef.current.focus() }, 50);
    }
  }, [previewBlob]);

  const bottomSheetRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if the click was outside the dropdown/bottom-sheet container
      // If we clicked the MoreMenu toggle button, let its own onClick handle it
      if (moreMenuRef.current && moreMenuRef.current.contains(event.target)) {
        return;
      }

      let isOutside = false;
      if (bottomSheetRef.current) {
        // We are using Portaled Bottom Sheet
        isOutside = !bottomSheetRef.current.contains(event.target);
      } else if (moreMenuRef.current) {
        // Fallback for non-portaled
        isOutside = !moreMenuRef.current.contains(event.target);
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
    const handleMessage = async (e) => {
      if (e.data && e.data.type === 'open-link' && e.data.url) {
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
            } catch (err) {
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
            await open(e.data.url);
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && previewBlob) {
        URL.revokeObjectURL(previewBlob.url);
        setPreviewBlob(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewBlob]);

  useEffect(() => {
    if (!emailData?.attachments || !emailData?.messageId || !googleToken) return;

    const fetchIcsData = async () => {
      const newDetails = {};

      for (const att of emailData.attachments) {
        const mType = att.mimeType?.toLowerCase() || '';
        const fName = att.filename?.toLowerCase() || '';
        if (fName.endsWith('.ics') || mType === 'text/calendar') {
          if (!icsDetails[att.attachmentId]) {
            try {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/attachments/${att.attachmentId}`, {
                headers: { Authorization: `Bearer ${googleToken}` }
              });
              const data = await res.json();
              if (data.data) {
                const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
                const binaryString = window.atob(base64);
                let utf8String = binaryString;
                try { utf8String = decodeURIComponent(escape(binaryString)); } catch (e) { }
                const jcalData = ICAL.parse(utf8String);
                const comp = new ICAL.Component(jcalData);
                const eventComp = comp.getFirstSubcomponent('vevent');
                if (eventComp) {
                  const ev = new ICAL.Event(eventComp);
                  let dateStr = '';
                  if (ev.startDate) {
                    const formatTime = (icalTime) => icalTime.toJSDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                    const formatDate = (icalTime) => icalTime.toJSDate().toLocaleDateString('cs-CZ');

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
  }, [emailData, googleToken]);

  const handleActionAttachment = async (attach, action) => {
    if (downloadingAttachId) return;
    setDownloadingAttachId(attach.attachmentId);

    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/attachments/${attach.attachmentId}`, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const data = await res.json();

      if (data.data) {
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let safeMimeType = attach.mimeType.toLowerCase();
        const lowerName = attach.filename.toLowerCase();

        // Vynutit správný mimeType u špatně kódovaných emailů (jako Alza faktury - octet-stream)
        if (lowerName.endsWith('.pdf')) safeMimeType = 'application/pdf';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) safeMimeType = 'image/jpeg';
        else if (lowerName.endsWith('.png')) safeMimeType = 'image/png';
        else if (lowerName.endsWith('.txt')) safeMimeType = 'text/plain';

        const blob = new Blob([bytes], { type: safeMimeType });
        const url = URL.createObjectURL(blob);

        if (action === 'open') {
          setPreviewBlob({ url, type: safeMimeType, filename: attach.filename });
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
      showAlert(`Hardcore Error: ${err.message || JSON.stringify(err) || err.toString()}`, 'Chyba', 'error');
    }

    setDownloadingAttachId(null);
    setDownloadingAttachId(null);
  };

  const handleAddToCalendar = async (attach) => {
    if (downloadingAttachId) return;
    setDownloadingAttachId(attach.attachmentId);

    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/attachments/${attach.attachmentId}`, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const data = await res.json();

      if (data.data) {
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = window.atob(base64);
        let utf8String = binaryString;
        try {
          utf8String = decodeURIComponent(escape(binaryString));
        } catch (e) { }

        let jcalData;
        try {
          jcalData = ICAL.parse(utf8String);
        } catch (e) {
          showAlert('Nepodařilo se rozšifrovat událost z této pozvánky.', 'Chyba parsování', 'error');
          setDownloadingAttachId(null);
          return;
        }

        const comp = new ICAL.Component(jcalData);
        // Find first vevent
        const eventComp = comp.getFirstSubcomponent('vevent');
        if (!eventComp) {
          showAlert('Soubor neobsahuje žádnou použitelnou událost.', 'Prázdný soubor', 'warning');
          setDownloadingAttachId(null);
          return;
        }

        const ev = new ICAL.Event(eventComp);

        const buildGoogleTime = (icalTime) => {
          if (!icalTime) return null;
          if (icalTime.isDate) {
            return { date: icalTime.toISODate() || icalTime.toString().split('T')[0] };
          }
          return { dateTime: icalTime.toJSDate().toISOString() };
        };

        const googleEvent = {
          summary: ev.summary || 'Nová událost z e-mailu',
          description: (ev.description ? ev.description + '\n\n' : '') + `[Přidáno z e-mailu: ${emailData.subject}]\n\nText zprávy:\n${emailData.rawTextBody ? emailData.rawTextBody.substring(0, 800) + (emailData.rawTextBody.length > 800 ? '...' : '') : ''}`,
          location: ev.location || '',
          start: buildGoogleTime(ev.startDate),
          end: buildGoogleTime(ev.endDate) || buildGoogleTime(ev.startDate)
        };

        const postRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(googleEvent)
        });

        if (postRes.ok) {
          showAlert('Událost z e-mailu byla přidána do Kalendáře!', 'Událost Přidána', 'success');
        } else {
          const errText = await postRes.text();
          showAlert('Došlo k chybě při zápisu do kalendáře:\n' + errText, 'Chyba synchronizace', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      showAlert('Vyskytla se chyba při zpracování: ' + err.message, 'Chyba zpracování', 'error');
    }
    setDownloadingAttachId(null);
  };

  const handleResumeDraft = async (data) => {
    try {
      const draftsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const draftsInfo = await draftsRes.json();
      const draftObj = draftsInfo.drafts?.find(d => d.message.id === data.messageId);

      const fetchedAttachments = [];
      if (data.attachments && data.attachments.length > 0) {
        for (const att of data.attachments) {
          const sourceMsgId = att.messageId || data.messageId;
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${sourceMsgId}/attachments/${att.attachmentId}`, {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          const attData = await res.json();
          if (attData.data) {
            const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
            fetchedAttachments.push({
              name: att.filename,
              type: att.mimeType,
              content: `data:${att.mimeType};base64,${base64}`
            });
          }
        }
      }

      const config = {
        type: 'draft',
        draftId: draftObj ? draftObj.id : null,
        draftMessageId: data.messageId,
        initialTo: data.to || '',
        initialCc: data.cc || '',
        initialSubject: data.subject || '',
        initialBody: data.htmlBody || data.textBody || '',
        initialAttachments: fetchedAttachments,
        htmlBody: ''
      };

      onActionReply && onActionReply(config);

    } catch (e) {
      console.error(e);
      showAlert('Nepodařilo se spárovat koncept sítě GMail.', 'Chyba sítě', 'error');
    }
  };

  useEffect(() => {
    if (emailData && emailData.isDraft && emailData.messageId === autoResumeDraftId) {
      handleResumeDraft(emailData);
      if (onDraftResumed) onDraftResumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailData, autoResumeDraftId]);

  const getHistoryHeader = (typeStr) => {
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
    let replyTo = emailData?.from;
    const isFromMe = userEmail && emailData?.rawFrom && emailData.rawFrom.toLowerCase().includes(userEmail.toLowerCase());
    if (isFromMe && emailData?.to) replyTo = emailData.to;

    onActionReply({
      type: 'reply',
      initialTo: replyTo,
      initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`,
      messageId: emailData?.messageId,
      threadId: emailData?.threadId,
      rfcMessageId: emailData?.rfcMessageId,
      htmlBody: getHistoryHeader('reply') + quotedBody,
      initialBody: '',
      originalFrom: emailData?.from,
      originalTo: emailData?.to,
      originalCc: emailData?.cc
    });
  };

  const handleReplyAll = () => {
    const quotedBody = `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid #00f3ff;padding-left:1ex">${emailData?.htmlBody || ''}</blockquote>`;
    
    const isFromMe = userEmail && emailData?.rawFrom && emailData.rawFrom.toLowerCase().includes(userEmail.toLowerCase());
    const baseTo = (isFromMe && emailData?.to) ? emailData.to : emailData?.from;
    const allTo = `${baseTo}${emailData?.cc ? `, ${emailData.cc}` : ''}`;
    
    onActionReply({ type: 'replyAll', initialTo: allTo, initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`, messageId: emailData?.messageId, threadId: emailData?.threadId, rfcMessageId: emailData?.rfcMessageId, htmlBody: getHistoryHeader('reply') + quotedBody, initialBody: '' });
  };

  const handleForward = async () => {
    setIsPreparingForward(true);
    const fetchedAttachments = [];
    if (emailData?.attachments && emailData.attachments.length > 0) {
      for (const att of emailData.attachments) {
        try {
          const sourceMsgId = att.messageId || emailData.messageId;
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${sourceMsgId}/attachments/${att.attachmentId}`, {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          const attData = await res.json();
          if (attData.data) {
            const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
            fetchedAttachments.push({
              name: att.filename,
              type: att.mimeType || 'application/octet-stream',
              content: `data:${att.mimeType || 'application/octet-stream'};base64,${base64}`
            });
          }
        } catch (e) {
          console.error("Failed to fetch forwarding attachment", e);
        }
      }
    }
    setIsPreparingForward(false);

    onActionReply({
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
    if (!emailData) return;
    const isUnread = emailData.isUnread;
    setEmailData(prev => ({ ...prev, isUnread: !isUnread }));
    window.dispatchEvent(new CustomEvent('vr-email-read-toggle', { detail: { id: emailData?.id || selectedEmailId, isUnread: !isUnread } }));
    try {
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${emailData.threadId || emailData.messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(isUnread ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] })
      });
      if (onMobileBack && isUnread) setTimeout(onMobileBack, 150);
    } catch (err) {
      console.error(err);
      setEmailData(prev => ({ ...prev, isUnread: isUnread }));
    }
  };

  useEffect(() => {
    const handleStarToggle = (e) => {
      if (emailData && (emailData.id === e.detail.id || selectedEmailId === e.detail.id)) {
        setEmailData(prev => prev ? { ...prev, isStarred: e.detail.isStarred } : prev);
      }
    };
    const handleReadToggle = (e) => {
      if (emailData && (emailData.id === e.detail.id || selectedEmailId === e.detail.id)) {
        setEmailData(prev => prev ? { ...prev, isUnread: e.detail.isUnread } : prev);
      }
    };
    window.addEventListener('vr-email-star-toggle', handleStarToggle);
    window.addEventListener('vr-email-read-toggle', handleReadToggle);
    return () => {
      window.removeEventListener('vr-email-star-toggle', handleStarToggle);
      window.removeEventListener('vr-email-read-toggle', handleReadToggle);
    };
  }, [emailData, selectedEmailId]);

  useEffect(() => {
    if (selectedEmailId) {
      document.body.classList.add('email-detail-active');
    } else {
      document.body.classList.remove('email-detail-active');
    }
    return () => document.body.classList.remove('email-detail-active');
  }, [selectedEmailId]);

  useEffect(() => {
    const handleSentReply = (e) => {
      // Pokud odpovíme a jsme zrovna na stejném vlákně, vynutíme refetch
      if (emailData && (emailData.threadId === e.detail.threadId || emailData.messageId === e.detail.threadId)) {
        // Počkáme půl vteřiny, než se Gmail API spamatuje na síti
        setTimeout(() => setRefreshTrigger(prev => prev + 1), 600);
      }
    };
    window.addEventListener('vr-email-sent-reply', handleSentReply);
    return () => window.removeEventListener('vr-email-sent-reply', handleSentReply);
  }, [emailData]);

  useEffect(() => {
    if (!selectedEmailId || !googleToken) {
      setEmailData(null);
      return;
    }

    const fetchEmail = async () => {
      setLoading(true);
      try {
        let data = null;

        if (!navigator.onLine) {
          // OFFLINE FALLBACK
          const cached = await db.emails.where('id').equals(selectedEmailId).first();
          if (cached) {
             // Mockup struktury aby app nespadla a vyrenderovala tělo
             data = {
               payload: { headers: [], parts: [] },
               threadId: cached.threadId,
               id: cached.id
             };
             // Přílohy a tělo jsou už vytaženy, takže to vyřešíme bypassnutím thread parsing fáze
             // a rovnou nastavíme emailData do state... no wait, the logic expects `data` to be a raw API payload!
             // OK, zjednodušený offline parser zrovna nastaví stav:
             setEmailData({
                messageId: cached.id,
                threadId: cached.threadId,
                html: cached.html,
                text: cached.text,
                attachments: cached.attachments || []
             });
             setExpandedThreads([cached.id]);
             setThreadMessages([{
               id: cached.id,
               date: new Date(cached.rawDate),
               dateText: new Date(cached.rawDate).toLocaleDateString('cs-CZ'),
               timeText: new Date(cached.rawDate).toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit'}),
               from: cached.from,
               to: cached.to,
               cc: cached.cc,
               snippet: cached.snippet,
               html: cached.html,
               text: cached.text,
               attachments: cached.attachments || []
             }]);
             setLoading(false);
             return;
          }
        }

        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${selectedEmailId}?format=full`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        data = await res.json();

        // ------------------ ZPRACOVÁNÍ THREADŮ ------------------
        // Pokud najdeme theardid, dotáhneme si celé vlákno pro zobrazení mých odeslaných odpovědí!
        let allAttachments = [];
        let allInlineTokens = [];

        if (data.threadId) {
          try {
            const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${data.threadId}?format=full`, {
              headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (threadRes.ok) {
              const threadData = await threadRes.json();
              if (threadData.messages && threadData.messages.length > 0) {
                // Přepíšeme vybranou zprávu na úplně tu nejdřívější v řetězci
                data = threadData.messages[threadData.messages.length - 1];

                // A posbíráme všechny existující přílohy/obrázky skrze starší zprávy (historie)
                for (const msg of threadData.messages) {
                  const msgAtts = extractAttachments(msg.payload);
                  msgAtts.forEach(a => Object.assign(a, { messageId: msg.id }));
                  allAttachments = allAttachments.concat(msgAtts);
                  
                  const msgInlines = extractInlineImages(msg.payload);
                  msgInlines.forEach(a => Object.assign(a, { messageId: msg.id }));
                  allInlineTokens = allInlineTokens.concat(msgInlines);
                }
              }
            }
          } catch (te) {
            console.error("Vlákno se nepodařilo nalistovat, padám na base zprávu", te);
          }
        }
        
        // Pokud jsmee neměli thready, zkusíme najít normálně přílohy
        if (allAttachments.length === 0) allAttachments = extractAttachments(data.payload);
        if (allInlineTokens.length === 0) allInlineTokens = extractInlineImages(data.payload);
        
        const headers = data.payload?.headers || [];
        const subject = getHeader(headers, 'Subject') || '(Bez předmětu)';
        const from = getHeader(headers, 'From');
        const to = getHeader(headers, 'To');
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

        let bodyExtract = getMessageBody(data.payload);

        // Zpracování extrémně velkých emailových těl z attachmentId
        if (bodyExtract.attachmentId) {
          try {
            const attachRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${selectedEmailId}/attachments/${bodyExtract.attachmentId}`, {
              headers: { Authorization: `Bearer ${googleToken}` }
            });
            const attachData = await attachRes.json();
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

        const isStarred = data.labelIds?.includes('STARRED') || false;
        const cc = getHeader(headers, 'Cc') || '';
        const attachments = allAttachments;
        const inlineImagesTokens = allInlineTokens;

        let processedHtmlBody = htmlBody;

        for (const inline of inlineImagesTokens) {
          if (inline.attachmentId) {
            try {
              const sourceMsgId = inline.messageId || data.id;
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${sourceMsgId}/attachments/${inline.attachmentId}`, {
                headers: { Authorization: `Bearer ${googleToken}` }
              });
              const attData = await res.json();
              if (attData.data) {
                const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
                const dataUrl = `data:${inline.mimeType || 'image/png'};base64,${base64}`;
                processedHtmlBody = processedHtmlBody.replace(new RegExp(`cid:${inline.cid.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}`, 'gi'), dataUrl);
              }
            } catch (e) {
              console.error("Failed to fetch inline image", e);
            }
          } else if (inline.data) {
            const base64 = inline.data.replace(/-/g, '+').replace(/_/g, '/');
            const dataUrl = `data:${inline.mimeType || 'image/png'};base64,${base64}`;
            processedHtmlBody = processedHtmlBody.replace(new RegExp(`cid:${inline.cid.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}`, 'gi'), dataUrl);
          }
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

        setEmailData({
          subject,
          from: displayFrom,
          rawFrom: from,
          to,
          date: niceDate,
          cc,
          htmlBody: DOMPurify.sanitize(processedHtmlBody, { ADD_DATA_URI_TAGS: ['img'] }),
          textBody: bodyExtract.text,
          rawTextBody,
          attachments,
          messageId: data.id,
          threadId: data.threadId,
          rfcMessageId,
          isStarred,
          isDraft: data.labelIds?.includes('DRAFT') || false
        });
      } catch (err) {
        console.error("Chyba při načítání detailu:", err);
      }
      setLoading(false);
    };

    fetchEmail();
  }, [selectedEmailId, googleToken, refreshTrigger]);

  // Žádný email není navolen v listu
  if (!selectedEmailId) {
    return (
      <div className="flex-1 relative flex flex-col items-center justify-center p-10 h-full overflow-hidden bg-transparent">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#f800ff] rounded-full blur-[150px] opacity-10 pointer-events-none"></div>
        <div className="absolute top-1/4 left-3/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#00f3ff] rounded-full blur-[120px] opacity-10 pointer-events-none"></div>

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
      <div className="flex-1 flex flex-col items-center justify-center text-[#00f3ff]/60 h-full relative overflow-hidden bg-[#0f172a]">
        <div className="w-16 h-16 rounded-full border-[6px] border-[#00f3ff]/10 border-t-[#00f3ff] animate-spin mb-6 drop-shadow-[0_0_15px_rgba(0,243,255,0.4)]"></div>
        <p className="font-bold tracking-widest uppercase animate-pulse">Dešifruji data z matrixu...</p>
      </div>
    );
  }

  const slideAnimationClass = isVerticalLayout
    ? 'anim-email-slide-down'
    : 'anim-email-slide-right';

  // Samotný E-mail čtecí panel
  return (
    <>
      {/* --- MOBILE TOP BAR MORPHING FROM APP HEADER (PORTALLED) --- */}
      {createPortal(
        <div className="md:hidden fixed top-0 left-0 w-full flex items-center justify-between px-4 h-16 bg-transparent border-b border-[#00f3ff]/20 z-[60] shrink-0 pointer-events-auto">
          {onMobileBack && (
            <button
              onClick={onMobileBack}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/90 backdrop-blur-md border-[1.5px] border-[#00f3ff]/60 text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] shadow-[inset_0_0_15px_rgba(0,243,255,0.3)] transition-all active:scale-95 anim-spin-in-arrow"
            >
              <ArrowLeft size={22} strokeWidth={2.5} />
            </button>
          )}
          <div className="flex items-center gap-3 pr-0 anim-slide-in-right-overlay" style={{ '--delay': '150ms' }}>
            {emailData && (
              <button
                onClick={toggleReadStatus}
                className={`w-10 h-10 flex items-center justify-center rounded-full bg-black/90 backdrop-blur-md border-[1.5px] transition-all active:scale-95 text-[20px] ${emailData.isUnread ? 'text-[#00f3ff] border-[#00f3ff]/60 drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] shadow-[inset_0_0_15px_rgba(0,243,255,0.3)]' : 'text-white/80 border-white/50 drop-shadow-[0_0_10px_rgba(255,255,255,0.6)] shadow-[inset_0_0_12px_rgba(255,255,255,0.2)] hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] hover:border-white hover:text-white'}`}
                title={emailData.isUnread ? "Označit jako přečtené" : "Označit jako nepřečtené"}
              >
                {emailData.isUnread ? <Mail size={20} /> : <MailOpen size={20} />}
              </button>
            )}
            {onTrash && (
              <button
                onClick={handleTrashClick}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/90 backdrop-blur-md border-[1.5px] border-[#ef4444]/80 text-[#ef4444] drop-shadow-[0_0_15px_rgba(239,68,68,1)] shadow-[inset_0_0_20px_rgba(239,68,68,0.4)] transition-all active:scale-95 hover:bg-[#ef4444]/20"
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
        className={`flex-1 flex flex-col pt-16 md:pt-0 bg-[#0f172a] overflow-hidden fixed inset-0 z-50 md:relative md:inset-auto md:z-auto pointer-events-auto shadow-[0_-5px_20px_rgba(0,0,0,0.5)] md:shadow-none ${slideAnimationClass}`}
        onDoubleClick={() => {
          if (emailData?.isDraft) handleResumeDraft(emailData);
        }}
      >

        {/* Detail Hlaviček - Floating Frame na Desktopu s dynamickou výškou pro dlouhé texty */}
        <div className="shrink-0 px-4 py-5 md:py-4 md:px-6 md:m-6 md:mb-0 md:min-h-[100px] border-t-0 md:border md:rounded-2xl border-transparent md:border-[#00f3ff]/20 bg-[#050810] md:bg-[#0a0f1d] shadow-[0_15px_40px_rgba(0,0,0,0.6)] md:shadow-[0_5px_20px_rgba(0,0,0,0.5)] z-[70] flex flex-col gap-4 relative w-full md:w-auto overflow-hidden">

          {/* Horní neonová linka ze Seznamu Emailů (Pouze mobil) */}
          <div className="md:hidden absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>

          {/* Dekorační levé zakončení (Pouze mobil) */}
          <div className="md:hidden absolute top-0 left-0 w-1 h-full bg-[#f800ff]/20"></div>

          {/* Velmi jemný radialní odlesk v pozadí (Pouze mobil) */}
          <div className="md:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,243,255,0.06)_0%,transparent_60%)] pointer-events-none"></div>

          {/* Laserová linka dole (Z návrhu 1, žádané uživatelem, pouze mobil) */}
          <div className="md:hidden absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff] via-[#00f3ff]/50 to-[#00f3ff]/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>

          <div className="flex flex-col md:flex-row justify-between items-start gap-4 md:gap-6 relative z-10 w-full pl-2 md:pl-0">
            <div className="flex-1 min-w-0 w-full">
              {emailData?.isDraft && (
                <div className="mb-4">
                  <button
                    onClick={() => handleResumeDraft(emailData)}
                    className="w-full relative overflow-hidden group rounded-2xl flex items-center justify-center p-1 cursor-pointer bg-[#f800ff]/10 border border-[#f800ff]/40 shadow-[0_0_20px_rgba(248,0,255,0.2)] hover:shadow-[0_0_40px_rgba(248,0,255,0.5)] transition-all animate-pulse hover:animate-none"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f800ff]/20 to-transparent group-hover:translate-x-[200%] transition-transform duration-1000 -translate-x-full"></div>
                    <div className="relative z-10 py-3 mx-4 flex items-center justify-center gap-3">
                      <span className="font-black tracking-[0.3em] text-[#f800ff] text-xl drop-shadow-[0_0_10px_#f800ff]">POKRAČOVAT V PSANÍ (UPRAVIT KONCEPT)</span>
                    </div>
                  </button>
                </div>
              )}

              {/* STATUS BOARD BADGES */}
              <div className="flex flex-wrap items-center gap-2 mb-3">

                {/* Odesilatel / Star status */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const currentIsStarred = emailData.isStarred;
                    setEmailData(prev => ({ ...prev, isStarred: !currentIsStarred }));
                    window.dispatchEvent(new CustomEvent('vr-email-star-toggle', { detail: { id: emailData?.id || selectedEmailId, isStarred: !currentIsStarred } }));
                    try {
                      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${emailData.threadId || emailData.messageId}/modify`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(currentIsStarred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] })
                      });
                    } catch (err) { console.error(err); setEmailData(prev => ({ ...prev, isStarred: currentIsStarred })); }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border cursor-pointer hover:brightness-125 active:scale-95 transition-all ${emailData?.isStarred ? 'bg-[#f800ff]/10 border-[#f800ff]/30 text-[#f800ff] drop-shadow-[0_0_5px_rgba(248,0,255,0.4)]' : 'bg-[#00f3ff]/10 border-[#00f3ff]/30 text-[#00f3ff]'}`}
                  title={emailData?.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
                >
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${emailData?.isStarred ? 'bg-[#f800ff] shadow-[0_0_8px_#f800ff]' : 'bg-[#00f3ff] shadow-[0_0_5px_#00f3ff]'}`}></div>
                  <span className="text-[9px] md:text-[10px] uppercase font-mono font-bold tracking-widest text-current">Link_Active</span>
                </button>

                {/* Attachments status */}
                {emailData?.attachments?.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#f800ff]/10 border border-[#f800ff]/30">
                    <Paperclip size={12} strokeWidth={3} className="text-[#f800ff]" />
                    <span className="text-[9px] md:text-[10px] uppercase font-mono font-bold tracking-widest text-[#f800ff]">Datacore_{emailData.attachments.length}</span>
                  </div>
                )}



              </div>

              <div className="flex items-center gap-3 group w-full min-w-0 pr-4">
                <h1
                  className="text-2xl md:text-3xl font-black md:font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] md:drop-shadow-md tracking-wide leading-tight break-words"
                  title={emailData?.subject}
                >
                  {emailData?.subject}
                </h1>
                {emailData?.subject && (
                  <button
                    onClick={() => handleCopyToClipboard(emailData.subject, 'subject')}
                    className="opacity-20 hover:opacity-100 hover:bg-white/10 transition-all p-1 md:p-2 rounded-lg text-white shrink-0"
                    title="Kopírovat předmět"
                  >
                    {copiedId === 'subject' ? <Check size={14} className="md:w-5 md:h-5 text-green-400" /> : <Copy size={14} className="md:w-5 md:h-5" />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 shrink-0 md:w-auto mt-2 md:mt-0">

              {/* ---------------- DESKTOP ACTIONS ---------------- */}
              <div className="hidden md:flex items-center gap-2">

                {onActionReply && !emailData?.isDraft && (
                  <>
                    <button
                      onClick={handleReply}
                      className="p-2 rounded-xl text-[#00f3ff]/70 bg-[#00f3ff]/5 border border-[#00f3ff]/20 hover:text-[#00f3ff] hover:bg-[#00f3ff]/15 hover:border-[#00f3ff]/50 transition-all shadow-[0_0_5px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]"
                      title="Odpovědět (Reply)"
                    >
                      <Reply size={22} />
                    </button>
                    <button
                      onClick={handleReplyAll}
                      className="p-2 rounded-xl text-[#00f3ff]/70 bg-[#00f3ff]/5 border border-[#00f3ff]/20 hover:text-[#00f3ff] hover:bg-[#00f3ff]/15 hover:border-[#00f3ff]/50 transition-all shadow-[0_0_5px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]"
                      title="Odpovědět všem (Reply All)"
                    >
                      <ReplyAll size={22} />
                    </button>
                    <button
                      onClick={handleForward}
                      disabled={isPreparingForward}
                      className="p-2 rounded-xl text-[#00f3ff]/70 bg-[#00f3ff]/5 border border-[#00f3ff]/20 hover:text-[#f800ff] hover:bg-[#f800ff]/15 hover:border-[#f800ff]/50 transition-all shadow-[0_0_5px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(248,0,255,0.4)] disabled:opacity-50"
                      title="Přeposlat (Forward)"
                    >
                      {isPreparingForward ? (
                        <div className="w-[22px] h-[22px] rounded-full border-[2px] border-[#f800ff]/20 border-t-[#f800ff] animate-spin m-[0.5px]"></div>
                      ) : (
                        <Forward size={22} />
                      )}
                    </button>
                    <div className="w-px h-6 bg-[#00f3ff]/20 mx-1"></div>
                  </>
                )}

                {onSpam && (
                  <button
                    onClick={onSpam}
                    className="p-2 rounded-xl text-[#ef4444]/70 bg-[#ef4444]/5 border border-[#ef4444]/20 hover:text-[#ef4444] hover:bg-[#ef4444]/15 hover:border-[#ef4444]/50 transition-all shadow-[0_0_5px_rgba(239,68,68,0.1)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                    title="Označit jako Spam"
                  >
                    <AlertOctagon size={22} />
                  </button>
                )}

                {onTrash && (
                  <button
                    onClick={handleTrashClick}
                    className="p-2 rounded-xl text-[#ef4444]/70 bg-[#ef4444]/5 border border-[#ef4444]/20 hover:text-[#ef4444] hover:bg-[#ef4444]/15 hover:border-[#ef4444]/50 transition-all shadow-[0_0_5px_rgba(239,68,68,0.1)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                    title="Smazat (Delete)"
                  >
                    <Trash2 size={22} />
                  </button>
                )}
                {onExpand && (
                  <button
                    onClick={onExpand}
                    className="hidden md:block p-2 rounded-xl text-[#00f3ff]/70 bg-[#00f3ff]/5 border border-[#00f3ff]/20 hover:text-[#00f3ff] hover:bg-[#00f3ff]/15 hover:border-[#00f3ff]/50 transition-all shadow-[0_0_5px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]"
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
                      className="hidden md:flex p-2 bg-white/5 hover:bg-[#ef4444]/20 text-gray-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center"
                      title="Zavřít"
                    >
                      <X size={22} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Dělící čára napevno ustavená na Y=192px (přesně navazující na horizont levé tabulky nezávisle na výšce hlavičky výše) */}
        <div className="hidden md:block absolute left-0 w-full h-[1px] top-[192px] bg-gradient-to-r from-[#00f3ff]/20 to-transparent opacity-80 shadow-[0_1px_5px_rgba(0,243,255,0.2)] pointer-events-none z-10"></div>

        {/* Samotné Iframe Tělo zprávy s neonovým okrajem */}
        <div className="flex-1 md:flex-none flex flex-col min-w-0 p-0 m-0 md:absolute md:top-[213px] md:bottom-8 md:inset-x-6 rounded-none md:rounded-2xl border-t md:border border-[#00f3ff]/20 md:border-[#00f3ff]/40 shadow-[0_5px_20px_rgba(0,0,0,0.5)] md:shadow-[0_0_20px_rgba(0,243,255,0.2)] overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#0a0f1d] relative z-20">
          {/* Sender Info Block */}
          <div className="shrink-0 w-full px-4 py-3 md:px-6 md:py-4 border-b border-white/5 bg-[#0a0f1d] z-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between text-sm gap-3 w-full">
              <div className="flex items-center justify-between w-full md:w-auto min-w-0">
                <div className="flex items-start gap-3 w-full md:w-auto min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-[#00f3ff]/20 text-[#00f3ff] font-bold text-lg flex items-center justify-center border border-[#00f3ff]/50 shadow-[0_0_10px_rgba(0,243,255,0.2)]">
                    {emailData?.from?.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || emailData?.from?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex flex-col overflow-hidden pr-0 w-full">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#00f3ff] text-lg md:text-xl tracking-wide leading-tight truncate max-w-[150px] md:max-w-xl">{emailData?.from}</span>
                      {emailData?.rawFrom && (
                        <button onClick={() => handleCopyToClipboard(emailData.rawFrom, 'from')} className="opacity-60 hover:opacity-100 hover:bg-[#00f3ff]/20 transition-all p-1 rounded-lg text-[#00f3ff]" title="Kopírovat plnou adresu odesílatele">
                          {copiedId === 'from' ? <Check size={14} className="md:w-4 md:h-4 text-green-400" /> : <Copy size={14} className="md:w-4 md:h-4" />}
                        </button>
                      )}
                      <span className="text-gray-400 font-semibold md:hidden ml-1">{emailData?.date}</span>
                    </div>
                    <div className="flex flex-col text-gray-400 text-xs tracking-wider mt-0.5 max-w-full gap-1">
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
                    <button onClick={handleReply} className="p-2 rounded-xl text-[#00f3ff]/70 hover:text-[#00f3ff] hover:bg-[#00f3ff]/10 hover:shadow-[0_0_10px_rgba(0,243,255,0.2)] transition-all">
                      <Reply size={22} />
                    </button>
                  )}
                  <div className="relative" ref={moreMenuRef}>
                    <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className={`p-2 rounded-xl transition-all ${isMoreMenuOpen ? 'text-[#00f3ff] bg-[#00f3ff]/20 shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'text-[#00f3ff]/70 hover:bg-[#00f3ff]/10 hover:shadow-[0_0_10px_rgba(0,243,255,0.2)]'}`}>
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
                          className="absolute inset-0 bg-black/40"
                          style={{ animation: 'mobileSheetFadeIn 0.3s ease-out forwards' }}
                        ></div>

                        {/* Moderní Mobile Bottom Sheet místo plovoucího okna */}
                        <div
                          ref={bottomSheetRef}
                          className="relative w-full max-w-lg bg-[#050810] border-t border-[#00f3ff]/40 rounded-t-[30px] shadow-[0_-15px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(0,243,255,0.15)] flex flex-col p-6 pb-12 gap-1 z-10"
                          style={{ animation: 'mobileSheetSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
                        >
                          {/* Designové držátko/čárka typická pro Bottom sheets */}
                          <div className="w-12 h-1.5 bg-[#00f3ff]/30 rounded-full mx-auto mb-6 shrink-0"></div>

                          {onActionReply && !emailData?.isDraft && (
                            <button onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(false); handleReplyAll(); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-[#00f3ff]/10 text-[#00f3ff]/80 hover:text-[#00f3ff] transition-all w-full text-left font-bold tracking-wide active:bg-[#00f3ff]/20">
                              <div className="w-10 h-10 rounded-full bg-[#00f3ff]/10 flex items-center justify-center shrink-0"><ReplyAll size={20} /></div> Odpovědět všem
                            </button>
                          )}
                          {onActionReply && !emailData?.isDraft && (
                            <button onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(false); handleForward(); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-[#00f3ff]/10 text-[#00f3ff]/80 hover:text-[#00f3ff] transition-all w-full text-left font-bold tracking-wide active:bg-[#00f3ff]/20">
                              <div className="w-10 h-10 rounded-full bg-[#00f3ff]/10 flex items-center justify-center shrink-0"><Forward size={20} /></div> Přeposlat
                            </button>
                          )}

                          <div className="w-full h-px bg-gradient-to-r from-transparent via-[#00f3ff]/20 to-transparent my-2 opacity-50 shrink-0"></div>

                          <button onClick={async (e) => {
                            e.stopPropagation();
                            setIsMoreMenuOpen(false);
                            const currentIsStarred = emailData.isStarred;
                            setEmailData(prev => ({ ...prev, isStarred: !currentIsStarred }));
                            window.dispatchEvent(new CustomEvent('vr-email-star-toggle', { detail: { id: emailData?.id || selectedEmailId, isStarred: !currentIsStarred } }));
                            try {
                              await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${emailData.threadId || emailData.messageId}/modify`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(currentIsStarred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] })
                              });
                            } catch (err) { console.error(err); setEmailData(prev => ({ ...prev, isStarred: currentIsStarred })); }
                          }} className={`flex items-center gap-4 p-4 rounded-2xl transition-all w-full text-left font-bold tracking-wide active:scale-[0.98] ${emailData.isStarred ? 'hover:bg-[#f800ff]/10 text-[#f800ff]/90 active:bg-[#f800ff]/20' : 'hover:bg-[#f800ff]/10 text-[#f800ff]/50 active:bg-[#f800ff]/20'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${emailData.isStarred ? 'bg-transparent border-2 border-[#f800ff]/30' : 'bg-[#f800ff]/10'}`}>
                              <div className={`w-4 h-4 rounded-full transition-all ${emailData.isStarred ? 'border-2 border-[#f800ff]/50' : 'bg-[#f800ff] shadow-[0_0_8px_#f800ff] animate-pulse'}`}></div>
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
              <span className="hidden md:block shrink-0 text-gray-400 font-semibold bg-white/5 py-1 px-3 rounded-lg border border-white/10 md:self-auto">{emailData?.date}</span>
            </div>

            {/* Přílohy PŘESUNUTÉ DO HLAVIČKY (Zůstanou zakotvené při scrollování a sdílí px s odesílatelem) */}
            {emailData?.attachments?.length > 0 && (
              <div className="flex flex-row md:flex-wrap gap-3 mt-4 pt-4 border-t border-white/5 pb-1 w-full overflow-x-auto md:overflow-visible overflow-y-hidden md:overflow-y-auto max-h-[90px] md:max-h-[180px] custom-scrollbar snap-x snap-mandatory">
                {emailData.attachments.map(att => {
                  const mType = att.mimeType.toLowerCase();
                  const fName = att.filename.toLowerCase();
                  const isPreviewable = mType === 'application/pdf' || mType.startsWith('image/') || mType.startsWith('text/') || fName.endsWith('.pdf') || fName.endsWith('.jpg') || fName.endsWith('.png') || fName.endsWith('.jpeg') || fName.endsWith('.txt');
                  const isIcs = fName.endsWith('.ics') || mType === 'text/calendar';

                  return (
                    <div key={att.attachmentId} className="flex w-[85%] md:w-auto shrink-0 items-center justify-between p-1 pl-1.5 rounded-xl border border-[#00f3ff]/30 bg-black/40 shadow-[0_4px_10px_rgba(0,0,0,0.3)] group hover:border-[#00f3ff]/70 transition-all relative snap-start">

                      <button
                        onClick={() => handleActionAttachment(att, isPreviewable ? 'open' : 'download')}
                        disabled={downloadingAttachId === att.attachmentId}
                        className="flex-1 min-w-0 flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-lg hover:bg-[#00f3ff]/10 transition-colors disabled:opacity-50 text-left"
                        title={isPreviewable ? "Otevřít zobrazení" : "Stáhnout soubor na disk"}
                      >
                        {downloadingAttachId === att.attachmentId ? (
                          <div className="w-4 h-4 rounded-full border-[2px] border-[#00f3ff]/20 border-t-[#00f3ff] animate-spin shrink-0"></div>
                        ) : isPreviewable ? (
                          <Eye size={16} className="text-[#00f3ff] shrink-0" />
                        ) : (
                          <Paperclip size={16} className="text-[#00f3ff] shrink-0" />
                        )}
                        <div className="flex flex-col text-left pl-1 flex-1 min-w-0">
                          <span className="truncate text-[#00f3ff] text-sm font-semibold tracking-wide drop-shadow-[0_0_5px_rgba(0,243,255,0.1)]">{att.filename}</span>
                          {isIcs && icsDetails[att.attachmentId] && (
                            <span className="text-[10px] text-[#f800ff] font-bold tracking-[0.15em] uppercase animate-pulse">📅 {icsDetails[att.attachmentId]}</span>
                          )}
                          {!isIcs && <span className="text-[10px] text-[#00f3ff]/50 font-bold uppercase tracking-wider">{Math.round(att.size / 1024)} KB</span>}
                        </div>

                      </button>

                      <div className="flex items-center px-1 border-l border-[#00f3ff]/20">
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
                          className="p-2 mx-1 text-[#00f3ff]/60 hover:text-[#f800ff] hover:bg-[#f800ff]/20 rounded-lg transition-all disabled:opacity-50"
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
                sandbox="allow-popups allow-same-origin allow-scripts"
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
                    color: #e2e8f0 !important;
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
                  a, a * { color: #00f3ff !important; text-decoration: none !important; }
                  a:hover, a:hover * { text-decoration: underline !important; color: #f800ff !important; text-shadow: 0 0 10px #f800ff !important; }
                  
                  /* Stylování iFrame posuvníku do neonu */
                  ::-webkit-scrollbar { width: 8px; height: 8px; }
                  ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
                  ::-webkit-scrollbar-thumb { background: rgba(0,243,255,0.2); border-radius: 4px; }
                  ::-webkit-scrollbar-thumb:hover { background: rgba(0,243,255,0.5); }
                </style>
                ${emailData.htmlBody}
                <script>
                  document.addEventListener('click', function(e) {
                    const a = e.target.closest('a');
                    if (a && a.href) {
                      e.preventDefault();
                      window.parent.postMessage({ type: 'open-link', url: a.href }, '*');
                    }
                  });

                  // Nejpokročilejší auto-scaling pro emailové iframy na WebKitu/Chromiu
                  let stalyScale = 1.0;
                  let vychoziScale = 1.0;
                  let translateX = 0;
                  let translateY = 0;
                  
                  function applyTransform() {
                     document.body.style.transformOrigin = '0 0';
                     document.body.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + stalyScale + ')';
                  }

                  function fitToWidth() {
                    // 1. Uvolnit mantinely pro přesné změření původního rozložení
                    document.documentElement.style.overflowX = 'visible';
                    document.body.style.overflowX = 'visible';
                    document.body.style.transform = 'none';
                    document.body.style.width = 'auto';
                    translateX = 0;
                    translateY = 0;
                    
                    // 2. Musíme dát maličký rozestup browseru, aby stihl aplikovat "auto" před změřením, 
                    // ale kvůli synchronnosti změn to můžeme zkusit rovnou z DOMu
                    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
                    const winWidth = window.innerWidth;
                    
                    // 3. Rozhodnutí
                    if (docWidth > winWidth + 5 && winWidth > 0) {
                       // Email má fixní šířku (např 600px table), která se nevměstná do mobilu.
                       stalyScale = winWidth / docWidth;
                       // Zásadní chyba z minula: Musíme uměle zvětšit i tělo, aby HTML neoseklo pravou stranu před zmenšením!
                       document.body.style.width = docWidth + 'px';
                    } else {
                       // Běžný responzivní email (vykreslen tak, že se hned vešel)
                       stalyScale = 1.0;
                       document.body.style.width = '100%';
                    }
                    vychoziScale = stalyScale;
                    
                    // 4. Aplikovat transform a znovu uzamknout scrollování s pojištěním, že neosekáváme vnitřek
                    applyTransform();
                    document.documentElement.style.overflowX = 'hidden';
                    
                    // 5. Odeslat novou výšku rodiči, aby nás správně roztáhl
                    const fullScrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight);
                    window.parent.postMessage({ type: 'content-height', height: (fullScrollHeight * stalyScale) + 50 }, '*');
                  }

                  // Okamžitá spoušť po nalití docu
                  fitToWidth();
                  window.addEventListener('load', fitToWidth);
                  
                  let lastWidth = window.innerWidth;
                  window.addEventListener('resize', function() {
                     // Spustit škálování AŽ když se změní šířka okna (např otočení telefonu). 
                     // Změna výšky okna nesmí re-triggerovat škálování, jinak vzniká nekonečná smyčka
                     // u emailů, co mají "height: 100%" (vyplňují novou výšku iframu a posílají ještě větší scrollHeight!)
                     if (Math.abs(window.innerWidth - lastWidth) > 5) {
                         lastWidth = window.innerWidth;
                         fitToWidth();
                     }
                  });
                  
                  setTimeout(fitToWidth, 200);
                  setTimeout(fitToWidth, 800);

                  // Javascript Pinch-To-Zoom, plně napojený na CSS Transformaci
                  let vzdalenostInit = 0;
                  let scaleInit = 1.0;
                  let txInit = 0;
                  let tyInit = 0;
                  let stredInitX = 0;
                  let stredInitY = 0;

                  document.addEventListener('touchstart', function(e) {
                    if (e.touches.length === 2) {
                       vzdalenostInit = Math.hypot(
                         e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY
                       );
                       scaleInit = stalyScale;
                       txInit = translateX;
                       tyInit = translateY;
                       stredInitX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                       stredInitY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    }
                  });

                  document.addEventListener('touchmove', function(e) {
                    if (e.touches.length === 2 && vzdalenostInit > 0) {
                      e.preventDefault(); // Zákaz výchozích nativních pokusů prohlížeče
                      
                      const vzdalenostAktual = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                      );
                      
                      const ptZStredX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                      const ptZStredY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                      
                      const pomer = vzdalenostAktual / vzdalenostInit;
                      stalyScale = scaleInit * pomer;
                      
                      // Mantinely pro velikost textu (menší než vychozi o kousek a obří zvětšení)
                      if (stalyScale < vychoziScale * 0.8) stalyScale = vychoziScale * 0.8;
                      if (stalyScale > 5.0) stalyScale = 5.0;
                      
                      // Držení těžiště
                      translateX = ptZStredX - ((stredInitX - txInit) * (stalyScale / scaleInit));
                      translateY = ptZStredY - ((stredInitY - tyInit) * (stalyScale / scaleInit));
                      
                      applyTransform();
                    } else if (e.touches.length === 1 && stalyScale > vychoziScale) {
                       // Mírný pan/posun jednoho prstu pokusme neblokovat? Tady jen zablokovat default na okrajích
                    }
                  }, { passive: false });

                  document.addEventListener('touchend', function(e) {
                     if (e.touches.length < 2) vzdalenostInit = 0;
                  });

                  document.addEventListener('touchend', function(e) {
                    if (e.touches.length < 2) vzdalenostInit = 0;
                  });
                </script>
             `}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 font-medium">
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
          className="fixed inset-0 z-[999999] bg-black/95 flex flex-col p-4 sm:p-10 backdrop-blur-md outline-none"
          onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(previewBlob.url); setPreviewBlob(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); URL.revokeObjectURL(previewBlob.url); setPreviewBlob(null); } }}
        >
          <div className="flex justify-between items-center mb-4 text-[#00f3ff]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 bg-black/40 px-6 py-3 rounded-xl border border-[#00f3ff]/20">
              <Eye size={24} className="animate-pulse" />
              <h2 className="text-xl font-bold tracking-wide truncate max-w-md">{previewBlob.filename}</h2>
            </div>
            <button
              onClick={() => {
                URL.revokeObjectURL(previewBlob.url);
                setPreviewBlob(null);
              }}
              className="pointer-events-auto p-2 bg-black/40 hover:bg-[#ef4444]/20 text-gray-300 hover:text-[#ef4444] rounded-full transition-all border border-white/10 hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center backdrop-blur-md"
              title="Zavřít zobrazení"
            >
              <X size={24} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.15)] bg-black border border-[#00f3ff]/20 flex items-center justify-center preview-checkered" onClick={(e) => e.stopPropagation()}>
            {previewBlob.type.startsWith('image/') ? (
              <img src={previewBlob.url} className="max-w-full max-h-full object-contain p-2 drop-shadow-2xl" alt="Preview" />
            ) : previewBlob.type === 'application/pdf' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full w-full bg-[#050810]/95">
                 <FileText size={64} className="text-[#00f3ff] mb-6 drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]" />
                 <h3 className="text-2xl font-black tracking-widest text-white mb-4 uppercase drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">Náhled na mobilu</h3>
                 <p className="text-[#00f3ff]/70 max-w-md mb-8 text-sm leading-relaxed">Mobilní systémy (iOS/Android) z bezpečnostních a technických důvodů blokují přímé zobrazení PDF souborů uvnitř okna webových aplikací.</p>
                 <a href={previewBlob.url} target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-[#00f3ff]/10 border-2 border-[#00f3ff]/50 hover:bg-[#00f3ff]/30 text-[#00f3ff] hover:text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(0,243,255,0.2)] hover:shadow-[0_0_40px_rgba(0,243,255,0.6)] tracking-wide">OTEVŘÍT PDF SOUBOR</a>
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
