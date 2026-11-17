import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, AlertTriangle, Paperclip, Save, File, Trash2, FileText, PenTool, ReplyAll } from 'lucide-react';
import { encodeBase64Url, encodeHeaderName } from '../utils/emailParser';
import RichTextEditor from './RichTextEditor';
import { useFocusTrap } from '../hooks/useFocusTrap';
import AutofillInput from './AutofillInput';
import { saveNewContacts } from '../utils/contactManager';

const EmailComposer = ({ googleToken, config, onClose, onSuccessAction, userEmail }) => {
  const [to, setTo] = useState(config?.initialTo || '');
  const [cc, setCc] = useState(config?.initialCc || '');
  const [showCc, setShowCc] = useState(!!config?.initialCc);
  const [hasUpgradedToReplyAll, setHasUpgradedToReplyAll] = useState(false);
  const [subject, setSubject] = useState(config?.initialSubject || config?.templateData?.subject || '');
  const getInitialBody = () => {
    let text = config?.initialBody || config?.templateData?.body || '';
    if (!config?.draftId && (config?.type !== 'reply' && config?.type !== 'replyAll' && config?.type !== 'forward')) {
        try {
            const signatures = JSON.parse(localStorage.getItem('zazijvr_signatures')) || [];
            const defSig = signatures.find(s => s.isDefault);
            if (defSig && !text.includes(defSig.body)) {
                text = text + (text ? '<br><br>' : '') + defSig.body;
            }
        } catch(e) {}
    }
    if (config?.htmlBody && !text.includes('class="gmail_quote"')) {
        text = text + `<br><br><div class="gmail_quote" dir="auto"><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${config.htmlBody}</blockquote></div>`;
    }
    return text;
  };

  // `body` je jen hodnota pro editor (počáteční obsah, šablona, podpis).
  // Aktuální rozepsaný text je vždy v bodyRef – při psaní se state nemění, aby se okno nepřekreslovalo.
  const [body, setBody] = useState(getInitialBody);
  const bodyRef = useRef(body);
  const initialBodyRef = useRef(body);
  const handleBodyChange = useCallback((html) => { bodyRef.current = html; }, []);
  /** Nahradí obsah editoru (šablona, podpis) – editor si novou hodnotu převezme */
  // Klíč editoru – po vložení šablony / podpisu se editor načte znovu i se stejným textem
  const [bodyVersion, setBodyVersion] = useState(0);
  const replaceBody = (html) => {
    bodyRef.current = html;
    setBody(html);
    setBodyVersion((v) => v + 1);
  };

  // Pod celoobrazovkovým oknem se aplikace nemusí vykreslovat – na Linuxu (WebKitGTK)
  // jinak každé písmeno překresluje i seznam mailů, pozadí a efekty pod oknem.
  useEffect(() => {
    document.documentElement.classList.add('composer-open');
    return () => document.documentElement.classList.remove('composer-open');
  }, []);
  const [templateTitle, setTemplateTitle] = useState(config?.templateData?.title || '');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const [attachments, setAttachments] = useState(config?.initialAttachments || []);
  const [draftId, setDraftId] = useState(config?.draftId || null);
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);
  
  const templateMenuRef = useRef(null);
  const signatureMenuRef = useRef(null);
  
  useFocusTrap(modalRef, true);

  const [savedTemplates, setSavedTemplates] = useState([]);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  
  const [showTemplateNamePrompt, setShowTemplateNamePrompt] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  useEffect(() => {
    try {
      const templates = JSON.parse(localStorage.getItem('zazijvr_templates')) || [];
      const signatures = JSON.parse(localStorage.getItem('zazijvr_signatures')) || [];
      setSavedTemplates(templates);
      setSavedSignatures(signatures);
    } catch(e) {}
  }, []);

  const handleSaveCurrentAsTemplate = () => {
    setShowTemplateNamePrompt(true);
    setNewTemplateName("");
  };

  const confirmSaveCurrentAsTemplate = () => {
    const title = newTemplateName.trim();
    if (!title) return;

    try {
      const templates = JSON.parse(localStorage.getItem('zazijvr_templates')) || [];
      const newTemplate = {
        id: Date.now().toString(),
        title: title.trim(),
        subject: subject,
        body: bodyRef.current
      };
      
      const newTemplates = [...templates, newTemplate];
      localStorage.setItem('zazijvr_templates', JSON.stringify(newTemplates));
      
      
      setSavedTemplates(newTemplates);
      setShowTemplateMenu(false);
      setShowTemplateNamePrompt(false);
    } catch (err) {
      console.error("Nepodařilo se uložit šablonu:", err);
    }
  };

  const handleUpgradeToReplyAll = () => {
     let allTo = [config?.originalFrom, config?.originalTo].filter(Boolean).join(', ');
     let allCc = config?.originalCc || '';
     
     if (userEmail) {
        const userEmailClean = userEmail.trim().toLowerCase();
        // Odstranění vlastního emailu ze seznamu přes RegExp s respektem k okolním znakům
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emailRegex = new RegExp(`([^,]*${escapeRegExp(userEmailClean)}[^,]*)`, 'gi');
        
        allTo = allTo.replace(emailRegex, '').replace(/,\s*,/g, ',').trim().replace(/^,|,$/g, '');
        allCc = allCc.replace(emailRegex, '').replace(/,\s*,/g, ',').trim().replace(/^,|,$/g, '');
     }
     
     // Pokud by allTo po našem odstranění bylo prázdné a my odstranili sebe, dáme ho zpět k odesilateli
     if (!allTo.trim() && config?.originalFrom) {
         allTo = config.originalFrom;
     }

     setTo(allTo);
     setCc(allCc);
     if (allCc) setShowCc(true);
     setHasUpgradedToReplyAll(true);
  };

  const handleAttemptClose = () => {
    let isDirty = false;
    
    // Pomocná funkce pro vyhodnocení jestli je HTML text editoru reálně prázdný
    const isEditorEmpty = (html) => {
        if (!html) return true;
        const stripped = html.replace(/<[^>]*>?/gm, '').trim();
        return stripped === '';
    };

    const currentBody = bodyRef.current;
    if (config?.type === 'template') {
       isDirty = !!(templateTitle || subject || !isEditorEmpty(currentBody));
    } else {
       const initTo = config?.initialTo || '';
       const initBody = config?.initialBody || '';
       const initSubject = config?.initialSubject || '';
       const initAtt = config?.initialAttachments?.length || 0;
       
       // Porovnává se s obsahem, se kterým okno začalo (včetně podpisu / citace)
       const isBodyDirty = initBody ? (currentBody !== initBody) : (currentBody !== initialBodyRef.current && !isEditorEmpty(currentBody));

       if (to === initTo && !isBodyDirty && subject === initSubject && attachments.length === initAtt && !cc) {
           isDirty = false;
       } else {
           isDirty = true;
       }
    }
    
    if (isDirty && !isSending && !isSaving) {
      setShowCloseWarning(true);
    } else {
      onClose && onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCloseWarning) {
            setShowCloseWarning(false);
        } else {
            handleAttemptClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [to, cc, subject, attachments, showCloseWarning, config, isSending, isSaving, templateTitle]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Capture fází odchycený klik mimo otevřené menu. 
      // Zastaví propagaci a nevznikne žádný následný ghost click.
      let didClose = false;
      if (showTemplateMenu && templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        setShowTemplateMenu(false);
        didClose = true;
      }
      if (showSignatureMenu && signatureMenuRef.current && !signatureMenuRef.current.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        setShowSignatureMenu(false);
        didClose = true;
      }
    };

    if (showTemplateMenu || showSignatureMenu) {
      document.addEventListener('click', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [showTemplateMenu, showSignatureMenu]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => [...prev, {
           name: file.name,
           type: file.type || 'application/octet-stream',
           content: event.target.result // looks like data:image/png;base64,iVBORw0...
        }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset the input value so the same file could be selected again if removed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const buildMimeString = () => {
    let mimeStr = `To: ${encodeHeaderName(to)}\r\n`;
    if (cc) mimeStr += `Cc: ${encodeHeaderName(cc)}\r\n`;
    mimeStr += `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\n`;
    if (config?.rfcMessageId) {
      mimeStr += `In-Reply-To: ${config.rfcMessageId}\r\n`;
      mimeStr += `References: ${config.rfcMessageId}\r\n`;
    }

    const boundMix = '====mixed_boundary_xyz_123====';
    const boundRel = '====related_boundary_rel_789====';
    const boundAlt = '====alt_boundary_abc_456====';

    // Zpracování Base64 obrázků vložených napřímo do HTML (např. skrze RichTextEditor)
    let processedHtmlBody = `<div dir="ltr">${bodyRef.current}</div>`;
    const inlineImages = [];
    let imgCounter = 0;

    processedHtmlBody = processedHtmlBody.replace(/<img[^>]+src="data:(image\/[^;]+);base64,([^"]+)"[^>]*>/gi, (match, mimeType, base64Data) => {
      imgCounter++;
      const cid = `inline_img_${Date.now()}_${imgCounter}@zazijvr`;
      
      inlineImages.push({ cid, mimeType, base64Data });

      return match.replace(/src="data:image\/[^;]+;base64,[^"]+"/, `src="cid:${cid}"`);
    });

    // Textová verze pro klienty bez HTML – z aktuálního obsahu editoru (bez citace původní zprávy)
    const htmlForText = bodyRef.current
      .replace(/<div class="gmail_quote"[\s\S]*$/i, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n');
    const strippedBody = (new DOMParser().parseFromString(htmlForText, 'text/html').body.textContent || '')
      .replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const plainTextBody = strippedBody + (config?.htmlBody ? '\n\n[Původní zpráva je níže]' : '');

    const hasAttachments = attachments.length > 0;
    const hasInline = inlineImages.length > 0;

    const getAltBlock = () => {
      let b = `Content-Type: multipart/alternative; boundary="${boundAlt}"\r\n\r\n`;
      b += `--${boundAlt}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${plainTextBody}\r\n\r\n`;
      b += `--${boundAlt}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${processedHtmlBody}\r\n\r\n`;
      b += `--${boundAlt}--\r\n`;
      return b;
    };

    const getRelBlock = () => {
      if (!hasInline) return getAltBlock();
      let b = `Content-Type: multipart/related; boundary="${boundRel}"\r\n\r\n`;
      b += `--${boundRel}\r\n`;
      b += getAltBlock() + '\r\n'; // AltBlock končí CRLF
      
      inlineImages.forEach(img => {
         b += `--${boundRel}\r\n`;
         b += `Content-Type: ${img.mimeType}; name="${img.cid}"\r\n`;
         b += `Content-ID: <${img.cid}>\r\n`;
         b += `Content-Disposition: inline; filename="${img.cid}"\r\n`;
         b += `Content-Transfer-Encoding: base64\r\n\r\n`;
         const lines = img.base64Data.match(/.{1,76}/g) || [];
         b += lines.join('\r\n') + '\r\n\r\n';
      });
      b += `--${boundRel}--\r\n`;
      return b;
    };

    if (hasAttachments) {
      mimeStr += `Content-Type: multipart/mixed; boundary="${boundMix}"\r\n\r\n`;
      mimeStr += `--${boundMix}\r\n`;
      mimeStr += getRelBlock() + '\r\n';

      attachments.forEach(att => {
        mimeStr += `--${boundMix}\r\n`;
        mimeStr += `Content-Type: ${att.type}; name="${att.name}"\r\n`;
        mimeStr += `Content-Disposition: attachment; filename="${att.name}"\r\n`;
        mimeStr += `Content-Transfer-Encoding: base64\r\n\r\n`;
        const base64Data = att.content.split(',')[1];
        if (base64Data) {
           const lines = base64Data.match(/.{1,76}/g) || [];
           mimeStr += lines.join('\r\n') + '\r\n\r\n';
        }
      });
      mimeStr += `--${boundMix}--\r\n`;
    } else {
      mimeStr += getRelBlock();
    }

    return mimeStr;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const mimeStr = buildMimeString();
      const raw = encodeBase64Url(mimeStr);
      
      let url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
      let method = 'POST';
      let requestBody = { message: { raw } };
      if (config?.threadId) {
        requestBody.message.threadId = config.threadId;
      }
      
      if (draftId) {
        url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} - ${errText}`);
      }
      
      const data = await res.json();
      if (!draftId && data.id) {
        setDraftId(data.id);
      }
      
      if (onSuccessAction) {
        onSuccessAction('draft', { draftId: data.id || draftId });
      }
      
      onClose && onClose();
      
    } catch (err) {
      console.error("Chyba při ukládání draftu:", err);
      setErrorMsg(`Chyba při ukládání: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!to || !subject) {
      setErrorMsg('Nevyplněna adresa příjemce nebo předmět.');
      return;
    }
    setIsSending(true);
    setErrorMsg(null);
    try {
      if (userEmail) {
         saveNewContacts(userEmail, [to, cc]);
      }

      const mimeStr = buildMimeString();
      const raw = encodeBase64Url(mimeStr);

      const requestBody = { raw };
      if (config?.threadId) {
        requestBody.threadId = config.threadId;
      }

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} - ${errText}`);
      }

      if (draftId) {
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${googleToken}` }
        });
      }

      const sentData = await res.json();
      
      const threadIdOut = sentData.threadId || config?.threadId;

      // ---- CLOUD SYNC: Označit originální THREAD tajným štítkem VR-Replied -----
      // Abysme neaplikovali štítek na úplně první odeslanou zprávu, která není odpovědí
      if (config?.type === 'reply' || config?.type === 'replyAll') {
        const repliedLabelId = localStorage.getItem('vr-replied-label-id');
        if (repliedLabelId && threadIdOut) {
           try {
              await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadIdOut}/modify`, {
                 method: 'POST',
                 headers: {
                    'Authorization': `Bearer ${googleToken}`,
                    'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({
                    addLabelIds: [repliedLabelId]
                 })
              });
              console.log("Thread označen cloud sync štítkem VR-Replied.");
           } catch(e) {
              console.error("Cloud Sync Reply Label Failed", e);
           }
        }
      }
      // -------------------------------------------------------------------------

      // Vypreparování jednoduchého snippetu (čistého textu) bez HTML
      const snippet = bodyRef.current ? bodyRef.current.replace(/<[^>]*>?/gm, ' ').substring(0, 150).trim() : '';

      window.dispatchEvent(new CustomEvent('vr-email-sent-reply', {
        detail: {
          threadId: threadIdOut,
          messageId: sentData.id,
          snippet: snippet
        }
      }));

      if (onSuccessAction && config?.draftMessageId) {
        onSuccessAction('send', { draftMessageId: config.draftMessageId });
      }

      onClose && onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(`Chyba při odesílání: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTemplate = () => {
    if (!templateTitle.trim()) {
      setErrorMsg('Není zadán název šablony pro menu.');
      return;
    }
    if (onSuccessAction) {
      onSuccessAction('save_template', {
        id: config?.templateData?.id || Date.now().toString(),
        title: templateTitle,
        subject: subject,
        body: bodyRef.current
      });
    }
    onClose && onClose();
  };

  return (
    <div ref={modalRef} className="fixed inset-0 bg-[#061026] z-[99999] flex items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 lg:p-10">
      <div className="bg-[#061026] sm:border-[2px] border-[#00f3ff]/40 sm:rounded-3xl w-full sm:w-[98vw] max-w-[1800px] h-full sm:h-[95vh] flex flex-col relative overflow-hidden transform-gpu">
        
        {/* Dekorační linky nahoře */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00f3ff] to-transparent opacity-50"></div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1/4 h-0.5 bg-[#00f3ff] shadow-[0_0_10px_#00f3ff]"></div>

        <div className="flex justify-between items-center p-6 border-b border-[#00f3ff]/10 bg-[#0a1630]">
          <h2 className="text-2xl font-black tracking-[0.2em] text-white flex items-center gap-3">
            <img src="/vr_drafts.svg" className="w-8 h-8 object-contain" alt="VR Mascot" draggable="false" />
            {config?.type === 'template' ? 'EDITOR ŠABLONY' : config?.type === 'reply' || config?.type === 'replyAll' ? 'ODPOVĚĎ' : config?.type === 'forward' ? 'PŘEPOSLÁNÍ' : 'NOVÁ ZPRÁVA'}
          </h2>
          <button
            onClick={handleAttemptClose}
            className="p-2 bg-white/5 hover:bg-[#ef4444]/20 text-slate-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden border-b border-[#00f3ff]/10">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col gap-4 bg-[#061026]">
            {errorMsg && (
              <div className="p-4 bg-[#ef4444]/10 border border-[#ef4444]/40 rounded-xl text-[#ef4444] flex items-center gap-3 font-semibold">
                <AlertTriangle className="shrink-0" />
                {errorMsg}
              </div>
            )}
  
            {config?.type === 'template' && (
              <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] text-[#00f3ff] uppercase tracking-widest font-bold ml-1 opacity-70">Název šablony (pro zobrazení v menu)</label>
                <input 
                  type="text" 
                  value={templateTitle} 
                  onChange={e => setTemplateTitle(e.target.value)}
                  placeholder="Např. Formální pozvánka"
                  className="w-full bg-[#061026]/50 border border-[#f72585]/60 shadow-[0_0_10px_rgba(247,37,133,0.1)] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#f72585] focus:shadow-[0_0_15px_rgba(247,37,133,0.3)] focus:bg-[#061026] transition-all font-bold"
                />
              </div>
            )}

            {config?.type !== 'template' && (
              <div className="flex flex-col gap-4">
                <div className="relative w-full">
                  <AutofillInput 
                    label="Komu"
                    value={to} 
                    onChange={e => setTo(e.target.value)}
                    userEmail={userEmail}
                    className="w-full bg-[#061026]/50 border border-[#00f3ff]/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00f3ff]/60 focus:bg-[#061026] font-mono"
                    headerRight={
                      <>
                        {config?.type === 'reply' && !hasUpgradedToReplyAll && (config?.originalCc || config?.originalTo) && (
                          <button 
                            onClick={(e) => { e.preventDefault(); handleUpgradeToReplyAll(); }}
                            className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-[#00f3ff]/60 hover:text-yellow-400 p-0.5 transition-colors uppercase font-bold tracking-widest"
                            title="Odpovědět všem"
                          >
                            <ReplyAll size={12} /> <span className="hidden sm:inline">VŠEM</span>
                          </button>
                        )}
                        {!showCc && (
                          <button 
                            onClick={(e) => { e.preventDefault(); setShowCc(true); }}
                            className="text-[9px] sm:text-[10px] uppercase font-bold text-[#00f3ff]/60 hover:text-[#00f3ff] px-1.5 py-0.5 bg-[#061026]/80 border border-[#00f3ff]/20 rounded transition-colors tracking-widest"
                            title="Přidat Kopii (CC)"
                          >
                            + CC
                          </button>
                        )}
                      </>
                    }
                  />
                </div>
      
                {showCc && (
                  <AutofillInput 
                    label="Kopie (CC)"
                    value={cc} 
                    onChange={e => setCc(e.target.value)}
                    userEmail={userEmail}
                    className="w-full bg-[#061026]/50 border border-[#00f3ff]/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00f3ff]/60 focus:bg-[#061026] font-mono"
                  />
                )}
              </div>
            )}
  
            <div className="flex flex-col gap-2 relative">
              <label className="text-[10px] text-[#00f3ff] uppercase tracking-widest font-bold ml-1 opacity-70">Předmět</label>
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-[#061026]/50 border border-[#00f3ff]/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00f3ff]/60 focus:bg-[#061026]  transition-all font-bold tracking-wide"
              />
            </div>
  
            <div className="flex flex-col gap-2 relative flex-1 min-h-[250px] lg:min-h-[350px]">
              <label className="text-[10px] text-[#00f3ff] uppercase tracking-widest font-bold ml-1 opacity-70">Zpráva</label>
              <div className="relative w-full h-full flex-1 flex flex-col">
                <RichTextEditor
                   key={bodyVersion}
                   value={body}
                   onChange={handleBodyChange}
                   placeholder="Napište svou zprávu..."
                   className="flex-1 w-full absolute inset-0 bg-[#061026]/50 border-[#00f3ff]/20 "
                />
              </div>
            </div>
            
            
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-[#0a1630] flex flex-col gap-4 shrink-0 border-t border-[#00f3ff]/10 z-10 relative">
          
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 w-full">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[#00f3ff]/10 border border-[#00f3ff]/40 rounded-lg px-3 py-1.5 shadow-[0_0_10px_rgba(0,243,255,0.1)] transition-all">
                   <File size={14} className="text-[#00f3ff]" />
                   <span className="text-white text-xs font-mono max-w-[200px] truncate">{att.name}</span>
                   <button onClick={() => removeAttachment(idx)} className="ml-1 text-[#ef4444] hover:text-white transition-colors" title="Odebrat přílohu">
                      <Trash2 size={14} />
                   </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto relative">
            <button
               onClick={() => fileInputRef.current?.click()}
               className="group flex items-center justify-center gap-2 px-4 py-2 bg-transparent border border-slate-600 hover:border-[#00f3ff]/80 rounded-xl text-slate-400 hover:text-[#00f3ff] transition-all"
               title="Příloha"
            >
               <Paperclip size={18} className="group-hover:scale-110 transition-transform" />
               <span className="hidden sm:block text-sm font-semibold tracking-wide">PŘÍLOHA</span>
            </button>
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />

            <div className="relative" ref={templateMenuRef}>
              <button
                 onClick={() => {setShowTemplateMenu(!showTemplateMenu); setShowSignatureMenu(false);}}
                 className="group flex items-center justify-center gap-2 px-4 py-2 bg-transparent border border-slate-600 hover:border-[#00f3ff]/80 rounded-xl text-slate-400 hover:text-[#00f3ff] transition-all"
                 title="Šablony"
              >
                 <FileText size={18} className="group-hover:scale-110 transition-transform" />
              </button>
              {showTemplateMenu && (
                 <div className="absolute bottom-[calc(100%+0.5rem)] left-0 w-56 bg-[#020817]/90 border border-[#00f3ff]/40 rounded-xl shadow-[0_0_30px_rgba(0,243,255,0.3)] overflow-hidden z-[100] ">
                   <div className="p-2 border-b border-[#00f3ff]/[0.15] text-[10px] uppercase font-bold text-[#00f3ff]/70 tracking-widest text-center bg-[#00f3ff]/5">Vybrat Šablonu</div>
                   <button 
                     onClick={(e) => { e.preventDefault(); handleSaveCurrentAsTemplate(); }}
                     className="w-full px-3 py-2.5 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 text-[#00f3ff] font-bold text-xs flex items-center justify-center gap-2 border-b border-[#00f3ff]/20 transition-colors"
                   >
                     <Save size={14} /> ULOŽIT JAKO ŠABLONU
                   </button>
                   {savedTemplates.length === 0 ? (
                     <div className="p-4 text-xs text-slate-500 text-center font-semibold">Zatím nemáte žádné šablony.</div>
                   ) : (
                     <div className="max-h-48 overflow-y-auto custom-scrollbar">
                       {savedTemplates.map(t => (
                         <div 
                           key={t.id} 
                           onClick={() => {
                             if (t.subject) setSubject(t.subject);
                             replaceBody(t.body);
                             setShowTemplateMenu(false);
                           }}
                           className="p-3 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-white cursor-pointer transition-colors border-b border-[#00f3ff]/10 last:border-0 truncate text-sm"
                         >
                           {t.title}
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
              )}
            </div>

            <div className="relative" ref={signatureMenuRef}>
              <button
                 onClick={() => {setShowSignatureMenu(!showSignatureMenu); setShowTemplateMenu(false);}}
                 className="group flex items-center justify-center gap-2 px-4 py-2 bg-transparent border border-slate-600 hover:border-[#00f3ff]/80 rounded-xl text-slate-400 hover:text-[#00f3ff] transition-all"
                 title="Podpisy"
              >
                 <PenTool size={18} className="group-hover:scale-110 transition-transform" />
              </button>
              {showSignatureMenu && (
                 <div className="absolute bottom-[calc(100%+0.5rem)] left-0 w-56 bg-[#020817]/90 border border-[#00f3ff]/40 rounded-xl shadow-[0_0_30px_rgba(0,243,255,0.3)] overflow-hidden z-[100] ">
                   <div className="p-2 border-b border-[#00f3ff]/[0.15] text-[10px] uppercase font-bold text-[#00f3ff]/70 tracking-widest text-center bg-[#00f3ff]/5">Vložit Podpis</div>
                   {savedSignatures.length === 0 ? (
                     <div className="p-4 text-xs text-slate-500 text-center font-semibold">Zatím nemáte žádné podpisy.</div>
                   ) : (
                     <div className="max-h-48 overflow-y-auto custom-scrollbar">
                       {savedSignatures.map(s => (
                         <div 
                           key={s.id} 
                           onClick={() => {
                             // Podpis se přidá k tomu, co je teď v editoru (ne k počátečnímu obsahu)
                             const prev = bodyRef.current || '';
                             replaceBody(prev + (prev ? '<br><br>' : '') + s.body);
                             setShowSignatureMenu(false);
                           }}
                           className="p-3 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-white cursor-pointer transition-colors border-b border-[#00f3ff]/10 last:border-0 text-sm"
                         >
                           <div className="font-bold truncate">{s.title}</div>
                           <div className="text-[10px] text-slate-500 truncate mt-0.5">{s.body.replace(/<[^>]+>/g, '').substring(0, 30)}...</div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
              )}
            </div>
          </div>

          <div className="flex flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            {config?.type === 'template' ? (
              <button 
                onClick={handleSaveTemplate}
                disabled={!templateTitle.trim()}
                className="group flex-1 sm:w-64 flex flex-col items-center justify-center p-1 relative overflow-hidden rounded-xl border border-[#00f3ff]/50 hover:border-[#00f3ff]/80 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#00f3ff]/10 to-[#00f3ff]/10 group-hover:from-[#00f3ff]/30 group-hover:to-[#00f3ff]/30 transition-all duration-300"></div>
                <div className="relative z-10 w-full h-full bg-[#061026] rounded-lg py-3 flex items-center justify-center gap-2 sm:gap-3 shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all">
                   <Save size={18} className="text-[#00f3ff] group-hover:scale-110 transition-transform" />
                   <span className="font-black tracking-[0.1em] text-[#00f3ff] text-xs sm:text-sm group-hover:text-white transition-colors">ULOŽIT ŠABLONU</span>
                </div>
              </button>
            ) : (
              <>
                <button 
                  onClick={handleSaveDraft}
                  disabled={isSaving || isSending}
                  className="group flex-1 sm:w-48 flex flex-col items-center justify-center p-1 relative overflow-hidden rounded-xl border border-[#00f3ff]/[0.15] hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-transparent group-hover:bg-white/5 transition-all duration-300"></div>
                  <div className="relative z-10 w-full h-full bg-[#061026] rounded-lg py-3 px-2 flex items-center justify-center gap-2 transition-all">
                     {isSaving ? (
                        <div className="w-5 h-5 rounded-full border-[2px] border-slate-500 border-t-gray-300 animate-spin"></div>
                     ) : (
                        <Save size={18} className="text-slate-500 group-hover:scale-110 transition-transform" />
                     )}
                     <span className="font-black tracking-widest text-slate-500 text-xs sm:text-sm group-hover:text-slate-300 transition-colors">
                       {isSaving ? 'UKLÁDÁM' : 'ULOŽIT'}
                     </span>
                  </div>
                </button>
    
                <button 
                  onClick={handleSend}
                  disabled={isSending || isSaving}
                  className="group flex-1 sm:w-64 flex flex-col items-center justify-center p-1 relative overflow-hidden rounded-xl border border-[#00f3ff]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00f3ff]/10 to-[#00f3ff]/10 group-hover:from-[#00f3ff]/30 group-hover:to-[#00f3ff]/30 transition-all duration-300"></div>
                  <div className="relative z-10 w-full h-full bg-[#061026] rounded-lg py-3 px-2 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,243,255,0.2)] group-hover:shadow-[0_0_25px_rgba(0,243,255,0.5)] transition-all">
                     {isSending ? (
                        <div className="w-5 h-5 rounded-full border-[2px] border-[#00f3ff]/30 border-t-[#00f3ff] animate-spin"></div>
                     ) : (
                        <Send size={18} className="text-[#00f3ff] group-hover:scale-110 transition-transform" />
                     )}
                     <span className="font-black tracking-widest text-[#00f3ff] text-xs sm:text-sm group-hover:text-white transition-colors">
                       {isSending ? 'ODESÍLÁM' : 'ODESLAT'}
                     </span>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      </div>
        {showCloseWarning && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#020817]/60 backdrop-blur-sm p-4">
          <div className="bg-[#061026] border border-[#00f3ff]/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(0,243,255,0.2)] max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white tracking-wide mb-2">Zahodit rozepsanou zprávu?</h3>
            <p className="text-slate-400 text-sm mb-6">Máte neuložené změny. Opravdu chcete okno zavřít a změny zahodit?</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowCloseWarning(false)}
                className="px-4 py-2 bg-transparent text-slate-300 font-bold rounded-xl hover:bg-white/5 transition-colors border border-[#00f3ff]/[0.15]"
              >
                Zpět k úpravám
              </button>
              <button 
                onClick={() => onClose && onClose()}
                className="px-4 py-2 bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-500/50 font-bold rounded-xl transition-all"
              >
                Zahodit
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateNamePrompt && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#020817]/60 backdrop-blur-sm p-4">
          <div className="bg-[#061026] border border-[#00f3ff]/50 p-6 rounded-2xl shadow-[0_0_30px_rgba(0,243,255,0.2)] max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white tracking-wide mb-2">Nová Šablona</h3>
            <p className="text-slate-400 text-sm mb-4">Zadejte název, pod kterým se má tento e-mail uložit do rychlých šablon.</p>
            <input 
              type="text" 
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => { 
                if (e.key === 'Enter') confirmSaveCurrentAsTemplate(); 
                if (e.key === 'Escape') setShowTemplateNamePrompt(false);
              }}
              placeholder="Např. Reakce na projekt..."
              className="w-full bg-[#061026] border border-[#00f3ff]/40 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-[#00f3ff] focus:shadow-[0_0_15px_rgba(0,243,255,0.2)] transition-all mb-6 font-bold"
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowTemplateNamePrompt(false)}
                className="px-4 py-2 bg-transparent text-slate-300 font-bold rounded-xl hover:bg-white/5 transition-colors border border-[#00f3ff]/[0.15]"
              >
                Zrušit
              </button>
              <button 
                onClick={confirmSaveCurrentAsTemplate}
                disabled={!newTemplateName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#00f3ff]/20 text-[#00f3ff] hover:bg-[#00f3ff]/30 hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] border border-[#00f3ff]/50 font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} /> Uložit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailComposer;
