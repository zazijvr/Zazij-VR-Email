import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import { X, Settings as SettingsIcon, FileText, PenTool, Folder, Download, Loader2, Sparkles } from 'lucide-react';
import TemplateSettings from './TemplateSettings';
import SignatureSettings from './SignatureSettings';
import FolderSettings from './FolderSettings';
import ImapAccountsSection from './ImapAccountsSection';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getVersion } from '@tauri-apps/api/app';
import { checkForUpdate, installUpdate, isUpdaterSupported, type UpdateProgress } from '../utils/updater';
import type { Update } from '@tauri-apps/plugin-updater';
import type { GmailLabel } from '../types/gmail';
import { ThemeTile } from './ThemeDecor';
import { chooseTheme, selectableThemes, useTheme } from '../theme';
import type { UserInfo } from '../types/account';

interface SettingsModalProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  googleToken: string | null;
  userInfo: UserInfo | null;
  loginWithGoogle: () => void;
  isVerticalLayout: boolean;
  setIsVerticalLayout: (vertical: boolean) => void;
  savedAccounts?: string[];
  switchGoogleAccount: (email: string) => void;
  logoutGoogleAccount: (email: string) => void;
  customLabels: GmailLabel[];
  setCustomLabels: Dispatch<SetStateAction<GmailLabel[]>>;
  /** Po přidání / odebrání IMAP účtu */
  onImapAccountsChanged?: () => void;
  /** Aktivní jiný (IMAP) účet, null = Google účet */
  activeImap?: string | null;
  onSwitchImap?: (email: string) => void;
  onImapAccountRemoved?: (email: string) => void;
}

export default function SettingsModal({
  isSettingsOpen,
  setIsSettingsOpen,
  googleToken,
  userInfo,
  loginWithGoogle,
  isVerticalLayout,
  setIsVerticalLayout,
  savedAccounts = [],
  switchGoogleAccount,
  logoutGoogleAccount,
  customLabels,
  setCustomLabels,
  onImapAccountsChanged,
  activeImap = null,
  onSwitchImap,
  onImapAccountRemoved,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const theme = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const [localVersion, setLocalVersion] = useState('');
  const [cloudVersion, setCloudVersion] = useState('');
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateState, setUpdateState] = useState<'idle' | 'downloading' | 'restarting' | 'error'>('idle');
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState('');

  useFocusTrap(modalRef, isSettingsOpen);

  useEffect(() => {
    if (isSettingsOpen) {
      checkUpdates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kontrola aktualizací jen při otevření Nastavení
  }, [isSettingsOpen]);

  const checkUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError('');
    try {
      setLocalVersion(await getVersion());
      const update = await checkForUpdate();
      setPendingUpdate(update);
      setCloudVersion(update?.version || '');
      setIsUpdateAvailable(!!update);
      if (updateState === 'error') setUpdateState('idle');
    } catch (error) {
      console.error('Failed to check updates', error);
      setUpdateError('Nepodařilo se ověřit aktualizace. Zkontrolujte připojení k internetu.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!pendingUpdate) return;
    setUpdateState('downloading');
    setUpdateProgress(null);
    setUpdateError('');
    try {
      await installUpdate(pendingUpdate, (p) => setUpdateProgress(p));
      setUpdateState('restarting');
    } catch (e) {
      console.error('Aktualizace selhala', e);
      setUpdateState('error');
      setUpdateError(`Aktualizaci se nepodařilo nainstalovat: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const progressPct = updateProgress?.total ? Math.min(100, Math.round((updateProgress.downloaded / updateProgress.total) * 100)) : null;

  if (!isSettingsOpen) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/70"
        onClick={() => setIsSettingsOpen(false)}
      ></div>
      
      <div className="relative bg-[#1e293b]/80 border border-neon-blue/25 rounded-2xl sm:rounded-[30px] w-full max-w-3xl p-4 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.05)] flex flex-col z-10 transition-transform max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-4 sm:mb-6 border-b border-neon-blue/[0.15] pb-3 sm:pb-4">
          <h2 className="text-xl sm:text-3xl font-black tracking-widest text-neon-blue drop-shadow-[0_0_20px_rgb(var(--c-neon-blue)/0.6)]">NASTAVENÍ</h2>
          <button 
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 sm:p-2 bg-white/5 hover:bg-danger/20 text-slate-400 hover:text-danger rounded-full transition-all border border-transparent hover:border-danger/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center shrink-0"
          >
            <X size={20} className="sm:w-[22px] sm:h-[22px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex gap-2 sm:gap-4 mb-4 border-b border-neon-blue/10 pb-6 pt-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto custom-scrollbar">
          <button onClick={() => setActiveTab('general')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap text-xs sm:text-base ${activeTab === 'general' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]' : 'bg-navy-card/70 text-slate-400 border border-neon-blue/10 hover:bg-white/5 hover:text-white'}`}>
            <SettingsIcon size={16} className="sm:w-[18px] sm:h-[18px]" /> OBECNÉ
          </button>
          <button onClick={() => setActiveTab('templates')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap text-xs sm:text-base ${activeTab === 'templates' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]' : 'bg-navy-card/70 text-slate-400 border border-neon-blue/10 hover:bg-white/5 hover:text-white'}`}>
            <FileText size={16} className="sm:w-[18px] sm:h-[18px]" /> ŠABLONY
          </button>
          <button onClick={() => setActiveTab('signatures')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap text-xs sm:text-base ${activeTab === 'signatures' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]' : 'bg-navy-card/70 text-slate-400 border border-neon-blue/10 hover:bg-white/5 hover:text-white'}`}>
            <PenTool size={16} className="sm:w-[18px] sm:h-[18px]" /> PODPISY
          </button>
          <button onClick={() => setActiveTab('folders')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap text-xs sm:text-base ${activeTab === 'folders' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.2)]' : 'bg-navy-card/70 text-slate-400 border border-neon-blue/10 hover:bg-white/5 hover:text-white'}`}>
            <Folder size={16} className="sm:w-[18px] sm:h-[18px]" /> SLOŽKY
          </button>
        </div>
        
        {activeTab === 'general' && (
        <div className="flex flex-col gap-8 mt-2 overflow-y-auto custom-scrollbar pr-2 max-h-[60vh]">

          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-neon-blue/[0.15] pb-2">Vzhled</h3>
            <div role="radiogroup" aria-label="Motiv" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {selectableThemes(theme).map((t) => (
                <ThemeTile key={t.id} theme={t} selected={t.id === theme} onSelect={() => chooseTheme(t.id)} />
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:block">
            <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-neon-blue/[0.15] pb-2">Verze aplikace</h3>
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all ${isUpdateAvailable ? 'bg-neon-purple/5 border-neon-purple/30 shadow-[0_0_20px_rgb(var(--c-neon-purple)/0.1)]' : 'bg-navy-card border-neon-blue/[0.15]'}`}>
              <div className="flex flex-col gap-1 mb-4 sm:mb-0">
                <span className="text-white font-bold tracking-wide flex items-center gap-2">
                  ZazijVR Email Klient 
                  <span className="px-2 py-0.5 bg-white/10 text-slate-300 rounded text-xs font-mono border border-neon-blue/10">{localVersion || '...'}</span>
                </span>
                
                {!isUpdaterSupported() ? (
                  <span className="text-sm text-slate-400 mt-1">Aktualizace se na tomto zařízení instalují ručně.</span>
                ) : isCheckingUpdate ? (
                  <span className="text-sm text-slate-400 flex items-center gap-1.5 mt-1">
                    <Loader2 size={14} className="animate-spin text-neon-blue" />
                    Ověřuji dostupnost aktualizací...
                  </span>
                ) : updateError ? (
                  <span className="text-sm text-red-400 mt-1">{updateError}</span>
                ) : isUpdateAvailable ? (
                  <span className="text-sm text-neon-purple font-semibold flex items-center gap-1.5 mt-1">
                    <Sparkles size={14} />
                    K dispozici je nová verze {cloudVersion}
                  </span>
                ) : (
                  <span className="text-sm text-neon-blue flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-neon-blue shadow-[0_0_5px_rgb(var(--c-neon-blue)/1)]"></span>
                    Používáte nejnovější verzi.
                  </span>
                )}
                {pendingUpdate?.body && updateState === 'idle' && (
                  <span className="text-xs text-slate-400 mt-1 whitespace-pre-line max-w-md">{pendingUpdate.body}</span>
                )}
              </div>
              
              {isUpdateAvailable && (
                <button 
                  onClick={handleDownloadUpdate}
                  disabled={updateState === 'downloading' || updateState === 'restarting'}
                  className="w-full sm:w-auto flex items-center justify-center sm:justify-start gap-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple border border-neon-purple/50 hover:border-neon-purple px-5 py-2.5 rounded-xl font-black tracking-wider transition-all shadow-[0_0_15px_rgb(var(--c-neon-purple)/0.3)] hover:shadow-[0_0_25px_rgb(var(--c-neon-purple)/0.6)] hover:scale-105 group whitespace-nowrap"
                >
                  {updateState === 'downloading' || updateState === 'restarting' ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {updateState === 'restarting' ? 'RESTARTUJI…' : progressPct !== null ? `STAHUJI ${progressPct} %` : 'STAHUJI…'}
                    </>
                  ) : (
                    <>
                      <Download size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                      {updateState === 'error' ? 'ZKUSIT ZNOVU' : 'NAINSTALOVAT A RESTARTOVAT'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="hidden sm:block">
            <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-neon-blue/[0.15] pb-2">Vzhled a Zobrazení</h3>
            <div className="flex items-center gap-4 bg-navy-card border border-neon-blue/10 p-5 rounded-2xl w-full">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-slate-200 font-semibold tracking-wide">Rozložení panelů s poštou</span>
                <span className="text-sm text-slate-500">Zvolte, jak chcete mít umístěný náhled e-mailu vůči seznamu zpráv.</span>
              </div>
              <div className="flex items-center gap-2 bg-navy p-1 rounded-xl border border-neon-blue/10">
                <button 
                  onClick={() => setIsVerticalLayout(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold tracking-wider transition-all ${!isVerticalLayout ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/40 shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.2)]' : 'text-slate-500 hover:text-white'}`}
                >
                  VEDLE SEBE
                </button>
                <button 
                  onClick={() => setIsVerticalLayout(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold tracking-wider transition-all ${isVerticalLayout ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/40 shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.2)]' : 'text-slate-500 hover:text-white'}`}
                >
                  POD SEBOU
                </button>
              </div>
            </div>
          </div>

          <div className="mt-0 sm:mt-2">
            <h3 className="text-xl font-bold text-slate-200 mb-4 border-b border-neon-blue/[0.15] pb-2">Propojené Účty</h3>
            <div className="flex flex-col gap-4">
              
              {savedAccounts.length > 0 ? (
                <>
                  {savedAccounts.map((email) => {
                    const isActive = !activeImap && (userInfo?.email === email || (savedAccounts.length === 1 && !!googleToken));
                    return (
                      <div key={email} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-5 rounded-2xl transition-all border ${isActive ? 'bg-neon-blue/10 border-neon-blue/50 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.1)]' : 'bg-navy-card border-neon-blue/[0.15] hover:border-white/30'}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 overflow-hidden mb-3 sm:mb-0">
                          <div className={`shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-lg sm:text-xl uppercase ${isActive ? 'bg-neon-blue text-navy shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.6)]' : 'bg-white/10 text-slate-400'}`}>
                            {email.charAt(0)}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className={`font-bold tracking-wide truncate max-w-[200px] sm:max-w-xs ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>{email}</span>
                            {isActive ? (
                              <span className="text-neon-blue text-[10px] sm:text-xs font-semibold flex items-center gap-1.5 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse shadow-[0_0_5px_rgb(var(--c-neon-blue)/1)]"></span>
                                Aktivní napojení ({userInfo?.messagesTotal || 0} mailů)
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px] sm:text-xs mt-1">Odpojený účet</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-neon-blue/10 pt-3 sm:pt-0">
                          {!isActive && (
                            <button 
                              onClick={() => switchGoogleAccount(email)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 hover:bg-neon-blue/20 text-slate-300 hover:text-neon-blue border border-neon-blue/[0.15] hover:border-neon-blue/50 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap"
                            >
                              PŘEPNOUT
                            </button>
                          )}
                          <button 
                            onClick={() => logoutGoogleAccount(email)}
                            className="p-1.5 sm:p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-neon-blue/[0.15] hover:border-red-500/50 rounded-lg sm:rounded-xl transition-all"
                            title="Odebrat účet"
                          >
                            <X size={18} className="sm:w-[20px] sm:h-[20px]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button 
                    onClick={() => loginWithGoogle()}
                    className="group self-start flex items-center gap-3 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue border border-neon-blue/40 hover:border-neon-blue/80 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 mt-2 shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_25px_rgb(var(--c-neon-blue)/0.4)]"
                  >
                    <span className="text-2xl font-black leading-none drop-shadow-md">+</span>
                    <span className="tracking-wide">Přidat další Google Účet</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-navy-card border border-neon-blue/10 p-5 rounded-2xl">
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-300 font-semibold tracking-wide">Zatím nemáte propojený žádný účet.</span>
                      <span className="text-sm text-slate-500">Pro zobrazení vaší doručené pošty a událostí je nutné se přihlásit.</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => loginWithGoogle()}
                    className="group self-start flex items-center gap-3 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue border border-neon-blue/40 hover:border-neon-blue/80 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.1)] hover:shadow-[0_0_25px_rgb(var(--c-neon-blue)/0.4)]"
                  >
                    <span className="text-2xl font-black leading-none drop-shadow-md">+</span>
                    <span className="tracking-wide">Připojit Google Účet</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <ImapAccountsSection onAccountsChanged={onImapAccountsChanged} activeEmail={activeImap} onSwitch={onSwitchImap} onRemoved={onImapAccountRemoved} />

        </div>
        )}

        {activeTab === 'templates' && <TemplateSettings googleToken={googleToken} />}
        {activeTab === 'signatures' && <SignatureSettings />}
        {activeTab === 'folders' && <FolderSettings googleToken={googleToken} customLabels={customLabels} setCustomLabels={setCustomLabels} />}
        

        
      </div>
    </div>
  );
}
