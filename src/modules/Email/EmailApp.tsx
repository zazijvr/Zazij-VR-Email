import { useState, useEffect, useRef, type CSSProperties, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import EmailList from '../../components/EmailList';
import EmailDetail from '../../components/EmailDetail';
import EmailComposer from '../../components/EmailComposer';
import { useAlert } from '../../components/AlertProvider';
import { getMessage } from '../../services/gmail';
import { useMailProvider } from '../../services/mailProvider';
import { useQueryClient } from '@tanstack/react-query';
import type { EmailRef, MoveRequest } from '../../types/email';
import type { GmailLabel } from '../../types/gmail';
import type { UnreadCounts } from '../../types/account';
import type { ComposerConfig, ComposerSuccess } from '../../types/composer';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface EmailAppProps {
  googleToken: string | null;
  activeFolder: string;
  unreadCounts: UnreadCounts;
  setUnreadCounts: Dispatch<SetStateAction<UnreadCounts>>;
  triggerCompose: number;
  triggerMove: { moves: MoveRequest[]; ts: number } | null;
  loginWithGoogle: () => void;
  isVerticalLayout: boolean;
  customLabels: GmailLabel[];
  userEmail?: string;
}

const getFolderIcon = (folder: string) => {
  const commonClasses = "w-14 h-14 md:w-16 md:h-16 object-contain";
  switch (folder) {
    case 'Doručené': return <img src="/vr_inbox.svg" className={commonClasses} alt="Doručené" draggable="false" />;
    case 'Odeslané': return <img src="/vr_sent.svg" className={commonClasses} alt="Odeslané" draggable="false" />;
    case 'Rozepsané': return <img src="/vr_drafts.svg" className={commonClasses} alt="Rozepsané" draggable="false" />;
    case 'Spam': return <img src="/vr_spam.svg" className={commonClasses} alt="Spam" draggable="false" />;
    case 'Koš': return <img src="/vr_trash.svg" className={commonClasses} alt="Koš" draggable="false" />;
    case 'Důležité': return <img src="/vr_important.svg" className={commonClasses} alt="Důležité" draggable="false" />;
    default: return <img src="/vr_inbox.svg" className={commonClasses} alt={folder} draggable="false" />;
  }
};

export default function EmailApp({ googleToken, activeFolder, unreadCounts, setUnreadCounts, triggerCompose, triggerMove, loginWithGoogle, isVerticalLayout, customLabels, userEmail }: EmailAppProps) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const provider = useMailProvider();
  const queryClient = useQueryClient();

  // Poměr panelů seznam / náhled – zvlášť pro vodorovné a svislé rozložení, pamatuje se v localStorage
  const splitKey = isVerticalLayout ? 'vr-split-vertical' : 'vr-split-horizontal';
  const readSplit = (key: string) => {
    try {
      const v = parseFloat(localStorage.getItem(key) ?? '');
      return Number.isFinite(v) && v >= 0.2 && v <= 0.8 ? v : 0.5;
    } catch { return 0.5; }
  };
  const [splitRatio, setSplitRatio] = useState(() => readSplit(splitKey));
  useEffect(() => { setSplitRatio(readSplit(splitKey)); }, [splitKey]);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const startSplitDrag = (e: MouseEvent) => {
    e.preventDefault();
    const box = splitContainerRef.current?.getBoundingClientRect();
    if (!box) return;
    setIsDraggingSplit(true);
    let ratio = splitRatio;
    const onMove = (ev: globalThis.MouseEvent) => {
      const r = isVerticalLayout ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width;
      ratio = Math.min(0.8, Math.max(0.2, r));
      setSplitRatio(ratio);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsDraggingSplit(false);
      try { localStorage.setItem(splitKey, String(ratio)); } catch { /* bez úložiště se jen nezapamatuje */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const resetSplit = () => {
    setSplitRatio(0.5);
    try { localStorage.removeItem(splitKey); } catch { /* nic */ }
  };
  const [modalEmailId, setModalEmailId] = useState<string | null>(null);
  const [autoResumeDraftId, setAutoResumeDraftId] = useState<string | null>(null);

  // Přepnutí účtu – zavřít otevřený e-mail předchozího účtu
  useEffect(() => {
    const reset = () => {
      setSelectedEmailId(null);
      setModalEmailId(null);
      setAutoResumeDraftId(null);
    };
    window.addEventListener('vr-account-switched', reset);
    return () => window.removeEventListener('vr-account-switched', reset);
  }, []);
  const [composerConfig, setComposerConfig] = useState<ComposerConfig | null>(null);
  const { showAlert } = useAlert();

  const [trashedEmails, setTrashedEmails] = useState<(EmailRef & { trashedFrom: string })[]>([]);
  const [spamEmails, setSpamEmails] = useState<(EmailRef & { spammedFrom: string })[]>([]);
  const [hiddenEmailIds, setHiddenEmailIds] = useState<string[]>([]);
  const [optimisticMoves, setOptimisticMoves] = useState<(EmailRef & { targetFolder: string })[]>([]);
  const [refreshTriggerList, setRefreshTriggerList] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.getElementById('attachment-preview-modal')) return;
        // Escape v okně pro psaní řeší okno samo – nesmí zavřít i otevřený mail pod ním
        if (composerConfig) return;
        if (modalEmailId) {
          setModalEmailId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalEmailId, composerConfig]);

  const lastTriggerRef = useRef(triggerCompose);

  useEffect(() => {
    if (triggerCompose > lastTriggerRef.current) {
      setComposerConfig({ type: 'new' });
      lastTriggerRef.current = triggerCompose;
    }
  }, [triggerCompose]);

  useEffect(() => {
    triggerMove?.moves.forEach((move) => {
      handleMoveEmail(move.id, move.sourceLabel, move.targetLabel, move.fullObj);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerMove]);

  /** Doplní id vlákna, když z UI přišlo jen id zprávy (jen Gmail – u IMAPu je id zprávy zároveň vláknem) */
  const resolveEmail = async (emailObj: EmailRef | string): Promise<EmailRef> => {
    const emailData: EmailRef = typeof emailObj === 'string'
      ? { id: emailObj, subject: '(Bez specifikace)', from: '', sizeText: '', dateText: '' }
      : emailObj;
    if (!emailData.threadId && typeof emailObj === 'string' && googleToken && provider?.kind === 'gmail') {
      try {
        emailData.threadId = (await getMessage(googleToken, emailData.id, 'minimal')).threadId;
      } catch (err) {
        console.warn('Nepodařilo se zjistit vlákno e-mailu:', err);
      }
    }
    return emailData;
  };

  /** IMAP: zpráva po přesunu dostane na serveru nové UID – místo optimistických přesunů se seznam znovu načte */
  const refreshImapAfter = async (ids: string[], action: () => Promise<void>, errorPrefix: string) => {
    setHiddenEmailIds((prev) => [...prev.filter((x) => !ids.includes(x)), ...ids]);
    if (ids.includes(selectedEmailId ?? '')) setSelectedEmailId(null);
    if (ids.includes(modalEmailId ?? '')) setModalEmailId(null);
    try {
      await action();
    } catch (err) {
      setHiddenEmailIds((prev) => prev.filter((x) => !ids.includes(x)));
      showAlert(`${errorPrefix}:\n${errorText(err)}`, null, 'error');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['imapFolders'] });
    }
  };

  const handleMoveEmail = async (emailId: string, sourceLabel: string, targetLabel: string, fullEmailObj?: EmailRef) => {
    if (!provider) return;
    const ref: EmailRef = fullEmailObj ?? { id: emailId };
    if (provider.kind === 'imap') {
      await refreshImapAfter([emailId], () => provider.move(ref, sourceLabel, targetLabel), 'Přesun se nepovedl');
      return;
    }
    setHiddenEmailIds((prev) => (prev.includes(emailId) ? prev : [...prev, emailId]));
    if (fullEmailObj) {
      setOptimisticMoves((prev) => [...prev.filter((m) => m.id !== emailId), { ...fullEmailObj, targetFolder: targetLabel }]);
    }
    if (sourceLabel === 'Koš') setTrashedEmails((prev) => prev.filter((t) => t.id !== emailId));
    if (targetLabel === 'Koš') {
      setTrashedEmails((prev) => [...prev.filter((t) => t.id !== emailId), { ...ref, trashedFrom: sourceLabel }]);
    }
    try {
      await provider.move(ref, sourceLabel, targetLabel);
    } catch (e) {
      console.error('Selhal přesun e-mailu:', e);
    }
  };

  const handleGlobalTrash = async (emailObj: EmailRef | string) => {
    if (!provider) return;
    const emailData = await resolveEmail(emailObj);
    // V koši se maže natrvalo, jinde se e-mail jen přesune do koše
    const action = () => (activeFolder === 'Koš' ? provider.deleteForever(emailData, activeFolder) : provider.trash(emailData, activeFolder));
    if (provider.kind === 'imap') {
      await refreshImapAfter([emailData.id], action, 'Chyba při mazání e-mailu');
      return;
    }

    setTrashedEmails((prev) => [...prev.filter((t) => t.id !== emailData.id), { ...emailData, trashedFrom: activeFolder }]);
    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);
    try {
      await action();
    } catch (err) {
      console.error('Chyba z API: ', err);
      setTrashedEmails((prev) => prev.filter((t) => t.id !== emailData.id));
      showAlert(`Chyba při mazání e-mailu:\n${errorText(err)}`, null, 'error');
    }
  };

  const handleGlobalRestore = async (emailObj: EmailRef | string) => {
    if (!provider) return;
    const emailData = await resolveEmail(emailObj);
    if (provider.kind === 'imap') {
      await refreshImapAfter([emailData.id], () => provider.restore(emailData), 'Nelze obnovit');
      return;
    }

    const trashedEntry = trashedEmails.find((t) => t.id === emailData.id);
    setTrashedEmails((prev) => prev.filter((t) => t.id !== emailData.id));
    // E-mail přetažený do koše byl schovaný a „přesunutý“ do Koše – po obnovení patří do Doručených
    setHiddenEmailIds((prev) => prev.filter((t) => t !== emailData.id));
    setOptimisticMoves((prev) => [...prev.filter((m) => m.id !== emailData.id), { ...emailData, targetFolder: 'Doručené' }]);
    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);

    try {
      await provider.restore(emailData);
    } catch (err) {
      console.error('Chyba z API: ', err);
      // Nepovedlo se – e-mail zůstává v koši
      setOptimisticMoves((prev) => prev.filter((m) => m.id !== emailData.id));
      setTrashedEmails((prev) => [...prev.filter((t) => t.id !== emailData.id), trashedEntry ?? { ...emailData, trashedFrom: 'Doručené' }]);
      showAlert(`Nelze obnovit:\n${errorText(err)}`, null, 'error');
    }
  };

  const handleGlobalSpam = async (emailObj: EmailRef | string) => {
    if (!provider) return;
    const emailData = await resolveEmail(emailObj);
    if (provider.kind === 'imap') {
      await refreshImapAfter([emailData.id], () => provider.markSpam(emailData, activeFolder), 'Nepodařilo se označit jako SPAM');
      return;
    }

    setSpamEmails((prev) => [...prev.filter((t) => t.id !== emailData.id), { ...emailData, spammedFrom: activeFolder }]);
    if (selectedEmailId === emailData.id) setSelectedEmailId(null);
    if (modalEmailId === emailData.id) setModalEmailId(null);

    try {
      await provider.markSpam(emailData, activeFolder);
    } catch (err) {
      console.error('Chyba při označování spamu: ', err);
      setSpamEmails((prev) => prev.filter((t) => t.id !== emailData.id));
      showAlert(`Nepodařilo se označit jako SPAM: ${errorText(err)}`, null, 'error');
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {(provider || googleToken) && (
        <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 p-8 border-none bg-navy-card backdrop-blur-md relative z-[100] overflow-visible">

          {/* Synchronizovaná horní neonová linka (Úplně stejná jako u EmailDetail) */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.5)] pointer-events-none z-20"></div>

          {/* Dekorativní kyberpunkové žíly - Efekt vrácený na pravou stranu */}
          {/* Neonové čáry – ukotvené ke spodku hlavičky, takže „zatékají“ pod její spodní okraj */}
          <div className="absolute right-0 top-0 bottom-0 w-[340px] overflow-hidden pointer-events-none opacity-70 z-[5]">
            <img src="/neon_corner.png" alt="" draggable="false" className="absolute right-0 bottom-0 h-[170px] w-auto max-w-none" />
          </div>

          <div className="flex items-center gap-6 relative z-10">
            <div className="p-2 md:p-3 rounded-2xl bg-neon-blue/10 border-2 border-neon-blue/40 shadow-[0_0_25px_rgba(0,243,255,0.4)] transition-all">
              {getFolderIcon(activeFolder)}
            </div>
            <div className="flex flex-col justify-center relative mt-1 select-none">
              <div className="flex items-center gap-3 ml-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-purple shadow-[0_0_8px_rgba(247,37,133,0.8)]"></div>
                <span className="text-neon-blue text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] uppercase opacity-80">
                  System // Directory // 0xE9
                </span>
              </div>
              <div className="flex flex-row items-baseline">
                <span className="text-neon-blue text-4xl md:text-5xl font-light mr-4 opacity-70">[</span>
                <h1 className="text-4xl md:text-5xl font-black text-neon-blue tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,243,255,0.8)] pt-2 pb-1 leading-normal">
                  {activeFolder}
                </h1>
                <span className="text-neon-blue text-4xl md:text-5xl font-light ml-4 opacity-70">]</span>
              </div>
            </div>
          </div>
          {/* Aplikace neonové lajny zespodu hlavní hlavičky složek - Synchronizováno s Emailem */}
          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-blue via-neon-blue/50 to-neon-blue/10 drop-shadow-[0_0_10px_#00f3ff] pointer-events-none z-20"></div>
        </div>
      )}

      <div ref={splitContainerRef} style={{ '--split': `${(splitRatio * 100).toFixed(2)}%` } as CSSProperties} className={`flex-1 flex overflow-hidden ${isVerticalLayout ? 'flex-col' : 'flex-row'}`}>
        {!provider && !googleToken ? (
          <div className="flex-1 flex w-full h-full flex-col">
            <EmailList googleToken={googleToken} loginWithGoogle={loginWithGoogle} />
          </div>
        ) : (
          <>
            <div className={`flex-1 overflow-hidden relative z-0 ${selectedEmailId ? 'hidden md:flex' : 'flex'} flex-col ${isVerticalLayout ? 'md:flex-none md:basis-[var(--split)] md:min-h-0' : 'md:flex-none md:basis-[var(--split)] md:min-w-0'}`}>
                            <EmailList
                googleToken={googleToken}
                activeFolder={activeFolder}
                selectedEmailId={selectedEmailId}
                setSelectedEmailId={setSelectedEmailId}
                onExpand={(id: string) => setModalEmailId(id)}
                onDraftClick={(id: string) => setAutoResumeDraftId(id)}
                trashedEmails={trashedEmails}
                spamEmails={spamEmails}
                hiddenEmailIds={hiddenEmailIds}
                optimisticMoves={optimisticMoves}
                onTrash={handleGlobalTrash}
                onRestore={handleGlobalRestore}
                setUnreadCounts={setUnreadCounts}
                unreadCounts={unreadCounts}
                loginWithGoogle={loginWithGoogle}
                customLabels={customLabels}
                userEmail={userEmail}
                refreshTriggerList={refreshTriggerList}
              />
            </div>

            {/* Dělicí lišta – tažením se mění poměr panelů, dvojklik vrátí 50 : 50 */}
            <div
              onMouseDown={startSplitDrag}
              onDoubleClick={resetSplit}
              title="Táhnutím změníte velikost panelů (dvojklik = půl na půl)"
              className={`hidden md:block shrink-0 relative z-20 group ${isVerticalLayout ? 'h-[7px] w-full cursor-row-resize' : 'w-[7px] h-full cursor-col-resize'}`}
            >
              <div className={`absolute transition-colors ${isDraggingSplit ? 'bg-neon-blue shadow-[0_0_8px_rgba(0,243,255,0.7)]' : 'bg-neon-blue/15 group-hover:bg-neon-blue/70'} ${isVerticalLayout ? 'left-0 right-0 top-[3px] h-px' : 'top-0 bottom-0 left-[3px] w-px'}`} />
            </div>
            {isDraggingSplit && (
              // Během tažení zachytí myš i nad náhledem e-mailu (iframe by jinak pohyb „spolkl“)
              <div className={`fixed inset-0 z-[9999] ${isVerticalLayout ? 'cursor-row-resize' : 'cursor-col-resize'}`} />
            )}

            <div className={`flex-1 overflow-hidden relative bg-navy z-10 ${selectedEmailId ? 'flex' : 'hidden md:flex'} flex-col ${isVerticalLayout ? 'md:min-h-0' : 'md:min-w-0'}`}>
              <EmailDetail
                googleToken={googleToken}
                selectedEmailId={selectedEmailId}
                onExpand={selectedEmailId ? () => setModalEmailId(selectedEmailId) : undefined}
                onTrash={selectedEmailId ? () => handleGlobalTrash(selectedEmailId) : undefined}
                onSpam={selectedEmailId ? () => handleGlobalSpam(selectedEmailId) : undefined}
                onMobileBack={() => setSelectedEmailId(null)}
                onActionReply={(config: ComposerConfig) => setComposerConfig(config)}
                autoResumeDraftId={autoResumeDraftId}
                onDraftResumed={() => setAutoResumeDraftId(null)}
                userEmail={userEmail}
              />
            </div>
          </>
        )}
      </div>

      {modalEmailId && createPortal(
        <div className="fixed inset-0 bg-navy-deep/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-0 sm:p-6 lg:p-10">
          <div className="bg-navy sm:border-[2px] border-neon-blue/30 shadow-[0_0_50px_-10px_rgba(0,243,255,0.3)] sm:rounded-3xl w-full sm:w-[98vw] max-w-[1800px] h-full sm:h-[95vh] flex flex-col relative overflow-hidden transform-gpu">
            <EmailDetail
              googleToken={googleToken}
              selectedEmailId={modalEmailId}
              onTrash={modalEmailId ? () => handleGlobalTrash(modalEmailId) : undefined}
              onSpam={modalEmailId ? () => handleGlobalSpam(modalEmailId) : undefined}
              onActionReply={(config: ComposerConfig) => setComposerConfig(config)}
              onClose={() => setModalEmailId(null)}
              userEmail={userEmail}
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
          onSuccessAction={(action: ComposerSuccess['action'], meta: ComposerSuccess['meta']) => {
            const draftId = action === 'send' ? (meta as { draftMessageId?: string }).draftMessageId : undefined;
            if (action === 'send' && draftId) {
              setHiddenEmailIds(prev => [...prev, draftId]);
              if (selectedEmailId === draftId) setSelectedEmailId(null);
              if (modalEmailId === draftId) setModalEmailId(null);
            }
            setRefreshTriggerList(prev => prev + 1);
          }}
        />,
        document.body
      )}
    </div>
  );
}
