import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EmailList from '../../components/EmailList';
import EmailDetail from '../../components/EmailDetail';
import EmailComposer from '../../components/EmailComposer';
import { Mail, Inbox, Send, FileEdit, Flag, AlertOctagon, Trash2 } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';

const getFolderIcon = (folder) => {
  const commonClasses = "w-14 h-14 md:w-16 md:h-16 object-contain filter drop-shadow-[0_0_15px_rgba(0,243,255,0.8)]";
  switch (folder) {
    case 'Doručené': return <img src="/vr_inbox_trans.png" className={commonClasses} alt="Doručené" draggable="false" />;
    case 'Odeslané': return <img src="/vr_sent_trans.png" className={commonClasses} alt="Odeslané" draggable="false" />;
    case 'Rozepsané': return <img src="/vr_drafts_trans.png" className={commonClasses} alt="Rozepsané" draggable="false" />;
    case 'Spam': return <img src="/vr_spam_trans.png" className={commonClasses} alt="Spam" draggable="false" />;
    case 'Koš': return <img src="/vr_trash_trans.png" className={commonClasses} alt="Koš" draggable="false" />;
    case 'Důležité': return <img src="/vr_important_trans.png" className={commonClasses} alt="Důležité" draggable="false" />;
    default: return <img src="/vr_inbox_trans.png" className={commonClasses} alt={folder} draggable="false" />;
  }
};

export default function EmailApp({ googleToken, activeFolder, unreadCounts, setUnreadCounts, triggerCompose, triggerMove, loginWithGoogle, isVerticalLayout, customLabels, userEmail }) {
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [modalEmailId, setModalEmailId] = useState(null);
  const [autoResumeDraftId, setAutoResumeDraftId] = useState(null);
  const [composerConfig, setComposerConfig] = useState(null);
  const { showAlert } = useAlert();
  
  const [trashedEmails, setTrashedEmails] = useState([]);
  const [spamEmails, setSpamEmails] = useState([]);
  const [hiddenEmailIds, setHiddenEmailIds] = useState([]);
  const [optimisticMoves, setOptimisticMoves] = useState([]);
  const [refreshTriggerList, setRefreshTriggerList] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('attachment-preview-modal')) return;
        if (modalEmailId) {
          setModalEmailId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalEmailId, composerConfig]);

  const lastTriggerRef = React.useRef(triggerCompose);

  useEffect(() => {
    if (triggerCompose > lastTriggerRef.current) {
      setComposerConfig({ type: 'new' });
      lastTriggerRef.current = triggerCompose;
    }
  }, [triggerCompose]);

  useEffect(() => {
    if (triggerMove && Array.isArray(triggerMove.moves)) {
      triggerMove.moves.forEach(move => {
        handleMoveEmail(move.id, move.sourceLabel, move.targetLabel, move.fullObj);
      });
    } else if (triggerMove && triggerMove.id) {
      handleMoveEmail(triggerMove.id, triggerMove.source, triggerMove.target, triggerMove.fullObj);
    }
  }, [triggerMove]);

  const handleMoveEmail = async (emailId, sourceLabel, targetLabel, fullEmailObj) => {
    if (!googleToken) return;
    setHiddenEmailIds(prev => {
      if (prev.includes(emailId)) return prev;
      return [...prev, emailId];
    });
    
    if (fullEmailObj) {
      setOptimisticMoves(prev => {
        const filtered = prev.filter(m => m.id !== emailId);
        return [...filtered, { ...fullEmailObj, targetFolder: targetLabel }];
      });
    }

    const folderMapping = {
      'Doručené': 'INBOX',
      'Odeslané': 'SENT',
      'Důležité': 'STARRED',
      'Rozepsané': 'DRAFT',
      'Spam': 'SPAM',
      'Koš': 'TRASH'
    };

    const getLabelId = (labelName) => {
      if (folderMapping[labelName]) return folderMapping[labelName];
      const custom = customLabels?.find(l => l.name === labelName);
      return custom ? custom.id : null;
    };

    const sourceId = getLabelId(sourceLabel);
    const targetId = getLabelId(targetLabel);

    if (!sourceId || !targetId) return;

    const targetIdMethod = fullEmailObj?.threadId || emailId;

    try {
      if (sourceId === 'TRASH') {
        setTrashedEmails(prev => prev.filter(t => t.id !== emailId));
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/untrash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}` }
        });
      } else if (targetId === 'TRASH') {
        setTrashedEmails(prev => {
          const filtered = prev.filter(t => t.id !== emailId);
          return [...filtered, { ...(fullEmailObj || {id: emailId}), trashedFrom: sourceLabel }];
        });
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/trash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        return; 
      }

      // Add/Remove labels as needed
      if (targetId !== 'TRASH') {
        const removeLabels = sourceId !== 'TRASH' ? [sourceId] : [];
        const addLabels = [targetId];

        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: removeLabels, addLabelIds: addLabels })
        });
      }
    } catch (e) {
      console.error("Selhal přesun e-mailu GMail API:", e);
    }
  };

  const handleGlobalTrash = async (emailObj) => {
    let emailData = typeof emailObj === 'string' ? { id: emailObj, subject: '(Bez specifikace)', from: '', sizeText: '', dateText: '' } : emailObj;
    
    if (!emailData.threadId && typeof emailObj === 'string') {
      try {
        const fetchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}?fields=threadId`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const threadData = await fetchRes.json();
        if (threadData.threadId) emailData.threadId = threadData.threadId;
      } catch (err) { console.warn("Fallback thread id fetch error: ", err); }
    }

    setTrashedEmails(prev => {
      const filtered = prev.filter(t => t.id !== emailData.id);
      return [...filtered, { ...emailData, trashedFrom: activeFolder }];
    });
    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);

    try {
      let res;
      const targetIdMethod = emailData.threadId || emailData.id;
      if (activeFolder === 'Koš') {
        res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${googleToken}` }
        });
      } else {
        res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/trash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}` }
        });
      }
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      console.error("Chyba z API: ", err);
      setTrashedEmails(prev => prev.filter(t => t.id !== emailData.id));
      showAlert(`Chyba při mazání e-mailu:\n${err.message}`, null, 'error');
    }
  };

  const handleGlobalRestore = async (emailObj) => {
    let emailData = typeof emailObj === 'string' ? { id: emailObj, subject: '(Bez specifikace)', from: '', sizeText: '', dateText: '' } : emailObj;

    if (!emailData.threadId && typeof emailObj === 'string') {
      try {
        const fetchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}?fields=threadId`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const threadData = await fetchRes.json();
        if (threadData.threadId) emailData.threadId = threadData.threadId;
      } catch (err) { console.warn("Fallback query failed: ", err); }
    }

    setTrashedEmails(prev => prev.filter(t => t.id !== emailData.id));

    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);

    try {
      const targetIdMethod = emailData.threadId || emailData.id;
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/untrash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      if (!res.ok) throw new Error(`${res.status}`);

      // Go the extra mile and force it back into INBOX so it is never lost in pure Archive
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/modify`, {
         method: 'POST',
         headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({ addLabelIds: ['INBOX'] })
      });
    } catch (err) {
      console.error("Chyba z API: ", err);
      setHiddenEmailIds(prev => prev.filter(t => t !== emailData.id));
      showAlert(`Nelze obnovit:\n${err.message}`, null, 'error');
    }
  };

  const handleGlobalSpam = async (emailObj) => {
    let emailData = typeof emailObj === 'string' ? { id: emailObj, subject: '(Bez specifikace)', from: '', sizeText: '', dateText: '' } : emailObj;
    
    if (!emailData.threadId && typeof emailObj === 'string') {
      try {
        const fetchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.id}?fields=threadId`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const threadData = await fetchRes.json();
        if (threadData.threadId) emailData.threadId = threadData.threadId;
      } catch (err) { console.warn("Fallback thread id fetch error: ", err); }
    }

    setSpamEmails(prev => {
      const filtered = prev.filter(t => t.id !== emailData.id);
      return [...filtered, { ...emailData, spammedFrom: activeFolder }];
    });
    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);

    try {
      const targetIdMethod = emailData.threadId || emailData.id;
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${targetIdMethod}/modify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] })
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      console.error("Chyba při označování spamu: ", err);
      setSpamEmails(prev => prev.filter(t => t.id !== emailData.id));
      showAlert(`Nepodařilo se označit jako SPAM: ${err.message}`, null, 'error');
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {googleToken && (
        <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 p-8 border-none bg-black/30 backdrop-blur-md relative z-[100] overflow-visible">
          
          {/* Synchronizovaná horní neonová linka (Úplně stejná jako u EmailDetail) */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>

          {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
          <div className="absolute right-0 top-0 h-[114px] w-[400px] overflow-hidden pointer-events-none opacity-50 z-[5]">
               <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <defs>
                   <filter id="headerRightGlowSVG" x="-20%" y="-20%" width="140%" height="140%">
                     <feGaussianBlur stdDeviation="3" result="blur1" />
                     <feGaussianBlur stdDeviation="6" result="blur2" />
                     <feMerge>
                         <feMergeNode in="blur2" />
                         <feMergeNode in="blur1" />
                         <feMergeNode in="SourceGraphic" />
                     </feMerge>
                   </filter>
                 </defs>
                 <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#00f3ff" strokeWidth="2" filter="url(#headerRightGlowSVG)" />
                 <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVG)" />
                 <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#f800ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#headerRightGlowSVG)" />
                 <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#00f3ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#headerRightGlowSVG)" />
                 <circle cx="80" cy="40" r="4" fill="#0f172a" stroke="#00f3ff" strokeWidth="1.5" filter="url(#headerRightGlowSVG)" />
                 <circle cx="200" cy="80" r="3" fill="#00f3ff" filter="url(#headerRightGlowSVG)" />
                 <circle cx="35" cy="15" r="3" fill="#f800ff" filter="url(#headerRightGlowSVG)" />
                 <circle cx="220" cy="50" r="5" fill="#0f172a" stroke="#f800ff" strokeWidth="1.5" filter="url(#headerRightGlowSVG)" />
                 <circle cx="130" cy="100" r="2" fill="#00f3ff" filter="url(#headerRightGlowSVG)" />
               </svg>
          </div>

          <div className="flex items-center gap-6 relative z-10">
            <div className="p-2 md:p-3 rounded-2xl bg-[#00f3ff]/10 border-2 border-[#00f3ff]/40 shadow-[0_0_25px_rgba(0,243,255,0.4)] transition-all">
              {getFolderIcon(activeFolder)}
            </div>
            <div className="flex flex-col justify-center relative mt-1 select-none">
              <div className="flex items-center gap-3 ml-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#f800ff] shadow-[0_0_8px_rgba(248,0,255,0.8)]"></div>
                <span className="text-[#00f3ff] text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                  System // Directory // 0xE9
                </span>
              </div>
              <div className="flex flex-row items-baseline">
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                <h1 className="text-4xl md:text-5xl font-black text-[#00f3ff] tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal">
                  {activeFolder}
                </h1>
                <span className="text-[#00f3ff] text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
              </div>
            </div>
          </div>
          {/* Aplikace neonové lajny zespodu hlavní hlavičky složek - Synchronizováno s Emailem */}
          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#00f3ff] via-[#00f3ff]/50 to-[#00f3ff]/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>
        </div>
      )}

      <div className={`flex-1 flex overflow-hidden ${isVerticalLayout ? 'flex-col' : 'flex-row'}`}>
        {!googleToken ? (
           <div className="flex-1 flex w-full h-full flex-col">
             <EmailList googleToken={googleToken} loginWithGoogle={loginWithGoogle} />
           </div>
        ) : (
           <>
              <div className={`flex-1 overflow-hidden relative z-0 ${selectedEmailId ? 'hidden md:flex' : 'flex'} flex-col ${isVerticalLayout ? 'md:max-h-[50%] md:min-h-[50%] border-b border-[#00f3ff]/10' : 'md:max-w-[50%] md:min-w-[50%] border-r border-[#00f3ff]/10'}`}>
                <div className="hidden md:block absolute left-0 bottom-0 h-[114px] w-[144px] overflow-hidden z-[0] pointer-events-none opacity-40 blur-[3px]">
                   <div className="absolute left-[-256px] bottom-0 h-[114px] w-[400px] rotate-180">
                     <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <defs>
                         <filter id="bottomLeftMiniGlowBlurred" x="-20%" y="-20%" width="140%" height="140%">
                           <feGaussianBlur stdDeviation="3" result="blur1" />
                           <feGaussianBlur stdDeviation="8" result="blur2" />
                           <feMerge>
                               <feMergeNode in="blur2" />
                               <feMergeNode in="blur1" />
                               <feMergeNode in="SourceGraphic" />
                           </feMerge>
                         </filter>
                       </defs>
                       <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#00f3ff" strokeWidth="2" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#f800ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#00f3ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <circle cx="80" cy="40" r="4" fill="#0f172a" stroke="#00f3ff" strokeWidth="1.5" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <circle cx="200" cy="80" r="3" fill="#00f3ff" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <circle cx="35" cy="15" r="3" fill="#f800ff" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <circle cx="220" cy="50" r="5" fill="#0f172a" stroke="#f800ff" strokeWidth="1.5" filter="url(#bottomLeftMiniGlowBlurred)" />
                       <circle cx="130" cy="100" r="2" fill="#00f3ff" filter="url(#bottomLeftMiniGlowBlurred)" />
                     </svg>
                   </div>
                </div>

                <EmailList
                  googleToken={googleToken}
                  activeFolder={activeFolder}
                  selectedEmailId={selectedEmailId}
                  setSelectedEmailId={setSelectedEmailId}
                  onExpand={(id) => setModalEmailId(id)}
                  onDraftClick={(id) => setAutoResumeDraftId(id)}
                  trashedEmails={trashedEmails}
                  spamEmails={spamEmails}
                  hiddenEmailIds={hiddenEmailIds}
                  optimisticMoves={optimisticMoves}
                  onTrash={handleGlobalTrash}
                  onRestore={handleGlobalRestore}
                  onSpam={handleGlobalSpam}
                  setUnreadCounts={setUnreadCounts}
                  unreadCounts={unreadCounts}
                  loginWithGoogle={loginWithGoogle}
                  customLabels={customLabels}
                  userEmail={userEmail}
                  refreshTriggerList={refreshTriggerList}
                />
              </div>

              <div className={`flex-1 overflow-hidden relative bg-[#0f172a] z-10 ${selectedEmailId ? 'flex' : 'hidden md:flex'} flex-col ${isVerticalLayout ? 'md:min-h-[50%]' : 'md:min-w-[50%]'}`}>
                {isVerticalLayout ? (
                   <>
                     <div className="hidden md:block absolute left-0 top-0 right-0 h-[10px] bg-gradient-to-b from-[#00f3ff]/5 to-transparent pointer-events-none z-[5]" />
                     <div className="hidden md:block absolute left-0 top-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00f3ff]/30 to-transparent z-[5]" />
                   </>
                ) : (
                   <>
                     <div className="hidden md:block absolute left-0 top-0 bottom-0 w-[10px] bg-gradient-to-r from-[#00f3ff]/5 to-transparent pointer-events-none z-[5]" />
                     <div className="hidden md:block absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[#00f3ff]/30 to-transparent z-[5]" />
                   </>
                )}
                
                {/* Mobilní lišta byla přesunuta do komponenty EmailDetail pro snazší integraci do jednoho řádku */}

                <EmailDetail
                  googleToken={googleToken}
                  isVerticalLayout={isVerticalLayout}
                  selectedEmailId={selectedEmailId}
                  onExpand={selectedEmailId ? () => setModalEmailId(selectedEmailId) : undefined}
                  onTrash={selectedEmailId ? () => handleGlobalTrash(selectedEmailId) : undefined}
                  onRestore={selectedEmailId ? () => handleGlobalRestore(selectedEmailId) : undefined}
                  onSpam={selectedEmailId ? () => handleGlobalSpam(selectedEmailId) : undefined}
                  onMobileBack={() => setSelectedEmailId(null)}
                  onActionReply={(config) => setComposerConfig(config)}
                  autoResumeDraftId={autoResumeDraftId}
                  onDraftResumed={() => setAutoResumeDraftId(null)}
                />
              </div>
           </>
        )}
      </div>

      {modalEmailId && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-8">
          <div className="bg-[#02040a] border-[2px] border-[#00f3ff]/30 shadow-[0_0_50px_-10px_rgba(0,243,255,0.3)] rounded-3xl w-full max-w-[1200px] h-full flex flex-col relative overflow-hidden">
            <EmailDetail
              googleToken={googleToken}
              selectedEmailId={modalEmailId}
              onTrash={modalEmailId ? () => handleGlobalTrash(modalEmailId) : undefined}
              onSpam={modalEmailId ? () => handleGlobalSpam(modalEmailId) : undefined}
              onActionReply={(config) => setComposerConfig(config)}
              onClose={() => setModalEmailId(null)}
            />
          </div>
        </div>,
        document.body
      )}

      {composerConfig && createPortal(
        <EmailComposer
          googleToken={googleToken}
          config={composerConfig}
          onClose={() => setComposerConfig(null)}
          userEmail={userEmail}
          onSuccessAction={(action, meta) => {
            if (action === 'send' && meta.draftMessageId) {
              setHiddenEmailIds(prev => [...prev, meta.draftMessageId]);
              if (selectedEmailId === meta.draftMessageId) setSelectedEmailId(null);
              if (modalEmailId === meta.draftMessageId) setModalEmailId(null);
            }
            setRefreshTriggerList(prev => prev + 1);
          }}
        />,
        document.body
      )}
    </div>
  );
}
