import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Maximize2, Trash2, Paperclip, Eye, Download, Reply, ReplyAll, Forward, AlertOctagon, X, Star, CalendarPlus, Copy, Check, MoreVertical } from 'lucide-react';
import ICAL from 'ical.js';
import DOMPurify from 'dompurify';

import { getHeader, getMessageBody, decodeMojibake, extractAttachments, extractInlineImages, decodeBase64Url } from '../utils/emailParser';

import { useAlert } from './AlertProvider';

export default function EmailDetail({ googleToken, isVerticalLayout, selectedEmailId, onExpand, onTrash, onSpam, onActionReply, onClose, autoResumeDraftId, onDraftResumed }) {
  const [emailData, setEmailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingAttachId, setDownloadingAttachId] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [isPreparingForward, setIsPreparingForward] = useState(false);
  const [icsDetails, setIcsDetails] = useState({});
  const { showAlert } = useAlert();

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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside, { capture: true });
    };
  }, []);

  useEffect(() => {
    const handleMessage = async (e) => {
      if (e.data && e.data.type === 'open-link' && e.data.url) {
        try {
          await open(e.data.url);
        } catch (err) {
          console.error("Failed to open link via Tauri shell:", err);
        }
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
                try { utf8String = decodeURIComponent(escape(binaryString)); } catch(e) { }
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
        setIcsDetails(prev => ({...prev, ...newDetails}));
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
        } catch(e) { }

        let jcalData;
        try {
          jcalData = ICAL.parse(utf8String);
        } catch(e) {
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
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messageId}/attachments/${att.attachmentId}`, {
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
    onActionReply({ type: 'reply', initialTo: emailData?.from, initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`, messageId: emailData?.messageId, threadId: emailData?.threadId, rfcMessageId: emailData?.rfcMessageId, htmlBody: getHistoryHeader('reply') + (emailData?.htmlBody || ''), initialBody: '' });
  };

  const handleReplyAll = () => {
    onActionReply({ type: 'replyAll', initialTo: `${emailData?.from}${emailData?.cc ? `, ${emailData.cc}` : ''}`, initialSubject: emailData?.subject?.match(/^Re:/i) ? emailData.subject : `Re: ${emailData?.subject}`, messageId: emailData?.messageId, threadId: emailData?.threadId, rfcMessageId: emailData?.rfcMessageId, htmlBody: getHistoryHeader('reply') + (emailData?.htmlBody || ''), initialBody: '' });
  };

  const handleForward = async () => {
    setIsPreparingForward(true);
    const fetchedAttachments = [];
    if (emailData?.attachments && emailData.attachments.length > 0) {
      for (const att of emailData.attachments) {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/attachments/${att.attachmentId}`, {
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
      htmlBody: getHistoryHeader('forward') + (emailData?.htmlBody || ''),
      initialBody: '',
      initialAttachments: fetchedAttachments
    });
  };

  useEffect(() => {
    if (!selectedEmailId || !googleToken) {
      setEmailData(null);
      return;
    }

    const fetchEmail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${selectedEmailId}?format=full`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const data = await res.json();

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
        const attachments = extractAttachments(data.payload);
        const inlineImagesTokens = extractInlineImages(data.payload);

        let processedHtmlBody = htmlBody;

        for (const inline of inlineImagesTokens) {
          if (inline.attachmentId) {
            try {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${selectedEmailId}/attachments/${inline.attachmentId}`, {
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
  }, [selectedEmailId, googleToken]);

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
    ? 'animate-in slide-in-from-top-32 fade-in duration-1000 ease-out fill-mode-both'
    : 'animate-in slide-in-from-right-32 fade-in duration-1000 ease-out fill-mode-both';

  // Samotný E-mail čtecí panel
  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden relative">
      <div 
        key={emailData?.messageId || "loading"} 
        className={`flex-1 flex flex-col h-full overflow-hidden ${slideAnimationClass}`}
        onDoubleClick={() => {
           if (emailData?.isDraft) handleResumeDraft(emailData);
        }}
      >
        {/* --- MOBILE TOP BAR --- */}
        <div className="md:hidden flex items-center justify-between px-2 py-3 border-b border-[#00f3ff]/20 bg-[#0f172a] z-20 shadow-[0_5px_15px_rgba(0,0,0,0.5)] w-full">
          {onMobileBack && (
            <button onClick={onMobileBack} className="text-[#00f3ff] p-2 hover:bg-[#00f3ff]/10 rounded-xl transition-all">
              <ArrowLeft size={24} />
            </button>
          )}
          <div className="flex items-center gap-2 pr-2">
            {emailData && (
              <button 
                onClick={toggleReadStatus} 
                className={`p-2 rounded-xl transition-all ${emailData.isUnread ? 'text-[#00f3ff] bg-[#00f3ff]/10' : 'text-white/50 hover:text-white/80 hover:bg-white/10'}`}
                title={emailData.isUnread ? "Označit jako přečtené" : "Označit jako nepřečtené"}
              >
                {emailData.isUnread ? <Mail size={22} /> : <MailOpen size={22} />}
              </button>
            )}
            {onTrash && (
              <button onClick={() => { if(onMobileBack) onMobileBack(); onTrash(); }} className="p-2 rounded-xl text-[#ef4444]/80 hover:text-[#ef4444] hover:bg-[#ef4444]/20 transition-all">
                <Trash2 size={22} />
              </button>
            )}
          </div>
        </div>

        {/* Detail Hlaviček */}
        <div className="shrink-0 px-4 py-4 md:p-8 border-b border-[#00f3ff]/10 bg-black/20 shadow-[0_10px_30px_rgba(0,0,0,0.3)] z-10 flex flex-col gap-4 relative w-full overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 md:gap-6 relative z-10 w-full">
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
              <div className="flex items-center gap-3 group w-full">
                <h1 className="text-lg md:text-3xl font-bold md:font-black text-white drop-shadow-md tracking-wide leading-tight break-words">
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
                 {emailData && (
                   <>
                     <button
                       onClick={async () => {
                         const currentIsStarred = emailData.isStarred;
                         setEmailData(prev => ({ ...prev, isStarred: !currentIsStarred }));
                         try {
                           await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/modify`, {
                             method: 'POST',
                             headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
                             body: JSON.stringify(currentIsStarred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] })
                           });
                         } catch (err) { console.error(err); setEmailData(prev => ({ ...prev, isStarred: currentIsStarred })); }
                       }}
                    className={`p-2 rounded-xl border transition-all ${emailData.isStarred ? 'text-[#f800ff] bg-[#f800ff]/10 border-[#f800ff]/40 shadow-[0_0_15px_rgba(248,0,255,0.4)]' : 'text-[#f800ff]/50 bg-[#f800ff]/5 border-[#f800ff]/10 hover:text-[#f800ff] hover:bg-[#f800ff]/15 hover:border-[#f800ff]/50 shadow-[0_0_5px_rgba(248,0,255,0.1)] hover:shadow-[0_0_15px_rgba(248,0,255,0.4)]'}`}
                    title={emailData.isStarred ? "Odebrat prioritu" : "Označit jako důležité"}
                  >
                    <Star size={22} fill={emailData.isStarred ? "currentColor" : "none"} />
                  </button>
                  <div className="w-px h-6 bg-[#00f3ff]/20 mx-1"></div>
                </>
              )}

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
                  onClick={onTrash}
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
                    <button onClick={handleReply} className="p-2 text-[#00f3ff] hover:bg-[#00f3ff]/10 rounded-xl transition-all shadow-[0_0_10px_rgba(0,243,255,0.2)]">
                      <Reply size={22} />
                    </button>
                 )}
                 <div className="relative" ref={moreMenuRef}>
                    <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className="p-2 rounded-xl text-white/70 hover:bg-white/10 transition-all">
                      <MoreVertical size={22} />
                    </button>
                    {isMoreMenuOpen && (
                      <div className="absolute top-10 right-0 w-56 bg-black/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl z-50 flex flex-col p-2 gap-1 animate-in fade-in slide-in-from-top-2">
                        {onActionReply && !emailData?.isDraft && (
                          <button onClick={() => { setIsMoreMenuOpen(false); handleReplyAll(); }} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 text-white/80 w-full text-left">
                            <ReplyAll size={18} /> Odpovědět všem
                          </button>
                        )}
                        {onActionReply && !emailData?.isDraft && (
                          <button onClick={() => { setIsMoreMenuOpen(false); handleForward(); }} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 text-white/80 w-full text-left">
                            <Forward size={18} /> Přeposlat
                          </button>
                        )}
                        <div className="w-full h-px bg-white/10 my-1"></div>
                        <button onClick={async () => {
                           setIsMoreMenuOpen(false);
                           const currentIsStarred = emailData.isStarred;
                           setEmailData(prev => ({ ...prev, isStarred: !currentIsStarred }));
                           try {
                             await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/modify`, {
                               method: 'POST',
                               headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
                               body: JSON.stringify(currentIsStarred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] })
                             });
                           } catch (err) { console.error(err); setEmailData(prev => ({ ...prev, isStarred: currentIsStarred })); }
                        }} className={`flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 w-full text-left ${emailData.isStarred ? 'text-[#f800ff]' : 'text-white/80'}`}>
                          <Star size={18} fill={emailData.isStarred ? "currentColor" : "none"} /> {emailData.isStarred ? "Odebrat prioritu" : "Důležité"}
                        </button>
                        <button onClick={toggleReadStatus} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 text-white/80 w-full text-left">
                          {emailData.isUnread ? <Mail size={18} /> : <MailOpen size={18} />} {emailData.isUnread ? "Značit jako přečtené" : "Značit jako nepřečtené"}
                        </button>
                      </div>
                    )}
                 </div>
              </div>
            </div>
            <span className="hidden md:block shrink-0 text-gray-400 font-semibold bg-white/5 py-1 px-3 rounded-lg border border-white/10 md:self-auto">{emailData?.date}</span>
          </div>

          {/* Přílohy */}
          {emailData?.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4 pt-5 border-t border-white/10 overflow-y-auto custom-scrollbar pb-2 max-h-48">
              {emailData.attachments.map(att => {
                const mType = att.mimeType.toLowerCase();
                const fName = att.filename.toLowerCase();
                const isPreviewable = mType === 'application/pdf' || mType.startsWith('image/') || mType.startsWith('text/') || fName.endsWith('.pdf') || fName.endsWith('.jpg') || fName.endsWith('.png') || fName.endsWith('.jpeg') || fName.endsWith('.txt');
                const isIcs = fName.endsWith('.ics') || mType === 'text/calendar';

                return (
                  <div key={att.attachmentId} className="flex shrink-0 items-center justify-between p-1 pl-1.5 rounded-xl border border-[#00f3ff]/30 bg-black/40 shadow-[0_4px_10px_rgba(0,0,0,0.3)] group hover:border-[#00f3ff]/70 transition-all relative">

                    <button
                      onClick={() => handleActionAttachment(att, isPreviewable ? 'open' : 'download')}
                      disabled={downloadingAttachId === att.attachmentId}
                      className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-lg hover:bg-[#00f3ff]/10 transition-colors disabled:opacity-50 text-left"
                      title={isPreviewable ? "Otevřít zobrazení" : "Stáhnout soubor na disk"}
                    >
                      {downloadingAttachId === att.attachmentId ? (
                        <div className="w-4 h-4 rounded-full border-[2px] border-[#00f3ff]/20 border-t-[#00f3ff] animate-spin"></div>
                      ) : isPreviewable ? (
                        <Eye size={16} className="text-[#00f3ff]" />
                      ) : (
                        <Paperclip size={16} className="text-[#00f3ff]" />
                      )}
                      <div className="flex flex-col text-left pl-1">
                        <span className="truncate max-w-[220px] text-[#00f3ff] text-sm font-semibold tracking-wide drop-shadow-[0_0_5px_rgba(0,243,255,0.1)]">{att.filename}</span>
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

        {/* Samotné Iframe Tělo zprávy (Aggressive Dark Mode na Námořnické modré) */}
        <div className="flex-1 p-0 m-0 mt-2 md:m-6 md:mb-8 rounded-none md:rounded-2xl border-0 md:border border-white/10 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] overflow-hidden bg-[#0f172a]/40 backdrop-blur-md">
          {emailData?.htmlBody ? (
            <iframe
              title="Email Content"
              className="w-full h-full border-none rounded-2xl bg-transparent"
              sandbox="allow-popups allow-same-origin allow-scripts"
              srcDoc={`
                <style>
                  /* Naprosté zprůhlednění všech pozadí, ať sklem prosvítá ZažijVR modř */
                  body, html, table, tr, td, div, span, font, center, tbody, thead { 
                    background-color: transparent !important; 
                    background: transparent !important;
                  }
                  
                  /* Přebijeme generátory faktur: všechno co není aktivní odkaz obarvíme na bílo! */
                  *:not(a):not(a *) {
                    color: #e2e8f0 !important;
                  }
                  
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                    line-height: 1.6;
                    padding: 2rem 2.5rem !important;
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
                </script>
             `}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 font-medium">
              Zpráva neobsahuje žádný textový, ani HTML obsah ke čtení.
            </div>
          )}
        </div>
        
        {/* Velká akční tlačítka pod mailem jen pro mobily */}
        {onActionReply && !emailData?.isDraft && (
          <div className="md:hidden flex flex-col gap-3 px-4 pb-8 w-full mt-auto">
            <button
               onClick={handleReply}
               className="w-full py-4 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 border border-[#00f3ff]/40 rounded-2xl flex items-center justify-center gap-3 text-[#00f3ff] font-bold tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(0,243,255,0.2)]"
            >
              <Reply size={22} /> Odpovědět odesílateli
            </button>
            <button
               onClick={handleForward}
               disabled={isPreparingForward}
               className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-white/80 font-bold tracking-widest uppercase transition-all disabled:opacity-50"
            >
              {isPreparingForward ? <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div> : <Forward size={22} />} 
              Přeposlat zprávu
            </button>
          </div>
        )}
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
              className="pointer-events-auto px-6 py-3 bg-[#ef4444]/10 border border-[#ef4444]/40 hover:bg-[#ef4444]/30 hover:border-[#ef4444] text-[#ef4444] rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] font-black uppercase tracking-widest text-[11px]"
            >
              Zavřít zobrazení ✖
            </button>
          </div>
          <div className="flex-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.15)] bg-black border border-[#00f3ff]/20 flex items-center justify-center preview-checkered" onClick={(e) => e.stopPropagation()}>
            {previewBlob.type.startsWith('image/') ? (
              <img src={previewBlob.url} className="max-w-full max-h-full object-contain p-2 drop-shadow-2xl" alt="Preview" />
            ) : (
              <iframe src={previewBlob.url} className="w-full h-full bg-white" title="Preview" />
            )}
          </div>
        </div>,
        document.body
      )}
      {/* --- Konec flex-containeru --- */}
    </div>
  );
}
